/**
 * 任务列表 API
 * 获取当前用户的所有视频生成任务
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { videoTasks } from '@/storage/database/shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';

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
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 200); // 限制 1-200
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const db = await getDb();
    const userId = payload.id;

    // 查询该用户的所有任务，按创建时间倒序
    const tasks = await db
      .select()
      .from(videoTasks)
      .where(eq(videoTasks.userId, userId))
      .orderBy(desc(videoTasks.createdAt))
      .limit(limit)
      .offset(offset);

    // 获取总数
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(videoTasks)
      .where(eq(videoTasks.userId, userId));
    
    const total = Number(countResult[0]?.count) || 0;

    // 状态码转文字
    const statusMap: Record<number, string> = {
      0: '排队中',
      1: '处理中',
      2: '成功',
      [-1]: '失败'
    };

    const formattedTasks = tasks.map((task) => ({
      task_id: task.id,
      mode: task.mode,
      prompt: task.prompt,
      original_prompt: task.originalPrompt,
      image_urls: task.imageUrls,
      all_image_urls: (task.metadata as Record<string, unknown>)?.all_image_urls as string[] | undefined,
      image_order: (task.metadata as Record<string, unknown>)?.image_order as string[] | undefined,
      model_id: task.modelId,
      status: task.status,
      status_text: statusMap[task.status] || '未知',
      result_url: task.resultUrl,
      error_message: task.errorMessage,
      metadata: task.metadata,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      service_tier: (task.metadata as Record<string, unknown>)?.service_tier as 'flex' | 'default' | undefined,
    }));

    return NextResponse.json({
      success: true,
      data: {
        tasks: formattedTasks,
        total,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('任务列表 API 异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    // 删除任务（仅能删除自己的任务）
    const deleteResult = await db
      .delete(videoTasks)
      .where(sql`id = ${taskId} AND user_id = ${userId}`)
      .returning({ id: videoTasks.id });

    if (deleteResult.length === 0) {
      return NextResponse.json(
        { success: false, error: '任务不存在或无权删除' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '任务已删除'
    });

  } catch (error) {
    console.error('删除任务 API 异常:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
