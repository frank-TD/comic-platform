'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaListItem } from './MediaCard';
import type { UnifiedMediaState, UploadedMedia } from '@/lib/types';

interface MentionDropdownProps {
  open: boolean;
  onClose: () => void;
  mediaState: UnifiedMediaState;
  onSelect: (media: UploadedMedia) => void;
  onUpload: () => void;
  position?: { top?: number; bottom?: number; left?: number; right?: number };
  isLoading?: boolean;
}

export function MentionDropdown({
  open,
  onClose,
  mediaState,
  onSelect,
  onUpload,
  position = {},
  isLoading = false
}: MentionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 合并所有素材（按上传时间排序）
  const allMedia = [
    ...mediaState.images.map(m => ({ ...m, sortTime: m.createdAt })),
    ...mediaState.videos.map(m => ({ ...m, sortTime: m.createdAt })),
    ...mediaState.audios.map(m => ({ ...m, sortTime: m.createdAt })),
  ].sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, onClose]);

  // ESC 键关闭
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onClose]);

  const handleSelect = useCallback((media: UploadedMedia) => {
    onSelect(media);
    onClose();
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dropdownRef}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'absolute z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      style={{
        top: position.top !== undefined ? position.top : '100%',
        bottom: position.bottom !== undefined ? position.bottom : undefined,
        right: position.right !== undefined ? position.right : 0,
        left: position.left !== undefined ? position.left : undefined,
        marginTop: position.top !== undefined ? '4px' : undefined,
        marginBottom: position.bottom !== undefined ? '4px' : undefined,
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <span className="text-sm font-medium text-muted-foreground">可能@的内容</span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="max-h-80 overflow-y-auto">
        {/* 素材列表 */}
        {allMedia.length > 0 ? (
          <div className="py-1">
            {allMedia.map((media) => (
              <MediaListItem
                key={media.key}
                media={media}
                onClick={() => handleSelect(media)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无素材
          </div>
        )}

        {/* 分隔线 */}
        {allMedia.length > 0 && (
          <div className="border-t border-border mx-3 my-1" />
        )}

        {/* 上传按钮 */}
        <button
          onClick={() => {
            onUpload();
            onClose();
          }}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
            'hover:bg-muted/50',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <span className="text-sm font-medium text-foreground">上传素材</span>
            <p className="text-xs text-muted-foreground">
              支持图片、视频、音频
            </p>
          </div>
        </button>
      </div>

      {/* 数量提示 */}
      <div className="px-4 py-2 border-t border-border bg-muted/20">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>图片 {mediaState.images.length}/9</span>
          <span>视频 {mediaState.videos.length}/3</span>
          <span>音频 {mediaState.audios.length}/3</span>
        </div>
      </div>
    </div>
  );
}

export default MentionDropdown;
