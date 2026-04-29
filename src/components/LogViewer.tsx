'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
} from 'lucide-react';
import { getTaskLogs, TaskLogEntry } from '@/lib/api-client';

interface LogViewerProps {
  taskId: string;
}

// 日志级别配置
const LOG_LEVEL_CONFIG = {
  INFO: {
    icon: Info,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  WARN: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  ERROR: {
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  DEBUG: {
    icon: Bug,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
};

// 任务类型映射
const TASK_TYPE_MAP: Record<string, string> = {
  video_task: '视频生成',
  extend_task: '延长视频',
  edit_task: '编辑视频',
};

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function formatJson(metadata: unknown): string {
  if (!metadata) return '';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

export function LogViewer({ taskId }: LogViewerProps) {
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  // 加载日志
  const loadLogs = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    
    try {
      const response = await getTaskLogs(taskId);
      if (response.success && response.data) {
        // 按时间倒序排列（最新的在前面）
        const sortedLogs = [...response.data.logs].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setLogs(sortedLogs);
      }
    } catch (error) {
      console.error('加载日志失败:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (taskId) {
      loadLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // 切换展开/收起
  const toggleExpand = (logId: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  // 判断是否有元数据需要展示
  const hasMetadata = (log: TaskLogEntry): boolean => {
    return !!(log.metadata || log.errorCode || log.errorDetail);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            任务日志
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-sm text-slate-500">加载中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            任务日志
            <span className="text-xs font-normal text-slate-400">({logs.length} 条)</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadLogs(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            暂无日志记录
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {logs.map((log) => {
              const config = LOG_LEVEL_CONFIG[log.level as keyof typeof LOG_LEVEL_CONFIG] || LOG_LEVEL_CONFIG.INFO;
              const Icon = config.icon;
              const isExpanded = expandedLogs.has(log.id);
              const hasDetails = hasMetadata(log);

              return (
                <div
                  key={log.id}
                  className={`rounded-md border ${config.borderColor} ${config.bgColor} transition-colors`}
                >
                  <div
                    className="flex items-start gap-2 p-2 cursor-pointer"
                    onClick={() => hasDetails && toggleExpand(log.id)}
                  >
                    {/* 展开/收起按钮 */}
                    {hasDetails && (
                      <button className="mt-0.5 text-slate-400 hover:text-slate-600">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                    )}
                    
                    {/* 日志级别图标 */}
                    <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${config.color}`} />
                    
                    {/* 日志内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 级别标签 */}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${config.color} ${config.bgColor} font-medium`}>
                          {log.level}
                        </span>
                        
                        {/* 任务类型 */}
                        <span className="text-xs text-slate-500">
                          {TASK_TYPE_MAP[log.type] || log.type}
                        </span>
                        
                        {/* 时间 */}
                        <span className="text-xs text-slate-400">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      
                      {/* 消息内容 */}
                      <p className="text-sm text-slate-700 mt-1 break-words">
                        {log.message}
                      </p>

                      {/* 错误详情 */}
                      {log.errorCode && (
                        <p className="text-xs text-red-500 mt-1">
                          错误码: {log.errorCode}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {hasDetails && isExpanded && (
                    <div className="px-6 pb-2 space-y-2">
                      {/* 错误详情 */}
                      {log.errorDetail && (
                        <div className="bg-white rounded border border-red-100 p-2">
                          <p className="text-xs text-slate-500 mb-1">错误详情:</p>
                          <pre className="text-xs text-red-600 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
                            {log.errorDetail}
                          </pre>
                        </div>
                      )}
                      
                      {/* 元数据 */}
                      {log.metadata && (
                        <div className="bg-white rounded border border-slate-100 p-2">
                          <p className="text-xs text-slate-500 mb-1">元数据:</p>
                          <pre className="text-xs text-slate-600 whitespace-pre-wrap break-words font-mono max-h-32 overflow-y-auto">
                            {formatJson(log.metadata)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
