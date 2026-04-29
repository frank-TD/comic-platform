/**
 * Seedance 2.0 视频生成提供商适配器
 * 基于火山引擎 ARK API 实现
 * 文档: https://www.volcengine.com/docs/82379/1520757
 */

import { VideoProvider, VideoContent, VideoGenerationOptions, VideoGenerationResult, VideoResolution, VideoRatio } from './base';
import axios, { AxiosInstance } from 'axios';

interface SeedanceTaskRequest {
  model: string;
  content: Array<{
    type: 'text' | 'image_url' | 'video_url' | 'audio_url';
    text?: string;
    image_url?: { url: string };
    video_url?: { url: string };
    audio_url?: { url: string };
    role?: string;
  }>;
  generate_audio?: boolean;
  ratio?: string;
  duration?: number;
  watermark?: boolean;
  resolution?: string;
  /** 服务层级：flex 为离线推理模式（便宜但慢），默认为实时 */
  service_tier?: 'flex';
  /** 离线推理任务过期时间（秒），仅在 service_tier=flex 时生效 */
  execution_expires_after?: number;
}

interface SeedanceTaskResponse {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
  content?: {
    video_url?: string;
    audio_url?: string;
    last_frame_url?: string;
  };
  duration?: number;
  resolution?: string;
  ratio?: string;
  framespersecond?: number;
  service_tier?: string;
  error?: {
    code: string;
    message: string;
  };
}

export class Seedance2Provider implements VideoProvider {
  readonly id = 'seedance2.0';
  readonly name = 'Seedance 2.0';
  readonly status: 'live' | 'mock' | 'disabled' = 'live';

  private client: AxiosInstance;
  private apiKey: string;

  /**
   * 将 ARK API 英文错误信息转换为用户友好的中文提示
   */
  private friendlyErrorMessage(rawMessage?: string): string {
    if (!rawMessage) return '视频生成失败';
    const lower = rawMessage.toLowerCase();
    if (lower.includes('copyright') || lower.includes('版权')) {
      return '生成内容可能涉及版权限制，请避免使用具体角色名称、品牌标识或受版权保护的IP形象，尝试使用更通用的描述。';
    }
    if (lower.includes('content moderation') || lower.includes('safety') || lower.includes('内容安全')) {
      return '生成内容触发安全审核，请调整提示词，避免涉及敏感或违规内容。';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return '请求过于频繁，请稍后再试。';
    }
    if (lower.includes('pixel count') || lower.includes('2086876')) {
      return '参考视频分辨率过大，请压缩至 1080p（1920×1080）以下后重新上传。';
    }
    return rawMessage;
  }

  constructor() {
    this.apiKey = process.env.ARK_API_KEY || '';
    
    this.client = axios.create({
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      timeout: 180000, // 3 分钟超时，降低创建任务时因网络抖动导致响应丢失的概率
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    // 添加响应拦截器用于日志记录
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          // 服务器返回了错误状态码
          console.error(`[Seedance2Provider] API Error Response:`, {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers
          });
        } else if (error.request) {
          // 请求已发出但没有收到响应
          console.error(`[Seedance2Provider] No response received:`, error.request);
        } else {
          // 请求配置出错
          console.error(`[Seedance2Provider] Request error:`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 创建视频生成任务
   */
  async generate(content: VideoContent[], options: VideoGenerationOptions): Promise<VideoGenerationResult> {
    try {
      // 转换 content 格式
      const seedanceContent = this.convertContent(content);

      // 构建请求
      const request: SeedanceTaskRequest = {
        model: 'doubao-seedance-2-0-260128',
        content: seedanceContent,
        generate_audio: options.generateAudio ?? true,
        ratio: options.ratio || '9:16',
        duration: options.duration || 5,
        watermark: options.watermark ?? false,
        resolution: options.resolution || '1080p'
      };

      // 离线推理模式：添加 service_tier 和 execution_expires_after
      if (options.serviceTier === 'flex') {
        request.service_tier = 'flex';
        // 离线推理过期时间（默认 86400 秒 = 24 小时）
        request.execution_expires_after = options.executionExpiresAfter ?? 86400;
      }

      console.log(`[Seedance2Provider] Starting generation, duration: ${request.duration}s, ratio: ${request.ratio}, serviceTier: ${options.serviceTier || 'default'}`);

      // 创建任务（带一次网络错误重试，防止因超时导致 ARK 已创建任务但响应丢失）
      let createResponse;
      let retries = 0;
      const maxRetries = 1;
      while (true) {
        try {
          createResponse = await this.client.post('', request);
          break;
        } catch (err) {
          // 仅对网络层错误（无响应、超时、连接断开）重试；业务错误（4xx/5xx 有 response）不重试
          if (axios.isAxiosError(err) && !err.response && retries < maxRetries) {
            retries++;
            console.warn(`[Seedance2Provider] Create task network error, retrying (${retries}/${maxRetries})...`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          throw err;
        }
      }
      const taskData: SeedanceTaskResponse = createResponse.data;

      if (taskData.error) {
        return {
          success: false,
          errorMessage: this.friendlyErrorMessage(`${taskData.error.code}: ${taskData.error.message}`),
          taskId: taskData.id
        };
      }

      console.log(`[Seedance2Provider] Task created: ${taskData.id}, status: ${taskData.status}, serviceTier: ${options.serviceTier || 'default'}`);

      // 离线推理模式下，后端仅创建任务即返回，不轮询等待结果
      // 前端将通过轮询 /api/v1/status 获取结果
      if (options.serviceTier === 'flex') {
        return {
          success: true,
          videoUrl: '',  // 离线推理暂无结果
          taskId: taskData.id,
          metadata: {
            duration: options.duration,
            resolution: options.resolution,
            ratio: options.ratio,
            serviceTier: 'flex'
          }
        };
      }

      // 实时模式：轮询获取结果
      const result = await this.pollTaskResult(taskData.id, options.maxWaitTime);

      return result;
    } catch (error) {
      console.error('[Seedance2Provider] Error:', error);
      // 提取 ARK API 返回的详细错误信息
      let errorMessage = '未知错误';
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        // ARK API 错误格式: { error: { code: "...", message: "..." } } 或 { message: "..." }
        if (errorData?.error?.message) {
          errorMessage = `[${error.response.status}] ${errorData.error.code || 'ERROR'}: ${errorData.error.message}`;
        } else if (errorData?.message) {
          errorMessage = `[${error.response.status}] ${errorData.message}`;
        } else {
          errorMessage = `[${error.response.status}] ${JSON.stringify(errorData)}`;
        }
      } else if (axios.isAxiosError(error) && !error.response) {
        // 网络层错误：超时、连接断开、DNS 失败等（ARK 可能已创建任务但响应丢失）
        const code = error.code || 'NETWORK_ERROR';
        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
          errorMessage = '创建任务请求超时，请稍后查询任务列表确认任务是否已生成。如任务未出现，请重新提交。';
        } else {
          errorMessage = `网络异常 (${code})，请检查网络连接后重试。`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        success: false,
        errorMessage: this.friendlyErrorMessage(errorMessage)
      };
    }
  }

  /**
   * 轮询任务结果
   */
  private async pollTaskResult(taskId: string, maxWaitTime: number = 1800): Promise<VideoGenerationResult> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5秒轮询一次

    while (Date.now() - startTime < maxWaitTime * 1000) {
      try {
        const taskData = await this.getTaskStatus(taskId);

        console.log(`[Seedance2Provider] Poll task ${taskId}: ${taskData.status}`);

        if (taskData.status === 'succeeded') {
          // 火山引擎 ARK API 返回的是 content.video_url
          const videoUrl = taskData.content?.video_url || '';
          return {
            success: true,
            videoUrl: videoUrl,
            taskId: taskId,
            metadata: {
              duration: taskData.duration,
              resolution: taskData.resolution as VideoResolution || '1080p',
              ratio: taskData.ratio as VideoRatio || '9:16',
              lastFrameUrl: taskData.content?.last_frame_url,
              serviceTier: taskData.service_tier,
            }
          };
        }

        if (taskData.status === 'failed') {
          return {
            success: false,
            errorMessage: this.friendlyErrorMessage(taskData.error?.message || '视频生成失败'),
            taskId: taskId
          };
        }

        // 任务超时（超过 execution_expires_after 时间限制）
        if (taskData.status === 'expired') {
          return {
            success: false,
            errorMessage: '任务超时，生成时间超出限制，请重试或调整 execution_expires_after 参数',
            taskId: taskId
          };
        }

        // 任务被取消（仅排队中的任务可取消）
        if (taskData.status === 'cancelled') {
          return {
            success: false,
            errorMessage: '任务已被取消',
            taskId: taskId
          };
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error('[Seedance2Provider] Poll error:', error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    return {
      success: false,
      errorMessage: '任务超时',
      taskId: taskId
    };
  }

  /**
   * 查询 ARK 任务状态（公开方法，供 status API 调用）
   */
  async getTaskStatus(taskId: string): Promise<SeedanceTaskResponse> {
    const response = await this.client.get(`/${taskId}`);
    return response.data;
  }

  /**
   * 实现 VideoProvider 接口的 getArkTaskStatus 方法
   * 用于 status API 统一查询 ARK 任务状态
   */
  async getArkTaskStatus(taskId: string): Promise<{
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
    videoUrl?: string;
    lastFrameUrl?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }> {
    const taskData = await this.getTaskStatus(taskId);
    return {
      status: taskData.status === 'processing' ? 'running' : taskData.status === 'pending' ? 'queued' : taskData.status,
      videoUrl: taskData.content?.video_url,
      lastFrameUrl: taskData.content?.last_frame_url,
      errorMessage: this.friendlyErrorMessage(taskData.error?.message),
      metadata: {
        resolution: taskData.resolution,
        ratio: taskData.ratio,
        duration: taskData.duration,
        frames_per_second: taskData.framespersecond,
        service_tier: taskData.service_tier,
      },
    };
  }

  /**
   * 转换 content 格式
   */
  private convertContent(content: VideoContent[]): SeedanceTaskRequest['content'] {
    return content.map(item => {
      if (item.type === 'text') {
        return {
          type: 'text' as const,
          text: item.text
        };
      }
      
      if (item.type === 'image_url') {
        return {
          type: 'image_url' as const,
          image_url: { url: item.image_url.url },
          role: item.role || 'reference_image'
        };
      }

      if (item.type === 'video_url') {
        return {
          type: 'video_url' as const,
          video_url: { url: item.video_url?.url || '' },
          role: item.role || 'reference_video'
        };
      }

      if (item.type === 'audio_url') {
        return {
          type: 'audio_url' as const,
          audio_url: { url: item.audio_url?.url || '' },
          role: item.role || 'reference_audio'
        };
      }

      // 默认返回文本
      return {
        type: 'text' as const,
        text: ''
      };
    });
  }

  getSupportedResolutions(): VideoResolution[] {
    return ['480p', '720p', '1080p'];
  }

  getSupportedRatios(): VideoRatio[] {
    return ['16:9', '9:16', '1:1', '4:3', '3:4'];
  }

  getDurationRange(): { min: number; max: number } {
    return { min: 4, max: 15 };
  }

  /**
   * 检查 API Key 是否配置
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
