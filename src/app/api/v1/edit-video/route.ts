/**
 * 编辑视频 API (F03)
 * 
 * 支持对视频进行编辑：替换主体、增删对象、局部重绘等
 * 与原视频保持一致（画幅、时长、音频由模型自动处理）
 * 仅支持 Seedance 2.0 模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { videoTasks } from '@/storage/database/shared/schema';
import { TASK_STATUS, VIDEO_GENERATION_DEFAULTS } from '@/lib/config';
import { getVideoProvider, VideoContent } from '@/lib/providers';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import type { EditVideoParams } from '@/lib/types';
import { logInfo, logError, logDebug } from '@/lib/task-logger';
import { taskLimiter } from '@/lib/task-queue';

// 编辑视频任务内部处理（获取并发槽后执行）
async function processEditVideoTaskInner(
  taskId: string,
  prompt: string,
  videoUrl: string,
  options?: {
    imageUrl?: string;       // 参考图片（可选）
  }
): Promise<void> {
  const startTime = Date.now();
  
  // 记录任务开始
  await logInfo(taskId, 'edit_task', `编辑视频任务开始`, {
    has_reference_image: !!options?.imageUrl,
    prompt_preview: prompt.substring(0, 100),
  });

  try {
    const db = await getDb();
    
    // 【状态诚实】获取到并发槽后才更新为 PROCESSING
    await db
      .update(videoTasks)
      .set({ 
        status: TASK_STATUS.PROCESSING,
        extraData: {
          status_text: '视频编辑中...'
        },
        updatedAt: new Date().toISOString()
      })
      .where(eq(videoTasks.id, taskId));

    // 仅支持 Seedance 2.0
    const modelId = 'seedance2.0';
    const provider = getVideoProvider(modelId);

    // 记录 Provider 信息
    await logDebug(taskId, 'edit_task', `使用 Provider: ${provider.name}`, {
      provider: provider.id,
    });

    // 构建 content 数组
    const content: VideoContent[] = [];

    // 添加文本 prompt（编辑指令）
    const cleanPrompt = prompt.trim();
    content.push({
      type: 'text',
      text: cleanPrompt
    });

    // 添加参考图片（可选）
    if (options?.imageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: options.imageUrl },
        role: 'reference_image'
      });
    }

    // 添加待编辑视频
    content.push({
      type: 'video_url',
      video_url: { url: videoUrl },
      role: 'reference_video'
    });

    console.log(`[EditVideo] Starting for task ${taskId}`);
    console.log(`[EditVideo] Content items: ${content.length}`);
    console.log(`[EditVideo] Video: ${videoUrl}, Image: ${options?.imageUrl || 'None'}`);

    // 调用 Provider 生成视频（使用默认参数，与原视频保持一致）
    const result = await provider.generate(content, {
      model: 'doubao-seedance-2-0-260128',
      duration: 5, // 默认时长，模型会自动适配原视频
      resolution: '720p', // Seedance 2.0 限制为 720p
      ratio: '16:9', // 默认比例，模型会自动适配原视频
      watermark: VIDEO_GENERATION_DEFAULTS.watermark,
      generateAudio: true, // 默认生成音频
      maxWaitTime: VIDEO_GENERATION_DEFAULTS.maxWaitTime
    });

    console.log(`[EditVideo] Response received for task ${taskId}`);
    console.log(`[EditVideo] Success: ${result.success}`);

    // 更新任务状态
    if (result.success && result.videoUrl) {
      const duration = Date.now() - startTime;
      
      // 记录成功日志
      await logInfo(taskId, 'edit_task', `编辑视频成功`, {
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
            status_text: '编辑成功',
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
      // 编辑失败
      const errorMessage = result.errorMessage || '视频编辑失败';
      const duration = Date.now() - startTime;
      
      // 记录失败日志
      await logError(taskId, 'edit_task', `编辑视频失败: ${errorMessage}`, 'EDIT_VIDEO_FAILED', errorMessage, {
        duration_ms: duration,
      });
      
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.FAILED,
          errorMessage: errorMessage,
          extraData: {
            status_text: '编辑失败'
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    }
  } catch (error) {
    console.error(`[EditVideo] Error processing task ${taskId}:`, error);
    const duration = Date.now() - startTime;
    
    // 记录异常日志
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const errorStack = error instanceof Error ? error.stack : undefined;
    await logError(taskId, 'edit_task', `编辑视频异常: ${errorMessage}`, 'UNEXPECTED_ERROR', errorMessage + (errorStack ? `\n${errorStack}` : ''), {
      duration_ms: duration,
    });
    
    const db = await getDb();
    await db
      .update(videoTasks)
      .set({ 
        status: TASK_STATUS.FAILED,
        errorMessage: error instanceof Error ? error.message : '视频编辑失败',
        extraData: {
          status_text: '编辑失败'
        },
        updatedAt: new Date().toISOString()
      })
      .where(eq(videoTasks.id, taskId));
  }
}

// 编辑视频任务排队入口：通过全局并发控制器提交任务
function queueEditVideoTask(
  taskId: string,
  prompt: string,
  videoUrl: string,
  options?: {
    imageUrl?: string;
  }
): void {
  const pendingCount = taskLimiter.pendingCount;
  const activeCount = taskLimiter.activeCount;
  console.log(`[EditVideo] Task ${taskId} queued, limiter state: active=${activeCount}, pending=${pendingCount}`);

  taskLimiter(async () => {
    console.log(`[EditVideo] Task ${taskId} acquired concurrency slot, starting processing...`);
    try {
      await processEditVideoTaskInner(taskId, prompt, videoUrl, options);
    } catch (err) {
      console.error(`[EditVideo] Unhandled error for ${taskId}:`, err);
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
    const body: EditVideoParams = await request.json();
    const { videoUrl, imageUrl, prompt } = body;

    console.log(`[${requestId}] 编辑视频请求:`, {
      userId,
      videoUrl: videoUrl?.slice(0, 50),
      hasImage: !!imageUrl,
      prompt: prompt?.slice(0, 50)
    });

    // 3. 验证必填参数
    if (!videoUrl || typeof videoUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: '请上传待编辑视频' },
        { status: 400 }
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请输入编辑指令' },
        { status: 400 }
      );
    }

    // 验证视频 URL 格式
    if (!videoUrl.startsWith('http')) {
      return NextResponse.json(
        { success: false, error: '视频 URL 无效' },
        { status: 400 }
      );
    }

    // 4. 创建任务记录
    const taskId = uuidv4();
    const createdAt = new Date().toISOString();

    const taskRecord = {
      id: taskId,
      userId: userId,
      modelId: 'seedance2.0',
      mode: 'edit' as const,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      imageUrls: imageUrl ? [imageUrl] : [], // 存储参考图片
      status: TASK_STATUS.QUEUE,
      extraData: {
        provider: 'seedance2.0',
        imageUrl: imageUrl || null,
        videoUrl: videoUrl,
        status_text: '排队中'
      },
      metadata: { 
        task_type: 'edit_video',
        video_url: videoUrl
      },
      createdAt: createdAt
    };

    const db = await getDb();
    await db.insert(videoTasks).values(taskRecord);

    console.log(`[${requestId}] 编辑视频任务创建成功:`, { taskId });

    // 5. 启动视频编辑任务处理（异步，受全局并发槽限制）
    queueEditVideoTask(taskId, prompt, videoUrl, { imageUrl });

    // 6. 返回任务信息
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
        error: error instanceof Error ? error.message : '编辑视频请求失败' 
      },
      { status: 500 }
    );
  }
}
