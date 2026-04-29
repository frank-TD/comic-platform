/**
 * 获取当前用户 API
 * GET /api/v1/auth/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { users } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = extractTokenFromRequest(request);

    if (!token) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token 已过期' },
        { status: 401 }
      );
    }

    const db = await getDb();

    // 查询用户完整信息
    const userResult = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        dailyLimit: users.dailyLimit,
        tokenUsedToday: users.tokenUsedToday,
        lastResetDate: users.lastResetDate,
        createdAt: users.createdAt
      })
      .from(users)
      .where(and(
        eq(users.id, payload.id),
        eq(users.isDeleted, false)
      ))
      .limit(1);

    if (userResult.length === 0) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 401 }
      );
    }

    const user = userResult[0];

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        dailyLimit: user.dailyLimit,
        tokenUsedToday: user.tokenUsedToday,
        lastResetDate: user.lastResetDate,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('获取用户信息失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
