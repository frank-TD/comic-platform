/**
 * 登录 API
 * POST /api/v1/auth/login
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { users } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { verifyPassword, generateToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // 验证必填参数
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // 查询用户
    const userResult = await db
      .select()
      .from(users)
      .where(and(
        eq(users.username, username),
        eq(users.isDeleted, false)
      ))
      .limit(1);

    if (userResult.length === 0) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    const user = userResult[0];

    // 验证密码
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 生成 Token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role as 'admin' | 'member'
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          dailyLimit: user.dailyLimit,
          tokenUsedToday: user.tokenUsedToday
        }
      }
    }, {
      headers: {
        'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`
      }
    });

  } catch (error) {
    console.error('登录失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
