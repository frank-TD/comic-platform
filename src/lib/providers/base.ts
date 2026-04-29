/**
 * 视频生成提供商接口定义
 * 实现多模型适配层，支持切换不同平台的视频生成服务
 */

export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive';
export type VideoContent = {
  type: 'image_url';
  image_url: { url: string };
  role?: 'first_frame' | 'last_frame' | 'reference_image';
} | {
  type: 'text';
  text: string;
} | {
  type: 'video_url';
  video_url?: { url: string };
  role?: 'reference_video';
} | {
  type: 'audio_url';
  audio_url?: { url: string };
  role?: 'reference_audio';
};

export interface VideoGenerationOptions {
  model: string;
  duration: number;
  resolution: VideoResolution;
  ratio: VideoRatio;
  watermark?: boolean;
  generateAudio?: boolean;
  maxWaitTime?: number;
  /** 服务层级：flex 为离线推理（便宜但慢），默认为实时模式 */
  serviceTier?: 'flex';
  /** 离线推理任务过期时间（秒），仅在 serviceTier='flex' 时生效 */
  executionExpiresAfter?: number;
}

export interface VideoGenerationResult {
  success: boolean;
  videoUrl?: string;
  taskId?: string;
  errorMessage?: string;
  metadata?: {
    resolution?: string;
    ratio?: string;
    duration?: number;
    framesPerSecond?: number;
    lastFrameUrl?: string;
    serviceTier?: string;
  };
}

export interface VideoProvider {
  /** 提供商标识 */
  readonly id: string;
  /** 提供商名称 */
  readonly name: string;
  /** 提供商状态 */
  readonly status: 'live' | 'mock' | 'disabled';
  
  /** 生成视频 */
  generate(content: VideoContent[], options: VideoGenerationOptions): Promise<VideoGenerationResult>;
  
  /** 获取支持的分辨率 */
  getSupportedResolutions(): VideoResolution[];
  
  /** 获取支持的画幅比例 */
  getSupportedRatios(): VideoRatio[];
  
  /** 获取最小/最大生成时长 */
  getDurationRange(): { min: number; max: number };

  /** 查询 ARK 任务状态（仅支持 ARK API 的 Provider） */
  getArkTaskStatus?(taskId: string): Promise<{
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
    videoUrl?: string;
    lastFrameUrl?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }>;
}
