/**
 * 视频代理接口
 * 用于解决火山引擎 TOS 存储视频跨域预览问题
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { VIDEO_PROXY_ALLOWLIST } from '@/lib/config';

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

    // 域名白名单校验
    const hostname = parsedUrl.hostname.toLowerCase();
    const isAllowed = VIDEO_PROXY_ALLOWLIST.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
    if (!isAllowed) {
      return NextResponse.json(
        { success: false, error: '该域名不在白名单中，禁止代理' },
        { status: 403 }
      );
    }

    console.log(`[VideoProxy] Proxying video: ${url}`);

    // 代理请求视频（带 30 秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    console.log(`[VideoProxy] Proxied successfully, streaming to client`);

    // 使用流式传输，避免大视频全量载入内存
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        ...(contentLength ? { 'Content-Length': contentLength } : {}),
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[VideoProxy] Proxy Error:', error);
    return NextResponse.json(
      { success: false, error: '视频加载失败，请稍后重试' },
      { status: 500 }
    );
  }
}
