/**
 * 人声复刻 API（接入豆包声音复刻 2.0）
 *
 * 完整流程：
 * 1. 用户上传参考音频 + 输入配音文本
 * 2. 后端下载参考音频，转为 base64
 * 3. 调用 voice_clone API 训练音色（使用 speaker_id）
 * 4. 轮询等待训练完成
 * 5. 训练完成后使用 speaker_id 调用 V3 TTS 合成语音
 * 6. 上传合成音频到对象存储
 * 7. 更新任务状态
 *
 * 如果 Provider 未配置，自动降级为 Mock 模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/supabase-client';
import { audioTasks } from '@/storage/database/shared/schema';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import {
  getVoiceCloneProvider,
  VoiceCloneLanguage,
  VoiceCloneStatus,
  getCloneErrorMessage,
  getAudioFormatFromFileName,
} from '@/lib/providers/voice-clone-provider';
import { VOICE_CLONE_CONFIG } from '@/lib/config';
import { S3Storage } from 'coze-coding-dev-sdk';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  bucketName: process.env.COZE_BUCKET_NAME,
});

export async function POST(request: NextRequest) {
  // 验证 JWT Token
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: 'Token 已过期，请重新登录' },
      { status: 401 }
    );
  }

  try {
    const {
      prompt,
      referenceAudioUrl,
      speakerId,
      language,
    } = await request.json();

    // 验证配音内容
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供有效的配音内容' },
        { status: 400 }
      );
    }

    // 验证配音内容长度
    if (prompt.length > 5000) {
      return NextResponse.json(
        { success: false, error: '配音内容不能超过 5000 字符' },
        { status: 400 }
      );
    }

    // 验证参考音频
    if (!referenceAudioUrl || typeof referenceAudioUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: '请上传参考音频' },
        { status: 400 }
      );
    }

    const taskId = uuidv4();
    const db = await getDb();

    // 创建任务记录
    await db.insert(audioTasks).values({
      id: taskId,
      userId: payload.id,
      type: 'clone',
      prompt: prompt.trim(),
      referenceAudioUrl: referenceAudioUrl,
      speaker: speakerId || null,
      status: 1, // 处理中
      metadata: {
        language: language ?? VoiceCloneLanguage.CN,
      },
      createdAt: new Date().toISOString(),
    });

    // 异步处理人声复刻任务
    processCloneTask(taskId, {
      userId: payload.id,
      text: prompt.trim(),
      referenceAudioUrl,
      speakerId: speakerId || VOICE_CLONE_CONFIG.defaultSpeakerId,
      language: language ?? VoiceCloneLanguage.CN,
    }).catch(err => {
      console.error(`[Clone] Task ${taskId} failed:`, err);
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: taskId,
        status: 1,
        statusText: '处理中',
      }
    });

  } catch (error) {
    console.error('[Clone] API Error:', error);
    return NextResponse.json(
      { success: false, error: '人声复刻失败，请重试' },
      { status: 500 }
    );
  }
}

// ==================== 任务处理 ====================

interface CloneTaskParams {
  userId: string;
  text: string;
  referenceAudioUrl: string;
  speakerId: string;
  language: number;
}

/**
 * 异步处理人声复刻任务
 *
 * 完整流程：
 * 1. 下载参考音频并转为 base64
 * 2. 调用 voice_clone 训练音色
 * 3. 轮询等待训练完成
 * 4. 使用训练好的音色调用 V3 TTS 合成语音
 * 5. 上传结果到对象存储
 */
async function processCloneTask(taskId: string, params: CloneTaskParams) {
  const db = await getDb();
  const provider = getVoiceCloneProvider();

  try {
    console.log(`[Clone] Starting voice clone for task ${taskId}`);

    // 检查 Provider 是否配置
    if (!provider.isConfigured()) {
      console.log('[Clone] Provider not configured, using mock response');
      await handleMockClone(taskId, db, params);
      return;
    }

    // Step 1: 下载参考音频并转为 base64
    console.log(`[Clone] Downloading reference audio: ${params.referenceAudioUrl}`);
    const { audioBase64, audioFormat } = await downloadAudioAsBase64(params.referenceAudioUrl);
    console.log(`[Clone] Audio downloaded, format: ${audioFormat}, base64 length: ${audioBase64.length}`);

    // Step 2: 提交声音复刻训练
    if (!params.speakerId) {
      throw new Error('未指定音色 ID（speaker_id），请在环境变量 VOICE_CLONE_DEFAULT_SPEAKER_ID 中配置或在请求中传入');
    }

    const cloneResponse = await provider.trainVoice({
      speakerId: params.speakerId,
      audioData: audioBase64,
      audioFormat: audioFormat,
      language: params.language as VoiceCloneLanguage,
      enableAudioDenoise: VOICE_CLONE_CONFIG.defaults.enableAudioDenoise,
    });

    console.log(`[Clone] Training submitted, status: ${cloneResponse.status}, available_times: ${cloneResponse.availableTrainingTimes}`);

    // Step 3: 轮询等待训练完成
    const voiceStatus = await provider.waitForTrainingComplete(
      params.speakerId,
      VOICE_CLONE_CONFIG.polling.maxAttempts,
      VOICE_CLONE_CONFIG.polling.intervalMs
    );

    console.log(`[Clone] Training completed, status: ${voiceStatus.status}`);

    if (voiceStatus.status !== VoiceCloneStatus.SUCCESS && voiceStatus.status !== VoiceCloneStatus.ACTIVE) {
      throw new Error(`音色训练未成功，当前状态: ${voiceStatus.status}`);
    }

    // Step 4: 使用训练好的音色调用 V3 TTS 合成语音
    console.log(`[Clone] Synthesizing with cloned voice, text length: ${params.text.length}`);

    const ttsResult = await provider.synthesizeWithClonedVoice(
      {
        text: params.text,
        speakerId: params.speakerId,
        uid: params.userId,
        format: 'mp3',
        sampleRate: VOICE_CLONE_CONFIG.defaults.sampleRate,
      },
      storage
    );

    if (ttsResult.success && ttsResult.audioUri) {
      // Step 5: 更新任务状态为成功
      await db.update(audioTasks)
        .set({
          resultUrl: ttsResult.audioUri,
          duration: ttsResult.duration || 0,
          status: 2, // 成功
          metadata: {
            speakerId: params.speakerId,
            language: params.language,
            cloneStatus: voiceStatus.status,
          },
          updatedAt: new Date().toISOString(),
        })
        .where(eq(audioTasks.id, taskId));

      console.log(`[Clone] Task ${taskId} completed successfully, duration: ${ttsResult.duration}s`);
    } else {
      throw new Error(ttsResult.error || '语音合成失败');
    }

  } catch (error) {
    console.error(`[Clone] Task ${taskId} error:`, error);

    let errorMessage = error instanceof Error ? error.message : '人声复刻失败';

    // 尝试从错误中提取用户友好信息
    const codeMatch = errorMessage.match(/错误码[:\s]*(\d+)/);
    if (codeMatch) {
      const code = parseInt(codeMatch[1]);
      const errorInfo = getCloneErrorMessage(code);
      errorMessage = `${errorInfo.title} - ${errorInfo.suggestion}`;
    }

    await db.update(audioTasks)
      .set({
        status: -1, // 失败
        errorMessage: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(audioTasks.id, taskId));
  }
}

// ==================== 辅助函数 ====================

/**
 * 下载音频文件并转为 base64
 */
async function downloadAudioAsBase64(audioUrl: string): Promise<{ audioBase64: string; audioFormat: string }> {
  try {
    const response = await fetch(audioUrl, {
      method: 'GET',
      headers: {
        'Accept': 'audio/*',
      },
    });

    if (!response.ok) {
      throw new Error(`下载参考音频失败: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioBase64 = buffer.toString('base64');

    // 从 Content-Type 或 URL 推断音频格式
    const contentType = response.headers.get('content-type') || '';
    let audioFormat = '';

    if (contentType.includes('wav')) {
      audioFormat = 'wav';
    } else if (contentType.includes('mpeg') || contentType.includes('mp3')) {
      audioFormat = 'mp3';
    } else if (contentType.includes('ogg')) {
      audioFormat = 'ogg_opus';
    } else if (contentType.includes('m4a') || contentType.includes('mp4')) {
      audioFormat = 'm4a';
    } else if (contentType.includes('aac')) {
      audioFormat = 'aac';
    } else if (contentType.includes('pcm')) {
      audioFormat = 'pcm';
    }

    // 从 URL 推断格式
    if (!audioFormat) {
      const urlPath = new URL(audioUrl).pathname;
      const fileName = urlPath.split('/').pop() || '';
      audioFormat = getAudioFormatFromFileName(fileName) || 'wav';
    }

    // 检查音频大小（10MB 限制）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (buffer.length > maxSize) {
      throw new Error('参考音频文件过大，最大支持 10MB');
    }

    return { audioBase64, audioFormat };
  } catch (error) {
    if (error instanceof Error && error.message.includes('下载参考音频')) {
      throw error;
    }
    throw new Error(`下载参考音频失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * Mock 人声复刻响应处理
 *
 * 当 Provider 未配置时使用
 */
async function handleMockClone(taskId: string, db: Awaited<ReturnType<typeof getDb>>, params: CloneTaskParams) {
  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 获取参考音频时长
  let mockDuration = 10;
  try {
    const audioResponse = await fetch(params.referenceAudioUrl, { method: 'HEAD' });
    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) {
      mockDuration = Math.round(parseInt(contentLength) / 16000);
    }
  } catch {
    console.log('[Clone Mock] Could not determine audio duration, using default');
  }

  await db.update(audioTasks)
    .set({
      resultUrl: params.referenceAudioUrl, // Mock: 使用参考音频
      duration: mockDuration,
      status: 2, // 成功
      metadata: {
        mock: true,
        speakerId: params.speakerId,
      },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(audioTasks.id, taskId));

  console.log(`[Clone] Task ${taskId} completed (mock), duration: ${mockDuration}s`);
}
