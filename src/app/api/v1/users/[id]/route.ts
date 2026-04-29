/**
 * 单个成员管理 API
 * PUT /api/v1/users/[id] - 更新成员
 * DELETE /api/v1/users/[id] - 删除成员
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { users } from '@/storage/database/shared/schema';
import { eq, and } from 'drizzle-orm';
import { extractTokenFromRequest, verifyToken, hashPassword } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 更新成员
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;
    const body = await request.json();
    const { username, password, role, dailyLimit } = body;

    const db = await getDb();

    // 检查用户是否存在
    const existing = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(
        eq(users.id, id),
        eq(users.isDeleted, false)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // 不能修改超级管理员的角色
    if (existing[0].role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: '无法修改超级管理员' },
        { status: 403 }
      );
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString()
    };

    if (username) {
      // 检查用户名唯一性
      const usernameExists = await db
        .select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.username, username),
          eq(users.isDeleted, false)
        ))
        .limit(1);

      if (usernameExists.length > 0 && usernameExists[0].id !== id) {
        return NextResponse.json(
          { success: false, error: '用户名已存在' },
          { status: 400 }
        );
      }
      updateData.username = username;
    }

    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    if (role && ['admin', 'member'].includes(role)) {
      updateData.role = role;
    }

    if (typeof dailyLimit === 'number') {
      updateData.dailyLimit = dailyLimit;
    }

    // 更新用户
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id));

    // 获取更新后的用户信息
    const updated = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        dailyLimit: users.dailyLimit,
        tokenUsedToday: users.tokenUsedToday,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: updated[0]
    });

  } catch (error) {
    console.error('更新成员失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// 删除成员（软删除）
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;
    const db = await getDb();

    // 检查用户是否存在
    const existing = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(
        eq(users.id, id),
        eq(users.isDeleted, false)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // 不能删除超级管理员
    if (existing[0].role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: '无法删除超级管理员' },
        { status: 403 }
      );
    }

    // 软删除
    await db
      .update(users)
      .set({
        isDeleted: true,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, id));

    return NextResponse.json({
      success: true,
      message: '删除成功'
    });

  } catch (error) {
    console.error('删除成员失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
