/**
 * 模型配置 - V1.0 统一调度配置
 * 所有 API 端点、模型名称必须存放在此文件，禁止硬编码
 */

// 默认模型提供商
export const DEFAULT_PROVIDER = 'seedance2.0';

// 默认特性配置（用于没有独立 features 的模型）
const DEFAULT_FEATURES = {
  textToVideo: true,
  imageToVideo: true,
  audioGeneration: false,
  minDuration: 4,
  maxDuration: 15,
  resolutions: ['480p', '720p', '1080p'] as const,
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] as const
};

// 导出的类型别名
export type Ratios = typeof DEFAULT_FEATURES.ratios[number];

// 支持的模型列表
export const MODEL_PROVIDERS = {
  'doubao-seedance-1-5-pro': {
    name: 'Doubao-Seedance-1.5-pro',
    endpoint: 'doubao-seedance-1-5-pro-251215', // 模型标识符，由 SDK 处理
    apiKey: process.env.SEEDANCE_API_KEY || '',
    status: 'live' as const, // live | mock
    // 模型特性
    features: {
      textToVideo: true,
      imageToVideo: true,
      audioGeneration: true,
      minDuration: 4,
      maxDuration: 12,
      resolutions: ['480p', '720p', '1080p'] as const,
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] as const
    }
  },
  'seedance2.0': {
    name: 'Seedance 2.0',
    endpoint: process.env.ARK_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    apiKey: process.env.ARK_API_KEY || '',
    status: 'live' as const, // live | mock
    features: {
      textToVideo: true,
      imageToVideo: true,
      videoReference: true,  // 支持参考视频
      audioReference: true,  // 支持参考音频
      audioGeneration: true,
      minDuration: 4,
      maxDuration: 15,
      resolutions: ['480p', '720p'] as const,  // 注：1080p 需单独申请
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'] as const,
      watermark: true,  // 支持水印控制
    }
  },
  'seedance_pro': {
    name: 'Seedance Pro',
    endpoint: process.env.SEEDANCE_PRO_ENDPOINT || 'https://api.seedance-pro.example/v1/generate',
    apiKey: process.env.SEEDANCE_PRO_API_KEY || '',
    status: 'mock' as const,
    features: DEFAULT_FEATURES
  }
} as const;

// 获取当前激活的模型配置
export function getModelConfig(provider?: string) {
  const modelId = provider || DEFAULT_PROVIDER;
  const config = MODEL_PROVIDERS[modelId as keyof typeof MODEL_PROVIDERS];
  if (!config) {
    throw new Error(`未知的模型提供商: ${modelId}`);
  }
  return { modelId, ...config };
}

// 任务状态码
export const TASK_STATUS = {
  QUEUE: 0,      // 排队中
  PROCESSING: 1, // 处理中
  SUCCESS: 2,    // 成功
  FAILED: -1     // 失败
} as const;

// Mock 模式配置（仅在 API 调用失败时使用）
export const MOCK_CONFIG = {
  // 模拟视频的 URL（使用公共示例视频）
  mockVideoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  // Mock 任务完成延迟（毫秒）
  mockDelay: 5000
} as const;

// 视频生成默认参数
export const VIDEO_GENERATION_DEFAULTS = {
  model: 'doubao-seedance-1-5-pro-251215',
  duration: 5,
  resolution: '1080p' as const,
  ratio: '9:16' as const,
  watermark: false,
  generateAudio: true,
  maxWaitTime: 1800, // 最大等待时间（秒）
} as const;

// 离线推理配置（仅 Seedance 2.0 批量生成使用）
export const OFFLINE_INFERENCE_CONFIG = {
  serviceTier: 'flex' as const,          // 离线推理服务层级
  executionExpiresAfter: 86400,          // 离线任务过期时间（24小时，单位：秒）
  pollIntervalMs: 60000,                 // 前端轮询间隔（60秒）
} as const;

// 模型标识符映射：前端展示 ID -> SDK/API 实际使用的标识符
// 注意：SDK 期望的模型标识符可能与前端展示的 ID 不同
export const MODEL_ID_MAPPING: Record<string, string> = {
  'doubao-seedance-1-5-pro': 'doubao-seedance-1-5-pro-251215',
  'seedance2.0': 'seedance2.0',
  'seedance_pro': 'seedance_pro'
};

// 豆包声音复刻 2.0 API 配置
export const VOICE_CLONE_CONFIG = {
  // 火山引擎控制台获取的 APP ID 和 Access Token
  appId: process.env.VOICE_CLONE_APP_ID || '',
  accessToken: process.env.VOICE_CLONE_ACCESS_KEY || '',
  // 默认 speaker_id（从火山控制台获取，参考文档：获取声音复刻音色 ID）
  defaultSpeakerId: process.env.VOICE_CLONE_DEFAULT_SPEAKER_ID || '',
  // API 端点
  cloneEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/voice_clone',
  getVoiceEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/get_voice',
  // V3 TTS 端点（HTTP Chunked 单向流式）
  ttsEndpoint: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
  // V3 TTS 资源 ID（声音复刻 2.0）
  resourceId: 'seed-icl-2.0',
  // 默认设置
  defaults: {
    language: 0,         // 中文
    audioFormat: 'mp3',
    sampleRate: 24000,
    enableAudioDenoise: false,  // 2.0 默认关闭降噪
  },
  // 轮询设置
  polling: {
    maxAttempts: 30,     // 最多轮询 30 次
    intervalMs: 5000,    // 每 5 秒轮询一次
  },
} as const;

// LLM 配置（提示词优化等）
export const LLM_CONFIG = {
  model: process.env.LLM_MODEL || 'doubao-seed-2-0-pro-260215',
  temperature: 0.8,
} as const;

// 视频代理白名单域名（防止 SSRF）
export const VIDEO_PROXY_ALLOWLIST = [
  'tos-cn-beijing.volces.com',
  'tos-cn-shanghai.volces.com',
  'tos-cn-guangzhou.volces.com',
  'tos-s3-cn-beijing.volces.com',
  'ark.cn-beijing.volces.com',
  'ark.cn-shanghai.volces.com',
  'storage.googleapis.com',
  's3.amazonaws.com',
];

// MiniMax 音乐生成 API 配置
export const MINIMAX_MUSIC_CONFIG = {
  baseUrl: process.env.MINIMAX_API_BASE_URL || 'https://api.minimax.chat/v1',
  apiKey: process.env.MINIMAX_API_KEY || '',
  groupId: process.env.MINIMAX_GROUP_ID || '',
  // 支持的模型
  models: {
    textToMusic: 'music-2.6',      // 文本生成音乐
    coverMusic: 'music-cover',     // 参考音频翻唱
    textToMusicFree: 'music-2.6-free',      // 免费文本生成
    coverMusicFree: 'music-cover-free',     // 免费翻唱
  },
  // 默认设置
  defaults: {
    model: 'music-2.6',
    isInstrumental: false,
    audioFormat: 'mp3',
    sampleRate: 32000,
    bitrate: 128000,
  }
} as const;
