/**
 * 音频解码接口
 * MiniMax 返回 hex 编码的音频数据，需要转换为可播放的音频文件
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { MiniMaxMusicClient } from '@/lib/providers/minimax-music';

export async function POST(request: NextRequest) {
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
    const { hexAudio } = await request.json();

    if (!hexAudio || typeof hexAudio !== 'string') {
      return NextResponse.json(
        { success: false, error: '请提供有效的 hex 音频数据' },
        { status: 400 }
      );
    }

    // 将 hex 转换为 Buffer
    const audioBuffer = MiniMaxMusicClient.hexToBuffer(hexAudio);

    // 返回音频文件
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="bgm.mp3"',
        'Content-Length': audioBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('[Audio Decode] Error:', error);
    return NextResponse.json(
      { success: false, error: '音频解码失败' },
      { status: 500 }
    );
  }
}
