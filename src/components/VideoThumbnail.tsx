'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Video, PlayCircle, AlertCircle } from 'lucide-react';

interface VideoThumbnailProps {
  videoUrl: string;
  taskId: string;
}

// 缩略图状态
type ThumbnailState = 'loading' | 'success' | 'error' | 'fallback';

// 检测图片是否为全黑或无效
function isValidImage(dataUrl: string, ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  if (!dataUrl || dataUrl.length < 5000) return false;
  
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let nonBlackPixels = 0;
    const sampleStep = 400; // 每 400 像素采样一次
    
    for (let i = 0; i < data.length; i += sampleStep * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // 如果像素不是黑色（RGB 都小于 10）
      if (r > 10 || g > 10 || b > 10) {
        nonBlackPixels++;
      }
    }
    
    const totalSamples = data.length / sampleStep;
    // 如果超过 1% 的像素不是黑色，认为是有效图片
    return (nonBlackPixels / totalSamples) > 0.01;
  } catch {
    return false;
  }
}

// 视频预览组件（带降级处理的稳健实现）
export function VideoThumbnail({ 
  videoUrl, 
  taskId
}: VideoThumbnailProps) {
  // 使用 ref 持久化保存缩略图和状态
  const thumbnailCacheRef = useRef<Map<string, string>>(new Map());
  const fallbackCacheRef = useRef<Set<string>>(new Set()); // 记录无法获取缩略图的 URL
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>('loading');
  
  // 组件挂载时检查缓存并加载
  useEffect(() => {
    // 检查缓存
    const cached = thumbnailCacheRef.current.get(videoUrl);
    if (cached) {
      setThumbnail(cached);
      setThumbnailState('success');
      return;
    }
    
    // 检查是否已确认无法获取
    if (fallbackCacheRef.current.has(videoUrl)) {
      setThumbnailState('fallback');
      return;
    }
    
    // 已有缩略图或正在加载，跳过
    if (thumbnail || thumbnailState === 'loading') return;
    
    loadThumbnail(videoUrl);
  }, [videoUrl]);
  
  // 加载缩略图函数（尝试直接获取，失败后使用后端代理）
  const loadThumbnail = async (url: string) => {
    setThumbnailState('loading');
    
    // 方法1：尝试直接从视频捕获帧
    const directSuccess = await tryDirectCapture(url);
    if (directSuccess) return;
    
    // 方法2：使用后端代理（解决跨域问题）
    const proxySuccess = await tryProxyCapture(url);
    if (proxySuccess) return;
    
    // 方法3：降级为占位图标
    console.warn(`[VideoThumbnail] 所有方法都失败了，显示占位图标: ${url}`);
    fallbackCacheRef.current.add(url);
    setThumbnailState('fallback');
  };
  
  // 尝试直接从视频捕获帧
  const tryDirectCapture = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';
        video.setAttribute('playsinline', 'true');
        
        const canvas = document.createElement('canvas');
        let attempts = 0;
        const maxAttempts = 3;
        
        const tryCapture = () => {
          attempts++;
          
          if (video.readyState < 2) {
            if (attempts < maxAttempts) {
              setTimeout(tryCapture, 300);
              return;
            } else {
              video.currentTime = 0.01;
              return;
            }
          }
          
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            if (attempts < maxAttempts) {
              setTimeout(tryCapture, 300);
              return;
            }
            resolve(false);
            return;
          }
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(false);
            return;
          }
          
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            
            // 检查图片是否有效（非全黑）
            if (isValidImage(dataUrl, ctx, canvas.width, canvas.height)) {
              thumbnailCacheRef.current.set(url, dataUrl);
              setThumbnail(dataUrl);
              setThumbnailState('success');
              resolve(true);
              return;
            }
          } catch (err) {
            console.warn('[VideoThumbnail] 直接捕获失败:', err);
          }
          
          if (attempts < maxAttempts) {
            // 尝试其他时间点
            const duration = video.duration || 10;
            video.currentTime = Math.random() * duration * 0.8 + duration * 0.1;
            setTimeout(tryCapture, 500);
            return;
          }
          
          resolve(false);
        };
        
        const handleLoadedMetadata = () => {
          const duration = video.duration;
          if (duration > 0) {
            video.currentTime = duration * (0.3 + Math.random() * 0.5);
          }
        };
        
        const handleSeeked = () => {
          setTimeout(tryCapture, 200);
        };
        
        const handleError = () => {
          console.warn('[VideoThumbnail] 视频加载失败，直接捕获不可用');
          resolve(false);
        };
        
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('seeked', handleSeeked);
        video.addEventListener('error', handleError);
        
        video.load();
        
        // 5秒超时
        setTimeout(() => {
          resolve(false);
        }, 5000);
        
      } catch (err) {
        console.warn('[VideoThumbnail] 直接捕获异常:', err);
        resolve(false);
      }
    });
  };
  
  // 使用后端代理获取缩略图
  const tryProxyCapture = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      fetch(`/api/v1/video/thumbnail?url=${encodeURIComponent(url)}&t=00:00:02`)
        .then(response => {
          if (!response.ok) {
            console.warn('[VideoThumbnail] 后端代理失败:', response.status);
            resolve(false);
            return null;
          }
          return response.blob();
        })
        .then(blob => {
          if (!blob) {
            resolve(false);
            return;
          }
          
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            if (dataUrl && dataUrl.length > 1000) {
              thumbnailCacheRef.current.set(url, dataUrl);
              setThumbnail(dataUrl);
              setThumbnailState('success');
              resolve(true);
            } else {
              resolve(false);
            }
          };
          reader.onerror = () => {
            console.warn('[VideoThumbnail] 后端代理 blob 读取失败');
            resolve(false);
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          console.warn('[VideoThumbnail] 后端代理请求失败:', err);
          resolve(false);
        });
      
      // 10秒超时
      setTimeout(() => {
        resolve(false);
      }, 10000);
    });
  };
  
  // 渲染不同状态
  if (thumbnailState === 'loading') {
    return (
      <div className="w-16 h-12 bg-slate-200 rounded border flex items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors">
        <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
      </div>
    );
  }
  
  if (thumbnailState === 'fallback') {
    return (
      <div className="w-16 h-12 bg-slate-200 rounded border flex items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors group relative" title="缩略图不可用，点击在新窗口打开视频">
        <Video className="h-5 w-5 text-slate-400" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded">
          <AlertCircle className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    );
  }
  
  if (!thumbnail) {
    return (
      <div className="w-16 h-12 bg-slate-200 rounded border flex items-center justify-center cursor-pointer hover:bg-slate-300 transition-colors">
        <Video className="h-5 w-5 text-slate-400" />
      </div>
    );
  }
  
  return (
    <div className="w-16 h-12 rounded border overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all relative">
      <img 
        src={thumbnail} 
        alt="视频预览" 
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
        <PlayCircle className="h-4 w-4 text-white drop-shadow" />
      </div>
    </div>
  );
}
