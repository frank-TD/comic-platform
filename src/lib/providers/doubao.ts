/**
 * Doubao (豆包) 视频生成提供商适配器
 * 基于 coze-coding-dev-sdk 实现
 */

import { VideoProvider, VideoContent, VideoGenerationOptions, VideoGenerationResult, VideoResolution, VideoRatio } from './base';
import { Config, VideoGenerationClient, Content } from 'coze-coding-dev-sdk';

export class DoubaoProvider implements VideoProvider {
  readonly id = 'doubao-seedance-1-5-pro';
  readonly name = 'Doubao-Seedance-1.5-pro';
  readonly status: 'live' | 'mock' | 'disabled' = 'live';

  private client: VideoGenerationClient;

  constructor() {
    const config = new Config({
      apiKey: process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      baseUrl: process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn',
      modelBaseUrl: process.env.COZE_INTEGRATION_MODEL_BASE_URL || 'https://integration.coze.cn/api/v3',
      retryTimes: 3,
      retryDelay: 1000,
      timeout: 30000,
    });
    this.client = new VideoGenerationClient(config);
  }

  async generate(content: VideoContent[], options: VideoGenerationOptions): Promise<VideoGenerationResult> {
    try {
      // 转换 content 格式（只处理 Doubao SDK 支持的类型）
      const sdkContent: Content[] = content
        .filter(item => item.type === 'text' || item.type === 'image_url')
        .map(item => {
          if (item.type === 'image_url') {
            return {
              type: 'image_url' as const,
              image_url: { url: item.image_url.url },
              role: item.role
            };
          }
          return { type: 'text' as const, text: (item as { type: 'text'; text: string }).text };
        });

      // 检查是否有尾帧，设置 returnLastFrame
      const hasLastFrame = content.some(item => 
        item.type === 'image_url' && item.role === 'last_frame'
      );

      console.log(`[DoubaoProvider] Starting generation, model: ${options.model}`);

      const response = await this.client.videoGeneration(sdkContent, {
        model: options.model,
        duration: options.duration,
        resolution: options.resolution as '480p' | '720p' | '1080p',
        ratio: options.ratio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive',
        watermark: options.watermark ?? false,
        generateAudio: options.generateAudio ?? true,
        maxWaitTime: options.maxWaitTime ?? 1800,
        returnLastFrame: hasLastFrame
      });

      console.log(`[DoubaoProvider] Response status: ${response.response.status}`);

      if (response.response.status === 'succeeded' && response.videoUrl) {
        return {
          success: true,
          videoUrl: response.videoUrl,
          taskId: response.response.id,
          metadata: {
            resolution: response.response.resolution,
            ratio: response.response.ratio,
            duration: response.response.duration,
            framesPerSecond: response.response.framespersecond,
            lastFrameUrl: response.response.content?.last_frame_url
          }
        };
      } else {
        return {
          success: false,
          errorMessage: response.response.error_message || '视频生成失败',
          taskId: response.response.id
        };
      }
    } catch (error) {
      console.error('[DoubaoProvider] Error:', error);
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  getSupportedResolutions(): VideoResolution[] {
    return ['480p', '720p', '1080p'];
  }

  getSupportedRatios(): VideoRatio[] {
    return ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
  }

  getDurationRange(): { min: number; max: number } {
    return { min: 4, max: 12 };
  }
}
