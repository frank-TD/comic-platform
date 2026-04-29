'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ImageOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface PreviewImage {
  url: string;
  name?: string;
}

interface ImagePreviewDialogProps {
  open: boolean;
  images: PreviewImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImagePreviewDialog({
  open,
  images,
  currentIndex,
  onClose,
  onNavigate,
}: ImagePreviewDialogProps) {
  const image = images[currentIndex];
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // 切换图片时重置加载状态
  useEffect(() => {
    setImgStatus('loading');
  }, [currentIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, images.length, onNavigate]);

  // ESC 键关闭已在 Dialog 组件中由 Radix 处理，这里额外处理左右箭头
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrev, handleNext]);

  if (!image) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex items-center justify-center max-w-[90vw] max-h-[90vh] w-[90vw] h-[90vh] p-0 border-none bg-transparent shadow-none overflow-hidden"
        onClick={(e) => {
          // 点击遮罩层关闭（DialogContent 外的点击由 Radix 处理，这里处理内部空白区域）
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <DialogTitle className="sr-only">
          图片预览 {currentIndex + 1} / {images.length}
        </DialogTitle>

        <div className="relative flex items-center justify-center w-full h-full max-h-[85vh]">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-50 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
            aria-label="关闭预览"
          >
            <X size={20} />
          </button>

          {/* 左箭头 */}
          {hasPrev && (
            <button
              onClick={handlePrev}
              className="absolute left-2 z-50 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
              aria-label="上一张"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* 右箭头 */}
          {hasNext && (
            <button
              onClick={handleNext}
              className="absolute right-2 z-50 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
              aria-label="下一张"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* 加载中 */}
          {imgStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* 加载失败 */}
          {imgStatus === 'error' && (
            <div className="flex flex-col items-center justify-center text-white min-h-[200px] px-8">
              <ImageOff size={48} className="mb-3 opacity-60" />
              <p className="text-lg font-medium">图片加载失败</p>
              <p className="text-sm text-white/60 mt-1">链接可能已过期，请重新上传</p>
            </div>
          )}

          {/* 图片（加载失败时隐藏）：max-w-full max-h-full 确保在容器内完全自适应 */}
          {imgStatus !== 'error' && (
            <img
              src={image.url}
              alt={image.name || '预览图片'}
              className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-200 ${imgStatus === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
              draggable={false}
              onLoad={() => setImgStatus('loaded')}
              onError={() => setImgStatus('error')}
            />
          )}
        </div>

        {/* 底部指示器 */}
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-4 py-1.5">
            <span className="text-white text-sm">
              {currentIndex + 1} / {images.length}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
