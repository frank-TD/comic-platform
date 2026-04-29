/**
 * BGM 制作 API
 * 根据描述生成背景音乐（接入 MiniMax 音乐生成 API）
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/supabase-client';
import { audioTasks } from '@/storage/database/shared/schema';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { getMiniMaxMusicClient, MiniMaxMusicClient, MusicTaskStatus } from '@/lib/providers/minimax-music';
import { MINIMAX_MUSIC_CONFIG } from '@/lib/config';
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
      model = MINIMAX_MUSIC_CONFIG.defaults.model,
      isInstrumental = false,
      lyrics 
    } = await request.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供有效的音乐描述' },
        { status: 400 }
      );
    }

    // 验证模型是否支持
    const supportedModels = Object.values(MINIMAX_MUSIC_CONFIG.models);
    if (!supportedModels.includes(model)) {
      return NextResponse.json(
        { success: false, error: `不支持的模型: ${model}` },
        { status: 400 }
      );
    }

    const taskId = uuidv4();
    const db = await getDb();

    // 创建任务记录
    await db.insert(audioTasks).values({
      id: taskId,
      userId: payload.id,
      type: 'bgm',
      prompt: prompt.trim(),
      referenceAudioUrl: referenceAudioUrl || null,
      status: 1, // 处理中
      createdAt: new Date().toISOString(),
    });

    // 异步处理 BGM 生成任务
    processBGMTask(taskId, payload.id, prompt.trim(), referenceAudioUrl, model, isInstrumental, lyrics).catch(err => {
      console.error(`[BGM] Task ${taskId} failed:`, err);
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
    console.error('[BGM] API Error:', error);
    return NextResponse.json(
      { success: false, error: 'BGM 生成失败，请重试' },
      { status: 500 }
    );
  }
}

/**
 * 异步处理 BGM 生成任务
 */
async function processBGMTask(
  taskId: string,
  userId: string,
  prompt: string, 
  referenceAudioUrl?: string,
  model?: string,
  isInstrumental?: boolean,
  lyrics?: string
) {
  const db = await getDb();
  const musicClient = getMiniMaxMusicClient();

  try {
    // 调用 MiniMax API 创建音乐生成任务
    const createResponse = await musicClient.createTask({
      model: model || MINIMAX_MUSIC_CONFIG.defaults.model,
      prompt: prompt,
      lyrics: lyrics,
      isInstrumental: isInstrumental ?? MINIMAX_MUSIC_CONFIG.defaults.isInstrumental,
      audioSetting: {
        sampleRate: MINIMAX_MUSIC_CONFIG.defaults.sampleRate,
        bitrate: MINIMAX_MUSIC_CONFIG.defaults.bitrate,
        format: MINIMAX_MUSIC_CONFIG.defaults.audioFormat,
      },
      referenceAudio: referenceAudioUrl ? { audioUrl: referenceAudioUrl } : undefined,
    });

    console.log(`[BGM] Task ${taskId} created, MiniMax taskId: ${createResponse.taskId}`);

    // 轮询任务状态
    await pollTaskStatus(taskId, userId, createResponse.taskId);

  } catch (error) {
    console.error(`[BGM] Task ${taskId} error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'BGM 生成失败';
    
    await db.update(audioTasks)
      .set({ 
        status: -1, 
        errorMessage: errorMessage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(audioTasks.id, taskId));
  }
}

/**
 * 轮询任务状态
 */
async function pollTaskStatus(taskId: string, userId: string, miniMaxTaskId: string) {
  const db = await getDb();
  const musicClient = getMiniMaxMusicClient();
  const maxAttempts = 60; // 最多轮询 60 次
  const intervalMs = 5000; // 每 5 秒轮询一次

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await musicClient.getTaskStatus(miniMaxTaskId);
      
      console.log(`[BGM] Task ${taskId} poll ${attempt + 1}/${maxAttempts}, status: ${result.status}`);

      if (result.status === MusicTaskStatus.COMPLETED) {
        // 任务完成
        if (result.audio) {
          // 将 hex 音频转换为 Buffer 并上传到对象存储
          try {
            const audioBuffer = MiniMaxMusicClient.hexToBuffer(result.audio);
            const fileName = `bgm_${taskId}.mp3`;
            
            // 上传到对象存储
            const key = await storage.uploadFile({
              fileContent: audioBuffer,
              fileName: fileName,
              contentType: 'audio/mpeg',
            });

            // 生成可访问的签名 URL
            const url = await storage.generatePresignedUrl({
              key: key,
              expireTime: 86400 * 7, // 7 天有效期
            });

            console.log(`[BGM] Task ${taskId} uploaded to: ${url}`);

            await db.update(audioTasks)
              .set({ 
                status: 2, 
                resultUrl: url,
                metadata: { audioUrl: result.audioUrl },
                updatedAt: new Date().toISOString(),
              })
              .where(eq(audioTasks.id, taskId));
          } catch (uploadError) {
            console.error(`[BGM] Task ${taskId} upload error:`, uploadError);
            // 上传失败，但音乐已生成，存储 hex 数据作为后备
            await db.update(audioTasks)
              .set({ 
                status: 2, 
                resultUrl: `data:audio/mp3;hex,${result.audio}`,
                metadata: { hexAudio: result.audio, audioUrl: result.audioUrl },
                updatedAt: new Date().toISOString(),
              })
              .where(eq(audioTasks.id, taskId));
          }
        } else if (result.audioUrl) {
          // 直接返回 URL
          await db.update(audioTasks)
            .set({ 
              status: 2, 
              resultUrl: result.audioUrl,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(audioTasks.id, taskId));
        }
        
        console.log(`[BGM] Task ${taskId} completed successfully`);
        return;
      }

      if (result.status === MusicTaskStatus.FAILED) {
        const errorMsg = result.error?.message || '音乐生成失败';
        await db.update(audioTasks)
          .set({ 
            status: -1, 
            errorMessage: errorMsg,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(audioTasks.id, taskId));
        
        console.log(`[BGM] Task ${taskId} failed: ${errorMsg}`);
        return;
      }

      // 继续等待
      await new Promise(resolve => setTimeout(resolve, intervalMs));

    } catch (error) {
      console.error(`[BGM] Task ${taskId} poll error:`, error);
      // 轮询错误，继续重试
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  // 超时
  await db.update(audioTasks)
    .set({ 
      status: -1, 
      errorMessage: '生成超时，请稍后重试',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(audioTasks.id, taskId));
  
  console.log(`[BGM] Task ${taskId} timeout`);
}
