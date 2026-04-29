/**
 * 登出 API
 * POST /api/v1/auth/logout
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    success: true,
    message: '登出成功'
  }, {
    headers: {
      'Set-Cookie': 'auth_token=; Path=/; HttpOnly; Max-Age=0'
    }
  });
}
