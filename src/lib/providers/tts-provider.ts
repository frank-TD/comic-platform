/**
 * TTS Provider 接口定义
 * 
 * 用于统一管理多种 TTS 提供商（豆包、阿里云、腾讯云等）
 * 采用适配器模式，方便后续扩展和替换
 */

import { TTSRequest, TTSResponse } from 'coze-coding-dev-sdk';

// ==================== 类型定义 ====================

/**
 * TTS 提供商类型
 */
export type TTSProviderType = 'doubao' | 'aliyun' | 'tencent' | 'azure';

/**
 * TTS 音色选项
 */
export interface TTSVoiceOption {
  value: string;        // 音色 ID
  label: string;        // 显示名称
  provider: TTSProviderType; // 所属提供商
  gender?: 'male' | 'female'; // 性别
  language?: string;    // 语言
}

/**
 * TTS 请求参数（统一格式）
 */
export interface UnifiedTTSRequest {
  userId: string;           // 用户 ID
  text: string;             // 待合成文本
  voice: string;            // 音色 ID
  format?: 'mp3' | 'pcm' | 'ogg_opus';  // 音频格式
  sampleRate?: number;      // 采样率
  speechRate?: number;      // 语速 (-500 ~ 500)
  volume?: number;          // 音量 (-500 ~ 500)
  pitch?: number;           // 音调 (-500 ~ 500)
}

/**
 * TTS 响应结果（统一格式）
 */
export interface UnifiedTTSResponse {
  success: boolean;
  audioUri?: string;        // 音频 URI
  audioSize?: number;       // 音频大小（字节）
  duration?: number;         // 音频时长（秒）
  error?: string;           // 错误信息
}

/**
 * TTS Provider 基类接口
 */
export interface ITTSProvider {
  /** 提供商标识 */
  readonly type: TTSProviderType;
  
  /** 提供商名称 */
  readonly name: string;
  
  /** 获取该提供商支持的所有音色 */
  getVoices(): TTSVoiceOption[];
  
  /** 执行语音合成 */
  synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse>;
  
  /** 检查配置是否有效 */
  isConfigured(): boolean;
}

// ==================== 豆包 TTS 实现 ====================

import { TTSClient, Config } from 'coze-coding-dev-sdk';

/**
 * 豆包 TTS 提供商
 */
export class DoubaoTTSProvider implements ITTSProvider {
  readonly type: TTSProviderType = 'doubao';
  readonly name = '豆包 TTS';
  private client: TTSClient | null = null;
  
  constructor() {
    if (this.isConfigured()) {
      this.client = new TTSClient(new Config());
    }
  }
  
  /**
   * 豆包音色列表
   * 
   * 音色 ID 格式说明：
   * - xxx_bigtts: 大参数音色（基础版）
   * - xxx_saturn_bigtts: Saturn 音色（增强版，视频配音）
   * - xxx_tob: TOB 音色（角色扮演）
   */
  getVoices(): TTSVoiceOption[] {
    return [
      // ===== 通用音色（BigTTS 大参数音色）=====
      { value: 'zh_female_xiaohe_uranus_bigtts', label: '小禾（女声，通用）', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi（女声，中英）', provider: 'doubao', gender: 'female', language: 'zh-CN' },
      { value: 'zh_male_m191_uranus_bigtts', label: '云舟（男声）', provider: 'doubao', gender: 'male', language: 'zh' },
      { value: 'zh_male_taocheng_uranus_bigtts', label: '小甜（男声）', provider: 'doubao', gender: 'male', language: 'zh' },
      
      // ===== 视频配音音色（Saturn 增强音色）=====
      { value: 'zh_male_dayi_saturn_bigtts', label: '大义（男声）', provider: 'doubao', gender: 'male', language: 'zh', },
      { value: 'zh_female_mizai_saturn_bigtts', label: '蜜崽（女声）', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'zh_female_jitangnv_saturn_bigtts', label: '鸡汤女（女声）', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'zh_female_meilinvyou_saturn_bigtts', label: '魅力女声', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'zh_female_santongyongns_saturn_bigtts', label: '三通女声', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'zh_male_ruyayichen_saturn_bigtts', label: '儒雅男声', provider: 'doubao', gender: 'male', language: 'zh' },
      
      // ===== 角色扮演音色（TOB 音色）=====
      { value: 'saturn_zh_female_keainvsheng_tob', label: '可爱女孩', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'saturn_zh_female_tiaopigongzhu_tob', label: '调皮公主', provider: 'doubao', gender: 'female', language: 'zh' },
      { value: 'saturn_zh_male_shuanglangshaonian_tob', label: '爽朗少年', provider: 'doubao', gender: 'male', language: 'zh' },
      { value: 'saturn_zh_male_tiancaitongzhuo_tob', label: '天才同学', provider: 'doubao', gender: 'male', language: 'zh' },
      { value: 'saturn_zh_female_cancan_tob', label: '才女', provider: 'doubao', gender: 'female', language: 'zh' },
    ];
  }
  
  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    if (!this.client) {
      return { success: false, error: '豆包 TTS 未配置或配置无效' };
    }
    
    try {
      console.log(`[DoubaoTTS] Starting synthesis, voice: ${request.voice}`);
      
      const response: TTSResponse = await this.client.synthesize({
        uid: request.userId,
        text: request.text,
        speaker: request.voice,
        audioFormat: request.format || 'mp3',
      });
      
      // 估算时长：基于音频大小和采样率
      const estimatedDuration = Math.round(response.audioSize / (request.sampleRate || 24000) / 2);
      
      console.log(`[DoubaoTTS] Synthesis completed, size: ${response.audioSize}`);
      
      return {
        success: true,
        audioUri: response.audioUri,
        audioSize: response.audioSize,
        duration: estimatedDuration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '语音合成失败';
      console.error(`[DoubaoTTS] Synthesis failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
  
  isConfigured(): boolean {
    // 检查是否配置了必要的环境变量
    return !!(
      process.env.COZE_API_KEY ||
      process.env.DOUBAO_API_KEY ||
      process.env.TTS_API_KEY
    );
  }
}

// ==================== Provider 工厂 ====================

/**
 * TTS Provider 工厂函数
 * 根据类型返回对应的 Provider 实例
 */
export function getTTSProvider(type: TTSProviderType = 'doubao'): ITTSProvider {
  switch (type) {
    case 'doubao':
      return new DoubaoTTSProvider();
    // 预留其他提供商...
    // case 'aliyun':
    //   return new AliyunTTSProvider();
    // case 'tencent':
    //   return new TencentTTSProvider();
    default:
      throw new Error(`不支持的 TTS 提供商: ${type}`);
  }
}

/**
 * 获取所有可用的 TTS 提供商
 */
export function getAllTTSProviders(): ITTSProvider[] {
  return [
    new DoubaoTTSProvider(),
    // 预留其他提供商...
  ];
}

/**
 * 根据音色 ID 获取所属提供商
 */
export function getProviderByVoice(voiceId: string): TTSProviderType {
  // 豆包音色以特定前缀开头
  if (voiceId.includes('bigtts') || voiceId.includes('tob')) {
    return 'doubao';
  }
  // 可以扩展其他提供商的音色前缀判断
  return 'doubao'; // 默认返回豆包
}

// ==================== 工具函数 ====================

/**
 * 格式化音频时长
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * 估算音频时长（基于文件大小和采样率）
 */
export function estimateDuration(audioSize: number, sampleRate: number = 24000): number {
  // 估算公式：文件大小 / (采样率 * 2) ≈ 时长（秒）
  // 2 是因为 16bit 采样（2 bytes per sample）
  return Math.round(audioSize / (sampleRate * 2));
}
