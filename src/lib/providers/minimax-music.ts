/**
 * MiniMax 音乐生成 Provider
 * 支持文本生成音乐和参考音频翻唱
 */

import { MINIMAX_MUSIC_CONFIG } from '@/lib/config';
import axios, { AxiosInstance } from 'axios';

// 音乐任务状态
export enum MusicTaskStatus {
  PENDING = 0,   // 等待中
  PROCESSING = 1, // 处理中
  COMPLETED = 2,  // 已完成
  FAILED = -1     // 失败
}

// MiniMax API 请求参数
export interface MiniMaxMusicRequest {
  model: string;
  prompt: string;
  lyrics?: string;
  isInstrumental?: boolean;
  audioSetting?: {
    sampleRate?: number;
    bitrate?: number;
    format?: string;
  };
  referenceAudio?: {
    audioFile?: string;  // base64 编码的音频文件
    audioUrl?: string;   // 或音频 URL
  };
}

// MiniMax API 响应
export interface MiniMaxTaskResponse {
  taskId: string;
  status: number;
  taskStatus: string;
}

export interface MiniMaxTaskResult {
  taskId: string;
  status: number;
  audioUrl?: string;  // 已完成时返回的音频 URL
  audio?: string;     // 或 hex 编码的音频数据
  error?: {
    code: string;
    message: string;
  };
}

// MiniMax API 错误响应
interface MiniMaxErrorResponse {
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * MiniMax 音乐生成客户端
 */
export class MiniMaxMusicClient {
  private client: AxiosInstance;
  private groupId: string;

  constructor() {
    const config = MINIMAX_MUSIC_CONFIG;
    this.groupId = config.groupId;
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });
  }

  /**
   * 创建音乐生成任务
   */
  async createTask(request: MiniMaxMusicRequest): Promise<MiniMaxTaskResponse> {
    try {
      const response = await this.client.post<MiniMaxTaskResponse>(
        `/text_to_music?GroupId=${this.groupId}`,
        {
          model: request.model,
          prompt: request.prompt,
          lyrics: request.lyrics,
          is_instrumental: request.isInstrumental ?? false,
          audio_setting: request.audioSetting,
          reference_audio: request.referenceAudio,
        }
      );

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: MiniMaxErrorResponse } };
      if (axiosError.response?.data) {
        const errorData = axiosError.response.data;
        const message = errorData.base_resp?.status_msg 
          || errorData.error?.message 
          || '音乐生成请求失败';
        throw new Error(message);
      }
      throw error;
    }
  }

  /**
   * 查询音乐生成任务状态
   */
  async getTaskStatus(taskId: string): Promise<MiniMaxTaskResult> {
    try {
      const response = await this.client.get<MiniMaxTaskResult>(
        `/text_to_music?GroupId=${this.groupId}&TaskId=${taskId}`
      );

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: MiniMaxErrorResponse } };
      if (axiosError.response?.data) {
        const errorData = axiosError.response.data;
        const message = errorData.base_resp?.status_msg 
          || errorData.error?.message 
          || '查询任务状态失败';
        throw new Error(message);
      }
      throw error;
    }
  }

  /**
   * 将 hex 编码的音频转换为 Buffer
   */
  static hexToBuffer(hexString: string): Buffer {
    // 移除可能的空格和换行
    const cleanHex = hexString.replace(/\s/g, '');
    return Buffer.from(cleanHex, 'hex');
  }
}

// 单例实例
let musicClient: MiniMaxMusicClient | null = null;

export function getMiniMaxMusicClient(): MiniMaxMusicClient {
  if (!musicClient) {
    musicClient = new MiniMaxMusicClient();
  }
  return musicClient;
}
