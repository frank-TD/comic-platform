/**
 * 预留路由：图片生成 API (F02)
 * 
 * V1.0: 预留接口，暂不实现
 * 未来可用于：角色设计、场景图生成等
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '图片生成功能暂未开放（V1.0 Mock 阶段）',
    reserved: true,
    message: '此接口为预留扩展位，未来版本将支持角色设计、场景图生成等功能'
  }, { status: 501 });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: '图片生成功能暂未开放（V1.0 Mock 阶段）',
    reserved: true,
    message: '此接口为预留扩展位'
  }, { status: 501 });
}
