/**
 * 配音任务状态查询 API
 * 
 * GET: 查询指定任务的状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { audioTasks } from '@/storage/database/shared/schema';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

// 状态映射
const STATUS_MAP: Record<number, { status: number; statusText: string }> = {
  0: { status: 0, statusText: '排队中' },
  1: { status: 1, statusText: '处理中' },
  2: { status: 2, statusText: '成功' },
  '-1': { status: -1, statusText: '失败' },
};

export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少任务 ID' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 查询任务
    const tasks = await db
      .select()
      .from(audioTasks)
      .where(and(
        eq(audioTasks.id, taskId),
        eq(audioTasks.userId, payload.id)
      ))
      .limit(1);

    if (tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: '任务不存在' },
        { status: 404 }
      );
    }

    const task = tasks[0];
    const statusInfo = STATUS_MAP[task.status] || { status: task.status, statusText: '未知' };

    return NextResponse.json({
      success: true,
      data: {
        task_id: task.id,
        type: task.type,
        prompt: task.prompt,
        speaker: task.speaker,
        reference_audio_url: task.referenceAudioUrl,
        result_url: task.resultUrl,
        duration: task.duration,
        status: statusInfo.status,
        status_text: statusInfo.statusText,
        error_message: task.errorMessage,
        created_at: task.createdAt,
      }
    });

  } catch (error) {
    console.error('[AudioStatus] Query Error:', error);
    return NextResponse.json(
      { success: false, error: '查询任务状态失败' },
      { status: 500 }
    );
  }
}
