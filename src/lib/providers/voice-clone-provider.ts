/**
 * 豆包声音复刻 2.0 Provider
 *
 * 接入火山引擎声音复刻 API V3，支持：
 * 1. voice_clone - 上传参考音频训练音色
 * 2. get_voice   - 查询音色训练状态
 * 3. V3 TTS      - 使用训练好的音色合成语音
 *
 * 完整流程：
 * 1. 用户上传参考音频 → 调用 voice_clone 训练音色
 * 2. 轮询 get_voice 等待训练完成（status=2 或 4）
 * 3. 训练完成后使用 speaker_id 调用 V3 TTS API 合成语音
 *
 * 文档参考：
 * - 声音复刻 API V3: https://www.volcengine.com/docs/6561/2227958
 * - V3 HTTP Chunked 单向流式: https://www.volcengine.com/docs/6561/1598757
 */

import axios, { AxiosInstance } from 'axios';
import { VOICE_CLONE_CONFIG } from '@/lib/config';
import { S3Storage } from 'coze-coding-dev-sdk';
import { v4 as uuidv4 } from 'uuid';

// ==================== 类型定义 ====================

/** 音色训练状态 */
export enum VoiceCloneStatus {
  NOT_FOUND = 0,  // 未找到
  TRAINING = 1,   // 训练中
  SUCCESS = 2,    // 训练成功
  FAILED = 3,     // 训练失败
  ACTIVE = 4,     // 已激活
}

/** 支持的语言 */
export enum VoiceCloneLanguage {
  CN = 0,  // 中文（默认）
  EN = 1,  // 英文
}

/** 声音复刻请求参数 */
export interface VoiceCloneRequest {
  speakerId: string;                // 音色代号（从火山控制台获取或自动生成）
  audioData: string;                // base64 编码的音频数据
  audioFormat?: string;             // 音频格式（pcm/m4a 必传，其余可选）
  language?: VoiceCloneLanguage;    // 语种
  text?: string;                    // 参考音频对应文本（可选，用于 WER 校验）
  enableAudioDenoise?: boolean;     // 是否开启降噪（2.0 默认 false）
  enableCropByAsr?: boolean;        // 是否开启 ASR 截断
  demoText?: string;                // 试听文本
}

/** 声音复刻响应 */
export interface VoiceCloneResponse {
  code?: number;
  message?: string;
  speakerId: string;
  status: VoiceCloneStatus;
  availableTrainingTimes?: number;
  createTime?: number;
  language?: number;
  speakerStatus?: Array<{
    modelType: number;
    demoAudio?: string;
  }>;
}

/** 音色查询请求 */
export interface GetVoiceRequest {
  speakerId: string;
}

/** 音色查询响应 */
export interface GetVoiceResponse {
  code?: number;
  message?: string;
  speakerId: string;
  status: VoiceCloneStatus;
  availableTrainingTimes?: number;
  createTime?: number;
  language?: number;
  speakerStatus?: Array<{
    modelType: number;
    demoAudio?: string;
  }>;
}

/** V3 TTS 合成请求 */
export interface V3TTSRequest {
  text: string;                    // 待合成文本
  speakerId: string;               // 音色 ID（voice_clone 返回的 speaker_id）
  uid: string;                     // 用户标识
  format?: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';  // 音频编码格式
  sampleRate?: number;             // 采样率
  speechRate?: number;             // 语速 [-50, 100]
  loudnessRate?: number;           // 音量 [-50, 100]
  language?: string;               // 明确语种
  model?: string;                  // 模型版本（seed-tts-2.0-expressive / seed-tts-2.0-standard）
}

/** V3 TTS 合成响应 */
export interface V3TTSResponse {
  success: boolean;
  audioBuffer?: Buffer;            // 合成的音频数据
  audioUri?: string;               // 上传到对象存储后的 URL
  duration?: number;               // 音频时长（秒）
  error?: string;
}

// ==================== 错误码映射 ====================

const CLONE_ERROR_MAP: Record<number, { title: string; suggestion: string }> = {
  45001001: { title: '请求参数有误', suggestion: '请检查上传的音频格式和参数是否正确' },
  45001101: { title: '音频上传失败', suggestion: '请重新上传参考音频，检查网络连接' },
  45001102: { title: '音频转写失败', suggestion: '请确保音频清晰、人声占比高后重试' },
  45001104: { title: '声纹检测未通过', suggestion: '请更换音频或更换说话人' },
  45001105: { title: '获取音频数据失败', suggestion: '请确认音频数据不为空且 base64 编码正确' },
  45001107: { title: '音色 ID 未找到', suggestion: '请确认音色 ID 正确或重新创建' },
  45001108: { title: '音频转码失败', suggestion: '请确认音频格式与采样率，提供可解码音频' },
  45001109: { title: 'WER 检测错误', suggestion: '请检查参考音频与提供的文本是否对应' },
  45001112: { title: 'SNR 检测错误', suggestion: '请更换更高信噪比的音频' },
  45001113: { title: '降噪失败', suggestion: '请尝试关闭降噪或更换音频' },
  45001114: { title: '音频质量较差', suggestion: '请更换更清晰的参考音频' },
  45001122: { title: '未检测到人声', suggestion: '请上传含清晰人声的音频' },
  45001123: { title: '达到上传次数上限', suggestion: '该音色训练次数已用完，请使用其他音色 ID' },
  45001124: { title: '音频内容审核拒绝', suggestion: '请更换音频内容，避免敏感内容' },
  45001125: { title: '试听文本审核拒绝', suggestion: '请修改试听文本，避免敏感词' },
  45001126: { title: '试听文本长度错误', suggestion: '试听文本长度需在4到80字之间' },
  45001127: { title: '参考音频审核拒绝', suggestion: '请更换音频，确保来源合规' },
  45001128: { title: '参考音频文本审核拒绝', suggestion: '请更换音频或文本，避免敏感内容' },
  55001301: { title: '数据库查询失败', suggestion: '服务暂时异常，请稍后重试' },
  55001302: { title: '数据库插入失败', suggestion: '服务暂时异常，请稍后重试' },
  55001303: { title: '数据库更新失败', suggestion: '服务暂时异常，请稍后重试' },
  55001304: { title: '数据库删除失败', suggestion: '服务暂时异常，请稍后重试' },
  55001305: { title: '对象存储上传失败', suggestion: '服务暂时异常，请稍后重试' },
  55001306: { title: '对象存储下载失败', suggestion: '服务暂时异常，请稍后重试' },
  55001307: { title: '音色克隆失败', suggestion: '服务暂时异常，请稍后重试' },
};

/**
 * 根据错误码获取用户友好的错误信息
 */
export function getCloneErrorMessage(code: number): { title: string; suggestion: string } {
  return CLONE_ERROR_MAP[code] || {
    title: `声音复刻失败（错误码: ${code}）`,
    suggestion: '请稍后重试或联系客服',
  };
}

// ==================== VoiceCloneProvider ====================

/**
 * 豆包声音复刻 2.0 提供商
 */
export class VoiceCloneProvider {
  private appId: string;
  private accessToken: string;
  private client: AxiosInstance;

  constructor() {
    this.appId = VOICE_CLONE_CONFIG.appId;
    this.accessToken = VOICE_CLONE_CONFIG.accessToken;

    this.client = axios.create({
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!(this.appId && this.accessToken);
  }

  /**
   * 生成通用请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-App-Key': this.appId,
      'X-Api-Access-Key': this.accessToken,
      'X-Api-Request-Id': uuidv4(),
    };
  }

  // ==================== 声音复刻训练 ====================

  /**
   * 提交声音复刻训练
   *
   * POST https://openspeech.bytedance.com/api/v3/tts/voice_clone
   */
  async trainVoice(request: VoiceCloneRequest): Promise<VoiceCloneResponse> {
    if (!this.isConfigured()) {
      throw new Error('声音复刻 API 未配置，请设置 VOICE_CLONE_APP_ID 和 VOICE_CLONE_ACCESS_KEY 环境变量');
    }

    const requestBody: Record<string, unknown> = {
      speaker_id: request.speakerId,
      audio: {
        data: request.audioData,
      },
      language: request.language ?? VoiceCloneLanguage.CN,
    };

    // 可选参数：音频格式（pcm/m4a 必传）
    if (request.audioFormat) {
      (requestBody.audio as Record<string, unknown>).format = request.audioFormat;
    }

    // 可选参数：参考文本
    if (request.text) {
      (requestBody.audio as Record<string, unknown>).text = request.text;
    }

    // 可选参数：扩展参数
    const extraParams: Record<string, unknown> = {};
    if (request.enableAudioDenoise !== undefined) {
      extraParams.enable_audio_denoise = request.enableAudioDenoise;
    }
    if (request.enableCropByAsr !== undefined) {
      extraParams.enable_crop_by_asr = request.enableCropByAsr;
    }
    if (request.demoText) {
      extraParams.demo_text = request.demoText;
    }
    if (Object.keys(extraParams).length > 0) {
      requestBody.extra_params = extraParams;
    }

    try {
      console.log(`[VoiceClone] Training voice for speaker: ${request.speakerId}`);

      const response = await this.client.post<VoiceCloneResponse>(
        VOICE_CLONE_CONFIG.cloneEndpoint,
        requestBody,
        { headers: this.getHeaders() }
      );

      const data = response.data;
      console.log(`[VoiceClone] Training response: status=${data.status}, speaker_id=${data.speakerId}`);

      if (data.code && data.code !== 0) {
        const errorInfo = getCloneErrorMessage(data.code);
        throw new Error(`${errorInfo.title}: ${errorInfo.suggestion}`);
      }

      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data as { code?: number; message?: string };
        if (errorData.code) {
          const errorInfo = getCloneErrorMessage(errorData.code);
          throw new Error(`${errorInfo.title}: ${errorInfo.suggestion} (原始错误: ${errorData.message || ''})`);
        }
        throw new Error(`声音复刻训练失败: ${errorData.message || error.message}`);
      }
      throw error;
    }
  }

  // ==================== 音色状态查询 ====================

  /**
   * 查询音色训练状态
   *
   * POST https://openspeech.bytedance.com/api/v3/tts/get_voice
   */
  async getVoiceStatus(speakerId: string): Promise<GetVoiceResponse> {
    if (!this.isConfigured()) {
      throw new Error('声音复刻 API 未配置');
    }

    try {
      const response = await this.client.post<GetVoiceResponse>(
        VOICE_CLONE_CONFIG.getVoiceEndpoint,
        { speaker_id: speakerId },
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data as { code?: number; message?: string };
        throw new Error(`查询音色状态失败: ${errorData.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * 轮询等待音色训练完成
   *
   * @param speakerId 音色 ID
   * @param maxAttempts 最大轮询次数
   * @param intervalMs 轮询间隔（毫秒）
   * @returns 训练完成的音色状态
   */
  async waitForTrainingComplete(
    speakerId: string,
    maxAttempts: number = 30,
    intervalMs: number = 5000
  ): Promise<GetVoiceResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.getVoiceStatus(speakerId);

      console.log(`[VoiceClone] Poll ${attempt + 1}/${maxAttempts} for ${speakerId}: status=${result.status}`);

      if (result.status === VoiceCloneStatus.SUCCESS || result.status === VoiceCloneStatus.ACTIVE) {
        return result;
      }

      if (result.status === VoiceCloneStatus.FAILED) {
        throw new Error('音色训练失败，请更换参考音频后重试');
      }

      // 训练中，等待后重试
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('音色训练超时，请稍后查询训练状态');
  }

  // ==================== V3 TTS 合成（使用复刻音色） ====================

  /**
   * 使用复刻音色调用 V3 TTS 合成语音
   *
   * POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
   *
   * 使用 HTTP Chunked 流式返回，收集全部音频后上传对象存储
   */
  async synthesizeWithClonedVoice(
    request: V3TTSRequest,
    storage: S3Storage
  ): Promise<V3TTSResponse> {
    if (!this.isConfigured()) {
      throw new Error('声音复刻 API 未配置');
    }

    const format = request.format || 'mp3';
    const sampleRate = request.sampleRate || 24000;

    const requestBody = {
      user: {
        uid: request.uid,
      },
      req_params: {
        text: request.text,
        speaker: request.speakerId,
        model: request.model,
        audio_params: {
          format,
          sample_rate: sampleRate,
          speech_rate: request.speechRate ?? 0,
          loudness_rate: request.loudnessRate ?? 0,
        },
        additions: {
          // 声音复刻 2.0 默认中文
          explicit_language: request.language || 'zh-cn',
        },
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Api-App-Id': this.appId,
      'X-Api-Access-Key': this.accessToken,
      'X-Api-Resource-Id': VOICE_CLONE_CONFIG.resourceId,
      'X-Api-Request-Id': uuidv4(),
    };

    try {
      console.log(`[VoiceClone] Synthesizing with cloned voice: speaker=${request.speakerId}, text_len=${request.text.length}`);

      const response = await this.client.post(
        VOICE_CLONE_CONFIG.ttsEndpoint,
        requestBody,
        {
          headers,
          responseType: 'stream',
        }
      );

      // 收集流式返回的音频数据
      const audioChunks: Buffer[] = [];

      return new Promise<V3TTSResponse>((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          audioChunks.push(chunk);
        });

        response.data.on('end', async () => {
          try {
            const fullBuffer = Buffer.concat(audioChunks);
            const responseText = fullBuffer.toString('utf-8');

            // 解析流式返回的 JSON 行，提取音频数据
            const audioDataParts: string[] = [];
            let totalDuration = 0;

            // HTTP Chunked 返回的每一行是一个 JSON 对象
            const lines = responseText.split('\n').filter(line => line.trim());

            for (const line of lines) {
              try {
                const jsonObj = JSON.parse(line);

                // 错误响应
                if (jsonObj.code && jsonObj.code !== 0 && jsonObj.code !== 20000000) {
                  console.error(`[VoiceClone] TTS error response: code=${jsonObj.code}, message=${jsonObj.message}`);
                  reject(new Error(`语音合成失败: ${jsonObj.message || `错误码 ${jsonObj.code}`}`));
                  return;
                }

                // 收集音频数据
                if (jsonObj.data) {
                  audioDataParts.push(jsonObj.data);
                }

                // 获取时长信息
                if (jsonObj.addition?.duration) {
                  totalDuration = parseInt(jsonObj.addition.duration) / 1000;
                }

                // 合成完成
                if (jsonObj.code === 20000000) {
                  break;
                }
              } catch {
                // 忽略非 JSON 行
              }
            }

            if (audioDataParts.length === 0) {
              reject(new Error('语音合成未返回音频数据'));
              return;
            }

            // 合并 base64 音频数据并解码
            const fullBase64Audio = audioDataParts.join('');
            const audioBuffer = Buffer.from(fullBase64Audio, 'base64');

            console.log(`[VoiceClone] Audio synthesized, size: ${audioBuffer.length} bytes`);

            // 上传到对象存储
            const fileName = `clone_${uuidv4()}.${format}`;
            const key = await storage.uploadFile({
              fileContent: audioBuffer,
              fileName,
              contentType: `audio/${format === 'ogg_opus' ? 'ogg' : format}`,
            });

            const url = await storage.generatePresignedUrl({
              key,
              expireTime: 86400 * 7, // 7 天有效期
            });

            // 估算时长（如果服务端未返回）
            if (!totalDuration) {
              totalDuration = estimateAudioDuration(audioBuffer.length, format, sampleRate);
            }

            console.log(`[VoiceClone] Audio uploaded: ${url}, duration: ${totalDuration}s`);

            resolve({
              success: true,
              audioUri: url,
              duration: Math.round(totalDuration),
            });
          } catch (error) {
            console.error('[VoiceClone] Failed to process audio:', error);
            reject(error);
          }
        });

        response.data.on('error', (error: Error) => {
          console.error('[VoiceClone] Stream error:', error);
          reject(new Error(`语音合成流式传输失败: ${error.message}`));
        });
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        let errorMessage = `语音合成失败 (HTTP ${error.response.status})`;
        if (typeof errorData === 'object' && errorData !== null) {
          const ed = errorData as { message?: string; code?: number };
          errorMessage = ed.message || errorMessage;
        }
        return { success: false, error: errorMessage };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : '语音合成失败',
      };
    }
  }
}

// ==================== 工具函数 ====================

/**
 * 估算音频时长（基于文件大小和格式）
 */
function estimateAudioDuration(fileSize: number, format: string, sampleRate: number = 24000): number {
  // MP3 128kbps ≈ 16000 bytes/s
  // WAV = sampleRate * 2 (16bit) * 1 (mono)
  // ogg_opus ≈ 类似 MP3 的压缩率
  switch (format) {
    case 'wav':
    case 'pcm':
      return fileSize / (sampleRate * 2);
    case 'mp3':
    case 'ogg_opus':
    default:
      return fileSize / 16000;
  }
}

/**
 * 获取音频格式的 MIME 类型
 */
export function getAudioMimeType(format: string): string {
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg_opus: 'audio/ogg',
    pcm: 'audio/pcm',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
  };
  return mimeMap[format] || 'audio/mpeg';
}

/**
 * 从文件名获取音频格式
 */
export function getAudioFormatFromFileName(fileName: string): string | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const formatMap: Record<string, string> = {
    mp3: 'mp3',
    wav: 'wav',
    ogg: 'ogg_opus',
    m4a: 'm4a',
    aac: 'aac',
    pcm: 'pcm',
  };
  return ext ? formatMap[ext] : undefined;
}

// ==================== 单例 ====================

let voiceCloneProviderInstance: VoiceCloneProvider | null = null;

/**
 * 获取 VoiceCloneProvider 单例
 */
export function getVoiceCloneProvider(): VoiceCloneProvider {
  if (!voiceCloneProviderInstance) {
    voiceCloneProviderInstance = new VoiceCloneProvider();
  }
  return voiceCloneProviderInstance;
}
