/**
 * 音频上传 API
 * 支持 WAV、MP3 等音频格式上传
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import type { UserPayload } from '@/lib/auth';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  bucketName: process.env.COZE_BUCKET_NAME,
});

// 允许的音频格式
const ALLOWED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mpeg', // MP3
  'audio/mp3',
];

// 最大文件大小：15MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// 验证 JWT Token
async function verifyAuth(request: NextRequest): Promise<{ valid: boolean; payload?: UserPayload; error?: string }> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { valid: false, error: '请先登录' };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { valid: false, error: 'Token 已过期，请重新登录' };
  }

  return { valid: true, payload };
}

export async function POST(request: NextRequest) {
  // 验证 JWT Token
  const auth = await verifyAuth(request);
  if (!auth.valid || !auth.payload) {
    return NextResponse.json(
      { success: false, error: auth.error || '请先登录' },
      { status: 401 }
    );
  }

  const userId = auth.payload.id;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '没有上传文件' },
        { status: 400 }
      );
    }

    // 验证文件类型
    const contentType = file.type;
    if (!ALLOWED_AUDIO_TYPES.includes(contentType)) {
      const allowedExt = ['WAV', 'MP3'].join('、');
      return NextResponse.json(
        { success: false, error: `音频格式不支持。支持格式：${allowedExt}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `音频超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制` },
        { status: 400 }
      );
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());

    // 生成唯一文件名（包含用户 ID，实现用户隔离）
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 11);
    // 根据 contentType 确定扩展名
    const extension = contentType.includes('wav') ? 'wav' : 'mp3';
    const fileName = `upload/audio/${userId}/audio_${timestamp}_${randomStr}.${extension}`;

    console.log(`[AudioUpload] FormData upload: ${fileName}, size: ${buffer.length} bytes, type: ${contentType}`);

    // 上传到对象存储
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: contentType,
    });

    // 生成可访问的签名 URL
    const url = await storage.generatePresignedUrl({
      key: key,
      expireTime: 86400 * 7, // 7 天有效期
    });

    console.log(`[AudioUpload] Success: ${url}`);

    return NextResponse.json({
      success: true,
      data: {
        url: url,
        key: key
      }
    });
  } catch (error) {
    console.error('[AudioUpload] Upload error:', error);
    return NextResponse.json(
      { success: false, error: '音频上传失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除音频
export async function DELETE(request: NextRequest) {
  // 验证 JWT Token
  const auth = await verifyAuth(request);
  if (!auth.valid || !auth.payload) {
    return NextResponse.json(
      { success: false, error: auth.error || '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: '缺少 key 参数' },
        { status: 400 }
      );
    }

    // 校验文件归属：只能删除自己用户目录下的文件
    const userId = auth.payload.id;
    const expectedPrefix = `upload/audio/${userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: '无权删除该文件' },
        { status: 403 }
      );
    }

    console.log(`[AudioDelete] Deleting: ${key}`);

    // 删除对象存储中的文件
    const result = await storage.deleteFile({ fileKey: key });

    if (result) {
      console.log(`[AudioDelete] Success: ${key}`);
      return NextResponse.json({
        success: true,
        message: '音频删除成功'
      });
    } else {
      console.log(`[AudioDelete] File not found or already deleted: ${key}`);
      return NextResponse.json({
        success: true,
        message: '音频不存在或已删除'
      });
    }
  } catch (error) {
    console.error('[AudioDelete] Error:', error);
    return NextResponse.json(
      { success: false, error: '删除音频失败' },
      { status: 500 }
    );
  }
}
