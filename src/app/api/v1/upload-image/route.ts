/**
 * 图片上传 API
 * 支持 FormData 和 Base64 两种上传方式
 * FormData 方式：无大小限制，推荐使用
 * Base64 方式：Legacy 支持，受请求体大小限制
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

// 允许的图片格式
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
];

// 最大文件大小：30MB
const MAX_FILE_SIZE = 30 * 1024 * 1024;

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

// 处理 FormData 上传
async function handleFormDataUpload(request: NextRequest, userId: string): Promise<NextResponse> {
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
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
      const allowedExt = ALLOWED_IMAGE_TYPES.map(t => t.split('/')[1].toUpperCase()).join('、');
      return NextResponse.json(
        { success: false, error: `图片格式不支持。支持格式：${allowedExt}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `图片超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制` },
        { status: 400 }
      );
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());

    // 生成唯一文件名（包含用户 ID，实现用户隔离）
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 11);
    const extension = contentType.split('/')[1] || 'png';
    const fileName = `upload/image/${userId}/image_${timestamp}_${randomStr}.${extension}`;

    console.log(`[ImageUpload] FormData upload: ${fileName}, size: ${buffer.length} bytes`);

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

    console.log(`[ImageUpload] Success: ${url}`);

    return NextResponse.json({
      success: true,
      data: {
        url: url,
        key: key
      }
    });
  } catch (error) {
    console.error('[ImageUpload] FormData upload error:', error);
    return NextResponse.json(
      { success: false, error: '图片上传失败' },
      { status: 500 }
    );
  }
}

// 处理 Base64 上传（Legacy 方式，受请求体大小限制）
async function handleBase64Upload(body: { image: string }, userId: string): Promise<NextResponse> {
  const { image } = body;

  if (!image || typeof image !== 'string') {
    return NextResponse.json(
      { success: false, error: '图片数据不能为空' },
      { status: 400 }
    );
  }

  // 如果是 URL，校验格式后原样返回
  if (image.startsWith('http')) {
    try {
      const parsed = new URL(image);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json(
          { success: false, error: '不支持的 URL 协议' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          url: image
        }
      });
    } catch {
      return NextResponse.json(
        { success: false, error: '无效的 URL 格式' },
        { status: 400 }
      );
    }
  }

  // 检查是否是 base64 格式
  const base64Match = image.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    return NextResponse.json(
      { success: false, error: '无效的图片格式' },
      { status: 400 }
    );
  }

  const contentType = base64Match[1];
  const base64Data = base64Match[2];

  // 解码 base64
  const buffer = Buffer.from(base64Data, 'base64');

  // 验证文件大小
  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: `图片超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制（Base64 编码后）` },
      { status: 400 }
    );
  }

  // 生成唯一文件名（包含用户 ID，实现用户隔离）
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).slice(2, 11);
  const extension = contentType.split('/')[1] || 'png';
  const fileName = `upload/image/${userId}/image_${timestamp}_${randomStr}.${extension}`;

  console.log(`[ImageUpload] Base64 upload: ${fileName}, size: ${buffer.length} bytes`);

  try {
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

    console.log(`[ImageUpload] Success: ${url}`);

    return NextResponse.json({
      success: true,
      data: {
        url: url,
        key: key
      }
    });
  } catch (error) {
    console.error('[ImageUpload] Base64 upload error:', error);
    return NextResponse.json(
      { success: false, error: '图片上传失败' },
      { status: 500 }
    );
  }
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

  // 检查 Content-Type 确定上传方式
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    // FormData 方式上传
    return handleFormDataUpload(request, userId);
  } else {
    // Base64 方式上传（Legacy）
    try {
      const body = await request.json();
      return handleBase64Upload(body, userId);
    } catch {
      return NextResponse.json(
        { success: false, error: '无效的请求格式' },
        { status: 400 }
      );
    }
  }
}

// DELETE: 删除图片
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
    const expectedPrefix = `upload/image/${userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: '无权删除该文件' },
        { status: 403 }
      );
    }

    console.log(`[ImageDelete] Deleting: ${key}`);

    // 删除对象存储中的文件
    const result = await storage.deleteFile({ fileKey: key });

    if (result) {
      console.log(`[ImageDelete] Success: ${key}`);
      return NextResponse.json({
        success: true,
        message: '图片删除成功'
      });
    } else {
      console.log(`[ImageDelete] File not found or already deleted: ${key}`);
      return NextResponse.json({
        success: true,
        message: '图片不存在或已删除'
      });
    }
  } catch (error) {
    console.error('[ImageDelete] Error:', error);
    return NextResponse.json(
      { success: false, error: '删除图片失败' },
      { status: 500 }
    );
  }
}
