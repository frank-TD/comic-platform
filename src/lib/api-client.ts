/**
 * API 客户端工具
 */

import type { 
  ApiResponse, 
  GenerateParams, 
  BatchGenerateParams, 
  TaskRecord,
  TaskStatus,
  ExtendVideoParams,
  EditVideoParams
} from './types';

// 获取认证 Token
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

// 基础请求封装（支持 JWT 认证）
async function apiRequest<T>(
  url: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {})
  };

  // 添加 JWT Token
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // 处理 401 未授权
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      return { success: false, error: '登录已过期，请重新登录' };
    }

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 单次生成视频
export async function generateVideo(params: GenerateParams): Promise<ApiResponse<{
  task_id: string;
  status: TaskStatus;
  status_text: string;
  mode: string;
  model: string;
  created_at: string;
}>> {
  return apiRequest('/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// 批量生成视频
export async function batchGenerateVideo(params: BatchGenerateParams): Promise<ApiResponse<{
  batch_id?: string;
  tasks: Array<{
    task_id: string;
    status: TaskStatus;
    status_text: string;
    mode: string;
    model: string;
    created_at: string;
  }>;
  task_ids: string[];
}>> {
  // 直接调用批量接口，后端会生成 batch_id 并创建多个任务
  return apiRequest('/api/v1/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompts: params.prompts,
      mode: 'batch',
      images: params.images,
      model: params.model,
      resolution: params.resolution,
      ratio: params.ratio,
      duration: params.duration,
      videoUrls: params.videoUrls,
      audioUrls: params.audioUrls,
      generateAudio: params.generateAudio,
      useOfflineInference: params.useOfflineInference,
      imageOrder: params.imageOrder,
      metadata: params.metadata,
      taskItems: params.taskItems
    })
  });
}

// 获取任务状态
export async function getTaskStatus(taskId: string): Promise<ApiResponse<{
  task_id: string;
  status: TaskStatus;
  status_text: string;
  result_url?: string;
  error_message?: string;
  service_tier?: 'flex' | 'default';
}>> {
  return apiRequest(`/api/v1/status?task_id=${encodeURIComponent(taskId)}`);
}

// 获取任务列表
export async function getTaskList(
  limit = 50, 
  offset = 0
): Promise<ApiResponse<{
  tasks: TaskRecord[];
  total: number;
  limit: number;
  offset: number;
}>> {
  return apiRequest(`/api/v1/tasks?limit=${limit}&offset=${offset}`);
}

// 删除任务
export async function deleteTask(taskId: string): Promise<ApiResponse> {
  return apiRequest(`/api/v1/tasks?task_id=${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  });
}

// 上传图片到对象存储（优先使用 FormData，无大小限制）
export async function uploadImage(file: File | Blob): Promise<ApiResponse<{
  url: string;
  key: string;
}>> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 使用 FormData 上传文件（无大小限制）
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/v1/upload-image', {
      method: 'POST',
      headers,
      body: formData,
    });

    // 检查响应状态
    if (!response.ok) {
      let errorMsg = `上传失败 (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMsg = errorData.error;
        }
      } catch {
        // 响应不是 JSON，尝试获取文本
        try {
          const text = await response.text();
          if (text.length < 200) {
            errorMsg = text;
          }
        } catch {
          // ignore
        }
      }
      console.error('uploadImage error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 删除对象存储中的图片
export async function deleteImage(key: string): Promise<ApiResponse> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };

  try {
    const response = await fetch(`/api/v1/upload-image?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers,
    });

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 带进度的媒体上传接口（使用 XHR 实现真实上传进度）
export function uploadMediaWithProgress(
  file: File | Blob,
  onProgress: (percent: number) => void,
  onComplete: (result: ApiResponse<{
    url: string;
    storageKey: string;
    type: 'image' | 'video' | 'audio';
    name: string;
    size: number;
    thumbnailUrl?: string;
  }>) => void
): void {
  const token = getAuthToken();
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);

  // 上传进度
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      onProgress(percent);
    }
  };

  // 上传完成（不管成功失败都会触发）
  xhr.onload = () => {
    if (xhr.status === 200) {
      try {
        const response = JSON.parse(xhr.responseText);
        onComplete(response);
      } catch {
        onComplete({ success: false, error: '解析响应失败' });
      }
    } else {
      let errorMsg = `上传失败 (${xhr.status})`;
      try {
        const errorData = JSON.parse(xhr.responseText);
        if (errorData.error) {
          errorMsg = errorData.error;
        }
      } catch {
        // ignore
      }
      onComplete({ success: false, error: errorMsg });
    }
  };

  // 网络错误
  xhr.onerror = () => {
    onComplete({ success: false, error: '网络连接失败' });
  };

  // 打开请求并发送
  xhr.open('POST', '/api/v1/upload-media');
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }
  xhr.send(formData);
}

// 统一的媒体上传接口（支持图片/视频/音频）
export async function uploadMedia(file: File | Blob): Promise<ApiResponse<{
  url: string;
  storageKey: string;
  type: 'image' | 'video' | 'audio';
  name: string;
  size: number;
  thumbnailUrl?: string;
}>> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 使用 FormData 上传文件（无大小限制）
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/v1/upload-media', {
      method: 'POST',
      headers,
      body: formData,
    });

    // 检查响应状态
    if (!response.ok) {
      let errorMsg = `上传失败 (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMsg = errorData.error;
        }
      } catch {
        // 响应不是 JSON，尝试获取文本
        try {
          const text = await response.text();
          if (text.length < 200) {
            errorMsg = text;
          }
        } catch {
          // ignore
        }
      }
      console.error('uploadMedia error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 统一媒体删除接口（支持图片/视频/音频）
export async function deleteMedia(key: string): Promise<ApiResponse> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`
  };

  try {
    const response = await fetch(`/api/v1/upload-media?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers,
    });

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 清空某类型的所有媒体文件（用于删除最后一张后重置计数）
export async function clearMediaByType(type: 'image' | 'video' | 'audio'): Promise<ApiResponse> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const response = await fetch('/api/v1/upload-media', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ type }),
    });

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 解析 prompt 中的媒体引用（支持 @图X / @视频X / @音频X）
export function parseMediaReferences(prompt: string): {
  cleanPrompt: string;
  imageReferences: string[];
  videoReferences: string[];
  audioReferences: string[];
} {
  // 匹配 @图1 @图片2 等格式
  const imageRefRegex = /@[图图片][\d]+/g;
  // 匹配 @视频1 @视频2 等格式
  const videoRefRegex = /@[视频vide][\d]+/g;
  // 匹配 @音频1 @音频2 等格式
  const audioRefRegex = /@[音频audio音][\d]+/g;
  
  const imageReferences = prompt.match(imageRefRegex) || [];
  const videoReferences = prompt.match(videoRefRegex) || [];
  const audioReferences = prompt.match(audioRefRegex) || [];
  
  // 合并所有引用并移除
  const allRefsRegex = /@[图图片视频vide音频audio音][\d]+/g;
  const cleanPrompt = prompt.replace(allRefsRegex, '').trim();
  
  return { 
    cleanPrompt, 
    imageReferences,
    videoReferences,
    audioReferences 
  };
}

// 上传视频到对象存储
export async function uploadVideo(file: File | Blob): Promise<ApiResponse<{
  url: string;
  key: string;
}>> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 使用 FormData 上传文件（无大小限制）
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/v1/upload-video', {
      method: 'POST',
      headers,
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 上传音频到对象存储
export async function uploadAudio(file: File | Blob): Promise<ApiResponse<{
  url: string;
  key: string;
}>> {
  // 获取认证 Token
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 使用 FormData 上传文件（无大小限制）
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/v1/upload-audio', {
      method: 'POST',
      headers,
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error('API 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败'
    };
  }
}

// 上传图片到对象存储（Legacy Base64 方式，仅用于兼容）
export async function uploadImageBase64(base64Data: string): Promise<ApiResponse<{
  url: string;
  key: string;
}>> {
  return apiRequest('/api/v1/upload-image', {
    method: 'POST',
    body: JSON.stringify({ image: base64Data })
  });
}

// 解析 prompt 中的图片引用（如 @图1 @图2）
export function parseImageReferences(prompt: string): {
  cleanPrompt: string;
  references: string[];
} {
  // 匹配 @图1 @图片2 等格式
  const refRegex = /@[图图片][\d]+/g;
  const references = prompt.match(refRegex) || [];
  
  // 移除引用符号
  const cleanPrompt = prompt.replace(refRegex, '').trim();
  
  return { cleanPrompt, references };
}

// 替换 prompt 中的图片引用为实际 URL
export function replaceImageReferences(
  prompt: string,
  imageMap: Map<string, string>
): string {
  const refRegex = /@[图图片]([\d]+)/g;
  
  return prompt.replace(refRegex, (match, index) => {
    const key = match;
    return imageMap.get(key) || match;
  });
}

// 延长视频（串联多个视频片段）
export async function extendVideo(params: ExtendVideoParams): Promise<ApiResponse<{
  taskId: string;
  status: TaskStatus;
  status_text: string;
}>> {
  return apiRequest('/api/v1/extend-video', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// 编辑视频（替换主体、增删对象、局部重绘）
export async function editVideo(params: EditVideoParams): Promise<ApiResponse<{
  taskId: string;
  status: TaskStatus;
  status_text: string;
}>> {
  return apiRequest('/api/v1/edit-video', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// 日志条目类型
export interface TaskLogEntry {
  id: number;
  taskId: string;
  level: string;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
}

// 查询任务日志
export async function getTaskLogs(taskId: string): Promise<ApiResponse<{
  logs: TaskLogEntry[];
  total: number;
}>> {
  return apiRequest(`/api/v1/logs?task_id=${encodeURIComponent(taskId)}`, {
    method: 'GET'
  });
}

// ============ 配音相关 API ============

// 配音任务记录类型
export interface AudioTaskRecord {
  task_id: string;
  type: 'tts' | 'clone' | 'bgm';
  prompt?: string;
  speaker?: string;
  reference_audio_url?: string;
  result_url?: string;
  duration?: number;
  status: TaskStatus;
  status_text: string;
  error_message?: string;
  created_at: string;
}

// TTS 音色制作
export async function generateTTS(params: {
  prompt: string;
  speaker: string;
}): Promise<ApiResponse<{
  taskId: string;
  status: TaskStatus;
  statusText: string;
}>> {
  return apiRequest('/api/v1/audio/voice/tts', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// 人声复刻
export async function generateVoiceClone(params: {
  prompt: string;
  referenceAudioUrl: string;
}): Promise<ApiResponse<{
  taskId: string;
  status: TaskStatus;
  statusText: string;
}>> {
  return apiRequest('/api/v1/audio/voice/clone', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// BGM 制作
export async function generateBGM(params: {
  prompt: string;
  referenceAudioUrl?: string;
}): Promise<ApiResponse<{
  taskId: string;
  status: TaskStatus;
  statusText: string;
}>> {
  return apiRequest('/api/v1/audio/bgm', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// 获取配音任务状态
export async function getAudioTaskStatus(taskId: string): Promise<ApiResponse<AudioTaskRecord>> {
  return apiRequest(`/api/v1/audio/status?task_id=${encodeURIComponent(taskId)}`);
}

// 获取配音任务列表
export async function getAudioTaskList(
  limit = 50,
  offset = 0,
  type?: 'tts' | 'clone' | 'bgm'
): Promise<ApiResponse<{
  tasks: AudioTaskRecord[];
  total: number;
  limit: number;
  offset: number;
}>> {
  let url = `/api/v1/audio/tasks?limit=${limit}&offset=${offset}`;
  if (type) {
    url += `&type=${type}`;
  }
  return apiRequest(url);
}

// 删除配音任务
export async function deleteAudioTask(taskId: string): Promise<ApiResponse> {
  return apiRequest(`/api/v1/audio/tasks?task_id=${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  });
}

// 下载音频（通过代理接口解决跨域问题）
export async function downloadAudioProxy(url: string, filename: string) {
  const downloadUrl = `/api/v1/audio/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  window.location.href = downloadUrl;
}
