/**
 * 初始化超级管理员 API
 * 仅当数据库中没有用户时，创建超级管理员账号
 * POST /api/v1/auth/init
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/storage/database/supabase-client';
import { users } from '@/storage/database/shared/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// 超级管理员默认配置
const SUPER_ADMIN_CONFIG = {
  username: 'admin_master',
  password: 'LibTV_Seedance_2026',
  role: 'super_admin',
  dailyLimit: 9999
};

export async function POST() {
  try {
    const db = await getDb();

    // 检查是否已有用户
    const existingUsers = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.isDeleted, false));

    const userCount = Number(existingUsers[0]?.count) || 0;

    if (userCount > 0) {
      return NextResponse.json({
        success: false,
        error: '系统已有用户，无需初始化',
        data: { userCount }
      });
    }

    // 创建超级管理员
    const passwordHash = await hashPassword(SUPER_ADMIN_CONFIG.password);
    const userId = uuidv4();

    await db.insert(users).values({
      id: userId,
      username: SUPER_ADMIN_CONFIG.username,
      passwordHash,
      role: SUPER_ADMIN_CONFIG.role,
      dailyLimit: SUPER_ADMIN_CONFIG.dailyLimit,
      tokenUsedToday: 0,
      isDeleted: false,
      createdAt: new Date().toISOString()
    });

    console.log('[Init] 超级管理员创建成功:', {
      id: userId,
      username: SUPER_ADMIN_CONFIG.username,
      role: SUPER_ADMIN_CONFIG.role
    });

    return NextResponse.json({
      success: true,
      message: '超级管理员创建成功',
      data: {
        username: SUPER_ADMIN_CONFIG.username,
        password: SUPER_ADMIN_CONFIG.password,
        role: SUPER_ADMIN_CONFIG.role,
        dailyLimit: SUPER_ADMIN_CONFIG.dailyLimit,
        note: '请首次登录后立即修改密码'
      }
    });

  } catch (error) {
    console.error('[Init] 初始化失败:', error);
    return NextResponse.json(
      { success: false, error: '初始化失败' },
      { status: 500 }
    );
  }
}
