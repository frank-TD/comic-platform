/**
 * TTS 音色制作 API
 * 
 * 使用统一的 TTS Provider 架构，支持多种提供商
 * 当前实现：豆包 TTS
 * 
 * 预留扩展：
 * - 阿里云语音合成
 * - 腾讯云语音合成
 * - Azure 语音服务
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { audioTasks } from '@/storage/database/shared/schema';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import { 
  DoubaoTTSProvider, 
  getAllTTSProviders, 
  getTTSProvider,
  estimateDuration,
  TTSVoiceOption 
} from '@/lib/providers/tts-provider';

// 数据库类型
type DbType = Awaited<ReturnType<typeof getDb>>;

// ==================== 音色配置 ====================

/**
 * 音色分组配置（与前端保持一致）
 */
export const VOICE_OPTIONS = {
  general: [
    // BigTTS 通用音色
    { value: 'zh_female_xiaohe_uranus_bigtts', label: '小禾（女声，通用）', gender: 'female' },
    { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi（女声，中英）', gender: 'female' },
    { value: 'zh_male_m191_uranus_bigtts', label: '云舟（男声）', gender: 'male' },
    { value: 'zh_male_taocheng_uranus_bigtts', label: '小甜（男声）', gender: 'male' },
  ],
  dubbing: [
    // Saturn 视频配音音色
    { value: 'zh_male_dayi_saturn_bigtts', label: '大义（男声）', gender: 'male' },
    { value: 'zh_female_mizai_saturn_bigtts', label: '蜜崽（女声）', gender: 'female' },
    { value: 'zh_female_jitangnv_saturn_bigtts', label: '鸡汤女（女声）', gender: 'female' },
    { value: 'zh_female_meilinvyou_saturn_bigtts', label: '魅力女声', gender: 'female' },
    { value: 'zh_female_santongyongns_saturn_bigtts', label: '三通女声', gender: 'female' },
    { value: 'zh_male_ruyayichen_saturn_bigtts', label: '儒雅男声', gender: 'male' },
  ],
  roleplay: [
    // TOB 角色扮演音色
    { value: 'saturn_zh_female_keainvsheng_tob', label: '可爱女孩', gender: 'female' },
    { value: 'saturn_zh_female_tiaopigongzhu_tob', label: '调皮公主', gender: 'female' },
    { value: 'saturn_zh_male_shuanglangshaonian_tob', label: '爽朗少年', gender: 'male' },
    { value: 'saturn_zh_male_tiancaitongzhuo_tob', label: '天才同学', gender: 'male' },
    { value: 'saturn_zh_female_cancan_tob', label: '才女', gender: 'female' },
  ],
};

// 扁平化的音色映射（value -> label）
export const VOICE_MAP: Record<string, string> = {
  ...Object.fromEntries(VOICE_OPTIONS.general.map(v => [v.value, v.label])),
  ...Object.fromEntries(VOICE_OPTIONS.dubbing.map(v => [v.value, v.label])),
  ...Object.fromEntries(VOICE_OPTIONS.roleplay.map(v => [v.value, v.label])),
};

// 默认音色
const DEFAULT_VOICE = 'zh_female_xiaohe_uranus_bigtts';

// ==================== API 处理 ====================

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
      speaker = DEFAULT_VOICE,
      speechRate = 0,
      volume = 0,
      pitch = 0,
    } = await request.json();

    // 验证配音内容
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供有效的配音内容' },
        { status: 400 }
      );
    }

    // 验证配音内容长度（豆包 TTS 限制 5000 字符）
    if (prompt.length > 5000) {
      return NextResponse.json(
        { success: false, error: '配音内容不能超过 5000 字符' },
        { status: 400 }
      );
    }

    // 验证音色是否有效
    if (!VOICE_MAP[speaker]) {
      return NextResponse.json(
        { success: false, error: '无效的音色选择' },
        { status: 400 }
      );
    }

    const taskId = uuidv4();
    const db = await getDb();

    // 创建任务记录
    await db.insert(audioTasks).values({
      id: taskId,
      userId: payload.id,
      type: 'tts',
      prompt: prompt.trim(),
      speaker: speaker,
      status: 1, // 处理中
      createdAt: new Date().toISOString(),
    });

    // 异步处理 TTS 请求
    processTTSTask(taskId, {
      userId: payload.id,
      text: prompt.trim(),
      voice: speaker,
      speechRate,
      volume,
      pitch,
    }).catch(err => {
      console.error(`[TTS] Task ${taskId} failed:`, err);
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
    console.error('[TTS] API Error:', error);
    return NextResponse.json(
      { success: false, error: 'TTS 生成失败，请重试' },
      { status: 500 }
    );
  }
}

// ==================== TTS 任务处理 ====================

interface TTSRequestParams {
  userId: string;
  text: string;
  voice: string;
  speechRate?: number;
  volume?: number;
  pitch?: number;
}

/**
 * 异步处理 TTS 任务
 * 
 * 使用 Provider 模式，支持多种 TTS 提供商
 */
async function processTTSTask(taskId: string, params: TTSRequestParams) {
  const db = await getDb();
  
  try {
    console.log(`[TTS] Starting synthesis for task ${taskId}`);
    console.log(`[TTS] Voice: ${params.voice}, Text length: ${params.text.length}`);

    // 获取 TTS Provider（根据音色自动选择提供商）
    const provider = new DoubaoTTSProvider();
    
    // 检查 Provider 是否配置
    if (!provider.isConfigured()) {
      console.log('[TTS] Provider not configured, using mock response');
      // 如果未配置，使用 Mock 响应
      await handleMockTTS(taskId, db, params);
      return;
    }

    // 调用 TTS Provider
    const result = await provider.synthesize({
      userId: params.userId,
      text: params.text,
      voice: params.voice,
      speechRate: params.speechRate,
      volume: params.volume,
      pitch: params.pitch,
      format: 'mp3',
    });

    if (result.success && result.audioUri) {
      // 更新任务状态为成功
      await db.update(audioTasks)
        .set({
          resultUrl: result.audioUri,
          duration: result.duration || estimateDuration(result.audioSize || 0),
          status: 2, // 成功
          updatedAt: new Date().toISOString(),
        })
        .where(eq(audioTasks.id, taskId));

      console.log(`[TTS] Task ${taskId} completed successfully`);
    } else {
      // 更新任务状态为失败
      await db.update(audioTasks)
        .set({
          status: -1, // 失败
          errorMessage: result.error || 'TTS 合成失败',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(audioTasks.id, taskId));

      console.error(`[TTS] Task ${taskId} failed: ${result.error}`);
    }

  } catch (error) {
    console.error(`[TTS] Task ${taskId} error:`, error);
    
    await db.update(audioTasks)
      .set({
        status: -1, // 失败
        errorMessage: error instanceof Error ? error.message : 'TTS 生成失败',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(audioTasks.id, taskId));
  }
}

/**
 * Mock TTS 响应处理
 * 
 * 当 Provider 未配置时使用
 */
async function handleMockTTS(taskId: string, db: DbType, params: TTSRequestParams) {
  // 模拟处理延迟
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 使用不同的示例音频模拟不同类型
  const mockUrls = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  ];
  
  // 根据音色选择不同的示例音频
  const audioIndex = params.voice.includes('male') ? 1 : 0;
  const mockUrl = mockUrls[audioIndex];
  
  // 获取音频时长
  let mockDuration = 15;
  try {
    const audioResponse = await fetch(mockUrl, { method: 'HEAD' });
    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) {
      mockDuration = estimateDuration(parseInt(contentLength));
    }
  } catch (e) {
    console.log('[TTS Mock] Could not determine audio duration');
  }

  await db.update(audioTasks)
    .set({
      resultUrl: mockUrl,
      duration: mockDuration,
      status: 2, // 成功
      updatedAt: new Date().toISOString(),
    })
    .where(eq(audioTasks.id, taskId));

  console.log(`[TTS] Task ${taskId} completed (mock), duration: ${mockDuration}s`);
}
