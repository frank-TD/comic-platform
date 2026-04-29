/**
 * 视频缩略图代理接口
 * 用于解决火山引擎 TOS 存储视频跨域预览问题
 * 通过 FFmpeg 提取视频帧作为缩略图
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { VIDEO_PROXY_ALLOWLIST } from '@/lib/config';
import { spawn } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// 时间戳格式：纯数字秒数 或 HH:MM:SS / MM:SS
const TIMESTAMP_REGEX = /^(\d+(\.\d+)?|(\d{1,2}:){1,2}\d{1,2}(\.\d+)?)$/;

async function generateThumbnail(url: string, timestamp: string): Promise<Buffer> {
  const tempId = uuidv4();
  const inputPath = `/tmp/video_${tempId}.mp4`;
  const outputPath = `/tmp/thumb_${tempId}.jpg`;

  try {
    // 下载视频（带 30 秒超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const videoResponse = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    await writeFile(inputPath, Buffer.from(videoBuffer));

    // 使用 FFmpeg 提取帧
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',                    // 覆盖输出文件
        '-ss', timestamp,        // 跳转到指定时间
        '-i', inputPath,         // 输入文件
        '-vframes', '1',        // 只提取一帧
        '-q:v', '2',            // 输出质量 (2 = 高质量)
        '-vf', 'scale=320:-1',  // 缩放到 320 宽度
        outputPath              // 输出文件
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });

    // 读取缩略图
    const thumbnailBuffer = await readFile(outputPath);
    return thumbnailBuffer;
  } finally {
    // 确保临时文件被清理（成功或失败都会执行）
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

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
    const timestamp = searchParams.get('t') || '00:00:02'; // 默认第2秒

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少 URL 参数' },
        { status: 400 }
      );
    }

    // 验证 URL 是否合法
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
        { success: false, error: '该域名不在白名单中，禁止提取缩略图' },
        { status: 403 }
      );
    }

    // 校验 timestamp 格式
    if (!TIMESTAMP_REGEX.test(timestamp)) {
      return NextResponse.json(
        { success: false, error: '无效的时间戳格式' },
        { status: 400 }
      );
    }

    console.log(`[VideoThumbnailProxy] Processing: ${url}`);

    const thumbnailBuffer = await generateThumbnail(url, timestamp);

    console.log(`[VideoThumbnailProxy] Success: ${thumbnailBuffer.length} bytes`);

    // 返回图片（显式转换为 Uint8Array 以兼容 NextResponse 类型）
    return new NextResponse(new Uint8Array(thumbnailBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(thumbnailBuffer.length),
        'Cache-Control': 'public, max-age=86400', // 缓存 1 天
      },
    });

  } catch (error) {
    console.error('[VideoThumbnailProxy] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取缩略图失败' },
      { status: 500 }
    );
  }
}
