'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadedMedia } from '@/lib/types';

interface MediaCardProps {
  media: UploadedMedia;
  onDelete?: (key: string) => void;
  showDelete?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// 获取媒体类型图标
function MediaTypeIcon({ type }: { type: UploadedMedia['type'] }) {
  switch (type) {
    case 'image':
      return (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case 'video':
      return (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      );
    case 'audio':
      return (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
          />
        </svg>
      );
  }
}

// 获取媒体类型标签
function MediaTypeBadge({ type }: { type: UploadedMedia['type'] }) {
  const labels: Record<UploadedMedia['type'], string> = {
    image: '图',
    video: '视频',
    audio: '音频',
  };

  return (
    <span className={cn(
      'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-medium',
      type === 'image' && 'bg-blue-500/20 text-blue-400',
      type === 'video' && 'bg-purple-500/20 text-purple-400',
      type === 'audio' && 'bg-green-500/20 text-green-400'
    )}>
      {labels[type]}
    </span>
  );
}

export function MediaCard({
  media,
  onDelete,
  showDelete = true,
  isSelected = false,
  onClick,
  size = 'md',
  className
}: MediaCardProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const thumbnailClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={cn(
        'relative group rounded-lg border bg-card overflow-hidden transition-all',
        onClick && 'cursor-pointer hover:border-primary/50',
        isSelected && 'border-primary ring-2 ring-primary/20',
        className
      )}
      onClick={onClick}
    >
      {/* 缩略图区域 */}
      <div className={cn(
        'flex items-center justify-center bg-muted/50',
        sizeClasses[size]
      )}>
        {media.type === 'image' ? (
          // 图片显示缩略图
          <img
            src={media.thumbnailUrl || media.url}
            alt={media.name}
            className={cn(
              'object-cover rounded',
              thumbnailClasses[size]
            )}
            onError={(e) => {
              // 加载失败时显示图标
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          // 视频/音频显示图标
          <div className={cn(
            'flex items-center justify-center rounded bg-muted',
            thumbnailClasses[size]
          )}>
            <MediaTypeIcon type={media.type} />
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-1.5">
        <div className="flex items-center gap-1">
          <MediaTypeBadge type={media.type} />
          <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
            {media.name.length > 8 ? `${media.name.slice(0, 8)}...` : media.name}
          </span>
        </div>
      </div>

      {/* 删除按钮 */}
      {showDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(media.storageKey || media.key);
          }}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/80 hover:bg-destructive 
                     text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 
                     transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* 选中标记 */}
      {isSelected && (
        <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}

// 简化版媒体卡片（用于列表展示）
export function MediaListItem({
  media,
  onClick,
  isSelected = false
}: {
  media: UploadedMedia;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/10'
      )}
    >
      {/* 缩略图 */}
      <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
        {media.type === 'image' ? (
          <img
            src={media.thumbnailUrl || media.url}
            alt={media.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <MediaTypeIcon type={media.type} />
        )}
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <MediaTypeBadge type={media.type} />
          <span className="text-sm text-foreground truncate">{media.name}</span>
        </div>
        {media.duration && (
          <span className="text-xs text-muted-foreground">
            {Math.floor(media.duration / 60)}:{(media.duration % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
}

export default MediaCard;
