/**
 * 延长视频 API (F02)
 * 
 * 支持将多个视频片段（1-3个）串联/延长为连贯视频
 * 仅支持 Seedance 2.0 模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { videoTasks } from '@/storage/database/shared/schema';
import { TASK_STATUS, DEFAULT_PROVIDER, VIDEO_GENERATION_DEFAULTS } from '@/lib/config';
import { getVideoProvider, VideoContent } from '@/lib/providers';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import type { ExtendVideoParams } from '@/lib/types';
import { logInfo, logError, logDebug } from '@/lib/task-logger';
import { taskLimiter } from '@/lib/task-queue';

// 延长视频任务内部处理（获取并发槽后执行）
async function processExtendVideoTaskInner(
  taskId: string,
  prompt: string,
  videoUrls: string[],
  options?: {
    ratio?: string;
    duration?: number;
    generateAudio?: boolean;
  }
): Promise<void> {
  const startTime = Date.now();
  
  // 记录任务开始
  await logInfo(taskId, 'extend_task', `延长视频任务开始`, {
    video_count: videoUrls.length,
    ratio: options?.ratio,
    duration: options?.duration,
    generate_audio: options?.generateAudio,
  });

  try {
    const db = await getDb();
    
    // 【状态诚实】获取到并发槽后才更新为 PROCESSING
    await db
      .update(videoTasks)
      .set({ 
        status: TASK_STATUS.PROCESSING,
        extraData: {
          status_text: '视频延长中...'
        },
        updatedAt: new Date().toISOString()
      })
      .where(eq(videoTasks.id, taskId));

    // 仅支持 Seedance 2.0
    const modelId = 'seedance2.0';
    const provider = getVideoProvider(modelId);

    // 记录 Provider 信息
    await logDebug(taskId, 'extend_task', `使用 Provider: ${provider.name}`, {
      provider: provider.id,
    });

    console.log(`[ExtendVideo] Using provider: ${provider.name} (${provider.status})`);

    // 构建 content 数组
    const content: VideoContent[] = [];

    // 添加文本 prompt（衔接描述）
    const cleanPrompt = prompt.trim();
    content.push({
      type: 'text',
      text: cleanPrompt
    });

    // 添加视频片段（最多 3 个，全部作为 reference_video）
    for (const videoUrl of videoUrls) {
      content.push({
        type: 'video_url',
        video_url: { url: videoUrl },
        role: 'reference_video'
      });
    }

    // 使用用户选择的参数或默认值
    const finalRatio = options?.ratio || VIDEO_GENERATION_DEFAULTS.ratio;
    const finalDuration = options?.duration || VIDEO_GENERATION_DEFAULTS.duration;
    const finalGenerateAudio = options?.generateAudio ?? VIDEO_GENERATION_DEFAULTS.generateAudio;

    console.log(`[ExtendVideo] Starting for task ${taskId}`);
    console.log(`[ExtendVideo] Content items: ${content.length}`);
    console.log(`[ExtendVideo] Video clips: ${videoUrls.length}, Ratio: ${finalRatio}, Duration: ${finalDuration}s`);
    console.log(`[ExtendVideo] Generate audio: ${finalGenerateAudio}`);

    // 调用 Provider 生成视频
    const result = await provider.generate(content, {
      model: 'doubao-seedance-2-0-260128',
      duration: finalDuration,
      resolution: '720p', // Seedance 2.0 限制为 720p
      ratio: finalRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive',
      watermark: VIDEO_GENERATION_DEFAULTS.watermark,
      generateAudio: finalGenerateAudio,
      maxWaitTime: VIDEO_GENERATION_DEFAULTS.maxWaitTime
    });

    console.log(`[ExtendVideo] Response received for task ${taskId}`);
    console.log(`[ExtendVideo] Success: ${result.success}`);

    // 更新任务状态
    if (result.success && result.videoUrl) {
      const duration = Date.now() - startTime;
      
      // 记录成功日志
      await logInfo(taskId, 'extend_task', `延长视频成功`, {
        duration_ms: duration,
        result_url: result.videoUrl,
        model_task_id: result.taskId,
      });
      
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.SUCCESS,
          resultUrl: result.videoUrl,
          extraData: {
            status_text: '延长成功',
            model_response: {
              task_id: result.taskId,
              resolution: result.metadata?.resolution,
              ratio: result.metadata?.ratio,
              duration: result.metadata?.duration,
              frames_per_second: result.metadata?.framesPerSecond
            }
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    } else {
      // 生成失败
      const errorMessage = result.errorMessage || '视频延长失败';
      const duration = Date.now() - startTime;
      
      // 记录失败日志
      await logError(taskId, 'extend_task', `延长视频失败: ${errorMessage}`, 'EXTEND_VIDEO_FAILED', errorMessage, {
        duration_ms: duration,
      });
      
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.FAILED,
          errorMessage: errorMessage,
          extraData: {
            status_text: '延长失败'
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    }
  } catch (error) {
    console.error(`[ExtendVideo] Error processing task ${taskId}:`, error);
    const duration = Date.now() - startTime;
    
    // 记录异常日志
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const errorStack = error instanceof Error ? error.stack : undefined;
    await logError(taskId, 'extend_task', `延长视频异常: ${errorMessage}`, 'UNEXPECTED_ERROR', errorMessage + (errorStack ? `\n${errorStack}` : ''), {
      duration_ms: duration,
    });
    
    const db = await getDb();
    await db
      .update(videoTasks)
      .set({ 
        status: TASK_STATUS.FAILED,
        errorMessage: error instanceof Error ? error.message : '视频延长失败',
        extraData: {
          status_text: '延长失败'
        },
        updatedAt: new Date().toISOString()
      })
      .where(eq(videoTasks.id, taskId));
  }
}

// 延长视频任务排队入口：通过全局并发控制器提交任务
function queueExtendVideoTask(
  taskId: string,
  prompt: string,
  videoUrls: string[],
  options?: {
    ratio?: string;
    duration?: number;
    generateAudio?: boolean;
  }
): void {
  const pendingCount = taskLimiter.pendingCount;
  const activeCount = taskLimiter.activeCount;
  console.log(`[ExtendVideo] Task ${taskId} queued, limiter state: active=${activeCount}, pending=${pendingCount}`);

  taskLimiter(async () => {
    console.log(`[ExtendVideo] Task ${taskId} acquired concurrency slot, starting processing...`);
    try {
      await processExtendVideoTaskInner(taskId, prompt, videoUrls, options);
    } catch (err) {
      console.error(`[ExtendVideo] Unhandled error for ${taskId}:`, err);
    }
  });
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4().slice(0, 8);
  const startTime = Date.now();

  try {
    // 1. 验证用户身份
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
        { success: false, error: '登录已过期，请重新登录' },
        { status: 401 }
      );
    }

    const userId = payload.id || 'anonymous';

    // 2. 解析请求体
    const body: ExtendVideoParams = await request.json();
    const { videoUrls, prompt, ratio, duration, generateAudio } = body;

    console.log(`[${requestId}] 延长视频请求:`, {
      userId,
      videoCount: videoUrls?.length,
      prompt: prompt?.slice(0, 50),
      ratio,
      duration,
      generateAudio
    });

    // 3. 验证必填参数
    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: '请至少上传 1 个视频片段' },
        { status: 400 }
      );
    }

    if (videoUrls.length > 3) {
      return NextResponse.json(
        { success: false, error: '最多支持 3 个视频片段' },
        { status: 400 }
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请输入衔接描述' },
        { status: 400 }
      );
    }

    // 验证视频 URL 格式
    for (let i = 0; i < videoUrls.length; i++) {
      if (!videoUrls[i] || typeof videoUrls[i] !== 'string') {
        return NextResponse.json(
          { success: false, error: `视频片段 ${i + 1} 的 URL 无效` },
          { status: 400 }
        );
      }
    }

    // 4. 验证可选参数
    const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
    const finalRatio = ratio && validRatios.includes(ratio) ? ratio : VIDEO_GENERATION_DEFAULTS.ratio;
    const finalDuration = duration && duration >= 4 && duration <= 15 ? duration : VIDEO_GENERATION_DEFAULTS.duration;

    // 5. 创建任务记录
    const taskId = uuidv4();
    const createdAt = new Date().toISOString();

    const taskRecord = {
      id: taskId,
      userId: userId,
      modelId: 'seedance2.0',
      mode: 'extend' as const,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      imageUrls: [], // 延长视频不使用图片
      status: TASK_STATUS.QUEUE,
      extraData: {
        provider: 'seedance2.0',
        ratio: finalRatio,
        duration: finalDuration,
        videoUrls: videoUrls,
        generateAudio: generateAudio ?? VIDEO_GENERATION_DEFAULTS.generateAudio,
        status_text: '排队中'
      },
      metadata: { 
        task_type: 'extend_video',
        video_urls: videoUrls
      },
      createdAt: createdAt
    };

    const db = await getDb();
    await db.insert(videoTasks).values(taskRecord);
    
    // 记录任务创建日志
    await logInfo(taskId, 'extend_task', `延长视频任务已创建，等待处理`, {
      request_id: requestId,
      user_id: payload.id,
      video_count: videoUrls.length,
      ratio: finalRatio,
      duration: finalDuration,
      generate_audio: generateAudio,
    });

    console.log(`[${requestId}] 延长视频任务创建成功:`, { taskId });

    // 6. 启动视频延长任务处理（异步，受全局并发槽限制）
    queueExtendVideoTask(taskId, prompt, videoUrls, { 
      ratio: finalRatio, 
      duration: finalDuration,
      generateAudio
    });

    // 7. 返回任务信息
    const responseTime = Date.now() - startTime;
    console.log(`[${requestId}] 返回响应 (${responseTime}ms):`, {
      success: true,
      taskId,
      status: 'queue'
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        status: 'queue',
        status_text: '排队中'
      }
    });

  } catch (error) {
    console.error(`[${requestId}] 请求处理失败:`, error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '延长视频请求失败' 
      },
      { status: 500 }
    );
  }
}
