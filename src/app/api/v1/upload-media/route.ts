/**
 * 统一媒体上传 API
 * 支持图片、视频、音频三种类型
 * 自动识别文件类型
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import type { UserPayload } from '@/lib/auth';
import type { MediaType } from '@/lib/types';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  bucketName: process.env.COZE_BUCKET_NAME,
});

// 允许的文件类型
const ALLOWED_TYPES: Record<MediaType, string[]> = {
  image: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
  ],
  video: [
    'video/mp4',
    'video/quicktime', // mov
    'video/x-msvideo', // avi
    'video/webm',
  ],
  audio: [
    'audio/wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
  ],
};

// 文件大小限制（与独立上传接口保持一致）
const MAX_FILE_SIZE: Record<MediaType, number> = {
  image: 30 * 1024 * 1024,   // 30MB
  video: 100 * 1024 * 1024,  // 100MB（与 upload-video 一致）
  audio: 15 * 1024 * 1024,   // 15MB
};

// 类型映射
const TYPE_MAP: Record<string, MediaType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/webm': 'video',
  'audio/wav': 'audio',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/aac': 'audio',
};

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

// 根据文件类型获取文件夹路径
function getFolderPath(type: MediaType): string {
  const folders: Record<MediaType, string> = {
    image: 'upload/image',
    video: 'upload/video',
    audio: 'upload/audio',
  };
  return folders[type];
}

// 根据文件扩展名判断类型
function getMediaType(fileName: string, contentType: string): MediaType | null {
  // 首先根据 MIME 类型判断
  if (TYPE_MAP[contentType]) {
    return TYPE_MAP[contentType];
  }

  // 备用：根据扩展名判断
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const extMap: Record<string, MediaType> = {
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    webp: 'image',
    bmp: 'image',
    tiff: 'image',
    heic: 'image',
    heif: 'image',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    webm: 'video',
    wav: 'audio',
    mp3: 'audio',
    ogg: 'audio',
    aac: 'audio',
  };

  return extMap[ext] || null;
}

// 获取缩略图 URL（对于图片直接返回原图）
async function getThumbnailUrl(key: string, type: MediaType): Promise<string | undefined> {
  if (type === 'image') {
    return undefined; // 图片使用原图作为缩略图
  }

  try {
    const url = await storage.generatePresignedUrl({
      key: key,
      expireTime: 86400 * 7,
    });
    return url;
  } catch {
    return undefined;
  }
}

// 处理文件上传
async function handleUpload(request: NextRequest, userId: string): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '没有上传文件' },
        { status: 400 }
      );
    }

    const contentType = file.type;
    const fileName = file.name;
    const mediaType = getMediaType(fileName, contentType);

    if (!mediaType) {
      return NextResponse.json(
        { success: false, error: '不支持的文件类型' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALLOWED_TYPES[mediaType].includes(contentType)) {
      const allowedExt = ALLOWED_TYPES[mediaType]
        .map(t => t.split('/')[1]?.toUpperCase())
        .filter(Boolean)
        .join('、');
      return NextResponse.json(
        { success: false, error: `文件格式不支持 ${mediaType}。支持格式：${allowedExt}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE[mediaType]) {
      const maxMB = MAX_FILE_SIZE[mediaType] / 1024 / 1024;
      return NextResponse.json(
        { success: false, error: `文件超过 ${maxMB}MB 限制` },
        { status: 400 }
      );
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());

    // 生成唯一文件名（包含用户 ID，实现用户隔离）
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 11);
    const extension = fileName.split('.').pop() || 'bin';
    const folder = getFolderPath(mediaType);
    const storageFileName = `${folder}/${userId}/${folder.split('/').pop()}_${timestamp}_${randomStr}.${extension}`;

    console.log(`[MediaUpload] Uploading ${mediaType}: ${storageFileName}, size: ${buffer.length} bytes`);

    // 上传到对象存储
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: storageFileName,
      contentType: contentType,
    });

    // 生成可访问的签名 URL
    const url = await storage.generatePresignedUrl({
      key: key,
      expireTime: 86400 * 7, // 7 天有效期
    });

    // 生成缩略图 URL
    const thumbnailUrl = await getThumbnailUrl(key, mediaType);

    console.log(`[MediaUpload] Success: ${url}`);

    return NextResponse.json({
      success: true,
      data: {
        url: url,
        storageKey: key,
        type: mediaType,
        name: fileName,
        size: file.size,
        thumbnailUrl: thumbnailUrl,
      }
    });
  } catch (error) {
    console.error('[MediaUpload] Upload error:', error);
    return NextResponse.json(
      { success: false, error: '文件上传失败' },
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

  return handleUpload(request, auth.payload.id);
}

// DELETE: 删除媒体文件
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
    const expectedPrefix = `upload/${userId}/`;
    if (!key.includes(expectedPrefix)) {
      return NextResponse.json(
        { success: false, error: '无权删除该文件' },
        { status: 403 }
      );
    }

    console.log(`[MediaDelete] Deleting: ${key}`);

    // 删除对象存储中的文件
    const result = await storage.deleteFile({ fileKey: key });

    if (result) {
      console.log(`[MediaDelete] Success: ${key}`);
      return NextResponse.json({
        success: true,
        message: '文件删除成功'
      });
    } else {
      console.log(`[MediaDelete] File not found or already deleted: ${key}`);
      return NextResponse.json({
        success: true,
        message: '文件不存在或已删除'
      });
    }
  } catch (error) {
    console.error('[MediaDelete] Error:', error);
    return NextResponse.json(
      { success: false, error: '删除文件失败' },
      { status: 500 }
    );
  }
}

// 清空某类型的所有媒体文件（仅清空当前用户的文件）
export async function PATCH(request: NextRequest) {
  // 验证 JWT Token
  const auth = await verifyAuth(request);
  if (!auth.valid || !auth.payload) {
    return NextResponse.json(
      { success: false, error: auth.error || '请先登录' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { type } = body as { type: MediaType };

    if (!type || !['image', 'video', 'audio'].includes(type)) {
      return NextResponse.json(
        { success: false, error: '缺少或无效的 type 参数' },
        { status: 400 }
      );
    }

    // 仅列出当前用户的文件，避免影响其他用户
    const userId = auth.payload.id;
    const folderMap: Record<MediaType, string> = {
      image: `upload/image/${userId}`,
      video: `upload/video/${userId}`,
      audio: `upload/audio/${userId}`,
    };
    const prefix = folderMap[type];

    console.log(`[MediaClear] Clearing ${type} files for user ${userId}`);

    try {
      // 列出对象存储中该用户该类型的所有文件
      const result = await storage.listFiles({ prefix });
      const fileKeys = result?.keys || [];
      
      if (fileKeys.length > 0) {
        console.log(`[MediaClear] Found ${fileKeys.length} ${type} files to delete`);
        
        // 批量删除
        const deletePromises = fileKeys.map((key: string) => 
          storage.deleteFile({ fileKey: key })
        );
        await Promise.all(deletePromises);
        
        console.log(`[MediaClear] Successfully deleted ${fileKeys.length} ${type} files`);
      } else {
        console.log(`[MediaClear] No ${type} files found to delete`);
      }
    } catch (storageError) {
      // 如果列出文件失败（如 bucket 不支持列表操作），记录错误但不阻塞响应
      console.warn(`[MediaClear] Could not list ${type} files:`, storageError);
    }

    return NextResponse.json({
      success: true,
      message: `已清空所有 ${type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'} 记录`
    });
  } catch (error) {
    console.error('[MediaClear] Error:', error);
    return NextResponse.json(
      { success: false, error: '清空文件失败' },
      { status: 500 }
    );
  }
}
