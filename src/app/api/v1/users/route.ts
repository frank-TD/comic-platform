/**
 * 成员管理 API
 * GET /api/v1/users - 获取成员列表
 * POST /api/v1/users - 添加成员
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { users } from '@/storage/database/shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken, hashPassword } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// 成员列表
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || !['admin', 'super_admin'].includes(payload.role)) {
      return NextResponse.json({ success: false, error: '无权限访问' }, { status: 403 });
    }

    const db = await getDb();

    const members = await db
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
      .where(eq(users.isDeleted, false))
      .orderBy(desc(users.createdAt));

    return NextResponse.json({
      success: true,
      data: {
        members: members.map(m => ({
          ...m,
          createdAt: m.createdAt
        })),
        total: members.length
      }
    });

  } catch (error) {
    console.error('获取成员列表失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// 添加成员
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || !['admin', 'super_admin'].includes(payload.role)) {
      return NextResponse.json({ success: false, error: '无权限访问' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, role, dailyLimit } = body;

    // 验证必填参数
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '用户名和密码不能为空' },
        { status: 400 }
      );
    }

    // 验证角色
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { success: false, error: '角色必须是 admin 或 member' },
        { status: 400 }
      );
    }

    // 验证用户名唯一性
    const db = await getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.username, username),
        eq(users.isDeleted, false)
      ))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: '用户名已存在' },
        { status: 400 }
      );
    }

    // 加密密码
    const passwordHash = await hashPassword(password);

    // 创建用户
    const userId = uuidv4();
    await db.insert(users).values({
      id: userId,
      username,
      passwordHash,
      role: role || 'member',
      dailyLimit: dailyLimit || 30,
      tokenUsedToday: 0,
      isDeleted: false,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      data: {
        id: userId,
        username,
        role: role || 'member',
        dailyLimit: dailyLimit || 30
      }
    });

  } catch (error) {
    console.error('添加成员失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
