/**
 * 任务状态查询 API
 * 用于前端轮询获取任务状态
 * 支持离线推理任务：自动查询 ARK API 获取最新状态
 * 支持 ARK API 任务状态：queued, running, succeeded, failed, expired, cancelled
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { videoTasks } from '@/storage/database/shared/schema';
import { eq, sql } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { TASK_STATUS } from '@/lib/config';
import { getVideoProvider } from '@/lib/providers';

// ARK API 返回的任务状态类型
type ArkTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired' | 'cancelled';

/**
 * 将 ARK API 英文错误信息转换为用户友好的中文提示
 */
function friendlyErrorMessage(rawMessage?: string): string {
  if (!rawMessage) return '视频生成失败';
  const lower = rawMessage.toLowerCase();
  if (lower.includes('copyright') || lower.includes('版权')) {
    return '生成内容可能涉及版权限制，请避免使用具体角色名称、品牌标识或受版权保护的IP形象，尝试使用更通用的描述。';
  }
  if (lower.includes('content moderation') || lower.includes('safety') || lower.includes('内容安全')) {
    return '生成内容触发安全审核，请调整提示词，避免涉及敏感或违规内容。';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return '请求过于频繁，请稍后再试。';
  }
  return rawMessage;
}

// 查询 ARK API 获取离线推理任务的最新状态
async function queryArkTaskStatus(arkTaskId: string, modelId?: string): Promise<{
  status: ArkTaskStatus;
  videoUrl?: string;
  lastFrameUrl?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
} | null> {
  try {
    // 优先使用 Provider 的 getArkTaskStatus 方法
    if (modelId) {
      try {
        const provider = getVideoProvider(modelId);
        if (provider.getArkTaskStatus) {
          return await provider.getArkTaskStatus(arkTaskId);
        }
      } catch {
        // Provider 不支持 getArkTaskStatus，降级到直接 HTTP 调用
      }
    }

    // 降级：直接调用 ARK API
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      console.error('[StatusAPI] ARK_API_KEY not configured');
      return null;
    }

    const { default: axios } = await import('axios');
    const response = await axios.get(
      `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${arkTaskId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const taskData = response.data;
    // 统一状态映射：ARK API 返回 pending/processing -> queued/running
    const mappedStatus: ArkTaskStatus = 
      taskData.status === 'processing' ? 'running' :
      taskData.status === 'pending' ? 'queued' :
      taskData.status;
    
    return {
      status: mappedStatus,
      videoUrl: taskData.content?.video_url,
      lastFrameUrl: taskData.content?.last_frame_url,
      errorMessage: friendlyErrorMessage(taskData.error?.message),
      metadata: {
        resolution: taskData.resolution,
        ratio: taskData.ratio,
        duration: taskData.duration,
        frames_per_second: taskData.framespersecond,
        service_tier: taskData.service_tier,
      },
    };
  } catch (error) {
    console.error('[StatusAPI] Failed to query ARK task status:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'task_id 参数必填' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const userId = payload.id;

    const result = await db
      .select()
      .from(videoTasks)
      .where(eq(videoTasks.id, taskId))
      .limit(1);

    if (!result || result.length === 0) {
      return NextResponse.json(
        { success: false, error: '任务不存在' },
        { status: 404 }
      );
    }

    const task = result[0];

    // 验证任务属于当前用户
    if (task.userId !== userId) {
      return NextResponse.json(
        { success: false, error: '无权访问此任务' },
        { status: 403 }
      );
    }

    // 状态码转文字
    const statusMap: Record<number, string> = {
      0: '排队中',
      1: '处理中',
      2: '成功',
      [-1]: '失败'
    };

    // 对于离线推理任务（service_tier=flex），查询 ARK API 获取最新状态
    const taskMetadata = task.metadata as Record<string, unknown> | null;
    const isOfflineTask = taskMetadata?.service_tier === 'flex' || (task.extraData as Record<string, unknown>)?.service_tier === 'flex';
    const arkTaskId = taskMetadata?.ark_task_id as string | undefined;
    const taskModelId = task.modelId || undefined;
    
    if (isOfflineTask && arkTaskId && (task.status === TASK_STATUS.PROCESSING || task.status === TASK_STATUS.QUEUE)) {
      const arkStatus = await queryArkTaskStatus(arkTaskId, taskModelId);
      
      if (arkStatus) {
        if (arkStatus.status === 'succeeded' && arkStatus.videoUrl) {
          // 离线任务完成，更新数据库
          await db
            .update(videoTasks)
            .set({
              status: TASK_STATUS.SUCCESS,
              resultUrl: arkStatus.videoUrl,
              extraData: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '生成成功',
                model_response: {
                  task_id: arkTaskId,
                  last_frame_url: arkStatus.lastFrameUrl,
                  ...(arkStatus.metadata || {}),
                }
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(videoTasks.id, taskId));

          return NextResponse.json({
            success: true,
            data: {
              task_id: task.id,
              status: TASK_STATUS.SUCCESS,
              status_text: '成功',
              result_url: arkStatus.videoUrl,
              error_message: null,
              extra_data: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '生成成功',
              },
              created_at: task.createdAt,
              updated_at: new Date().toISOString(),
              service_tier: 'flex',
            }
          });
        } else if (arkStatus.status === 'failed') {
          // 离线任务失败，更新数据库
          const errorMsg = arkStatus.errorMessage || '离线推理任务失败';
          await db
            .update(videoTasks)
            .set({
              status: TASK_STATUS.FAILED,
              errorMessage: errorMsg,
              extraData: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '生成失败'
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(videoTasks.id, taskId));

          return NextResponse.json({
            success: true,
            data: {
              task_id: task.id,
              status: TASK_STATUS.FAILED,
              status_text: '失败',
              result_url: null,
              error_message: errorMsg,
              extra_data: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '生成失败',
              },
              created_at: task.createdAt,
              updated_at: new Date().toISOString(),
              service_tier: 'flex',
            }
          });
        } else if (arkStatus.status === 'expired') {
          // 离线任务超时（超过 execution_expires_after 限制），更新数据库
          const errorMsg = arkStatus.errorMessage || '离线推理任务超时，生成时间超出限制';
          await db
            .update(videoTasks)
            .set({
              status: TASK_STATUS.FAILED,
              errorMessage: errorMsg,
              extraData: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '任务超时'
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(videoTasks.id, taskId));

          return NextResponse.json({
            success: true,
            data: {
              task_id: task.id,
              status: TASK_STATUS.FAILED,
              status_text: '任务超时',
              result_url: null,
              error_message: errorMsg,
              extra_data: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '任务超时',
              },
              created_at: task.createdAt,
              updated_at: new Date().toISOString(),
              service_tier: 'flex',
            }
          });
        } else if (arkStatus.status === 'cancelled') {
          // 离线任务被取消，更新数据库
          const errorMsg = arkStatus.errorMessage || '离线推理任务已被取消';
          await db
            .update(videoTasks)
            .set({
              status: TASK_STATUS.FAILED,
              errorMessage: errorMsg,
              extraData: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '任务取消'
              },
              updatedAt: new Date().toISOString()
            })
            .where(eq(videoTasks.id, taskId));

          return NextResponse.json({
            success: true,
            data: {
              task_id: task.id,
              status: TASK_STATUS.FAILED,
              status_text: '任务取消',
              result_url: null,
              error_message: errorMsg,
              extra_data: {
                ...(task.extraData as Record<string, unknown> || {}),
                status_text: '任务取消',
              },
              created_at: task.createdAt,
              updated_at: new Date().toISOString(),
              service_tier: 'flex',
            }
          });
        }
        // ARK 任务仍在处理中（queued/running），返回当前状态（附带离线标记）
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        task_id: task.id,
        status: task.status,
        status_text: isOfflineTask && (task.status === TASK_STATUS.PROCESSING || task.status === TASK_STATUS.QUEUE)
          ? '离线处理中...'
          : (statusMap[task.status] || '未知'),
        result_url: task.resultUrl,
        error_message: task.errorMessage,
        extra_data: task.extraData,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        service_tier: isOfflineTask ? 'flex' : undefined,
      }
    });

  } catch (error) {
    console.error('状态查询 API 异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
