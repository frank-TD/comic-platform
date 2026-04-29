'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UploadedImage } from '@/lib/types';
import { X } from 'lucide-react';

interface SortableImageProps {
  image: UploadedImage;
  onRemove: (id: string) => void;
  onPreview?: (image: UploadedImage) => void;
  dragHandleProps?: Record<string, unknown>;
  uploadProgress?: number;  // 上传进度 0-100
  isUploading?: boolean;   // 是否正在上传
}

export function SortableImage({
  image,
  onRemove,
  onPreview,
  dragHandleProps,
  uploadProgress,
  isUploading
}: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      {...attributes}
    >
      {/* 拖拽手柄 */}
      <div
        {...listeners}
        {...dragHandleProps}
        className="absolute top-1 left-1 z-10 cursor-grab active:cursor-grabbing bg-black/50 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="18" r="2" />
          <circle cx="15" cy="18" r="2" />
        </svg>
      </div>

      {/* 删除按钮 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(image.id);
        }}
        className="absolute top-1 right-1 z-10 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>

      {/* 图片索引标签 */}
      <div className="absolute bottom-1 left-1 z-10 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded">
        {image.id}
      </div>

      {/* 图片 */}
      <div
        className="aspect-square rounded-lg overflow-hidden border-2 border-transparent group-hover:border-blue-400 transition-colors cursor-pointer"
        onClick={() => onPreview?.(image)}
      >
        <img
          src={image.thumbnail || image.url}
          alt={image.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* 上传进度条（仅上传中显示） */}
      {isUploading && uploadProgress !== undefined && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-lg">
          <div className="w-3/4 bg-slate-700 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="text-white text-xs mt-1">{uploadProgress}%</span>
        </div>
      )}
    </div>
  );
}

// 网格布局包装组件
export function SortableImageGrid({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      {children}
    </div>
  );
}
