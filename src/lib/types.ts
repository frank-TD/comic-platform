/**
 * 类型定义文件
 */

// 生成模式
export type GenerationMode = 'single' | 'batch' | 'extend' | 'edit';

// 任务状态码
export enum TaskStatus {
  QUEUE = 0,       // 排队中
  PROCESSING = 1,  // 处理中
  SUCCESS = 2,     // 成功
  FAILED = -1      // 失败
}

// 状态文字映射
export const STATUS_TEXT: Record<TaskStatus, string> = {
  [TaskStatus.QUEUE]: '排队中',
  [TaskStatus.PROCESSING]: '处理中',
  [TaskStatus.SUCCESS]: '成功',
  [TaskStatus.FAILED]: '失败'
};

// 任务记录
export interface TaskRecord {
  task_id: string;
  mode: GenerationMode;
  prompt: string;
  original_prompt?: string;
  image_urls?: string[];      // 该任务实际使用的图片（根据 @图X 引用筛选）
  all_image_urls?: string[];  // 用户提交时的全部图片（用于重新生成时还原）
  image_order?: string[];     // 图片顺序（URL 数组），用于重新生成时保持拖拽后的顺序
  model_id?: string;
  status: TaskStatus;
  status_text?: string;
  result_url?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  /** 服务层级：flex 表示离线推理，默认为实时 */
  service_tier?: 'flex' | 'default';
}

// API 响应基础格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 生成请求参数
export interface GenerateParams {
  prompt: string;
  mode: GenerationMode;
  images?: string[];
  model?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  videoUrls?: string[];      // 视频参考（仅 Seedance 2.0），最多 3 个
  audioUrls?: string[];      // 音频参考（仅 Seedance 2.0），最多 3 个
  generateAudio?: boolean;    // 是否生成音频（仅 Seedance 2.0）
  metadata?: Record<string, unknown>;
  imageOrder?: string[];     // 图片顺序（URL 数组），用于记录拖拽后的顺序
  // 统一素材引用（解析后的实际URL）
  referencedImages?: string[];  // prompt 中引用的图片 URL
  referencedVideos?: string[]; // prompt 中引用的视频 URL
  referencedAudios?: string[]; // prompt 中引用的音频 URL
}

// 批量生成参数
export interface BatchGenerateParams {
  prompts: string[];
  mode: GenerationMode;
  images?: string[];
  model?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  videoUrls?: string[];      // 视频参考（仅 Seedance 2.0），最多 3 个
  audioUrls?: string[];      // 音频参考（仅 Seedance 2.0），最多 3 个
  generateAudio?: boolean;    // 是否生成音频（仅 Seedance 2.0）
  useOfflineInference?: boolean;  // 是否启用离线推理（仅 Seedance 2.0 批量模式）
  metadata?: Record<string, unknown>;
  imageOrder?: string[];     // 图片顺序（URL 数组），用于记录拖拽后的顺序
  // 每任务独立素材（方案C）
  taskItems?: Array<{
    prompt: string;
    images: string[];
    videos: string[];
    audios: string[];
    duration?: number;  // 每条任务独立的时长
  }>;
}

// 分镜项目
export interface StoryboardItem {
  id: string;
  content: string;
  image?: string;
}

// 上传的图像信息
export interface UploadedImage {
  id: string;           // 唯一标识，格式为 "图1"、"图2" 等，基于 displayIndex
  name: string;
  url: string;
  thumbnail?: string;
  key?: string;         // 对象存储的 key，用于删除
  displayIndex: number; // 显示顺序（1=第一个），用于 @图X 引用解析
  uploadOrder: number;  // 上传顺序（1=最先上传），仅用于记录
}

// 媒体素材类型
export type MediaType = 'image' | 'video' | 'audio';

// 统一媒体素材（支持图片/视频/音频）
export interface UploadedMedia {
  key: string;              // 唯一标识 "@图1" / "@视频1" / "@音频1"
  name: string;             // 文件名
  url: string;               // 访问URL
  localPreviewUrl?: string;  // 本地预览URL（blob，上传前使用）
  type: MediaType;          // 素材类型
  size: number;              // 文件大小(bytes)
  thumbnailUrl?: string;     // 缩略图URL (视频/音频用)
  duration?: number;         // 视频/音频时长(秒)
  storageKey?: string;       // 对象存储的 key，用于删除
  createdAt: string;         // 上传时间
  uploadProgress?: number;   // 上传进度 0-100
  isUploading?: boolean;     // 是否正在上传
  isUploaded?: boolean;      // 是否已上传完成
}

// 统一素材状态
export interface UnifiedMediaState {
  images: UploadedMedia[];
  videos: UploadedMedia[];
  audios: UploadedMedia[];
  nextImageIndex: number;    // 下一个图片序号
  nextVideoIndex: number;    // 下一个视频序号
  nextAudioIndex: number;    // 下一个音频序号
}

// 上传响应数据
export interface UploadMediaResponse {
  key: string;              // 引用标识 "@图1"
  name: string;             // 文件名
  url: string;              // 访问URL
  type: MediaType;          // 素材类型
  size: number;             // 文件大小
  thumbnailUrl?: string;    // 缩略图URL
  duration?: number;        // 视频/音频时长
}

// 延长视频模式
export type ExtendMode = 'extend';

// 延长视频请求参数
export interface ExtendVideoParams {
  videoUrls: string[];       // 1-3 个视频片段 URL（必填）
  prompt: string;             // 衔接描述文本
  ratio?: string;             // 画幅比例
  duration?: number;          // 时长 4-15s
  generateAudio?: boolean;    // 是否生成音频
}

// 延长视频任务记录（扩展 TaskRecord）
export interface ExtendTaskRecord extends TaskRecord {
  mode: ExtendMode;
  video_urls: string[];       // 原始视频片段
}

// 编辑视频模式
export type EditMode = 'edit';

// 编辑视频请求参数
export interface EditVideoParams {
  videoUrl: string;            // 待编辑视频 URL（必填）
  imageUrl?: string;           // 参考图片 URL（可选，最多 1 张）
  prompt: string;              // 编辑指令（必填）
}

// 编辑视频任务记录（扩展 TaskRecord）
export interface EditTaskRecord extends TaskRecord {
  mode: EditMode;
  video_url: string;           // 待编辑视频
  image_url?: string;          // 参考图片
}
