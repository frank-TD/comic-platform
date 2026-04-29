'use client';

import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { LogViewer } from '@/components/LogViewer';
import {
  Download,
  ExternalLink,
  Copy,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  PlayCircle,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import type { TaskRecord, TaskStatus } from '@/lib/types';

interface TaskCardProps {
  task: TaskRecord;
  selectedTasks: Set<string>;
  previewTaskId: string | null;
  onToggleSelect: (taskId: string) => void;
  onSetPreview: (taskId: string | null) => void;
  onDelete: (taskId: string) => void;
  onRetry: (task: TaskRecord) => void;
}

const statusIcons = {
  0: <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />,
  1: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  2: <CheckCircle className="h-4 w-4 text-green-500" />,
  '-1': <XCircle className="h-4 w-4 text-red-500" />,
};

// 下载视频（使用后端代理解决跨域问题）
async function downloadVideo(url: string, filename: string) {
  try {
    // 使用后端代理接口下载，避免跨域限制
    const proxyUrl = `/api/v1/video/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('下载失败:', errorData.error || `服务器返回错误 ${response.status}`);
      return;
    }
    
    const blob = await response.blob();
    
    // 检查 blob 是否有效
    if (blob.size === 0) {
      console.error('下载失败: 视频文件为空');
      return;
    }
    
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('下载失败: 网络错误或视频不可用', error);
  }
}

// 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// 计算任务耗时
function calculateDuration(createdAt: string, updatedAt?: string): string {
  if (!updatedAt) return '';
  
  try {
    const start = new Date(createdAt).getTime();
    const end = new Date(updatedAt).getTime();
    const diff = Math.floor((end - start) / 1000);
    
    if (diff < 0) return '';
    
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    
    if (minutes > 0) {
      return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`;
    }
    return `${seconds}秒`;
  } catch {
    return '';
  }
}

// 错误码到用户友好提示的映射表
const ERROR_MESSAGES: Record<string, { title: string; suggestion: string }> = {
  // 网络相关
  'network_error': {
    title: '网络连接失败',
    suggestion: '请检查网络后重试'
  },
  'timeout of': {
    title: '请求超时',
    suggestion: '火山方舟响应较慢，请稍后重试'
  },
  'network': {
    title: '网络错误',
    suggestion: '请检查网络连接后重试'
  },
  
  // 认证/权限相关
  'unauthorized': {
    title: '认证失败',
    suggestion: '请重新登录后再试'
  },
  'token': {
    title: '登录已过期',
    suggestion: '请重新登录'
  },
  'invalid api': {
    title: 'API 配置错误',
    suggestion: '请联系管理员检查 API 配置'
  },
  'rate limit': {
    title: '请求过于频繁',
    suggestion: '请稍后重试'
  },
  'exhausted': {
    title: '配额已用尽',
    suggestion: '账户额度不足，请联系管理员'
  },
  
  // 资源相关
  'not found': {
    title: '资源不存在',
    suggestion: '视频或图片可能已被删除'
  },
  'no such': {
    title: '资源不存在',
    suggestion: '视频或图片可能已被删除'
  },
  
  // 参数相关
  'invalid request': {
    title: '请求参数错误',
    suggestion: '请检查输入内容后重试'
  },
  'missing': {
    title: '缺少必要参数',
    suggestion: '请填写完整的生成信息'
  },
  'unsupported': {
    title: '不支持的参数',
    suggestion: '请检查画幅、时长等参数是否正确'
  },
  'format': {
    title: '格式不支持',
    suggestion: '请使用支持的图片/视频格式'
  },
  
  // 视频生成相关
  'video generation failed': {
    title: '视频生成失败',
    suggestion: '模型处理异常，请重试'
  },
  'video generation error': {
    title: '视频生成失败',
    suggestion: '模型处理异常，请重试'
  },
  'generation failed': {
    title: '视频生成失败',
    suggestion: '生成过程出错，请重试'
  },
  
  // 超时相关
  '超时': {
    title: '生成超时',
    suggestion: '视频生成时间过长，请重试'
  },
  'timed out': {
    title: '生成超时',
    suggestion: '视频生成时间过长，请重试'
  },
  'timeout': {
    title: '生成超时',
    suggestion: '视频生成时间过长，请重试'
  },
  '任务超时': {
    title: '离线推理超时',
    suggestion: '离线推理任务超过时间限制，请重试或联系管理员调整超时配置'
  },
  'expired': {
    title: '离线推理超时',
    suggestion: '离线推理任务超过时间限制，请重试或联系管理员调整超时配置'
  },
  'execution_expires_after': {
    title: '离线推理超时',
    suggestion: '离线推理任务超过时间限制，请重试或联系管理员调整超时配置'
  },
  'service_tier': {
    title: '离线推理配置错误',
    suggestion: '离线推理参数不被当前模型支持，请联系管理员检查配置'
  },
  '已被取消': {
    title: '任务被取消',
    suggestion: '离线推理任务在排队中被取消，请重新提交'
  },
  
  // 服务端错误
  '500': {
    title: '服务器内部错误',
    suggestion: '火山方舟服务端异常，请稍后重试'
  },
  '502': {
    title: '服务暂时不可用',
    suggestion: '火山方舟服务异常，请稍后重试'
  },
  '503': {
    title: '服务暂时不可用',
    suggestion: '火山方舟服务繁忙，请稍后重试'
  },
  '504': {
    title: '服务响应超时',
    suggestion: '火山方舟响应较慢，请稍后重试'
  },
};

// 将技术性错误转换为用户友好的提示
function formatErrorMessage(errorMessage?: string): { title: string; suggestion: string; raw: string } | null {
  if (!errorMessage) return null;
  
  const lowerMessage = errorMessage.toLowerCase();
  
  // 精确匹配
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      return {
        ...value,
        raw: errorMessage
      };
    }
  }
  
  // 默认未知错误
  return {
    title: '生成失败',
    suggestion: '请尝试重新生成',
    raw: errorMessage
  };
}

export function TaskCard({
  task,
  selectedTasks,
  previewTaskId,
  onToggleSelect,
  onSetPreview,
  onDelete,
  onRetry,
}: TaskCardProps) {
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const isSuccess = task.status === 2;
  const isFailed = task.status === -1;
  
  // 获取显示的 prompt 内容
  const displayPrompt = task.original_prompt || task.prompt;
  // 超过 50 个字符视为长文本
  const isLongPrompt = displayPrompt.length > 50;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border bg-white ${
        selectedTasks.has(task.task_id)
          ? 'bg-blue-50 border-blue-200'
          : ''
      }`}
    >
      {/* 勾选框 */}
      {isSuccess && task.result_url && (
        <Checkbox
          checked={selectedTasks.has(task.task_id)}
          onCheckedChange={() => onToggleSelect(task.task_id)}
        />
      )}

      {/* 视频预览缩略图（成功任务） */}
      {isSuccess && task.result_url && (
        <div
          className="relative cursor-pointer"
          onMouseEnter={() => onSetPreview(task.task_id)}
          onMouseLeave={() => onSetPreview(null)}
          onClick={() => setPreviewDialogOpen(true)}
        >
          <VideoThumbnail videoUrl={task.result_url} taskId={task.task_id} />

          {/* 悬停预览弹窗 */}
          {previewTaskId === task.task_id && (
            <div
              className="absolute left-0 top-full mt-2 z-50 bg-black rounded-lg shadow-2xl overflow-hidden border-2 border-slate-200"
              style={{ width: '320px' }}
              onMouseEnter={() => onSetPreview(task.task_id)}
              onMouseLeave={() => onSetPreview(null)}
            >
              <video
                src={task.result_url}
                controls
                autoPlay
                preload="metadata"
                className="w-full aspect-video bg-black"
              />
              <div className="bg-white p-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">点击查看大图</span>
                <a
                  href={task.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-600"
                >
                  在新标签页打开 →
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 状态图标 */}
      {statusIcons[task.status as unknown as keyof typeof statusIcons]}

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant="outline"
            className={`text-xs ${
              task.mode === 'single'
                ? 'bg-blue-50 text-blue-600'
                : task.mode === 'edit'
                ? 'bg-orange-50 text-orange-600'
                : task.mode === 'extend'
                ? 'bg-cyan-50 text-cyan-600'
                : 'bg-purple-50 text-purple-600'
            }`}
          >
            {task.mode === 'single' ? '单次生成' : task.mode === 'edit' ? '编辑视频' : task.mode === 'extend' ? '延长视频' : '分镜脚本'}
          </Badge>
          {task.service_tier === 'flex' && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
              离线
            </Badge>
          )}
          <span className="text-xs text-slate-400">
            {new Date(task.created_at).toLocaleString()}
          </span>
          {/* 耗时显示（仅成功/失败任务显示） */}
          {(isSuccess || isFailed) && (
            <span className={`text-xs font-medium ${
              isSuccess ? 'text-green-600' : 'text-red-600'
            }`}>
              耗时 {calculateDuration(task.created_at, task.updated_at)}
            </span>
          )}
        </div>
        <div className="mb-2">
          <p className={`text-sm text-slate-700 ${promptExpanded || !isLongPrompt ? '' : 'line-clamp-2'}`}>
            {displayPrompt}
          </p>
          {isLongPrompt && (
            <button
              onClick={() => setPromptExpanded(!promptExpanded)}
              className="text-xs text-blue-500 hover:text-blue-600 mt-1 flex items-center gap-1"
            >
              {promptExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  展开全部
                </>
              )}
            </button>
          )}
        </div>

        {/* 结果操作 */}
        {isSuccess && task.result_url && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadVideo(
                  task.result_url!,
                  `video_${task.task_id.slice(0, 8)}.mp4`
                )
              }
            >
              <Download className="h-3 w-3 mr-1" />
              下载
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreviewDialogOpen(true)}>
              <PlayCircle className="h-3 w-3 mr-1" />
              预览
            </Button>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(task.prompt)}>
              <Copy className="h-3 w-3 mr-1" />
              复制
            </Button>
          </div>
        )}

        {/* 错误信息（用户友好的提示） */}
        {isFailed && (() => {
          const friendlyError = formatErrorMessage(task.error_message);
          if (!friendlyError) return null;
          return (
            <div className="mt-2 p-2 bg-red-50 rounded-md border border-red-100">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <span className="text-sm font-medium text-red-700">{friendlyError.title}</span>
              </div>
              <p className="text-xs text-red-600 ml-6">{friendlyError.suggestion}</p>
              {/* 可选：显示原始错误信息（悬停提示） */}
              <details className="mt-1">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-500">
                  查看技术详情
                </summary>
                <p className="text-xs text-slate-500 mt-1 break-all">{friendlyError.raw}</p>
              </details>
            </div>
          );
        })()}

        {/* 重新生成按钮 */}
        {isFailed && (
          // 失败任务 - 橙色按钮
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetry(task)}
            className="mt-1 text-orange-500 border-orange-200 hover:bg-orange-50"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            重新生成
          </Button>
        )}
        {isSuccess && (
          // 成功任务 - 蓝色按钮
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetry(task)}
            className="mt-1 text-blue-500 border-blue-200 hover:bg-blue-50"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            重新生成
          </Button>
        )}
      </div>

      {/* 删除按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(task.task_id)}
        className="text-slate-400 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* 视频预览 Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden max-h-[90vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>任务详情</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="preview" className="w-full">
            <div className="px-4 pt-2 border-b bg-slate-50">
              <TabsList className="bg-transparent h-auto p-0 rounded-none">
                <TabsTrigger
                  value="preview"
                  className="rounded-t-md data-[state=active]:bg-white data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:-mb-px data-[state=active]:shadow-none"
                >
                  <PlayCircle className="h-4 w-4 mr-1" />
                  视频预览
                </TabsTrigger>
                <TabsTrigger
                  value="logs"
                  className="rounded-t-md data-[state=active]:bg-white data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:-mb-px data-[state=active]:shadow-none"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  任务日志
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* 视频预览标签 */}
            <TabsContent value="preview" className="m-0">
              <div className="relative bg-black">
                <video
                  src={task.result_url || ''}
                  controls
                  autoPlay
                  preload="metadata"
                  className="w-full max-h-[60vh] bg-black"
                />
                {/* 在新标签页打开按钮 */}
                <a
                  href={task.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                  title="在新标签页打开"
                >
                  <Maximize2 className="h-4 w-4" />
                </a>
              </div>
              {/* 视频信息 */}
              <div className="p-4 bg-slate-50">
                <p className="text-sm text-slate-600 line-clamp-2">
                  {task.original_prompt || task.prompt}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span>{task.model_id || 'doubao-seedance-1-5-pro'}</span>
                  <span>{task.mode === 'single' ? '单次生成' : task.mode === 'edit' ? '编辑视频' : task.mode === 'extend' ? '延长视频' : '分镜生成'}</span>
                  <span>{new Date(task.created_at).toLocaleString()}</span>
                </div>
              </div>
            </TabsContent>
            
            {/* 任务日志标签 */}
            <TabsContent value="logs" className="m-0 p-4 max-h-[70vh] overflow-y-auto">
              <LogViewer taskId={task.task_id} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
