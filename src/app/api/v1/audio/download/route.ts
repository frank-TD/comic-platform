/**
 * 音频代理下载接口
 * 用于解决跨域下载问题
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';

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
    const url = searchParams.get('url');
    const filename = searchParams.get('filename') || 'audio.mp3';

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少 URL 参数' },
        { status: 400 }
      );
    }

    // 验证 URL 是否合法（防止 SSRF）
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { success: false, error: '不支持的 URL 协议' },
        { status: 400 }
      );
    }

    console.log(`[Download] Proxying audio: ${url}`);

    // 代理请求音频
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AudioDownloader/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    console.log(`[Download] Proxied successfully: ${audioBuffer.byteLength} bytes`);

    // 返回音频流
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(audioBuffer.byteLength),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[Download] Proxy Error:', error);
    return NextResponse.json(
      { success: false, error: '下载失败，请稍后重试' },
      { status: 500 }
    );
  }
}
