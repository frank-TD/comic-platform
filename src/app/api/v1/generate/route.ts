/**
 * 统一调度 API (F01)
 * 
 * 支持多模型视频生成（通过 Provider 适配层）
 * V1.0: 集成 Doubao-Seedance-1.5-pro
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { videoTasks } from '@/storage/database/shared/schema';
import { TASK_STATUS, DEFAULT_PROVIDER, MODEL_PROVIDERS, VIDEO_GENERATION_DEFAULTS, getModelConfig } from '@/lib/config';
import { getVideoProvider, VideoContent } from '@/lib/providers';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { logInfo, logError, logDebug } from '@/lib/task-logger';
import { taskLimiter } from '@/lib/task-queue';

// 视频生成任务处理
// 核心流程：获取并发槽 → 更新状态为 PROCESSING → 调用 ARK → 处理结果
// 注意：此函数内部不再负责状态流转，由 queueVideoTask 统一调度
async function processVideoTaskInner(
  taskId: string,
  prompt: string,
  images: string[] | undefined,
  options?: {
    model?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    videoUrls?: string[];    // 视频参考（最多 3 个）
    audioUrls?: string[];    // 音频参考（最多 3 个）
    generateAudio?: boolean;  // 是否生成音频
    serviceTier?: 'flex';    // 离线推理模式
    executionExpiresAfter?: number;  // 离线推理过期时间（秒）
  }
): Promise<void> {
  const startTime = Date.now();
  const modelId = options?.model || DEFAULT_PROVIDER;
  
  // 记录任务开始
  await logInfo(taskId, 'video_task', `视频生成任务开始`, {
    model: modelId,
    hasImages: !!images,
    imageCount: images?.length || 0,
    resolution: options?.resolution,
    ratio: options?.ratio,
    duration: options?.duration,
    videoRefCount: options?.videoUrls?.length || 0,
    audioRefCount: options?.audioUrls?.length || 0,
  });

  try {
    const db = await getDb();
    
    // 获取模型配置
    const modelConfig = getModelConfig(modelId);

    // 获取对应的 Provider
    const provider = getVideoProvider(modelId);

    console.log(`[VideoGen] Using provider: ${provider.name} (${provider.status})`);
    
    // 记录 Provider 信息
    await logDebug(taskId, 'video_task', `使用 Provider: ${provider.name}`, {
      provider: provider.id,
      providerStatus: provider.status,
    });

    // 构建 content 数组
    const content: VideoContent[] = [];

    // Seedance 2.0: 所有参考图片统一使用 reference_image 模式
    // 其他模型（Seedance 1.5-pro）: 第一张为首帧、第二张为尾帧、第三张及之后为风格参考图
    // 防御性去重：确保同一 URL 不会重复发送给 ARK API
    const uniqueImages = images ? [...new Set(images)] : [];
    if (uniqueImages.length > 0) {
      if (modelId === 'seedance2.0') {
        // Seedance 2.0: 全部作为参考图
        for (const imageUrl of uniqueImages) {
          content.push({
            type: 'image_url',
            image_url: { url: imageUrl },
            role: 'reference_image'
          });
        }
      } else {
        // 其他模型（Seedance 1.5-pro 等）：首尾帧模式
        // 首帧：第一张图片
        content.push({
          type: 'image_url',
          image_url: { url: uniqueImages[0] },
          role: 'first_frame'
        });
        
        // 尾帧：第二张图片
        if (uniqueImages.length > 1) {
          content.push({
            type: 'image_url',
            image_url: { url: uniqueImages[1] },
            role: 'last_frame'
          });
        }
        
        // 风格参考图：第三张及之后的图片
        for (let i = 2; i < uniqueImages.length; i++) {
          content.push({
            type: 'image_url',
            image_url: { url: uniqueImages[i] },
            role: 'reference_image'
          });
        }
      }
    }

    // 添加文本 prompt
    // 移除图片引用标记（如 @图1 @图2）
    const cleanPrompt = prompt.replace(/@[图\d]+\s*/g, '').trim();
    content.push({
      type: 'text',
      text: cleanPrompt
    });

    // 添加视频参考（仅 Seedance 2.0 支持，最多 3 个）
    if (options?.videoUrls && options.videoUrls.length > 0) {
      for (const videoUrl of options.videoUrls) {
        content.push({
          type: 'video_url',
          video_url: { url: videoUrl },
          role: 'reference_video'
        });
      }
    }

    // 添加音频参考（仅 Seedance 2.0 支持，最多 3 个）
    if (options?.audioUrls && options.audioUrls.length > 0) {
      for (const audioUrl of options.audioUrls) {
        content.push({
          type: 'audio_url',
          audio_url: { url: audioUrl },
          role: 'reference_audio'
        });
      }
    }

    // 使用用户选择的参数或默认值
    const finalResolution = options?.resolution || VIDEO_GENERATION_DEFAULTS.resolution;
    const finalRatio = options?.ratio || VIDEO_GENERATION_DEFAULTS.ratio;
    const finalDuration = options?.duration || VIDEO_GENERATION_DEFAULTS.duration;
    const finalGenerateAudio = options?.generateAudio ?? VIDEO_GENERATION_DEFAULTS.generateAudio;

    console.log(`[VideoGen] Starting generation for task ${taskId}`);
    console.log(`[VideoGen] Content items: ${content.length}`);
    console.log(`[VideoGen] Model: ${modelId}, Resolution: ${finalResolution}, Ratio: ${finalRatio}, Duration: ${finalDuration}s`);
    console.log(`[VideoGen] Video references: ${options?.videoUrls?.length || 0}, Audio references: ${options?.audioUrls?.length || 0}, Generate audio: ${finalGenerateAudio}`);
    console.log(`[VideoGen] Service tier: ${options?.serviceTier || 'default'}`);

    // 【状态诚实】获取到并发槽后才更新为 PROCESSING
    // 此时任务才真正开始调用 ARK，避免排队期间因 PROCESSING 超时被误判失败
    await db
      .update(videoTasks)
      .set({ 
        status: TASK_STATUS.PROCESSING,
        extraData: {
          status_text: '生成中...'
        },
        updatedAt: new Date().toISOString()
      })
      .where(eq(videoTasks.id, taskId));

    // 调用 Provider 生成视频
    let result = await provider.generate(content, {
      model: modelConfig.endpoint,
      duration: finalDuration,
      resolution: finalResolution as '480p' | '720p' | '1080p',
      ratio: finalRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive',
      watermark: VIDEO_GENERATION_DEFAULTS.watermark,
      generateAudio: finalGenerateAudio,
      maxWaitTime: VIDEO_GENERATION_DEFAULTS.maxWaitTime,
      serviceTier: options?.serviceTier,
      executionExpiresAfter: options?.executionExpiresAfter,
    });

    // 离线推理降级：如果 service_tier: flex 被 ARK API 拒绝，自动降级为实时模式
    if (!result.success && options?.serviceTier === 'flex' && result.errorMessage) {
      const errorMsg = result.errorMessage.toLowerCase();
      if (errorMsg.includes('service_tier') || errorMsg.includes('service tier') || errorMsg.includes('unsupported') || errorMsg.includes('invalidparameter')) {
        console.warn(`[VideoGen] service_tier: flex not supported, falling back to default for task ${taskId}`);
        await logInfo(taskId, 'video_task', `离线推理不支持，降级为实时模式`, {
          original_error: result.errorMessage,
          fallback_service_tier: 'default',
        });

        // 降级为实时模式重试
        result = await provider.generate(content, {
          model: modelConfig.endpoint,
          duration: finalDuration,
          resolution: finalResolution as '480p' | '720p' | '1080p',
          ratio: finalRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive',
          watermark: VIDEO_GENERATION_DEFAULTS.watermark,
          generateAudio: finalGenerateAudio,
          maxWaitTime: VIDEO_GENERATION_DEFAULTS.maxWaitTime,
          // 不传 serviceTier，使用默认实时模式
        });

        // 更新数据库中的 service_tier 标记
        if (result.success || result.taskId) {
          try {
            const existingTask = await db
              .select()
              .from(videoTasks)
              .where(eq(videoTasks.id, taskId))
              .limit(1);
            
            if (existingTask.length > 0) {
              const existingMetadata = (existingTask[0].metadata as Record<string, unknown>) || {};
              const existingExtraData = (existingTask[0].extraData as Record<string, unknown>) || {};
              await db
                .update(videoTasks)
                .set({
                  metadata: {
                    ...existingMetadata,
                    service_tier: 'default',
                    flex_fallback: true,
                  },
                  extraData: {
                    ...existingExtraData,
                    service_tier: 'default',
                    status_text: '排队中（已降级为实时模式）',
                  },
                  updatedAt: new Date().toISOString()
                })
                .where(eq(videoTasks.id, taskId));
            }
          } catch (updateError) {
            console.error(`[VideoGen] Failed to update task fallback info:`, updateError);
          }
        }
      }
    }

    console.log(`[VideoGen] Response received for task ${taskId}`);
    console.log(`[VideoGen] Success: ${result.success}, hasVideoUrl: ${!!result.videoUrl}, serviceTier: ${options?.serviceTier || 'default'}`);

    // 更新任务状态
    if (result.success && result.videoUrl) {
      // 实时模式：生成完成，有视频 URL
      // 记录成功日志
      const duration = Date.now() - startTime;
      await logInfo(taskId, 'video_task', `视频生成成功`, {
        duration_ms: duration,
        result_url: result.videoUrl,
        model_task_id: result.taskId,
        resolution: result.metadata?.resolution,
        ratio: result.metadata?.ratio,
        duration_sec: result.metadata?.duration,
      });
      
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.SUCCESS,
          resultUrl: result.videoUrl,
          extraData: {
            status_text: '生成成功',
            model_response: {
              task_id: result.taskId,
              resolution: result.metadata?.resolution,
              ratio: result.metadata?.ratio,
              duration: result.metadata?.duration,
              frames_per_second: result.metadata?.framesPerSecond,
              last_frame_url: result.metadata?.lastFrameUrl
            }
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    } else if (result.success && !result.videoUrl && options?.serviceTier === 'flex') {
      // 离线推理模式：任务已提交到 ARK，但尚未完成
      // 存储 ARK 任务 ID，保持 PROCESSING 状态，前端轮询获取结果
      const arkTaskId = result.taskId;
      console.log(`[VideoGen] Offline task created, ARK task ID: ${arkTaskId}`);
      
      await logInfo(taskId, 'video_task', `离线推理任务已提交`, {
        ark_task_id: arkTaskId,
        service_tier: 'flex',
      });
      
      // 更新 metadata 添加 ark_task_id 和 service_tier
      const existingTask = await db
        .select()
        .from(videoTasks)
        .where(eq(videoTasks.id, taskId))
        .limit(1);
      
      if (existingTask.length > 0) {
        const existingMetadata = (existingTask[0].metadata as Record<string, unknown>) || {};
        await db
          .update(videoTasks)
          .set({
            status: TASK_STATUS.PROCESSING,
            extraData: {
              status_text: '离线处理中...',
              ark_task_id: arkTaskId,
              service_tier: 'flex',
            },
            metadata: {
              ...existingMetadata,
              ark_task_id: arkTaskId,
              service_tier: 'flex',
            },
            updatedAt: new Date().toISOString()
          })
          .where(eq(videoTasks.id, taskId));
      }
    } else {
      // 生成失败
      const errorMsg = result.errorMessage || '视频生成失败';
      const duration = Date.now() - startTime;
      
      // 记录失败日志
      await logError(taskId, 'video_task', `视频生成失败: ${errorMsg}`, 'VIDEO_GENERATION_FAILED', errorMsg, {
        duration_ms: duration,
        model_task_id: result.taskId,
      });
      
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.FAILED,
          errorMessage: errorMsg,
          extraData: {
            status_text: '生成失败'
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    }

  } catch (error) {
    console.error(`[VideoGen] Error processing task ${taskId}:`, error);
    const duration = Date.now() - startTime;
    
    // 记录异常日志
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const errorStack = error instanceof Error ? error.stack : undefined;
    await logError(taskId, 'video_task', `视频生成异常: ${errorMessage}`, 'UNEXPECTED_ERROR', errorMessage + (errorStack ? `\n${errorStack}` : ''), {
      duration_ms: duration,
    });
    
    // 更新任务状态为失败
    try {
      const db = await getDb();
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await db
        .update(videoTasks)
        .set({ 
          status: TASK_STATUS.FAILED,
          errorMessage: errorMessage,
          extraData: {
            status_text: '生成失败'
          },
          updatedAt: new Date().toISOString()
        })
        .where(eq(videoTasks.id, taskId));
    } catch (updateError) {
      console.error(`[VideoGen] Failed to update task status:`, updateError);
    }
  }
}

// 任务排队入口：通过全局并发控制器提交任务
// 任务在获取到并发槽之前保持 QUEUE 状态，获取槽后才改为 PROCESSING 并真正调用 ARK
function queueVideoTask(
  taskId: string,
  prompt: string,
  images: string[] | undefined,
  options?: {
    model?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    videoUrls?: string[];
    audioUrls?: string[];
    generateAudio?: boolean;
    serviceTier?: 'flex';
    executionExpiresAfter?: number;
  }
): void {
  const pendingCount = taskLimiter.pendingCount;
  const activeCount = taskLimiter.activeCount;
  console.log(`[VideoGen] Task ${taskId} queued, limiter state: active=${activeCount}, pending=${pendingCount}`);

  taskLimiter(async () => {
    // 获取到并发槽：任务从 QUEUE → PROCESSING
    console.log(`[VideoGen] Task ${taskId} acquired concurrency slot, starting processing...`);
    try {
      await processVideoTaskInner(taskId, prompt, images, options);
    } catch (err) {
      // processVideoTaskInner 内部已处理异常，这里兜底防止未捕获错误导致槽位泄漏
      console.error(`[VideoGen] Unhandled error in processVideoTaskInner for ${taskId}:`, err);
    }
  });
}

// 去重工具函数：图片、视频、音频 URL 不应重复
function dedupArray(arr: string[] | undefined): string[] | undefined {
  if (!arr) return undefined;
  return [...new Set(arr)];
}

// 请求体验证
function validateRequest(body: unknown): { valid: boolean; error?: string; data?: {
  prompt: string;
  prompts?: string[];  // 批量模式用
  mode: string;
  images?: string[];
  model?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  videoUrls?: string[];     // 视频参考（仅 Seedance 2.0），最多 3 个
  audioUrls?: string[];     // 音频参考（仅 Seedance 2.0），最多 3 个
  generateAudio?: boolean;   // 是否生成音频（仅 Seedance 2.0）
  useOfflineInference?: boolean;  // 是否启用离线推理（仅 Seedance 2.0 批量模式）
  imageOrder?: string[];    // 图片顺序（URL 数组），用于重新生成时还原
  referencedImages?: string[];  // 单次模式中被引用的图片（无引用时与 images 相同）
  metadata?: object;
  taskItems?: Array<{
    prompt: string;
    images: string[];
    videos: string[];
    audios: string[];
    duration?: number;
  }>;
} } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '请求体不能为空' };
  }

  const b = body as Record<string, unknown>;

  if (!b.mode || !['single', 'batch'].includes(b.mode as string)) {
    return { valid: false, error: 'mode 参数无效，仅支持 single 或 batch' };
  }

  const mode = b.mode as string;

  // 单次模式：需要一个 prompt
  if (mode === 'single') {
    if (!b.prompt || typeof b.prompt !== 'string') {
      return { valid: false, error: 'prompt 参数必填' };
    }
  }

  // 批量模式：需要一个 prompts 数组
  if (mode === 'batch') {
    if (!b.prompts || !Array.isArray(b.prompts) || b.prompts.length === 0) {
      return { valid: false, error: 'batch 模式需要 prompts 数组参数' };
    }
    if (b.prompts.length > 5) {
      return { valid: false, error: 'batch 模式最多支持 5 个任务' };
    }
    for (const p of b.prompts) {
      if (typeof p !== 'string' || !p.trim()) {
        return { valid: false, error: 'prompts 数组中的每个元素必须是非空字符串' };
      }
    }
  }

  // 验证 model 参数
  const validModelKeys = Object.keys(MODEL_PROVIDERS);
  if (b.model && !validModelKeys.includes(b.model as string)) {
    return { valid: false, error: `model 参数无效，仅支持: ${validModelKeys.join(', ')}` };
  }

  // 验证 ratio 参数
  const modelConfig = getModelConfig(b.model as string || DEFAULT_PROVIDER);
  const supportedRatios = modelConfig.features.ratios as readonly string[];
  if (b.ratio && typeof b.ratio === 'string' && !supportedRatios.includes(b.ratio)) {
    return { valid: false, error: `ratio 参数无效，${modelConfig.name} 仅支持: ${supportedRatios.join(', ')}` };
  }

  // 验证 resolution 参数
  if (b.resolution && !['480p', '720p', '1080p'].includes(b.resolution as string)) {
    return { valid: false, error: `resolution 参数无效，仅支持: 480p, 720p, 1080p` };
  }

  // 验证 duration 参数
  const { minDuration, maxDuration } = modelConfig.features;
  if (b.duration && (typeof b.duration !== 'number' || b.duration < minDuration || b.duration > maxDuration)) {
    return { valid: false, error: `duration 参数无效，${modelConfig.name} 仅支持 ${minDuration}-${maxDuration} 秒` };
  }

  // 验证视频参考数量（仅 Seedance 2.0 支持，最多 3 个）
  const modelId = b.model as string || DEFAULT_PROVIDER;
  if (b.videoUrls && Array.isArray(b.videoUrls)) {
    if (modelId !== 'seedance2.0') {
      return { valid: false, error: '视频参考仅支持 Seedance 2.0 模型' };
    }
    if (b.videoUrls.length > 3) {
      return { valid: false, error: '视频参考最多支持 3 个' };
    }
    // 验证视频 URL 格式
    for (const url of b.videoUrls) {
      if (typeof url !== 'string' || !url.startsWith('http')) {
        return { valid: false, error: '视频参考必须提供有效的 URL' };
      }
    }
  }

  // 验证音频参考数量（仅 Seedance 2.0 支持，最多 3 个）
  if (b.audioUrls && Array.isArray(b.audioUrls)) {
    if (modelId !== 'seedance2.0') {
      return { valid: false, error: '音频参考仅支持 Seedance 2.0 模型' };
    }
    if (b.audioUrls.length > 3) {
      return { valid: false, error: '音频参考最多支持 3 个' };
    }
    // 验证音频 URL 格式
    for (const url of b.audioUrls) {
      if (typeof url !== 'string' || !url.startsWith('http')) {
        return { valid: false, error: '音频参考必须提供有效的 URL' };
      }
    }
  }

  // 图片数量校验：Seedance 2.0 最多 9 张，其他模型最多 4 张
  const dedupedImages = dedupArray(Array.isArray(b.images) ? b.images as string[] : undefined);
  const dedupedReferencedImages = dedupArray(Array.isArray(b.referencedImages) ? b.referencedImages as string[] : undefined);
  const maxImages = modelId === 'seedance2.0' ? 9 : 4;
  if (dedupedReferencedImages && dedupedReferencedImages.length > maxImages) {
    return { valid: false, error: `引用图片数量 ${dedupedReferencedImages.length} 超出限制，${modelConfig.name} 最多支持 ${maxImages} 张` };
  }
  if (dedupedImages && dedupedImages.length > maxImages) {
    return { valid: false, error: `上传图片数量 ${dedupedImages.length} 超出限制，${modelConfig.name} 最多支持 ${maxImages} 张` };
  }

  // 验证 taskItems（每任务独立素材）
  let validatedTaskItems: Array<{ prompt: string; images: string[]; videos: string[]; audios: string[]; duration?: number }> | undefined;
  if (b.taskItems && Array.isArray(b.taskItems)) {
    validatedTaskItems = [];
    for (const item of b.taskItems) {
      if (typeof item !== 'object' || !item) {
        return { valid: false, error: 'taskItems 中的每个元素必须是对象' };
      }
      const taskItem = item as Record<string, unknown>;
      if (typeof taskItem.prompt !== 'string') {
        return { valid: false, error: 'taskItems 中的每个元素必须包含 prompt 字符串' };
      }
      const itemImages = Array.isArray(taskItem.images) ? (taskItem.images as string[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
      const itemVideos = Array.isArray(taskItem.videos) ? (taskItem.videos as string[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
      const itemAudios = Array.isArray(taskItem.audios) ? (taskItem.audios as string[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
      // 验证单条任务的 duration（如提供）
      let itemDuration: number | undefined;
      if (taskItem.duration !== undefined) {
        if (typeof taskItem.duration !== 'number' || taskItem.duration < minDuration || taskItem.duration > maxDuration) {
          return { valid: false, error: `taskItems 中某任务的 duration 参数无效，${modelConfig.name} 仅支持 ${minDuration}-${maxDuration} 秒` };
        }
        itemDuration = taskItem.duration;
      }
      if (itemImages.length > maxImages) {
        return { valid: false, error: `taskItems 中某任务的图片数量 ${itemImages.length} 超出限制，${modelConfig.name} 最多支持 ${maxImages} 张` };
      }
      if (itemVideos.length > 3) {
        return { valid: false, error: 'taskItems 中某任务的视频参考最多支持 3 个' };
      }
      if (itemAudios.length > 3) {
        return { valid: false, error: 'taskItems 中某任务的音频参考最多支持 3 个' };
      }
      validatedTaskItems.push({
        prompt: taskItem.prompt as string,
        images: [...new Set(itemImages)],
        videos: [...new Set(itemVideos)],
        audios: [...new Set(itemAudios)],
        duration: itemDuration
      });
    }
  }

  return {
    valid: true,
    data: {
      prompt: b.prompt as string,
      prompts: b.prompts as string[] | undefined,
      mode,
      images: dedupedImages,
      model: b.model as string | undefined,
      resolution: b.resolution as string | undefined,
      ratio: b.ratio as string | undefined,
      duration: typeof b.duration === 'number' ? b.duration as number : undefined,
      videoUrls: dedupArray(Array.isArray(b.videoUrls) ? b.videoUrls as string[] : undefined),
      audioUrls: dedupArray(Array.isArray(b.audioUrls) ? b.audioUrls as string[] : undefined),
      generateAudio: typeof b.generateAudio === 'boolean' ? b.generateAudio as boolean : undefined,
      useOfflineInference: typeof b.useOfflineInference === 'boolean' ? b.useOfflineInference as boolean : undefined,
      imageOrder: dedupArray(Array.isArray(b.imageOrder) ? b.imageOrder as string[] : undefined),
      referencedImages: dedupedReferencedImages,
      metadata: b.metadata as object | undefined,
      taskItems: validatedTaskItems
    }
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    // 1. 验证 JWT Token
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

    // 2. 解析请求体
    const body = await request.json();
    const validation = validateRequest(body);

    if (!validation.valid) {
      console.warn(`[${requestId}] 请求验证失败:`, validation.error);
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { prompt, prompts, mode, images, model, resolution, ratio, duration, videoUrls, audioUrls, generateAudio, useOfflineInference, imageOrder, referencedImages, metadata, taskItems } = validation.data!;

    // 3. 使用 JWT Token 中的 user_id
    const userId = payload.id;

    // 4. 获取模型配置
    const modelId = model || DEFAULT_PROVIDER;

    // 5. 生成批次 ID（用于关联批量任务）
    const batchId = mode === 'batch' ? uuidv4() : undefined;

    // 6. 记录请求日志
    console.log(`[${requestId}] 收到生成请求:`, {
      userId: payload.username,
      mode,
      model: modelId,
      hasImages: !!(images && images.length > 0),
      imageCount: images?.length || 0,
      resolution,
      ratio,
      duration,
      batchId,
      promptCount: prompts?.length || 1,
      videoRefCount: videoUrls?.length || 0,
      audioRefCount: audioUrls?.length || 0,
      generateAudio,
      useOfflineInference,
      timestamp: new Date().toISOString()
    });

    // 6. 创建任务记录
    const db = await getDb();
    const createdAt = new Date().toISOString();

    // 解析 prompt 中的 @图X 引用，返回被引用的图片索引数组（从 1 开始）
    const extractImageRefs = (p: string): number[] => {
      const pattern = /@图(\d+)/g;
      const refs: number[] = [];
      let match;
      while ((match = pattern.exec(p)) !== null) {
        refs.push(parseInt(match[1], 10));
      }
      return refs;
    };

    // 确定要创建的任务列表（批量模式需要解析每个 prompt 的图片引用）
    const tasksToCreate: Array<{ prompt: string; originalPrompt: string; taskImages: string[]; taskVideoUrls?: string[]; taskAudioUrls?: string[]; duration?: number }> = [];
    
    if (mode === 'batch' && prompts) {
      if (taskItems && taskItems.length > 0) {
        // 方案C：每任务独立素材
        for (let i = 0; i < prompts.length; i++) {
          const item = taskItems[i];
          tasksToCreate.push({
            prompt: prompts[i],
            originalPrompt: prompts[i],
            taskImages: item?.images || [],
            taskVideoUrls: item?.videos || [],
            taskAudioUrls: item?.audios || [],
            duration: item?.duration
          });
        }
      } else {
        // 批量模式：每个 prompt 创建一条任务，并根据 @图X 引用筛选图片（兼容旧逻辑）
        for (const p of prompts) {
          const imageRefs = extractImageRefs(p);
          
          // 根据引用的 ID 筛选图片（@图1 对应 index 0，@图2 对应 index 1...）
          const taskImages = imageRefs
            .map(id => {
              const index = id - 1;
              return images && images[index] ? images[index] : null;
            })
            .filter((url): url is string => url !== null);
          
          tasksToCreate.push({ prompt: p, originalPrompt: p, taskImages });
        }
      }
    } else {
      // 单次模式：优先使用 referencedImages（前端解析的 @图X 引用），否则使用全部图片
      const taskImages = referencedImages && referencedImages.length > 0 ? referencedImages : (images || []);
      tasksToCreate.push({ prompt: prompt!, originalPrompt: prompt!, taskImages });
    }

    // 创建任务记录
    const createdTasks: Array<{ taskId: string; prompt: string; taskImages: string[]; taskVideoUrls?: string[]; taskAudioUrls?: string[]; useFlex: boolean; duration?: number }> = [];

    // 离线推理条件：批量模式 + Seedance 2.0 + 任务包含图片/视频/音频引用 + 用户选择启用
    // 注意：ARK API 的 service_tier: flex 不支持 t2v（纯文本生成视频）模式
    // 仅当任务包含图片/视频/音频等多模态参考且用户主动启用时才使用离线推理
    const hasTaskItemsMedia = Array.isArray(taskItems) && taskItems.some(item =>
      (item.images && item.images.length > 0) ||
      (item.videos && item.videos.length > 0) ||
      (item.audios && item.audios.length > 0)
    );
    const hasMediaRefs = !!(images && images.length > 0) || !!(videoUrls && videoUrls.length > 0) || !!(audioUrls && audioUrls.length > 0) || hasTaskItemsMedia;
    const isBatchOffline: boolean = mode === 'batch' && modelId === 'seedance2.0' && hasMediaRefs && useOfflineInference === true;

    try {
      await db.transaction(async (trx) => {
        for (const task of tasksToCreate) {
          const taskId = uuidv4();
          // 逐任务判断是否使用离线推理：需包含图片/视频/音频引用
          const taskHasImages = !!(task.taskImages && task.taskImages.length > 0);
          const taskHasVideoRefs = !!(task.taskVideoUrls && task.taskVideoUrls.length > 0) || !!(videoUrls && videoUrls.length > 0);
          const taskHasAudioRefs = !!(task.taskAudioUrls && task.taskAudioUrls.length > 0) || !!(audioUrls && audioUrls.length > 0);
          const taskUseFlex: boolean = isBatchOffline && (taskHasImages || taskHasVideoRefs || taskHasAudioRefs);
          
          // 每任务独立的视频/音频 URL（使用 ?? 避免空数组被误判为 falsy）
          const taskVideoUrls = task.taskVideoUrls ?? videoUrls ?? [];
          const taskAudioUrls = task.taskAudioUrls ?? audioUrls ?? [];

          const taskRecord = {
            id: taskId,
            userId: userId,
            modelId: modelId,
            mode: mode,
            prompt: task.prompt,
            originalPrompt: task.originalPrompt,
            imageUrls: task.taskImages,  // 使用该任务引用的图片
            status: TASK_STATUS.QUEUE,
            extraData: {
              provider: modelId,
              ratio: ratio,
              duration: task.duration || duration,
              videoUrls: taskVideoUrls,
              audioUrls: taskAudioUrls,
              generateAudio: generateAudio,
              status_text: '排队中',
              ...(taskUseFlex ? { service_tier: 'flex' } : {}),
            },
            metadata: { 
              batch_id: batchId,
              all_image_urls: images || [],  // 保存用户提交时的全部图片，用于重新生成时还原
              image_order: imageOrder || images || [],  // 保存图片顺序（从前端直接传入）
              video_urls: taskVideoUrls,  // 保存视频参考，用于重新生成时还原
              audio_urls: taskAudioUrls,  // 保存音频参考，用于重新生成时还原
              duration: task.duration || duration,  // 保存单条任务时长，用于重新生成时还原
              ...(taskUseFlex ? { service_tier: 'flex' } : {}),
              ...(metadata as Record<string, unknown> || {})
            },
            createdAt: createdAt
          };

          await trx.insert(videoTasks).values(taskRecord);
          createdTasks.push({ taskId, prompt: task.prompt, taskImages: task.taskImages, taskVideoUrls, taskAudioUrls, useFlex: taskUseFlex, duration: task.duration });
        }
      });
    } catch (txError) {
      console.error(`[${requestId}] 创建任务事务失败:`, txError);
      return NextResponse.json(
        { success: false, error: '创建任务失败' },
        { status: 500 }
      );
    }

    // 事务成功后再记录日志
    for (const task of createdTasks) {
      await logInfo(task.taskId, 'video_task', `视频生成任务已创建，等待处理`, {
        request_id: requestId,
        user_id: userId,
        mode: mode,
        model: modelId,
        resolution,
        ratio,
        duration,
        has_images: !!(task.taskImages && task.taskImages.length > 0),
        image_count: task.taskImages?.length || 0,
        all_image_count: images?.length || 0,  // 用户提交的全部图片数量
        video_ref_count: videoUrls?.length || 0,
        audio_ref_count: audioUrls?.length || 0,
        generate_audio: generateAudio,
        batch_id: batchId,
        service_tier: task.useFlex ? 'flex' : 'default',
      });
      
      console.log(`[${requestId}] 任务创建成功:`, {
        taskId: task.taskId,
        status: TASK_STATUS.QUEUE,
        createdAt,
        service_tier: task.useFlex ? 'flex' : 'default',
      });
    }

    // 7. 启动视频生成任务处理（异步，受全局并发槽限制）
    // 任务保持 QUEUE 状态，获取并发槽后才更新为 PROCESSING
    for (const task of createdTasks) {
      queueVideoTask(task.taskId, task.prompt, task.taskImages, { 
        model: modelId, 
        resolution, 
        ratio, 
        duration: task.duration || duration,
        videoUrls: task.taskVideoUrls,
        audioUrls: task.taskAudioUrls,
        generateAudio,
        ...(task.useFlex ? { serviceTier: 'flex' as const } : {}),
      });
    }

    // 8. 返回任务信息
    const responseTime = Date.now() - startTime;
    console.log(`[${requestId}] 返回响应:`, {
      success: true,
      taskCount: createdTasks.length,
      status: TASK_STATUS.QUEUE,
      duration: `${responseTime}ms`
    });
    
    return NextResponse.json({
      success: true,
      data: {
        batch_id: batchId,
        tasks: createdTasks.map(t => ({
          task_id: t.taskId,
          status: TASK_STATUS.QUEUE,
          status_text: '排队中',
          mode,
          model: modelId,
          provider: modelId,
          created_at: createdAt
        })),
        task_ids: createdTasks.map(t => t.taskId),
        status: TASK_STATUS.QUEUE,
        status_text: '排队中'
      }
    });

  } catch (error) {
    console.error(`[${requestId}] 生成请求异常:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      duration: `${Date.now() - startTime}ms`
    });
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
