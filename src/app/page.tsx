'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Textarea 
} from '@/components/ui/textarea';
import { 
  Input 
} from '@/components/ui/input';
import { 
  Label 
} from '@/components/ui/label';
import { 
  Badge 
} from '@/components/ui/badge';
import { 
  Checkbox 
} from '@/components/ui/checkbox';
import {
  Switch
} from '@/components/ui/switch';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  X,
  Clock,
  Play,
  ImageIcon,
  Video,
  Copy,
  ExternalLink,
  AudioLines,
  Image,
  FileText,
  PlayCircle,
  RefreshCw,
  Users,
  LogOut,
  Wand2,
  Mic,
  Music,
  User,
  History,
  ImagePlus
} from 'lucide-react';

// 导入任务卡片组件
import { TaskCard } from '@/components/TaskCard';
import { VideoThumbnail } from '@/components/VideoThumbnail';

// 导入拖拽排序组件
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { SortableImage } from '@/components/SortableImage';
import { ImagePreviewDialog } from '@/components/ImagePreviewDialog';

import { 
  generateVideo, 
  batchGenerateVideo,
  getTaskList, 
  getTaskStatus,
  deleteTask,
  uploadImage,
  deleteImage,
  uploadMedia,
  uploadMediaWithProgress,
  deleteMedia,
  clearMediaByType,
  extendVideo,
  editVideo
} from '@/lib/api-client';
import { 
  GenerationMode, 
  TaskRecord, 
  TaskStatus,
  UploadedImage,
  UploadedMedia,
  UnifiedMediaState
} from '@/lib/types';
import { STATUS_TEXT } from '@/lib/types';

// 导入 @ 引用下拉组件
import { MentionDropdown } from '@/components/MentionDropdown';

// 状态图标映射
const StatusIcon = ({ status }: { status: TaskStatus }) => {
  switch (status) {
    case TaskStatus.QUEUE:
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case TaskStatus.PROCESSING:
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case TaskStatus.SUCCESS:
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case TaskStatus.FAILED:
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
};

// 配音任务类型
interface AudioTask {
  task_id: string;
  type: string;
  prompt: string;
  speaker?: string;
  reference_audio_url?: string;
  result_url?: string;
  duration?: number;
  status: number;
  status_text: string;
  error_message?: string;
  created_at: string;
}

// 配音任务卡片组件
function AudioTaskCard({ task }: { task: AudioTask }) {
  const statusColors: Record<number | string, string> = {
    0: 'bg-yellow-100 text-yellow-800',
    1: 'bg-blue-100 text-blue-800',
    2: 'bg-green-100 text-green-800',
    '-1': 'bg-red-100 text-red-800'
  };

  const typeLabels: Record<string, string> = {
    tts: 'TTS 音色',
    clone: '人声复刻',
    bgm: 'BGM'
  };

  const isHexAudio = task.result_url?.startsWith('data:audio/mp3;hex,');

  const handlePlayAudio = async () => {
    if (!task.result_url) return;

    if (isHexAudio) {
      const hexData = task.result_url.replace('data:audio/mp3;hex,', '');
      try {
        const response = await fetch('/api/v1/audio/decode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hexAudio: hexData }),
        });
        if (!response.ok) throw new Error('解码音频失败');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      } catch (error) {
        console.error('播放音频失败:', error);
        toast.error('播放音频失败');
      }
    } else {
      const audio = new Audio(task.result_url);
      audio.play();
    }
  };

  const handleDownloadAudio = async () => {
    if (!task.result_url) return;

    if (isHexAudio) {
      const hexData = task.result_url.replace('data:audio/mp3;hex,', '');
      try {
        const response = await fetch('/api/v1/audio/decode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hexAudio: hexData }),
        });
        if (!response.ok) throw new Error('解码音频失败');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${task.type}_${task.task_id}.mp3`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('下载音频失败:', error);
        toast.error('下载音频失败');
      }
    } else {
      const a = document.createElement('a');
      a.href = task.result_url;
      a.download = `${task.type}_${task.task_id}.mp3`;
      a.click();
    }
  };

  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {task.type === 'tts' && <Mic className="h-4 w-4 text-slate-400 shrink-0" />}
        {task.type === 'clone' && <User className="h-4 w-4 text-slate-400 shrink-0" />}
        {task.type === 'bgm' && <Music className="h-4 w-4 text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs">
              {typeLabels[task.type] || task.type}
            </Badge>
            <span className={`text-xs px-2 py-0.5 rounded ${statusColors[task.status] || ''}`}>
              {task.status_text}
            </span>
          </div>
          <p className="text-sm text-slate-600 truncate">{task.prompt}</p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(task.created_at).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3">
        {task.status === 2 && task.result_url && (
          <>
            <Button variant="ghost" size="sm" onClick={handlePlayAudio}>
              <Play className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadAudio}>
              <Download className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// 任务列表渲染组件（抽取公共逻辑，支持在线/离线 Tab 复用）
function TaskListRenderer({
  tasks,
  selectedTasks,
  previewTaskId,
  onToggleSelect,
  onSetPreview,
  onDelete,
  onRetry,
  emptyMessage = '暂无生成记录',
  isOffline = false,
}: {
  tasks: TaskRecord[];
  selectedTasks: Set<string>;
  previewTaskId: string | null;
  onToggleSelect: (taskId: string) => void;
  onSetPreview: (taskId: string | null) => void;
  onDelete: (taskId: string) => void;
  onRetry: (task: TaskRecord) => void;
  emptyMessage?: string;
  isOffline?: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Video className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p>{emptyMessage}</p>
        {isOffline && <p className="text-xs mt-1">批量生成任务将使用离线推理</p>}
      </div>
    );
  }

  // 排序函数：PROCESSING > QUEUE > SUCCESS/FAILED（按时间戳）
  const sortByStatusAndTime = (taskList: TaskRecord[]) => {
    const getPriority = (status: TaskStatus) => {
      if (status === TaskStatus.PROCESSING) return 0;
      if (status === TaskStatus.QUEUE) return 1;
      return 2;
    };
    return [...taskList].sort((a, b) => {
      const pA = getPriority(a.status);
      const pB = getPriority(b.status);
      if (pA !== pB) return pA - pB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const sortedTasks = sortByStatusAndTime(tasks);

  // 按 batch_id 分组（所有任务，不限于当前过滤视图）
  const batchGroups = sortedTasks.reduce((groups, task) => {
    const batchId = (task.metadata as Record<string, unknown>)?.batch_id as string | undefined;
    if (batchId) {
      if (!groups[batchId]) {
        groups[batchId] = [];
      }
      groups[batchId].push(task);
    }
    return groups;
  }, {} as Record<string, TaskRecord[]>);

  // 过滤出需要在当前列表中展示的单次任务（排除 extend/edit，它们有独立列表）
  const singleTasks = sortedTasks.filter(t =>
    t.mode === 'single' ||
    (t.mode !== 'extend' && t.mode !== 'edit' && !(t.metadata as Record<string, unknown>)?.batch_id)
  );

  // 计算批次统计
  const getBatchStats = (batchTasks: TaskRecord[]) => {
    const success = batchTasks.filter(t => t.status === TaskStatus.SUCCESS).length;
    const failed = batchTasks.filter(t => t.status === TaskStatus.FAILED).length;
    const processing = batchTasks.filter(t => t.status === TaskStatus.QUEUE || t.status === TaskStatus.PROCESSING).length;
    return { success, failed, processing, total: batchTasks.length };
  };

  // 判断批次状态并获取对应颜色
  const getBatchStyle = (stats: ReturnType<typeof getBatchStats>) => {
    if (stats.processing > 0) {
      return { bg: 'bg-purple-50/30', border: 'border-purple-200', headerBg: 'bg-purple-100/50', text: 'text-purple-700', headerText: 'text-purple-500' };
    }
    if (stats.failed === stats.total) {
      return { bg: 'bg-red-50/30', border: 'border-red-200', headerBg: 'bg-red-100/50', text: 'text-red-700', headerText: 'text-red-500' };
    }
    if (stats.success === stats.total) {
      return { bg: 'bg-green-50/30', border: 'border-green-200', headerBg: 'bg-green-100/50', text: 'text-green-700', headerText: 'text-green-500' };
    }
    return { bg: 'bg-yellow-50/30', border: 'border-yellow-200', headerBg: 'bg-yellow-100/50', text: 'text-yellow-700', headerText: 'text-yellow-500' };
  };

  // 构建统一渲染列表：按 sortedTasks 顺序遍历，批量任务只渲染一次
  const renderedBatchIds = new Set<string>();
  const renderList: Array<{ type: 'batch'; batchId: string; tasks: TaskRecord[] } | { type: 'single'; task: TaskRecord }> = [];

  for (const task of sortedTasks) {
    // extend/edit 任务在独立的编辑类任务列表中展示，不在主列表中渲染
    if (task.mode === 'extend' || task.mode === 'edit') {
      continue;
    }
    const batchId = (task.metadata as Record<string, unknown>)?.batch_id as string | undefined;
    if (batchId) {
      if (!renderedBatchIds.has(batchId)) {
        renderedBatchIds.add(batchId);
        renderList.push({ type: 'batch', batchId, tasks: batchGroups[batchId] });
      }
    } else {
      renderList.push({ type: 'single', task });
    }
  }

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto">
      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          <span>离线推理任务采用低成本模式，生成速度较慢（可能需要数分钟到数小时），请耐心等待</span>
        </div>
      )}

      {/* 统一按时间顺序渲染批次和单次任务 */}
      {renderList.map((item) => {
        if (item.type === 'batch') {
          const { batchId, tasks: batchTasks } = item;
          const stats = getBatchStats(batchTasks);
          const style = getBatchStyle(stats);
          const createdAt = batchTasks[0]?.created_at;

          return (
            <div
              key={batchId}
              className={`border-2 ${style.border} rounded-lg ${style.bg} overflow-hidden`}
            >
              {/* 批次标题栏 */}
              <div className={`flex items-center justify-between px-4 py-2 ${style.headerBg} border-b ${style.border}`}>
                <div className="flex items-center gap-3">
                  <span className={`font-medium ${style.text}`}>
                    批次 #{batchId.slice(0, 8)}
                  </span>
                  {isOffline && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
                      离线
                    </Badge>
                  )}
                  <span className={`text-xs ${style.headerText}`}>
                    {createdAt ? new Date(createdAt).toLocaleString() : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    {stats.success > 0 && (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                        成功 {stats.success}
                      </Badge>
                    )}
                    {stats.failed > 0 && (
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                        失败 {stats.failed}
                      </Badge>
                    )}
                    {stats.processing > 0 && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                        处理中 {stats.processing}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 批次内任务列表 */}
              <div className="p-3 space-y-2">
                {batchTasks.map((task) => (
                  <TaskCard
                    key={task.task_id}
                    task={task}
                    selectedTasks={selectedTasks}
                    previewTaskId={previewTaskId}
                    onToggleSelect={onToggleSelect}
                    onSetPreview={onSetPreview}
                    onDelete={onDelete}
                    onRetry={onRetry}
                  />
                ))}
              </div>
            </div>
          );
        }

        // 单次任务
        const task = item.task;
        return (
          <TaskCard
            key={task.task_id}
            task={task}
            selectedTasks={selectedTasks}
            previewTaskId={previewTaskId}
            onToggleSelect={onToggleSelect}
            onSetPreview={onSetPreview}
            onDelete={onDelete}
            onRetry={onRetry}
          />
        );
      })}
    </div>
  );
}

// 下载视频
async function downloadVideo(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('下载失败:', error);
  }
}

export default function MangaDramaHub() {
  const router = useRouter();
  
  // 用户状态
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string } | null>(null);
  
  // 主标签页状态
  const [activeTab, setActiveTab] = useState('video');
  
  // 模式状态
  const [mode, setMode] = useState<GenerationMode>('single');
  
  // 编辑视频子Tab模式
  const [editSubMode, setEditSubMode] = useState<'edit' | 'extend'>('edit');
  
  // 单次生成
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 生成参数选项
  const [model, setModel] = useState('seedance2.0');
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('5');
  
  // 批量任务（每条任务自带独立素材）
  interface BatchTaskItem {
    id: string;
    content: string;
    images: UploadedImage[];
    videos: Array<{ id: string; url: string; name: string; key?: string }>;
    audios: Array<{ id: string; url: string; name: string; key?: string }>;
    nextImageIndex: number;
    nextVideoIndex: number;
    nextAudioIndex: number;
    duration: number;  // 每条任务独立的时长
  }

  const [batchTasks, setBatchTasks] = useState<BatchTaskItem[]>([
    { id: '1', content: '', images: [], videos: [], audios: [], nextImageIndex: 1, nextVideoIndex: 1, nextAudioIndex: 1, duration: 5 }
  ]);
  
  // 模型配置（与后端 src/lib/config.ts MODEL_PROVIDERS 保持一致）
const MODEL_CONFIG = {
  'doubao-seedance-1-5-pro': { maxDuration: 12, minDuration: 4, name: 'Doubao-Seedance-1.5-pro', maxResolution: '1080p' },
  'seedance2.0': { maxDuration: 15, minDuration: 4, name: 'Seedance 2.0', maxResolution: '720p' },
  'seedance_pro': { maxDuration: 15, minDuration: 4, name: 'Seedance Pro', maxResolution: '720p' }
};

// 生成时长选项
const getDurationOptions = (model: string): number[] => {
  const config = MODEL_CONFIG[model as keyof typeof MODEL_CONFIG] || MODEL_CONFIG['doubao-seedance-1-5-pro'];
  const options: number[] = [];
  for (let i = config.minDuration; i <= config.maxDuration; i++) {
    options.push(i);
  }
  return options;
};

// 视频生成配置
const MAX_BATCH_TASKS = 5; // 批量任务上限，最多5个视频同时生成

// 提示词优化状态
const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
const [optimizedPrompt, setOptimizedPrompt] = useState('');

// 已上传图片
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Array<{ id: string; url: string }>>([]);
  
  // @ 触发引用下拉列表
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [mentionType, setMentionType] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  
  // @ 按钮触发状态
  const [mentionDropdownOpen, setMentionDropdownOpen] = useState(false);
  const [mentionButtonPosition, setMentionButtonPosition] = useState({ top: 0, right: 0 });
  
  // 统一素材状态（图片/视频/音频）
  const [mediaState, setMediaState] = useState<UnifiedMediaState>({
    images: [],
    videos: [],
    audios: [],
    nextImageIndex: 1,
    nextVideoIndex: 1,
    nextAudioIndex: 1
  });
  const mediaStateRef = useRef(mediaState);
  useEffect(() => {
    mediaStateRef.current = mediaState;
  }, [mediaState]);
  
  // 统一素材上传中状态
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  
  // 视频预览
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  // 图片放大预览（Lightbox）
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    images: Array<{ id: string; url: string; name?: string }>;
    index: number;
  }>({ open: false, images: [], index: 0 });
  
  // 视频参考上传（仅 Seedance 2.0 支持）- 最多3个
  const [uploadedVideos, setUploadedVideos] = useState<Array<{ id: string; url: string; name: string; key?: string }>>([]);
  
  // 音频参考上传（仅 Seedance 2.0 支持）- 最多3个
  const [uploadedAudios, setUploadedAudios] = useState<Array<{ id: string; url: string; name: string; key?: string }>>([]);
  
  // 是否生成音频（仅 Seedance 2.0 支持）
  const [generateAudio, setGenerateAudio] = useState(true);
  const [useOfflineInference, setUseOfflineInference] = useState(false);

  // 延长视频相关状态
  const [extendVideos, setExtendVideos] = useState<Array<{ id: string; url: string; name: string; key?: string }>>([]);
  const [extendPrompt, setExtendPrompt] = useState('');
  const [extendRatio, setExtendRatio] = useState('9:16');
  const [extendDuration, setExtendDuration] = useState('8');
  const [extendGenerateAudio, setExtendGenerateAudio] = useState(true);

  // ============ 配音 Tab 状态 ============
  
  // 配音功能子模式
  const [audioSubMode, setAudioSubMode] = useState<'tts' | 'clone' | 'bgm'>('tts');
  
  // TTS 配音状态
  const [ttsPrompt, setTtsPrompt] = useState('');
  const [ttsSpeaker, setTtsSpeaker] = useState('zh_female_xiaohe_uranus_bigtts');
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  
  // 人声复刻状态
  const [clonePrompt, setClonePrompt] = useState('');
  const [cloneReferenceUrl, setCloneReferenceUrl] = useState('');
  const [cloneReferenceName, setCloneReferenceName] = useState('');
  const [cloneSpeakerId, setCloneSpeakerId] = useState('');
  const [isGeneratingClone, setIsGeneratingClone] = useState(false);
  
  // BGM 状态
  const [bgmPrompt, setBgmPrompt] = useState('');
  const [bgmModel, setBgmModel] = useState<'music-2.6' | 'music-cover'>('music-2.6');
  const [bgmInstrumental, setBgmInstrumental] = useState(false);
  const [bgmReferenceUrl, setBgmReferenceUrl] = useState('');
  const [bgmReferenceName, setBgmReferenceName] = useState('');
  const [isGeneratingBGM, setIsGeneratingBGM] = useState(false);
  
  // 配音任务列表
  const [audioTasks, setAudioTasks] = useState<AudioTask[]>([]);
  const [audioTasksLoading, setAudioTasksLoading] = useState(false);
  
  // 配音任务轮询
  const audioPollingRef = useRef<NodeJS.Timeout | null>(null);
  const audioTasksRef = useRef(audioTasks);
  useEffect(() => {
    audioTasksRef.current = audioTasks;
  }, [audioTasks]);
  
  // 配音音色选项（与后端保持一致）
  const VOICE_OPTIONS = {
    general: [
      { value: 'zh_female_xiaohe_uranus_bigtts', label: '小禾（女声，通用）' },
      { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi（女声，中英）' },
      { value: 'zh_male_m191_uranus_bigtts', label: '云舟（男声）' },
      { value: 'zh_male_taocheng_uranus_bigtts', label: '小甜（男声）' },
    ],
    dubbing: [
      { value: 'zh_male_dayi_saturn_bigtts', label: '大义（男声）' },
      { value: 'zh_female_mizai_saturn_bigtts', label: '蜜崽（女声）' },
      { value: 'zh_female_jitangnv_saturn_bigtts', label: '鸡汤女（女声）' },
      { value: 'zh_female_meilinvyou_saturn_bigtts', label: '魅力女声' },
      { value: 'zh_female_santongyongns_saturn_bigtts', label: '三通女声' },
      { value: 'zh_male_ruyayichen_saturn_bigtts', label: '儒雅男声' },
    ],
    roleplay: [
      { value: 'saturn_zh_female_keainvsheng_tob', label: '可爱女孩' },
      { value: 'saturn_zh_female_tiaopigongzhu_tob', label: '调皮公主' },
      { value: 'saturn_zh_male_shuanglangshaonian_tob', label: '爽朗少年' },
      { value: 'saturn_zh_male_tiancaitongzhuo_tob', label: '天才同学' },
      { value: 'saturn_zh_female_cancan_tob', label: '才女' },
    ],
  };

  // ============ 配音事件处理函数 ============

  // 获取配音任务列表
  const fetchAudioTasks = async () => {
    if (!currentUser) return;
    
    setAudioTasksLoading(true);
    try {
      const response = await fetch(`/api/v1/audio/tasks?limit=50&offset=0`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('获取任务列表失败');
      }
      
      const data = await response.json();
      if (data.success) {
        setAudioTasks(data.data.tasks || []);
        
        // 启动轮询处理处理中的任务
        const processingTasks = data.data.tasks.filter((t: { status: number }) => t.status === 0 || t.status === 1);
        if (processingTasks.length > 0) {
          startAudioPolling();
        }
      }
    } catch (error) {
      console.error('获取配音任务失败:', error);
    } finally {
      setAudioTasksLoading(false);
    }
  };

  // 轮询配音任务状态
  const startAudioPolling = () => {
    if (audioPollingRef.current) {
      clearInterval(audioPollingRef.current);
    }
    
    audioPollingRef.current = setInterval(async () => {
      const currentAudioTasks = audioTasksRef.current;
      const processingTasks = currentAudioTasks.filter(t => t.status === 0 || t.status === 1);
      
      if (processingTasks.length === 0) {
        if (audioPollingRef.current) {
          clearInterval(audioPollingRef.current);
          audioPollingRef.current = null;
        }
        return;
      }
      
      // 更新每个处理中的任务状态
      for (const task of processingTasks) {
        try {
          const response = await fetch(`/api/v1/audio/status?task_id=${task.task_id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setAudioTasks(prev => prev.map(t => 
                t.task_id === task.task_id 
                  ? { ...t, status: data.data.status, status_text: data.data.status_text, result_url: data.data.result_url }
                  : t
              ));
              
              // 如果任务完成，停止轮询
              if (data.data.status === 2 || data.data.status === -1) {
                const remaining = audioTasksRef.current.filter(t => 
                  t.task_id !== task.task_id && (t.status === 0 || t.status === 1)
                );
                if (remaining.length === 0 && audioPollingRef.current) {
                  clearInterval(audioPollingRef.current);
                  audioPollingRef.current = null;
                }
              }
            }
          }
        } catch (error) {
          console.error('轮询配音任务失败:', error);
        }
      }
    }, 3000);
  };

  // 生成 TTS 配音
  const handleGenerateTTS = async () => {
    if (!currentUser || !ttsPrompt.trim()) return;
    
    setIsGeneratingTTS(true);
    try {
      const response = await fetch('/api/v1/audio/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          prompt: ttsPrompt,
          speaker: ttsSpeaker
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTtsPrompt('');
        toast.success('配音任务已提交');
        await fetchAudioTasks();
      } else {
        toast.error(data.error || '生成配音失败');
      }
    } catch (error) {
      console.error('生成 TTS 失败:', error);
      toast.error('生成配音失败');
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  // 上传人声复刻参考音频
  const handleCloneReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'audio');
    
    try {
      const response = await fetch('/api/v1/upload-media', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCloneReferenceUrl(data.data.url);
        setCloneReferenceName(file.name);
      } else {
        toast.error(data.error || '上传参考音频失败');
      }
    } catch (error) {
      console.error('上传参考音频失败:', error);
      toast.error('上传参考音频失败');
    }
  };

  // 生成人声复刻配音
  const handleGenerateClone = async () => {
    if (!currentUser || !clonePrompt.trim() || !cloneReferenceUrl) return;
    
    setIsGeneratingClone(true);
    try {
      const response = await fetch('/api/v1/audio/voice/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          prompt: clonePrompt,
          referenceAudioUrl: cloneReferenceUrl,
          speakerId: cloneSpeakerId || undefined,
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setClonePrompt('');
        toast.success('复刻配音任务已提交');
        await fetchAudioTasks();
      } else {
        toast.error(data.error || '生成复刻配音失败');
      }
    } catch (error) {
      console.error('生成复刻配音失败:', error);
      toast.error('生成复刻配音失败');
    } finally {
      setIsGeneratingClone(false);
    }
  };

  // 生成 BGM
  const handleGenerateBGM = async () => {
    if (!currentUser || !bgmPrompt.trim()) return;
    
    setIsGeneratingBGM(true);
    try {
      const response = await fetch('/api/v1/audio/bgm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          prompt: bgmPrompt,
          model: bgmModel,
          isInstrumental: bgmInstrumental,
          referenceAudioUrl: bgmReferenceUrl || undefined,
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBgmPrompt('');
        toast.success('BGM 任务已提交');
        await fetchAudioTasks();
      } else {
        toast.error(data.error || '生成 BGM 失败');
      }
    } catch (error) {
      console.error('生成 BGM 失败:', error);
      toast.error('生成 BGM 失败');
    } finally {
      setIsGeneratingBGM(false);
    }
  };

  // 配音任务轮询清理
  useEffect(() => {
    return () => {
      if (audioPollingRef.current) {
        clearInterval(audioPollingRef.current);
      }
    };
  }, []);

  // 切换到配音 Tab 时获取任务列表
  useEffect(() => {
    if (activeTab === 'audio' && currentUser) {
      fetchAudioTasks();
    }
  }, [activeTab, currentUser]);



  // 编辑视频相关状态
  const [editVideoFile, setEditVideoFile] = useState<{ id: string; url: string; name: string; key?: string } | null>(null);
  const [editReferenceImage, setEditReferenceImage] = useState<{ id: string; url: string; name: string; key?: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  
  // textarea ref
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 跟踪当前焦点的 textarea（用于 paste 功能）
  const activeTextareaRef = useRef<{ element: HTMLTextAreaElement | null; id: string; setter: (value: string) => void; getValue: () => string } | null>(null);
  
  // 待插入的媒体引用队列（paste 后触发）
  const [pendingMediaRefs, setPendingMediaRefs] = useState<string[]>([]);
  
  // 任务列表
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  
  // 轮询定时器
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const offlinePollingRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化：检查登录状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
    } catch {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  // 登出
  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch {
        // 忽略错误
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  // 轮询任务状态（修复闭包问题：从 setTasks 函数式更新中获取最新 tasks）
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    
    pollingRef.current = setInterval(() => {
      // 使用函数式更新获取最新的 tasks 状态，避免闭包捕获旧值
      setTasks(currentTasks => {
        // 在线任务：仅轮询非离线的任务
        const processingTasks = currentTasks.filter(
          t => (t.status === TaskStatus.QUEUE || t.status === TaskStatus.PROCESSING) && t.service_tier !== 'flex'
        );
        
        if (processingTasks.length === 0) {
          // 停止轮询（使用 setTimeout 确保在当前批次完成后执行）
          setTimeout(() => {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }, 0);
          return currentTasks;
        }
        
        // 异步查询每个处理中任务的状态（不阻塞状态更新）
        processingTasks.forEach(task => {
          getTaskStatus(task.task_id).then(response => {
            if (response.success && response.data) {
              setTasks(prev => 
                prev.map(t => 
                  t.task_id === task.task_id 
                    ? { ...t, ...response.data! }
                    : t
                )
              );
            }
          }).catch(err => {
            console.error(`轮询任务 ${task.task_id} 失败:`, err);
          });
        });
        
        return currentTasks;
      });
    }, 3000);
  }, []);

  // 离线任务轮询（60秒间隔）
  const startOfflinePolling = useCallback(() => {
    if (offlinePollingRef.current) return;
    
    offlinePollingRef.current = setInterval(() => {
      setTasks(currentTasks => {
        // 离线任务：仅轮询 service_tier=flex 的任务
        const offlineProcessingTasks = currentTasks.filter(
          t => (t.status === TaskStatus.QUEUE || t.status === TaskStatus.PROCESSING) && t.service_tier === 'flex'
        );
        
        if (offlineProcessingTasks.length === 0) {
          setTimeout(() => {
            if (offlinePollingRef.current) {
              clearInterval(offlinePollingRef.current);
              offlinePollingRef.current = null;
            }
          }, 0);
          return currentTasks;
        }
        
        offlineProcessingTasks.forEach(task => {
          getTaskStatus(task.task_id).then(response => {
            if (response.success && response.data) {
              setTasks(prev => 
                prev.map(t => 
                  t.task_id === task.task_id 
                    ? { ...t, ...response.data! }
                    : t
                )
              );
            }
          }).catch(err => {
            console.error(`轮询离线任务 ${task.task_id} 失败:`, err);
          });
        });
        
        return currentTasks;
      });
    }, 60000); // 离线任务 60 秒轮询一次
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (offlinePollingRef.current) {
      clearInterval(offlinePollingRef.current);
      offlinePollingRef.current = null;
    }
  }, []);

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const response = await getTaskList(50, 0);
      if (response.success && response.data) {
        setTasks(response.data.tasks);
        
        // 自动轮询正在处理中的任务
        const processingTasks = response.data.tasks.filter(
          t => t.status === TaskStatus.QUEUE || t.status === TaskStatus.PROCESSING
        );
        
        if (processingTasks.length > 0 && !pollingRef.current) {
          startPolling();
        }
        
        // 自动轮询离线任务
        const offlineProcessingTasks = response.data.tasks.filter(
          t => (t.status === TaskStatus.QUEUE || t.status === TaskStatus.PROCESSING) && t.service_tier === 'flex'
        );
        if (offlineProcessingTasks.length > 0 && !offlinePollingRef.current) {
          startOfflinePolling();
        }
      }
    } catch (error) {
      console.error('加载任务列表失败:', error);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [startPolling, startOfflinePolling]);

  // 初始化加载
  useEffect(() => {
    loadTasks();
    return () => stopPolling();
  }, [loadTasks, stopPolling]);

  // ============ 统一素材上传处理 ============
  
  // 触发统一素材上传（通过 @ 按钮或素材管理区）
  const triggerMediaUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = (e) => handleMediaUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
    input.click();
  };

  // ARK 限制参考视频像素数不超过 2,086,876（≈1080p 上限）
  const MAX_VIDEO_PIXELS = 2086876;

  // 检查视频分辨率，超标则拒绝上传
  const checkVideoResolution = (file: File): Promise<{ valid: boolean; width?: number; height?: number; pixelCount?: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.playsInline = true;
      video.muted = true;

      const url = URL.createObjectURL(file);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };

      const onLoaded = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        cleanup();
        const pixelCount = width * height;
        resolve({ valid: pixelCount <= MAX_VIDEO_PIXELS, width, height, pixelCount });
      };

      const onError = () => {
        cleanup();
        resolve({ valid: false });
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      video.src = url;
    });
  };

  // 处理统一素材上传（图片/视频/音频）
  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // ============ 提前检测素材数量 ============
    // 统计本次选择的各类文件数量
    const selectedFiles = Array.from(files);
    const selectedImageCount = selectedFiles.filter(f => f.type.startsWith('image/')).length;
    const selectedVideoCount = selectedFiles.filter(f => f.type.startsWith('video/')).length;
    const selectedAudioCount = selectedFiles.filter(f => f.type.startsWith('audio/')).length;

    // 数量限制
    const MAX_IMAGES = 9;
    const MAX_VIDEOS = 3;
    const MAX_AUDIOS = 3;

    const currentMediaState = mediaStateRef.current;
    const currentImageCount = currentMediaState.images.length;
    const currentVideoCount = currentMediaState.videos.length;
    const currentAudioCount = currentMediaState.audios.length;

    // 检测图片数量
    if (selectedImageCount > 0) {
      const totalImages = currentImageCount + selectedImageCount;
      if (totalImages > MAX_IMAGES) {
        toast(`上传素材数量超出限制！图片 ${totalImages}/${MAX_IMAGES}，超出限制`);
        if (event.target) event.target.value = '';
        return;
      }
    }

    // 检测视频数量
    if (selectedVideoCount > 0) {
      const totalVideos = currentVideoCount + selectedVideoCount;
      if (totalVideos > MAX_VIDEOS) {
        toast(`上传素材数量超出限制！视频 ${totalVideos}/${MAX_VIDEOS}，超出限制`);
        if (event.target) event.target.value = '';
        return;
      }
    }

    // 检测音频数量
    if (selectedAudioCount > 0) {
      const totalAudios = currentAudioCount + selectedAudioCount;
      if (totalAudios > MAX_AUDIOS) {
        toast(`上传素材数量超出限制！音频 ${totalAudios}/${MAX_AUDIOS}，超出限制`);
        if (event.target) event.target.value = '';
        return;
      }
    }

    // ============ 开始上传（带进度显示）============
    // 使用 ref 来追踪当前序号（在循环中保持正确）
    const indexRef = { current: { image: mediaState.nextImageIndex, video: mediaState.nextVideoIndex, audio: mediaState.nextAudioIndex } };

    // 存储待处理的文件和对应的 mediaKey，用于后续更新
    const pendingUploads: Array<{
      file: File;
      mediaType: 'image' | 'video' | 'audio';
      mediaKey: string;
      currentIndex: number;
      localPreviewUrl: string;
    }> = [];

    // 第一步：立即生成本地预览，更新 UI
    for (const file of selectedFiles) {
      // 确定文件类型
      let mediaType: 'image' | 'video' | 'audio';
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        continue;
      }

      // 文件大小限制
      const MAX_SIZES = { image: 30 * 1024 * 1024, video: 100 * 1024 * 1024, audio: 15 * 1024 * 1024 };
      if (file.size > MAX_SIZES[mediaType]) {
        toast.error(`${mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频'}超过 ${MAX_SIZES[mediaType] / 1024 / 1024}MB 限制`);
        continue;
      }

      // 视频分辨率检查（ARK 限制像素数不超过约 1080p）
      if (mediaType === 'video') {
        const resCheck = await checkVideoResolution(file);
        if (!resCheck.valid) {
          const dim = resCheck.width && resCheck.height ? `（${resCheck.width}×${resCheck.height}）` : '';
          toast.error(`视频 "${file.name}" 分辨率过大${dim}，请压缩至 1080p 以下后重新上传`);
          continue;
        }
      }

      // 获取当前序号并递增
      const currentIndex = indexRef.current[mediaType];
      indexRef.current[mediaType]++;

      // 生成本地预览 URL
      const localPreviewUrl = URL.createObjectURL(file);

      // 生成引用 key
      const prefix = mediaType === 'image' ? '图' : mediaType === 'video' ? '视频' : '音频';
      const key = `@${prefix}${currentIndex}`;

      // 创建临时 media item（显示本地预览 + 上传进度）
      const tempMedia: UploadedMedia = {
        key,
        name: file.name,
        url: localPreviewUrl,  // 初始使用本地预览
        localPreviewUrl,
        type: mediaType,
        size: file.size,
        thumbnailUrl: localPreviewUrl,
        storageKey: key,
        createdAt: new Date().toISOString(),
        uploadProgress: 0,
        isUploading: true,
        isUploaded: false
      };

      // 记录待上传文件
      pendingUploads.push({
        file,
        mediaType,
        mediaKey: key,
        currentIndex,
        localPreviewUrl
      });

      // 立即更新 UI 显示本地预览和进度条
      setMediaState(prev => {
        const newImages = mediaType === 'image' ? [...prev.images, tempMedia] : prev.images;
        const newVideos = mediaType === 'video' ? [...prev.videos, tempMedia] : prev.videos;
        const newAudios = mediaType === 'audio' ? [...prev.audios, tempMedia] : prev.audios;
        return {
          images: newImages,
          videos: newVideos,
          audios: newAudios,
          nextImageIndex: mediaType === 'image' ? currentIndex + 1 : prev.nextImageIndex,
          nextVideoIndex: mediaType === 'video' ? currentIndex + 1 : prev.nextVideoIndex,
          nextAudioIndex: mediaType === 'audio' ? currentIndex + 1 : prev.nextAudioIndex
        };
      });

      // 同步更新旧的上传图片状态（用于批量生成 UI）
      if (mediaType === 'image') {
        const imageId = `图${currentIndex}`;
        setUploadedImages(prev => [
          ...prev,
          {
            id: imageId,
            name: file.name,
            url: localPreviewUrl,  // 初始使用本地预览
            thumbnail: localPreviewUrl,
            key: key,
            displayIndex: currentIndex,
            uploadOrder: prev.length + 1
          }
        ]);
      }
    }

    // 第二步：开始实际上传（不阻塞）
    for (const upload of pendingUploads) {
      uploadMediaWithProgress(
        upload.file,
        // 进度回调
        (percent) => {
          setMediaState(prev => {
            const mediaArray = prev[upload.mediaType + 's' as 'images' | 'videos' | 'audios'];
            const updated = mediaArray.map(m => 
              m.key === upload.mediaKey 
                ? { ...m, uploadProgress: percent }
                : m
            );
            return { ...prev, [upload.mediaType + 's' as 'images' | 'videos' | 'audios']: updated };
          });
        },
        // 完成回调
        (response) => {
          if (response.success && response.data) {
            const { data } = response;
            
            // 上传成功，更新为正式 URL，移除进度
            setMediaState(prev => {
              const mediaArray = prev[upload.mediaType + 's' as 'images' | 'videos' | 'audios'];
              const updated = mediaArray.map(m => 
                m.key === upload.mediaKey 
                  ? { 
                      ...m, 
                      url: data.url,  // 替换为正式 URL
                      thumbnailUrl: data.thumbnailUrl || data.url,
                      storageKey: data.storageKey,
                      uploadProgress: undefined,
                      isUploading: false,
                      isUploaded: true
                    }
                  : m
              );
              return { ...prev, [upload.mediaType + 's' as 'images' | 'videos' | 'audios']: updated };
            });

            // 同步更新 uploadedImages（旧状态）
            if (upload.mediaType === 'image') {
              setUploadedImages(prev => prev.map(img => 
                img.id === `图${upload.currentIndex}` || img.key === upload.mediaKey
                  ? { ...img, url: data.url, thumbnail: data.url, key: data.storageKey }
                  : img
              ));
              setPreviewUrls(prev => {
                const existing = prev.find(p => p.id === `图${upload.currentIndex}`);
                if (existing) {
                  return prev.map(p => p.id === `图${upload.currentIndex}` ? { ...p, url: data.url } : p);
                }
                return [...prev, { id: `图${upload.currentIndex}`, url: data.url }];
              });
            }

            // 释放本地预览 URL
            URL.revokeObjectURL(upload.localPreviewUrl);
          } else {
            // 上传失败，标记失败状态并释放本地预览 URL
            setMediaState(prev => {
              const mediaArray = prev[upload.mediaType + 's' as 'images' | 'videos' | 'audios'];
              const updated = mediaArray.map(m => 
                m.key === upload.mediaKey 
                  ? { ...m, uploadProgress: -1, isUploading: false }
                  : m
              );
              return { ...prev, [upload.mediaType + 's' as 'images' | 'videos' | 'audios']: updated };
            });
            URL.revokeObjectURL(upload.localPreviewUrl);
            toast.error(`${upload.mediaType === 'image' ? '图片' : upload.mediaType === 'video' ? '视频' : '音频'} "${upload.file.name}" 上传失败`);
          }
        }
      );
    }

    if (event.target) event.target.value = '';
  };

  // ============ 粘贴文件处理 ============
  // 支持在文本框中直接 Ctrl+V 粘贴文件，自动上传并插入 @引用

  // 处理粘贴的文件（统一复用 handleMediaUpload 的逻辑）
  const processPastedFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    // 过滤出媒体文件
    const mediaFiles = fileArray.filter(f => 
      f.type.startsWith('image/') || 
      f.type.startsWith('video/') || 
      f.type.startsWith('audio/')
    );
    
    if (mediaFiles.length === 0) {
      return; // 没有媒体文件，不处理
    }

    // 统计各类文件数量
    const selectedImageCount = mediaFiles.filter(f => f.type.startsWith('image/')).length;
    const selectedVideoCount = mediaFiles.filter(f => f.type.startsWith('video/')).length;
    const selectedAudioCount = mediaFiles.filter(f => f.type.startsWith('audio/')).length;

    // 数量限制
    const MAX_IMAGES = 9;
    const MAX_VIDEOS = 3;
    const MAX_AUDIOS = 3;

    const currentImageCount = mediaState.images.length;
    const currentVideoCount = mediaState.videos.length;
    const currentAudioCount = mediaState.audios.length;

    // 检测并调整文件数量
    let adjustedFiles = [...mediaFiles];
    
    // 检测图片数量
    if (selectedImageCount > 0) {
      const totalImages = currentImageCount + selectedImageCount;
      if (totalImages > MAX_IMAGES) {
        const excessImages = totalImages - MAX_IMAGES;
        toast(`图片数量超出限制！粘贴 ${selectedImageCount} 张图片后总计 ${totalImages}/${MAX_IMAGES}，将只上传前 ${Math.max(0, selectedImageCount - excessImages)} 张`);
        // 移除超出的图片
        let removed = 0;
        adjustedFiles = adjustedFiles.filter(f => {
          if (f.type.startsWith('image/') && removed < excessImages) {
            removed++;
            return false;
          }
          return true;
        });
      }
    }

    // 检测视频数量
    if (selectedVideoCount > 0) {
      const totalVideos = currentVideoCount + adjustedFiles.filter(f => f.type.startsWith('video/')).length;
      if (totalVideos > MAX_VIDEOS) {
        const excessVideos = totalVideos - MAX_VIDEOS;
        toast(`视频数量超出限制！将只上传前 ${Math.max(0, MAX_VIDEOS - currentVideoCount)} 个视频`);
        // 移除超出的视频
        let removed = 0;
        adjustedFiles = adjustedFiles.filter(f => {
          if (f.type.startsWith('video/') && removed < excessVideos && removed < selectedVideoCount) {
            removed++;
            return false;
          }
          return true;
        });
      }
    }

    // 检测音频数量
    if (selectedAudioCount > 0) {
      const totalAudios = currentAudioCount + adjustedFiles.filter(f => f.type.startsWith('audio/')).length;
      if (totalAudios > MAX_AUDIOS) {
        const excessAudios = totalAudios - MAX_AUDIOS;
        toast(`音频数量超出限制！将只上传前 ${Math.max(0, MAX_AUDIOS - currentAudioCount)} 个音频`);
        // 移除超出的音频
        let removed = 0;
        adjustedFiles = adjustedFiles.filter(f => {
          if (f.type.startsWith('audio/') && removed < excessAudios && removed < selectedAudioCount) {
            removed++;
            return false;
          }
          return true;
        });
      }
    }

    if (adjustedFiles.length === 0) {
      return;
    }

    setIsUploadingMedia(true);
    const uploadedRefs: string[] = [];

    // 使用 ref 来追踪当前序号（在循环中保持正确）
    const indexRef = { current: { image: mediaState.nextImageIndex, video: mediaState.nextVideoIndex, audio: mediaState.nextAudioIndex } };

    try {
      for (const file of adjustedFiles) {
        // 确定文件类型
        let mediaType: 'image' | 'video' | 'audio';
        if (file.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (file.type.startsWith('video/')) {
          mediaType = 'video';
        } else if (file.type.startsWith('audio/')) {
          mediaType = 'audio';
        } else {
          continue;
        }

        // 文件大小限制
        const MAX_SIZES = { image: 30 * 1024 * 1024, video: 100 * 1024 * 1024, audio: 15 * 1024 * 1024 };
        if (file.size > MAX_SIZES[mediaType]) {
          toast(`${mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频'} "${file.name}" 超过 ${MAX_SIZES[mediaType] / 1024 / 1024}MB 限制`);
          continue;
        }

        // 获取当前序号并递增
        const currentIndex = indexRef.current[mediaType];
        indexRef.current[mediaType]++;

        // 上传文件
        const response = await uploadMedia(file);

        if (response.success && response.data) {
          const { data } = response;
          
          // 记录新引用的 key（用于后续插入到文本框）
          const prefix = mediaType === 'image' ? '图' : mediaType === 'video' ? '视频' : '音频';
          const refKey = `@${prefix}${currentIndex}`;
          uploadedRefs.push(refKey);

          const newMedia: UploadedMedia = {
            key: refKey,
            name: data.name,
            url: data.url,
            type: data.type,
            size: data.size,
            thumbnailUrl: data.thumbnailUrl || data.url,
            storageKey: data.storageKey,
            createdAt: new Date().toISOString()
          };

          // 更新 mediaState
          setMediaState(prev => {
            const newImages = data.type === 'image' ? [...prev.images, newMedia] : prev.images;
            const newVideos = data.type === 'video' ? [...prev.videos, newMedia] : prev.videos;
            const newAudios = data.type === 'audio' ? [...prev.audios, newMedia] : prev.audios;
            return {
              images: newImages,
              videos: newVideos,
              audios: newAudios,
              nextImageIndex: data.type === 'image' ? currentIndex + 1 : prev.nextImageIndex,
              nextVideoIndex: data.type === 'video' ? currentIndex + 1 : prev.nextVideoIndex,
              nextAudioIndex: data.type === 'audio' ? currentIndex + 1 : prev.nextAudioIndex
            };
          });

          // 同步更新旧的上传图片状态（兼容现有逻辑）
          if (data.type === 'image') {
            const imageId = `图${currentIndex}`;
            setUploadedImages(prev => [
              ...prev,
              {
                id: imageId,
                name: data.name,
                url: data.url,
                thumbnail: data.url,
                key: data.storageKey,
                displayIndex: currentIndex,
                uploadOrder: prev.length + 1
              }
            ]);
            setPreviewUrls(prev => [...prev, { id: imageId, url: data.url }]);
          }

          // 同步更新视频参考状态
          if (data.type === 'video') {
            const videoId = `@视频${currentIndex}`;
            setUploadedVideos(prev => [
              ...prev,
              {
                id: videoId,
                name: data.name,
                url: data.url,
                key: data.storageKey
              }
            ]);
          }

          // 同步更新音频参考状态
          if (data.type === 'audio') {
            const audioId = `@音频${currentIndex}`;
            setUploadedAudios(prev => [
              ...prev,
              {
                id: audioId,
                name: data.name,
                url: data.url,
                key: data.storageKey
              }
            ]);
          }
        } else {
          console.error(`${mediaType} 上传失败:`, response.error);
          toast(`${mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频'} "${file.name}" 上传失败`);
        }
      }

      // 在焦点文本框中插入 @引用（直接追加到光标位置，保留原有内容）
      if (uploadedRefs.length > 0 && activeTextareaRef.current) {
        const { element, id, getValue, setter } = activeTextareaRef.current;
        
        if (element) {
          const cursorPos = element.selectionStart;
          const currentValue = getValue();
          // 直接在光标位置插入引用，保留光标前后的所有内容
          const newValue = currentValue.slice(0, cursorPos) + uploadedRefs.join(' ') + currentValue.slice(cursorPos);
          
          setter(newValue);
          
          // 设置光标位置到插入内容之后
          setTimeout(() => {
            const newCursorPos = cursorPos + uploadedRefs.join(' ').length;
            element.setSelectionRange(newCursorPos, newCursorPos);
            element.focus();
          }, 0);
        }
      }
    } catch (error) {
      console.error('处理粘贴文件失败:', error);
      toast('处理粘贴文件失败');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  // 注册 paste 事件监听器（组件挂载时）
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // 检查是否有文件粘贴
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        // 检查是否包含媒体文件
        const hasMedia = Array.from(e.clipboardData.files).some(f =>
          f.type.startsWith('image/') ||
          f.type.startsWith('video/') ||
          f.type.startsWith('audio/')
        );
        
        if (hasMedia) {
          e.preventDefault(); // 阻止默认粘贴行为
          processPastedFiles(e.clipboardData.files);
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []); // paste 监听器只需注册一次，通过 ref 获取最新状态

  // 删除统一素材（图片/视频/音频）
  const handleMediaDelete = async (storageKey: string) => {
    // 找到要删除的素材
    const mediaToDelete = 
      mediaState.images.find(m => m.storageKey === storageKey) ||
      mediaState.videos.find(m => m.storageKey === storageKey) ||
      mediaState.audios.find(m => m.storageKey === storageKey);

    if (!mediaToDelete) return;

    // 调用后端接口删除对象存储中的文件
    try {
      await deleteMedia(storageKey);
    } catch (error) {
      console.error('删除素材文件失败:', error);
    }

    // 判断删除的是什么类型的最后一张
    const wasLastImage = mediaToDelete.type === 'image' && mediaState.images.length === 1;
    const wasLastVideo = mediaToDelete.type === 'video' && mediaState.videos.length === 1;
    const wasLastAudio = mediaToDelete.type === 'audio' && mediaState.audios.length === 1;

    // 更新统一素材状态
    setMediaState(prev => {
      const newImages = prev.images.filter(m => m.storageKey !== storageKey);
      const newVideos = prev.videos.filter(m => m.storageKey !== storageKey);
      const newAudios = prev.audios.filter(m => m.storageKey !== storageKey);
      
      // 判断删除后该类型是否清空了
      const imagesCleared = newImages.length === 0 && prev.images.length > 0;
      const videosCleared = newVideos.length === 0 && prev.videos.length > 0;
      const audiosCleared = newAudios.length === 0 && prev.audios.length > 0;
      
      // 如果某类型清空了，同步清空后端记录并重置计数
      if (imagesCleared) {
        clearMediaByType('image').catch(err => console.error('清空图片记录失败:', err));
      }
      if (videosCleared) {
        clearMediaByType('video').catch(err => console.error('清空视频记录失败:', err));
      }
      if (audiosCleared) {
        clearMediaByType('audio').catch(err => console.error('清空音频记录失败:', err));
      }
      
      return {
        images: newImages,
        videos: newVideos,
        audios: newAudios,
        // 只有被清空的类型才重置计数
        nextImageIndex: imagesCleared ? 1 : prev.nextImageIndex,
        nextVideoIndex: videosCleared ? 1 : prev.nextVideoIndex,
        nextAudioIndex: audiosCleared ? 1 : prev.nextAudioIndex
      };
    });

    // 关闭下拉列表（如果素材全部删除）
    if (
      (wasLastImage && mediaState.videos.length === 0 && mediaState.audios.length === 0) ||
      (wasLastVideo && mediaState.images.length === 0 && mediaState.audios.length === 0) ||
      (wasLastAudio && mediaState.images.length === 0 && mediaState.videos.length === 0)
    ) {
      setMentionDropdownOpen(false);
    }

    // 同步更新旧的上传图片状态（兼容现有逻辑）
    if (mediaToDelete.type === 'image') {
      setUploadedImages(prev => {
        const filtered = prev.filter(m => m.key !== storageKey);
        return filtered;
      });
      setPreviewUrls(prev => prev.filter(m => m.id !== mediaToDelete.key));
    }

    // 同步更新旧的上传视频状态
    if (mediaToDelete.type === 'video') {
      setUploadedVideos(prev => prev.filter(v => v.key !== storageKey));
    }

    // 同步更新旧的上传音频状态
    if (mediaToDelete.type === 'audio') {
      setUploadedAudios(prev => prev.filter(a => a.key !== storageKey));
    }
  };

  // 从 @ 下拉框选择素材
  const handleMediaSelect = (media: UploadedMedia) => {
    // 优先使用当前焦点的 textarea
    const textarea = activeTextareaRef.current?.element || promptTextareaRef.current;
    if (!textarea) return;

    // 获取光标位置：如果 textarea 仍有焦点，selectionStart 是可靠的；
    // 失焦时某些浏览器 selectionStart 可能归零，此时用缓存值兜底
    const isTextareaFocused = document.activeElement === textarea;
    const selectionStart = textarea.selectionStart;
    const cursorPos = (isTextareaFocused && selectionStart !== null && selectionStart !== undefined)
      ? selectionStart 
      : cachedCursorPosRef.current;
    // 根据当前焦点判断使用哪个值
    const activeId = activeTextareaRef.current?.id;
    let currentPrompt: string;
    
    if (activeId === 'edit') {
      currentPrompt = editPrompt;
    } else if (activeId === 'extend') {
      currentPrompt = extendPrompt;
    } else if (activeId?.startsWith('batch-')) {
      // 批量生成模式，查找对应的任务
      const sbId = activeId.replace('batch-', '');
      const sb = batchTasks.find(t => t.id === sbId);
      currentPrompt = sb?.content || '';
    } else {
      // 默认使用单次生成
      currentPrompt = mode === 'single' ? prompt : batchTasks[0]?.content || '';
    }
    
    const textBeforeCursor = currentPrompt.slice(0, cursorPos);
    const textAfterCursor = currentPrompt.slice(cursorPos);

    // 点击 @ 按钮时，用户没有输入新的 @，所以始终在光标位置插入引用，
    // 不做 lastIndexOf('@') 替换（否则会误替换已有的 @图X/@视频X/@音频X 引用，导致中间文字被吞掉）
    // 注意：输入 @ 触发的 insertMediaReference 才需要替换 @
    const newValue = `${textBeforeCursor}${media.key} ${textAfterCursor}`;

    // 根据当前焦点更新对应的状态
    if (activeId === 'edit') {
      setEditPrompt(newValue);
    } else if (activeId === 'extend') {
      setExtendPrompt(newValue);
    } else if (activeId?.startsWith('batch-')) {
      const sbId = activeId.replace('batch-', '');
      updateStoryboard(sbId, newValue);
    } else if (mode === 'single') {
      setPrompt(newValue);
    } else {
      const firstSb = batchTasks[0];
      if (firstSb) {
        updateStoryboard(firstSb.id, newValue);
      }
    }

    // 设置光标位置到插入内容之后
    setTimeout(() => {
      const newPos = cursorPos + media.key.length + 1; // 光标原位置 + 引用长度 + 空格
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  // 缓存当前 textarea 的光标位置（用于 @ 引用插入）
  // 关键：在 textarea 每次光标变化和失焦时更新，确保下拉选择时能取到正确位置
  const cachedCursorPosRef = useRef<number>(0);

  // 更新光标位置缓存的辅助函数
  const updateCursorCache = () => {
    const textarea = activeTextareaRef.current?.element || promptTextareaRef.current;
    if (textarea) {
      const pos = textarea.selectionStart;
      // 只在 selectionStart 为合法值时更新（失焦后某些浏览器可能返回 null/undefined）
      if (pos !== null && pos !== undefined) {
        cachedCursorPosRef.current = pos;
      }
    }
  };

  // 处理 @ 按钮点击
  const handleMentionButtonClick = (e: React.MouseEvent) => {
    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    setMentionButtonPosition({
      top: rect.bottom + window.scrollY,
      right: window.innerWidth - rect.right
    });
    
    // 缓存当前 textarea 的光标位置，防止点击按钮后 textarea 失焦导致 selectionStart 变成 0
    updateCursorCache();
    
    setMentionDropdownOpen(!mentionDropdownOpen);
  };

  // ============ 原有上传处理 ============

  // 处理图片上传（同步更新 mediaState，确保三处入口同步）
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // 支持的图片格式
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/gif'];
    // Seedance 1.5 pro 额外支持
    const HEIC_TYPES = ['image/heic', 'image/heif'];
    const allAllowedTypes = model === 'doubao-seedance-1-5-pro' 
      ? [...ALLOWED_IMAGE_TYPES, ...HEIC_TYPES] 
      : ALLOWED_IMAGE_TYPES;

    // 根据模型限制图片数量
    const MAX_IMAGES = model === 'seedance2.0' ? 9 : 4;
    const currentCount = uploadedImages.length;
    const remainingSlots = MAX_IMAGES - currentCount;
    
    if (remainingSlots <= 0) {
      toast(`当前模型（${MODEL_CONFIG[model as keyof typeof MODEL_CONFIG]?.name || model}）最多支持上传${MAX_IMAGES}张图片`);
      event.target.value = '';
      return;
    }

    // 将 FileList 转为数组，只取还能容纳的图片数量
    const filesArray = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast(`最多还能上传${remainingSlots}张图片，已自动截取前${remainingSlots}张`);
    }

    setIsUploadingMedia(true);

    // 使用 indexRef 追踪序号（在循环中保持正确）
    const indexRef = { current: mediaState.nextImageIndex };

    try {
      // 读取并上传每张图片
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        
        // 检查文件类型
        if (!allAllowedTypes.includes(file.type)) {
          const allowedExt = allAllowedTypes.map(t => t.split('/')[1].toUpperCase()).join('、');
          toast(`图片 "${file.name}" 格式不支持。支持格式：${allowedExt}`);
          continue;
        }
        
        // 检查文件大小（单张图片最大 30MB）
        const MAX_IMAGE_SIZE = 30 * 1024 * 1024;
        if (file.size > MAX_IMAGE_SIZE) {
          toast(`图片 "${file.name}" 超过 30MB 限制，请压缩后再上传`);
          continue;
        }

        // 获取当前序号并递增
        const currentIndex = indexRef.current++;

        // 使用 uploadMedia 上传（与其他入口保持一致）
        try {
          const uploadResponse = await uploadMedia(file);
          
          if (uploadResponse.success && uploadResponse.data) {
            const { data } = uploadResponse;
            
            // 图片命名为 图1、图2...图9
            const imageId = `图${currentIndex}`;
            const key = `@图${currentIndex}`;
            const uploadOrder = currentCount + i + 1; // 记录原始上传顺序

            const newMedia: UploadedMedia = {
              key,
              name: data.name,
              url: data.url,
              type: 'image',
              size: data.size,
              thumbnailUrl: data.url,
              storageKey: data.storageKey,
              createdAt: new Date().toISOString()
            };

            // 更新 mediaState（统一素材状态）
            setMediaState(prev => ({
              ...prev,
              images: [...prev.images, newMedia],
              nextImageIndex: currentIndex + 1
            }));

            // 更新 uploadedImages（兼容现有逻辑）
            setUploadedImages(prev => [
              ...prev,
              {
                id: imageId,
                name: data.name,
                url: data.url,
                thumbnail: data.url,
                key: data.storageKey,
                displayIndex: currentIndex,
                uploadOrder: uploadOrder
              }
            ]);
            
            setPreviewUrls(prev => [...prev, { id: imageId, url: data.url }]);
          } else {
            console.error('图片上传失败:', uploadResponse.error);
            toast(`图片 "${file.name}" 上传失败`);
          }
        } catch (error) {
          console.error('处理图片失败:', error);
          toast(`处理图片 "${file.name}" 失败`);
        }
      }
    } finally {
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 处理视频参考上传（仅 Seedance 2.0 支持）
  // 限制：mp4/mov 格式，单个不超过 100MB，最多 3 个
  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // 最多上传 3 个视频参考
    const MAX_VIDEOS = 3;
    const currentCount = uploadedVideos.length;
    const remainingSlots = MAX_VIDEOS - currentCount;
    
    if (remainingSlots <= 0) {
      toast('最多只能上传 3 个视频参考');
      event.target.value = '';
      return;
    }

    // 将 FileList 转为数组，只取还能容纳的数量
    const filesArray = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast(`最多还能上传 ${remainingSlots} 个视频参考，已自动截取前 ${remainingSlots} 个`);
    }

    // 支持的视频格式
    const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

    setIsUploadingMedia(true);

    // 使用 indexRef 追踪序号（在循环中保持正确）
    const indexRef = { current: mediaState.nextVideoIndex };

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        
        // 检查文件类型
        if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
          toast(`视频 "${file.name}" 格式不支持。支持格式：MP4、MOV`);
          continue;
        }
        
        // 检查文件大小
        if (file.size > MAX_VIDEO_SIZE) {
          toast(`视频 "${file.name}" 超过 100MB 限制，请压缩后再上传`);
          continue;
        }

        // 视频分辨率检查
        const resCheck = await checkVideoResolution(file);
        if (!resCheck.valid) {
          const dim = resCheck.width && resCheck.height ? `（${resCheck.width}×${resCheck.height}）` : '';
          toast.error(`视频 "${file.name}" 分辨率过大${dim}，请压缩至 1080p 以下后重新上传`);
          continue;
        }

        // 获取当前序号并递增
        const currentIndex = indexRef.current++;

        try {
          const uploadResponse = await uploadMedia(file);
          
          if (uploadResponse.success && uploadResponse.data) {
            const { data } = uploadResponse;
            const videoId = `@视频${currentIndex}`;
            const key = videoId;

            const newMedia: UploadedMedia = {
              key,
              name: data.name,
              url: data.url,
              type: 'video',
              size: data.size,
              thumbnailUrl: data.thumbnailUrl || data.url,
              storageKey: data.storageKey,
              createdAt: new Date().toISOString()
            };

            // 更新 mediaState（统一素材状态）
            setMediaState(prev => ({
              ...prev,
              videos: [...prev.videos, newMedia],
              nextVideoIndex: currentIndex + 1
            }));

            // 更新 uploadedVideos（兼容现有逻辑）
            setUploadedVideos(prev => [
              ...prev,
              {
                id: videoId,
                name: data.name,
                url: data.url,
                key: data.storageKey
              }
            ]);
          } else {
            console.error('视频上传失败:', uploadResponse.error);
            toast(`视频 "${file.name}" 上传失败`);
          }
        } catch (error) {
          console.error('处理视频失败:', error);
          toast(`处理视频 "${file.name}" 失败`);
        }
      }
    } finally {
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 删除已上传的视频参考
  const removeVideo = (videoId: string) => {
    // 找到要删除的视频
    const videoToDelete = uploadedVideos.find(v => v.id === videoId);
    const wasLastVideo = uploadedVideos.length === 1;
    const storageKeyToDelete = videoToDelete?.key;
    
    // 调用后端接口删除对象存储中的文件
    if (storageKeyToDelete) {
      deleteMedia(storageKeyToDelete).catch(err => console.error('删除视频文件失败:', err));
    }
    
    setUploadedVideos(prev => prev.filter(v => v.id !== videoId));
    
    // 同步更新统一素材状态
    if (storageKeyToDelete) {
      setMediaState(prev => {
        const newVideos = prev.videos.filter(m => m.storageKey !== storageKeyToDelete);
        
        // 如果删除后没有视频了，清空后端记录并重置计数
        if (newVideos.length === 0) {
          clearMediaByType('video').catch(err => console.error('清空视频记录失败:', err));
          return {
            ...prev,
            videos: newVideos,
            nextVideoIndex: 1  // 重置为 1
          };
        }
        
        // 否则保持 nextIndex 不变
        return {
          ...prev,
          videos: newVideos
        };
      });
    }
    
    // 如果删除最后一个视频，关闭下拉列表
    if (wasLastVideo) {
      setMentionDropdownOpen(false);
    }
  };

  // 处理音频参考上传（仅 Seedance 2.0 支持）
  // 限制：wav/mp3 格式，单个不超过 15MB，最多 3 个
  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // 最多上传 3 个音频参考
    const MAX_AUDIOS = 3;
    const currentCount = uploadedAudios.length;
    const remainingSlots = MAX_AUDIOS - currentCount;
    
    if (remainingSlots <= 0) {
      toast('最多只能上传 3 个音频参考');
      event.target.value = '';
      return;
    }

    // 将 FileList 转为数组，只取还能容纳的数量
    const filesArray = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast(`最多还能上传 ${remainingSlots} 个音频参考，已自动截取前 ${remainingSlots} 个`);
    }

    // 支持的音频格式
    const ALLOWED_AUDIO_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3'];
    const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB

    setIsUploadingMedia(true);

    // 使用 indexRef 追踪序号（在循环中保持正确）
    const indexRef = { current: mediaState.nextAudioIndex };

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        
        // 检查文件类型
        if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
          toast(`音频 "${file.name}" 格式不支持。支持格式：WAV、MP3`);
          continue;
        }
        
        // 检查文件大小
        if (file.size > MAX_AUDIO_SIZE) {
          toast(`音频 "${file.name}" 超过 15MB 限制，请压缩后再上传`);
          continue;
        }

        // 获取当前序号并递增
        const currentIndex = indexRef.current++;

        try {
          const uploadResponse = await uploadMedia(file);
          
          if (uploadResponse.success && uploadResponse.data) {
            const { data } = uploadResponse;
            const audioId = `@音频${currentIndex}`;
            const key = audioId;

            const newMedia: UploadedMedia = {
              key,
              name: data.name,
              url: data.url,
              type: 'audio',
              size: data.size,
              thumbnailUrl: data.thumbnailUrl || data.url,
              storageKey: data.storageKey,
              createdAt: new Date().toISOString()
            };

            // 更新 mediaState（统一素材状态）
            setMediaState(prev => ({
              ...prev,
              audios: [...prev.audios, newMedia],
              nextAudioIndex: currentIndex + 1
            }));

            // 更新 uploadedAudios（兼容现有逻辑）
            setUploadedAudios(prev => [
              ...prev,
              {
                id: audioId,
                name: data.name,
                url: data.url,
                key: data.storageKey
              }
            ]);
          } else {
            console.error('音频上传失败:', uploadResponse.error);
            toast(`音频 "${file.name}" 上传失败`);
          }
        } catch (error) {
          console.error('处理音频失败:', error);
          toast(`处理音频 "${file.name}" 失败`);
        }
      }
    } finally {
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 删除已上传的音频参考
  const removeAudio = (audioId: string) => {
    // 找到要删除的音频
    const audioToDelete = uploadedAudios.find(a => a.id === audioId);
    const wasLastAudio = uploadedAudios.length === 1;
    const storageKeyToDelete = audioToDelete?.key;
    
    // 调用后端接口删除对象存储中的文件
    if (storageKeyToDelete) {
      deleteMedia(storageKeyToDelete).catch(err => console.error('删除音频文件失败:', err));
    }
    
    setUploadedAudios(prev => prev.filter(a => a.id !== audioId));
    
    // 同步更新统一素材状态
    if (storageKeyToDelete) {
      setMediaState(prev => {
        const newAudios = prev.audios.filter(m => m.storageKey !== storageKeyToDelete);
        
        // 如果删除后没有音频了，清空后端记录并重置计数
        if (newAudios.length === 0) {
          clearMediaByType('audio').catch(err => console.error('清空音频记录失败:', err));
          return {
            ...prev,
            audios: newAudios,
            nextAudioIndex: 1  // 重置为 1
          };
        }
        
        // 否则保持 nextIndex 不变
        return {
          ...prev,
          audios: newAudios
        };
      });
    }
    
    // 如果删除最后一个音频，关闭下拉列表
    if (wasLastAudio) {
      setMentionDropdownOpen(false);
    }
  };

  // 处理延长视频上传（1-3个视频片段）
  const handleExtendVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    // 最多上传 3 个视频片段
    const MAX_VIDEOS = 3;
    const currentCount = extendVideos.length;
    const remainingSlots = MAX_VIDEOS - currentCount;
    
    if (remainingSlots <= 0) {
      toast('最多只能上传 3 个视频片段');
      event.target.value = '';
      return;
    }

    // 将 FileList 转为数组，只取还能容纳的数量
    const filesArray = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      toast(`最多还能上传 ${remainingSlots} 个视频片段，已自动截取前 ${remainingSlots} 个`);
    }

    // 支持的视频格式
    const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      
      // 检查文件类型
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        toast(`视频 "${file.name}" 格式不支持。支持格式：MP4、MOV`);
        continue;
      }
      
      // 检查文件大小
      if (file.size > MAX_VIDEO_SIZE) {
        toast(`视频 "${file.name}" 超过 100MB 限制，请压缩后再上传`);
        continue;
      }

      try {
        // 直接上传文件（使用 FormData，无大小限制）
        const uploadResponse = await uploadMedia(file);
        
        if (uploadResponse.success && uploadResponse.data) {
          const videoId = `片段${currentCount + i + 1}`;
          setExtendVideos(prev => [
            ...prev,
            {
              id: videoId,
              name: file.name,
              url: uploadResponse.data!.url,
              key: uploadResponse.data!.storageKey
            }
          ]);
        } else {
          console.error('视频上传失败:', uploadResponse.error);
          toast(`视频 "${file.name}" 上传失败`);
        }
      } catch (error) {
        console.error('处理视频失败:', error);
        toast(`处理视频 "${file.name}" 失败`);
      }
    }

    event.target.value = '';
  };

  // 删除已上传的延长视频片段
  const removeExtendVideo = (videoId: string) => {
    setExtendVideos(prev => prev.filter(v => v.id !== videoId));
  };

  // 处理编辑视频上传（待编辑视频）
  const handleEditVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // 支持的视频格式
    const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

    // 检查文件类型
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast('视频格式不支持。支持格式：MP4、MOV');
      event.target.value = '';
      return;
    }
    
    // 检查文件大小
    if (file.size > MAX_VIDEO_SIZE) {
      toast('视频超过 100MB 限制，请压缩后再上传');
      event.target.value = '';
      return;
    }

    // 视频分辨率检查
    const resCheck = await checkVideoResolution(file);
    if (!resCheck.valid) {
      const dim = resCheck.width && resCheck.height ? `（${resCheck.width}×${resCheck.height}）` : '';
      toast.error(`视频分辨率过大${dim}，请压缩至 1080p 以下后重新上传`);
      event.target.value = '';
      return;
    }

    try {
      // 直接上传文件（使用 FormData，无大小限制）
      const uploadResponse = await uploadMedia(file);
      
      if (uploadResponse.success && uploadResponse.data) {
        setEditVideoFile({
          id: 'edit_video_1',
          name: file.name,
          url: uploadResponse.data.url,
          key: uploadResponse.data.storageKey
        });
      } else {
        console.error('视频上传失败:', uploadResponse.error);
        toast('视频上传失败');
      }
    } catch (error) {
      console.error('处理视频失败:', error);
      toast('处理视频失败');
    }

    event.target.value = '';
  };

  // 处理编辑参考图片上传
  const handleEditImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // 支持的图片格式
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    const MAX_IMAGE_SIZE = 30 * 1024 * 1024; // 30MB

    // 检查文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast('图片格式不支持。支持格式：JPG、PNG、WebP');
      event.target.value = '';
      return;
    }
    
    // 检查文件大小
    if (file.size > MAX_IMAGE_SIZE) {
      toast('图片超过 30MB 限制，请压缩后再上传');
      event.target.value = '';
      return;
    }

    try {
      // 直接上传文件（使用 FormData，无大小限制）
      const uploadResponse = await uploadImage(file);
      
      if (uploadResponse.success && uploadResponse.data) {
        setEditReferenceImage({
          id: 'ref_image_1',
          name: file.name,
          url: uploadResponse.data.url,
          key: uploadResponse.data.key
        });
      } else {
        console.error('图片上传失败:', uploadResponse.error);
        toast('图片上传失败');
      }
    } catch (error) {
      console.error('处理图片失败:', error);
      toast('处理图片失败');
    }

    event.target.value = '';
  };

  // 删除已上传的编辑视频
  const removeEditVideo = () => {
    setEditVideoFile(null);
  };

  // 删除已上传的编辑参考图片
  const removeEditImage = () => {
    setEditReferenceImage(null);
  };

  // 处理编辑视频提交
  const handleEditVideoGenerate = async () => {
    if (!editVideoFile) {
      toast('请上传待编辑视频');
      return;
    }
    if (!editPrompt.trim()) {
      toast('请输入编辑指令');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await editVideo({
        videoUrl: editVideoFile.url,
        imageUrl: editReferenceImage?.url,
        prompt: editPrompt
      });

      if (response.success) {
        await loadTasks();
        // 清空表单
        setEditVideoFile(null);
        setEditReferenceImage(null);
        setEditPrompt('');
      } else {
        toast(`编辑视频失败: ${response.error}`);
      }
    } catch (error) {
      console.error('编辑视频失败:', error);
      toast('编辑视频失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  // 处理延长视频提交
  const handleExtendVideoGenerate = async () => {
    if (extendVideos.length === 0) {
      toast('请至少上传 1 个视频片段');
      return;
    }
    if (!extendPrompt.trim()) {
      toast('请输入衔接描述');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await extendVideo({
        videoUrls: extendVideos.map(v => v.url),
        prompt: extendPrompt,
        ratio: extendRatio,
        duration: parseInt(extendDuration),
        generateAudio: extendGenerateAudio
      });

      if (response.success) {
        await loadTasks();
        // 清空表单
        setExtendVideos([]);
        setExtendPrompt('');
      } else {
        toast(`延长视频失败: ${response.error}`);
      }
    } catch (error) {
      console.error('延长视频失败:', error);
      toast('延长视频失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动超过 8px 才触发拖拽
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setUploadedImages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);

        // 只重新排序，不改变 id 和 displayIndex（保持引用一致性）
        const newItems = arrayMove(items, oldIndex, newIndex);

        // 同时更新 previewUrls（保持顺序一致）
        setPreviewUrls(newItems.map((img) => ({ id: img.id, url: img.url })));

        return newItems;
      });
    }
  };

  // 删除已上传的图片（同时删除本地状态和对象存储中的文件）
  const removeImage = async (imageId: string) => {
    // 找到要删除的图片
    const imageToDelete = uploadedImages.find(img => img.id === imageId);
    const wasLastImage = uploadedImages.length === 1;
    
    // 调用后端接口删除对象存储中的文件
    const storageKeyToDelete = imageToDelete?.key;
    if (storageKeyToDelete) {
      try {
        await deleteImage(storageKeyToDelete);
      } catch (error) {
        console.error('删除图片文件失败:', error);
        // 即使删除失败，也继续删除本地状态
      }
    }
    
    // 删除本地状态
    setUploadedImages((prev) => {
      return prev.filter(img => img.id !== imageId);
    });
    setPreviewUrls((prev) => {
      return prev.filter(img => img.id !== imageId);
    });
    
    // 同步更新统一素材状态
    if (storageKeyToDelete) {
      setMediaState(prev => {
        const newImages = prev.images.filter(m => m.storageKey !== storageKeyToDelete);
        
        // 如果删除后没有图片了，清空后端记录并重置计数
        if (newImages.length === 0) {
          clearMediaByType('image').catch(err => console.error('清空图片记录失败:', err));
          return {
            ...prev,
            images: newImages,
            nextImageIndex: 1  // 重置为 1
          };
        }
        
        // 否则保持 nextIndex 不变
        return {
          ...prev,
          images: newImages
        };
      });
    }
    
    // 如果删除最后一个素材，关闭下拉列表
    if (wasLastImage) {
      setMentionDropdownOpen(false);
    }
  };
  
  // 重新生成（从失败/成功任务恢复）
  const handleRetryGenerate = (task: TaskRecord) => {
    // 切换到对应的模式
    setMode(task.mode as GenerationMode);
    
    // 还原模型和参数设置
    if (task.model_id) {
      setModel(task.model_id);
    }
    // 从 metadata 中还原 ratio 和 duration
    const metaRatio = task.metadata?.ratio as string | undefined;
    if (metaRatio) {
      setRatio(metaRatio);
    }
    const metaDuration = task.metadata?.duration as number | undefined;
    if (metaDuration) {
      setDuration(String(metaDuration));
    }
    
    // 还原 Prompt 到对应的输入框
    if (task.mode === 'single') {
      setPrompt(task.original_prompt || task.prompt);
    } else if (task.mode === 'extend') {
      setExtendPrompt(task.original_prompt || task.prompt);
    } else if (task.mode === 'edit') {
      setEditPrompt(task.original_prompt || task.prompt);
    } else {
      // 批量模式：更新第一个任务的内容和素材
      const allImageUrls = task.all_image_urls || [];
      const imageOrderUrls = task.image_order || [];
      let imagesToRestore = imageOrderUrls.length >= allImageUrls.length && imageOrderUrls.length > 0
        ? imageOrderUrls
        : (allImageUrls.length > 0 ? allImageUrls : (task.image_urls || []));
      imagesToRestore = [...new Set(imagesToRestore)];
      const taskVideoUrls = (task.metadata?.video_urls as string[]) || [];
      const taskAudioUrls = (task.metadata?.audio_urls as string[]) || [];

      setBatchTasks([{
        id: '1',
        content: task.original_prompt || task.prompt,
        images: imagesToRestore.map((url, index) => ({
          id: `图${index + 1}`,
          name: `图片${index + 1}`,
          url,
          thumbnail: url,
          displayIndex: index + 1,
          uploadOrder: index + 1
        })),
        videos: taskVideoUrls.map((url, index) => ({
          id: `@视频${index + 1}`,
          name: `视频${index + 1}`,
          url,
          key: ''
        })),
        audios: taskAudioUrls.map((url, index) => ({
          id: `@音频${index + 1}`,
          name: `音频${index + 1}`,
          url,
          key: ''
        })),
        nextImageIndex: imagesToRestore.length + 1,
        nextVideoIndex: taskVideoUrls.length + 1,
        nextAudioIndex: taskAudioUrls.length + 1,
        duration: (task.metadata?.duration as number) || 5
      }]);
    }

    // 如果有参考图片，还原到上传区域（URL 有效期 7 天，无需重新上传）
    // 批量模式下不需要还原全局素材（已内联到 batchTasks）
    // all_image_urls 包含提交时的全部图片，image_order 包含拖拽后的顺序
    // 优先使用 image_order（保持拖拽顺序），其次 all_image_urls，最后 image_urls（仅引用的图片，旧数据兼容）
    const allImageUrls = task.all_image_urls || [];
    const imageOrderUrls = task.image_order || [];
    // 优先使用 image_order 如果可用且长度与 all_image_urls 一致（说明是完整顺序），
    // 否则使用 all_image_urls（图片数可能比 image_order 多，如旧数据中 image_order 只记录了引用的图片）
    // 去重：历史数据可能包含重复 URL，避免恢复时重复
    let imagesToRestore = imageOrderUrls.length >= allImageUrls.length && imageOrderUrls.length > 0
      ? imageOrderUrls
      : (allImageUrls.length > 0 ? allImageUrls : (task.image_urls || []));
    imagesToRestore = [...new Set(imagesToRestore)];
    
    if (imagesToRestore.length > 0) {
      const restoredImages = imagesToRestore.map((url, index) => ({
        id: `图${index + 1}`,  // 根据顺序分配 ID
        name: `图片${index + 1}`,
        url: url,
        thumbnail: url,
        displayIndex: index + 1,  // displayIndex 与顺序对应
        uploadOrder: index + 1    // 原始上传顺序
      }));
      setUploadedImages(restoredImages);
      setPreviewUrls(restoredImages.map(img => ({ id: img.id, url: img.url })));
      
      // 同步更新统一素材状态
      setMediaState(prev => ({
        ...prev,
        images: restoredImages.map((img, idx) => ({
          key: `@图${idx + 1}`,
          name: img.name,
          url: img.url,
          type: 'image' as const,
          size: 0,
          thumbnailUrl: img.url,
          createdAt: new Date().toISOString()
        })),
        nextImageIndex: restoredImages.length + 1
      }));
    } else {
      // 清空图片状态
      setUploadedImages([]);
      setPreviewUrls([]);
      setMediaState(prev => ({
        ...prev,
        images: [],
        nextImageIndex: 1
      }));
    }
    
    // 还原视频参考：批量/extend 任务在 metadata.video_urls 中，edit 任务在 metadata.video_url 中
    const meta = task.metadata || {};
    const videoUrls =
      (meta.video_urls as string[] | undefined) ||
      ((meta.video_url as string | undefined) ? [meta.video_url as string] : undefined);
    if (videoUrls && videoUrls.length > 0) {
      const restoredVideos = videoUrls.map((url, index) => ({
        id: `视频${index + 1}`,
        name: `视频${index + 1}`,
        url: url
      }));
      setUploadedVideos(restoredVideos);
      
      // 同步更新统一素材状态
      setMediaState(prev => ({
        ...prev,
        videos: restoredVideos.map((v, idx) => ({
          key: `@视频${idx + 1}`,
          name: v.name,
          url: v.url,
          type: 'video' as const,
          size: 0,
          createdAt: new Date().toISOString()
        })),
        nextVideoIndex: restoredVideos.length + 1
      }));
    } else {
      // 清空视频状态
      setUploadedVideos([]);
      setMediaState(prev => ({
        ...prev,
        videos: [],
        nextVideoIndex: 1
      }));
    }
    
    // 还原音频参考（从 metadata 中读取）
    const audioUrls = task.metadata?.audio_urls as string[] | undefined;
    if (audioUrls && audioUrls.length > 0) {
      const restoredAudios = audioUrls.map((url, index) => ({
        id: `音频${index + 1}`,
        name: `音频${index + 1}`,
        url: url
      }));
      setUploadedAudios(restoredAudios);
      
      // 同步更新统一素材状态
      setMediaState(prev => ({
        ...prev,
        audios: restoredAudios.map((a, idx) => ({
          key: `@音频${idx + 1}`,
          name: a.name,
          url: a.url,
          type: 'audio' as const,
          size: 0,
          createdAt: new Date().toISOString()
        })),
        nextAudioIndex: restoredAudios.length + 1
      }));
    } else {
      // 清空音频状态
      setUploadedAudios([]);
      setMediaState(prev => ({
        ...prev,
        audios: [],
        nextAudioIndex: 1
      }));
    }
    
    // 滚动到输入区域
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 延长视频模式：还原视频片段
    if (task.mode === 'extend' && videoUrls && videoUrls.length > 0) {
      const restoredExtendVideos = videoUrls.map((url, index) => ({
        id: `延长视频${index + 1}`,
        name: `视频片段${index + 1}`,
        url: url
      }));
      setExtendVideos(restoredExtendVideos);
    }
    
    // 编辑视频模式：还原视频文件和参考图片
    if (task.mode === 'edit') {
      if (videoUrls && videoUrls.length > 0) {
        setEditVideoFile({
          id: '编辑视频',
          name: '视频文件',
          url: videoUrls[0]
        });
      }
      // 还原编辑参考图片
      const editImageUrl = task.image_urls?.[0] || (task.all_image_urls?.[0]);
      if (editImageUrl) {
        setEditReferenceImage({
          id: '参考图片',
          name: '参考图片',
          url: editImageUrl
        });
      }
    }
  };

  // 添加视频任务
  const addBatchTask = () => {
    if (batchTasks.length >= MAX_BATCH_TASKS) {
      toast(`视频任务数量已达上限（${MAX_BATCH_TASKS}个），请先处理当前任务`);
      return;
    }
    setBatchTasks(prev => [
      ...prev,
      { id: `task_${Date.now()}`, content: '', images: [], videos: [], audios: [], nextImageIndex: 1, nextVideoIndex: 1, nextAudioIndex: 1, duration: 5 }
    ]);
  };

  // 删除分镜
  const removeStoryboard = (id: string) => {
    if (batchTasks.length > 1) {
      setBatchTasks(prev => prev.filter(sb => sb.id !== id));
    }
  };

  // 更新分镜内容
  const updateStoryboard = (id: string, content: string) => {
    setBatchTasks(prev =>
      prev.map(sb => sb.id === id ? { ...sb, content } : sb)
    );
  };

  // 更新单条任务的时长
  const updateTaskDuration = (id: string, newDuration: number) => {
    setBatchTasks(prev =>
      prev.map(sb => sb.id === id ? { ...sb, duration: newDuration } : sb)
    );
  };

  // ========== 每任务独立素材上传/删除 ==========

  // 处理指定任务的图片上传
  const handleTaskImageUpload = async (taskId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const task = batchTasks.find(t => t.id === taskId);
    if (!task) return;

    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/gif'];
    const HEIC_TYPES = ['image/heic', 'image/heif'];
    const allAllowedTypes = model === 'doubao-seedance-1-5-pro'
      ? [...ALLOWED_IMAGE_TYPES, ...HEIC_TYPES]
      : ALLOWED_IMAGE_TYPES;
    const MAX_IMAGES = model === 'seedance2.0' ? 9 : 4;
    const remainingSlots = MAX_IMAGES - task.images.length;

    if (remainingSlots <= 0) {
      toast(`当前模型最多支持上传${MAX_IMAGES}张图片`);
      event.target.value = '';
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast(`最多还能上传${remainingSlots}张图片，已自动截取前${remainingSlots}张`);
    }

    setIsUploadingMedia(true);
    const newImages: UploadedImage[] = [];
    let nextIndex = task.nextImageIndex;

    try {
      for (const file of filesArray) {
        if (!allAllowedTypes.includes(file.type)) {
          toast(`图片 "${file.name}" 格式不支持`);
          continue;
        }
        if (file.size > 30 * 1024 * 1024) {
          toast(`图片 "${file.name}" 超过 30MB 限制`);
          continue;
        }
        try {
          const res = await uploadMedia(file);
          if (res.success && res.data) {
            const imageId = `图${nextIndex}`;
            newImages.push({
              id: imageId,
              name: res.data.name,
              url: res.data.url,
              thumbnail: res.data.url,
              key: res.data.storageKey,
              displayIndex: nextIndex,
              uploadOrder: nextIndex
            });
            nextIndex++;
          } else {
            toast(`图片 "${file.name}" 上传失败`);
          }
        } catch {
          toast(`处理图片 "${file.name}" 失败`);
        }
      }
    } finally {
      if (newImages.length > 0) {
        setBatchTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, images: [...t.images, ...newImages], nextImageIndex: nextIndex }
            : t
        ));
      }
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 删除指定任务的图片
  const removeTaskImage = (taskId: string, imageId: string) => {
    const task = batchTasks.find(t => t.id === taskId);
    const imageToDelete = task?.images.find(img => img.id === imageId);
    if (imageToDelete?.key) {
      deleteImage(imageToDelete.key).catch(err => console.error('删除图片失败:', err));
    }
    setBatchTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, images: t.images.filter(img => img.id !== imageId) }
        : t
    ));
  };

  // 处理指定任务的视频上传
  const handleTaskVideoUpload = async (taskId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const task = batchTasks.find(t => t.id === taskId);
    if (!task) return;

    const MAX_VIDEOS = 3;
    const remainingSlots = MAX_VIDEOS - task.videos.length;
    if (remainingSlots <= 0) {
      toast('最多只能上传 3 个视频参考');
      event.target.value = '';
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast(`最多还能上传 ${remainingSlots} 个视频参考`);
    }

    const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
    setIsUploadingMedia(true);
    const newVideos: BatchTaskItem['videos'] = [];
    let nextIndex = task.nextVideoIndex;

    try {
      for (const file of filesArray) {
        if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
          toast(`视频 "${file.name}" 格式不支持`);
          continue;
        }
        if (file.size > MAX_VIDEO_SIZE) {
          toast(`视频 "${file.name}" 超过 100MB 限制`);
          continue;
        }

        // 视频分辨率检查
        const resCheck = await checkVideoResolution(file);
        if (!resCheck.valid) {
          const dim = resCheck.width && resCheck.height ? `（${resCheck.width}×${resCheck.height}）` : '';
          toast.error(`视频 "${file.name}" 分辨率过大${dim}，请压缩至 1080p 以下后重新上传`);
          continue;
        }

        try {
          const res = await uploadMedia(file);
          if (res.success && res.data) {
            const videoId = `@视频${nextIndex}`;
            newVideos.push({ id: videoId, name: res.data.name, url: res.data.url, key: res.data.storageKey });
            nextIndex++;
          } else {
            toast(`视频 "${file.name}" 上传失败`);
          }
        } catch {
          toast(`处理视频 "${file.name}" 失败`);
        }
      }
    } finally {
      if (newVideos.length > 0) {
        setBatchTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, videos: [...t.videos, ...newVideos], nextVideoIndex: nextIndex }
            : t
        ));
      }
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 删除指定任务的视频
  const removeTaskVideo = (taskId: string, videoId: string) => {
    const task = batchTasks.find(t => t.id === taskId);
    const videoToDelete = task?.videos.find(v => v.id === videoId);
    if (videoToDelete?.key) {
      deleteMedia(videoToDelete.key).catch(err => console.error('删除视频失败:', err));
    }
    setBatchTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, videos: t.videos.filter(v => v.id !== videoId) }
        : t
    ));
  };

  // 处理指定任务的音频上传
  const handleTaskAudioUpload = async (taskId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const task = batchTasks.find(t => t.id === taskId);
    if (!task) return;

    const MAX_AUDIOS = 3;
    const remainingSlots = MAX_AUDIOS - task.audios.length;
    if (remainingSlots <= 0) {
      toast('最多只能上传 3 个音频参考');
      event.target.value = '';
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast(`最多还能上传 ${remainingSlots} 个音频参考`);
    }

    const ALLOWED_AUDIO_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3'];
    const MAX_AUDIO_SIZE = 15 * 1024 * 1024;
    setIsUploadingMedia(true);
    const newAudios: BatchTaskItem['audios'] = [];
    let nextIndex = task.nextAudioIndex;

    try {
      for (const file of filesArray) {
        if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
          toast(`音频 "${file.name}" 格式不支持`);
          continue;
        }
        if (file.size > MAX_AUDIO_SIZE) {
          toast(`音频 "${file.name}" 超过 15MB 限制`);
          continue;
        }
        try {
          const res = await uploadMedia(file);
          if (res.success && res.data) {
            const audioId = `@音频${nextIndex}`;
            newAudios.push({ id: audioId, name: res.data.name, url: res.data.url, key: res.data.storageKey });
            nextIndex++;
          } else {
            toast(`音频 "${file.name}" 上传失败`);
          }
        } catch {
          toast(`处理音频 "${file.name}" 失败`);
        }
      }
    } finally {
      if (newAudios.length > 0) {
        setBatchTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, audios: [...t.audios, ...newAudios], nextAudioIndex: nextIndex }
            : t
        ));
      }
      setIsUploadingMedia(false);
      event.target.value = '';
    }
  };

  // 删除指定任务的音频
  const removeTaskAudio = (taskId: string, audioId: string) => {
    const task = batchTasks.find(t => t.id === taskId);
    const audioToDelete = task?.audios.find(a => a.id === audioId);
    if (audioToDelete?.key) {
      deleteMedia(audioToDelete.key).catch(err => console.error('删除音频失败:', err));
    }
    setBatchTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, audios: t.audios.filter(a => a.id !== audioId) }
        : t
    ));
  };

  // 构建任务的媒体状态（用于 MentionDropdown）
  const buildTaskMediaState = (task: BatchTaskItem): UnifiedMediaState => ({
    images: task.images.map((img) => ({
      key: `@图${img.displayIndex}`,
      name: img.name,
      url: img.url,
      type: 'image' as const,
      size: 0,
      thumbnailUrl: img.thumbnail || img.url,
      storageKey: img.key,
      createdAt: new Date().toISOString()
    })),
    videos: task.videos.map((v) => ({
      key: v.id,
      name: v.name,
      url: v.url,
      type: 'video' as const,
      size: 0,
      storageKey: v.key,
      createdAt: new Date().toISOString()
    })),
    audios: task.audios.map((a) => ({
      key: a.id,
      name: a.name,
      url: a.url,
      type: 'audio' as const,
      size: 0,
      storageKey: a.key,
      createdAt: new Date().toISOString()
    })),
    nextImageIndex: task.nextImageIndex,
    nextVideoIndex: task.nextVideoIndex,
    nextAudioIndex: task.nextAudioIndex
  });

  // 处理 prompt 输入 - 检测 @ 触发
  const handlePromptInput = (
    value: string, 
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    setter(value);
    
    // 检测 @ 触发下拉列表（图片、视频、音频任一上传即可触发）
    const hasAnyMedia = uploadedImages.length > 0 || uploadedVideos.length > 0 || uploadedAudios.length > 0;
    if (!hasAnyMedia) {
      setMentionPopoverOpen(false);
      return;
    }
    
    const cursorPos = promptTextareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    
    // 查找最后一个 @ 符号
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // 检查 @ 是否是新输入的（后面没有引用格式的内容）
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // 支持的格式：图、数字、视频、音频
      const isValidMention = !/^[图视频音\d]/.test(textAfterAt);
      
      if (isValidMention && !/[\s\n]/.test(textAfterAt)) {
        // 获取 @ 后的搜索文本
        setMentionSearchText(textAfterAt.toLowerCase());
        setMentionPopoverOpen(true);
        
        // 根据搜索文本判断用户想引用哪种类型
        if (textAfterAt.startsWith('图')) {
          setMentionType('image');
        } else if (textAfterAt.startsWith('视频')) {
          setMentionType('video');
        } else if (textAfterAt.startsWith('音频')) {
          setMentionType('audio');
        } else {
          setMentionType('all');
        }
      } else {
        setMentionPopoverOpen(false);
      }
    } else {
      setMentionPopoverOpen(false);
    }
  };
  
  // 优化提示词
  const optimizePrompt = async (originalPrompt: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (!originalPrompt.trim()) {
      toast('请先输入提示词内容');
      return;
    }

    setIsOptimizingPrompt(true);
    setOptimizedPrompt('');

    try {
      const response = await fetch('/api/v1/optimize-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: originalPrompt }),
      });

      if (!response.ok) {
        throw new Error('优化失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setOptimizedPrompt(fullContent);
              }
              if (data.done) {
                // 优化完成后，将优化结果填入输入框
                setter(fullContent);
                setIsOptimizingPrompt(false);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      if (fullContent) {
        setter(fullContent);
      }
    } catch (error) {
      console.error('优化提示词失败:', error);
      toast('优化失败，请重试');
    } finally {
      setIsOptimizingPrompt(false);
      setOptimizedPrompt('');
    }
  };
  
  // 解析 prompt 中的媒体引用，返回引用的 ID 列表
  const extractMediaReferences = (text: string): { images: string[]; videos: string[]; audios: string[] } => {
    const images: string[] = [];
    const videos: string[] = [];
    const audios: string[] = [];
    
    // 匹配 @图X 或 @图XX 格式
    const imagePattern = /@图(\d+)/g;
    let match;
    while ((match = imagePattern.exec(text)) !== null) {
      images.push(match[1]);
    }
    
    // 匹配 @视频X 或 @视频XX 格式
    const videoPattern = /@视频(\d+)/g;
    while ((match = videoPattern.exec(text)) !== null) {
      videos.push(match[1]);
    }
    
    // 匹配 @音频X 或 @音频XX 格式
    const audioPattern = /@音频(\d+)/g;
    while ((match = audioPattern.exec(text)) !== null) {
      audios.push(match[1]);
    }
    
    return { images, videos, audios };
  };

  // 插入媒体引用（修复：使用 activeTextareaRef 正确处理所有模式）
  // forceSetter: 指定目标 setter，绕过 activeTextareaRef，用于批量任务角标点击等场景
  const insertMediaReference = (type: 'image' | 'video' | 'audio', mediaId: string, currentValue: string, forceSetter?: (value: string) => void) => {
    const prefixMap = { image: '图', video: '视频', audio: '音频' };
    const prefix = prefixMap[type];

    // 强制模式：直接更新指定目标，不依赖 activeTextareaRef（修复批量任务角标指向错误 textarea 的问题）
    if (forceSetter) {
      const lastAtIndex = currentValue.lastIndexOf('@');
      let newValue: string;

      if (lastAtIndex !== -1) {
        // 如果内容中有 @，替换最后一个 @
        const textBefore = currentValue.slice(0, lastAtIndex);
        const textAfter = currentValue.slice(lastAtIndex + 1);
        newValue = `${textBefore}@${prefix}${mediaId} ${textAfter}`;
      } else {
        // 没有 @，在末尾追加
        const separator = currentValue.length > 0 && !currentValue.endsWith(' ') && !currentValue.endsWith('\n') ? ' ' : '';
        newValue = `${currentValue}${separator}@${prefix}${mediaId} `;
      }

      forceSetter(newValue);
      setMentionPopoverOpen(false);
      setMentionType('all');
      return;
    }

    // 优先使用当前焦点的 textarea
    const textarea = activeTextareaRef.current?.element || promptTextareaRef.current;
    if (!textarea) return;

    // 获取正确的光标位置（如果 textarea 仍有焦点，selectionStart 可靠；否则用缓存值兜底）
    const isTextareaFocused = document.activeElement === textarea;
    const selectionStart = textarea.selectionStart;
    const cursorPos = (isTextareaFocused && selectionStart !== null && selectionStart !== undefined)
      ? selectionStart
      : cachedCursorPosRef.current;
    const textBeforeCursor = currentValue.slice(0, cursorPos);
    const textAfterCursor = currentValue.slice(cursorPos);

    // 找到最后一个 @ 符号
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // 替换 @ 为 @图X / @视频X / @音频X
      const newTextBeforeCursor = textBeforeCursor.slice(0, lastAtIndex);
      const newValue = `${newTextBeforeCursor}@${prefix}${mediaId} ${textAfterCursor}`;

      // 根据当前焦点更新对应的状态（与 handleMediaSelect 保持一致）
      const activeId = activeTextareaRef.current?.id;

      if (activeId === 'edit') {
        setEditPrompt(newValue);
      } else if (activeId === 'extend') {
        setExtendPrompt(newValue);
      } else if (activeId?.startsWith('batch-')) {
        // 批量生成模式，更新对应的分镜
        const sbId = activeId.replace('batch-', '');
        updateStoryboard(sbId, newValue);
      } else if (mode === 'single') {
        setPrompt(newValue);
      } else {
        // 分镜模式，更新第一个分镜
        const firstSb = batchTasks[0];
        if (firstSb) {
          updateStoryboard(firstSb.id, newValue);
        }
      }

      setMentionPopoverOpen(false);
      setMentionType('all');

      // 设置光标位置到插入内容之后
      setTimeout(() => {
        const newPos = lastAtIndex + prefix.length + mediaId.length + 2; // @ + 前缀 + ID + 空格
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // 生成视频
  const handleGenerate = async () => {
    if (mode === 'single') {
      // 单次生成模式
      if (!prompt.trim()) {
        toast('请输入剧本内容');
        return;
      }

      setIsGenerating(true);

      try {
        // 解析 prompt 中的媒体引用
        const { images: refImages, videos: refVideos, audios: refAudios } = extractMediaReferences(prompt);
        
        // 获取引用的媒体 URL（去重：同一图片/视频/音频在 prompt 中多次引用时只发送一次 URL）
        const referencedImageUrls = [...new Set(refImages
          .map(id => uploadedImages.find(img => img.id === `图${id}`)?.url || uploadedImages.find(img => img.id === id)?.url)
          .filter(Boolean) as string[])];
        const referencedVideoUrls = [...new Set(refVideos
          .map(id => uploadedVideos.find(v => v.id === `视频${id}`)?.url || uploadedVideos.find(v => v.id === id)?.url)
          .filter(Boolean) as string[])];
        const referencedAudioUrls = [...new Set(refAudios
          .map(id => uploadedAudios.find(a => a.id === `音频${id}`)?.url || uploadedAudios.find(a => a.id === id)?.url)
          .filter(Boolean) as string[])];
        
        const response = await generateVideo({
          prompt: prompt,
          mode,
          model,
          resolution,
          ratio,
          duration: parseInt(duration),
          // images 始终传递全部上传的图片，用于后端存储 all_image_urls（重新生成时还原）
          // 去重：防止同一 URL 被多次添加
          images: uploadedImages.length > 0 ? [...new Set(uploadedImages.map(img => img.url))] : undefined,
          // referencedImages 传递被 @图X 引用的图片，后端用于实际生成
          // 无引用时后端会使用 images（全部图片）
          referencedImages: referencedImageUrls.length > 0 ? referencedImageUrls : undefined,
          videoUrls: referencedVideoUrls.length > 0 ? referencedVideoUrls : (uploadedVideos.length > 0 ? uploadedVideos.map(v => v.url) : undefined),
          audioUrls: referencedAudioUrls.length > 0 ? referencedAudioUrls : (uploadedAudios.length > 0 ? uploadedAudios.map(a => a.url) : undefined),
          generateAudio,
          // 传递图片顺序，用于记录拖拽后的顺序（去重）
          imageOrder: uploadedImages.length > 0 ? [...new Set(uploadedImages.map(img => img.url))] : undefined
        });

        if (response.success) {
          await loadTasks();
          setPrompt('');
          setUploadedImages([]);  // 清空图片状态，避免累积
          // 清空统一素材状态
          setMediaState({
            images: [],
            videos: [],
            audios: [],
            nextImageIndex: 1,
            nextVideoIndex: 1,
            nextAudioIndex: 1
          });
        } else {
          // 生成失败后也要清空图片状态，避免累积
          setUploadedImages([]);
          // 清空统一素材状态
          setMediaState({
            images: [],
            videos: [],
            audios: [],
            nextImageIndex: 1,
            nextVideoIndex: 1,
            nextAudioIndex: 1
          });
          toast(`生成失败: ${response.error}`);
        }
      } catch (error) {
        console.error('生成失败:', error);
        toast('生成失败，请重试');
      } finally {
        setIsGenerating(false);
      }
    } else {
      // 分镜模式 - 采用批量生成逻辑
      handleBatchGenerate();
    }
  };

  // 批量生成 - 同时发起多个任务
  const handleBatchGenerate = async () => {
    const validPrompts = batchTasks.filter(sb => sb.content.trim());
    
    if (validPrompts.length === 0) {
      toast('请至少输入一个视频任务内容');
      return;
    }

    setIsGenerating(true);

    try {
      // 准备 prompt 列表
      const prompts = validPrompts.map(sb => sb.content);

      // 准备每任务独立素材（含独立时长）
      const taskItems = validPrompts.map(sb => ({
        prompt: sb.content,
        images: sb.images.map(img => img.url),
        videos: sb.videos.map(v => v.url),
        audios: sb.audios.map(a => a.url),
        duration: sb.duration
      }));

      // 调用批量生成接口（后端会生成 batch_id）
      const response = await batchGenerateVideo({
        prompts,
        mode: 'batch',
        model,
        resolution,
        ratio,
        duration: parseInt(duration),
        generateAudio,
        useOfflineInference,
        taskItems
      });

      if (response.success) {
        await loadTasks();
        setBatchTasks([{ id: '1', content: '', images: [], videos: [], audios: [], nextImageIndex: 1, nextVideoIndex: 1, nextAudioIndex: 1, duration: 5 }]);
      } else {
        toast(`批量生成失败: ${response.error}`);
      }
    } catch (error) {
      console.error('批量生成失败:', error);
      toast('批量生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  // 处理任务选择
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    const completedTasks = tasks.filter(t => t.status === TaskStatus.SUCCESS && t.result_url);
    
    if (selectedTasks.size === completedTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(completedTasks.map(t => t.task_id)));
    }
  };

  // 批量下载
  const handleBatchDownload = async () => {
    const selectedTaskList = tasks.filter(t => selectedTasks.has(t.task_id) && t.result_url);
    let successCount = 0;
    let failCount = 0;
    
    for (const task of selectedTaskList) {
      if (task.result_url) {
        const filename = `video_${task.task_id.slice(0, 8)}.mp4`;
        try {
          await downloadVideo(task.result_url, filename);
          successCount++;
        } catch {
          failCount++;
          toast.error(`下载 ${filename} 失败`);
        }
        // 等待一小段时间再下载下一个
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (failCount > 0) {
      toast.error(`批量下载完成：成功 ${successCount} 个，失败 ${failCount} 个`);
    } else if (successCount > 0) {
      toast.success(`成功下载 ${successCount} 个视频`);
    }
  };

  // 删除任务
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    const response = await deleteTask(taskId);
    if (response.success) {
      setSelectedTasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      await loadTasks();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* 头部 */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">AI制作中台</h1>
              <p className="text-sm text-slate-500">视频生成平台 V1.0</p>
            </div>
            {currentUser && (
              <div className="flex items-center gap-4">
                {(currentUser.role === 'admin' || currentUser.role === 'super_admin') && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push('/users')}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    成员管理
                  </Button>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">
                    {currentUser.username}
                    <Badge variant="secondary" className="ml-2">
                      {currentUser.role === 'super_admin' ? '超级管理员' : currentUser.role === 'admin' ? '管理员' : '成员'}
                    </Badge>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1" />
                  登出
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 主功能标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="script" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              分镜脚本
            </TabsTrigger>
            <TabsTrigger value="image" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              图片生成
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              视频生成
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              编辑视频
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              配音
            </TabsTrigger>
          </TabsList>

          {/* 分镜脚本标签页 */}
          <TabsContent value="script" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>分镜脚本</CardTitle>
                <CardDescription>
                  管理剧本分镜，查看和编辑故事结构（V1.0 暂未开放）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">即将推出</p>
                  <p className="text-sm">分镜脚本管理功能正在开发中</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 图片生成标签页 */}
          <TabsContent value="image" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>图片生成</CardTitle>
                <CardDescription>
                  根据文本描述生成高质量图片（V1.0 暂未开放）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Image className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">即将推出</p>
                  <p className="text-sm">图片生成功能正在开发中</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 视频生成标签页 */}
          <TabsContent value="video" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 左侧：输入区域 */}
              <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>视频生成</CardTitle>
                <CardDescription>
                  输入剧本内容，支持上传图片并通过 @图1 @图2 引用
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 模式切换 */}
                <Tabs value={mode} onValueChange={(v) => setMode(v as GenerationMode)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="single" className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      单次生成
                    </TabsTrigger>
                    <TabsTrigger value="batch" className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      批量生成
                    </TabsTrigger>
                  </TabsList>

                  {/* 单次生成 */}
                  <TabsContent value="single" className="space-y-4 mt-4">
                    <div className="relative">
                      <Textarea
                        ref={promptTextareaRef}
                        placeholder="输入剧本内容...
例如：夕阳下的海边小镇，一位年轻画家正在描绘日落... 输入 @ 引用上传的图片/视频/音频，也可直接 Ctrl+V 粘贴图片/视频/音频"
                        value={prompt}
                        onChange={(e) => handlePromptInput(e.target.value, setPrompt)}
                        onSelect={() => updateCursorCache()}
                        onBlur={() => updateCursorCache()}
                        onFocus={() => {
                          activeTextareaRef.current = {
                            element: promptTextareaRef.current,
                            id: 'single',
                            setter: setPrompt,
                            getValue: () => prompt
                          };
                        }}
                        rows={8}
                        className="resize-none pr-12"
                        disabled={isOptimizingPrompt}
                      />
                      {/* @ 引用按钮 */}
                      <button
                        onClick={handleMentionButtonClick}
                        onMouseDown={(e) => e.preventDefault()}
                        className="absolute right-3 bottom-3 w-8 h-8 rounded-full border-2 border-slate-300 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center text-slate-500 hover:text-primary"
                        title="引用素材"
                      >
                        <span className="text-sm font-bold">@</span>
                      </button>
                      {/* @ 引用下拉列表 */}
                      {mentionDropdownOpen && (
                        <MentionDropdown
                          open={mentionDropdownOpen}
                          onClose={() => setMentionDropdownOpen(false)}
                          mediaState={mediaState}
                          onSelect={handleMediaSelect}
                          onUpload={triggerMediaUpload}
                          position={{ top: -8, right: 0 }}
                          isLoading={isUploadingMedia}
                        />
                      )}
                      {/* 媒体引用下拉列表 */}
                      {mentionPopoverOpen && (
                        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden" onMouseDown={(e) => e.preventDefault()}>
                          <div className="p-2 border-b bg-slate-50">
                            <p className="text-xs text-slate-500">
                              选择媒体引用 {mentionSearchText && `（搜索: ${mentionSearchText}）`}
                            </p>
                          </div>
                          <div className="max-h-80 overflow-y-auto">
                            {/* 图片分组 */}
                            {(mentionType === 'all' || mentionType === 'image') && uploadedImages.length > 0 && (
                              <>
                                <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1">
                                  <Image className="h-3 w-3" /> 图片
                                </div>
                                {uploadedImages
                                  .filter(img => 
                                    mentionSearchText === '' || 
                                    img.id.toLowerCase().includes(mentionSearchText) || 
                                    img.name.toLowerCase().includes(mentionSearchText)
                                  )
                                  .map((img, index) => (
                                    <button
                                      key={img.id}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                      onClick={() => insertMediaReference('image', String(index + 1), prompt)}
                                    >
                                      <img
                                        src={img.url}
                                        alt={img.id}
                                        className="w-10 h-10 object-cover rounded border"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">@图{index + 1}</p>
                                        <p className="text-xs text-slate-400 truncate">{img.name}</p>
                                      </div>
                                    </button>
                                  ))}
                              </>
                            )}
                            
                            {/* 视频分组 */}
                            {(mentionType === 'all' || mentionType === 'video') && uploadedVideos.length > 0 && (
                              <>
                                <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1 border-t">
                                  <Video className="h-3 w-3" /> 视频
                                </div>
                                {uploadedVideos
                                  .filter(video => 
                                    mentionSearchText === '' || 
                                    video.id.toLowerCase().includes(mentionSearchText) || 
                                    video.name.toLowerCase().includes(mentionSearchText)
                                  )
                                  .map((video, index) => (
                                    <button
                                      key={video.id}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                      onClick={() => insertMediaReference('video', String(index + 1), prompt)}
                                    >
                                      <Video className="h-10 w-10 text-slate-300 rounded border bg-slate-50 flex items-center justify-center" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">@视频{index + 1}</p>
                                        <p className="text-xs text-slate-400 truncate">{video.name}</p>
                                      </div>
                                    </button>
                                  ))}
                              </>
                            )}
                            
                            {/* 音频分组 */}
                            {(mentionType === 'all' || mentionType === 'audio') && uploadedAudios.length > 0 && (
                              <>
                                <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1 border-t">
                                  <AudioLines className="h-3 w-3" /> 音频
                                </div>
                                {uploadedAudios
                                  .filter(audio => 
                                    mentionSearchText === '' || 
                                    audio.id.toLowerCase().includes(mentionSearchText) || 
                                    audio.name.toLowerCase().includes(mentionSearchText)
                                  )
                                  .map((audio, index) => (
                                    <button
                                      key={audio.id}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                      onClick={() => insertMediaReference('audio', String(index + 1), prompt)}
                                    >
                                      <AudioLines className="h-10 w-10 text-slate-300 rounded border bg-slate-50 flex items-center justify-center" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">@音频{index + 1}</p>
                                        <p className="text-xs text-slate-400 truncate">{audio.name}</p>
                                      </div>
                                    </button>
                                  ))}
                              </>
                            )}
                            
                            {/* 没有匹配项 */}
                            {!(
                              (mentionType === 'all' || mentionType === 'image') && uploadedImages.some(img => 
                                mentionSearchText === '' || 
                                img.id.toLowerCase().includes(mentionSearchText) || 
                                img.name.toLowerCase().includes(mentionSearchText)
                              )
                            ) && !(
                              (mentionType === 'all' || mentionType === 'video') && uploadedVideos.some(video => 
                                mentionSearchText === '' || 
                                video.id.toLowerCase().includes(mentionSearchText) || 
                                video.name.toLowerCase().includes(mentionSearchText)
                              )
                            ) && !(
                              (mentionType === 'all' || mentionType === 'audio') && uploadedAudios.some(audio => 
                                mentionSearchText === '' || 
                                audio.id.toLowerCase().includes(mentionSearchText) || 
                                audio.name.toLowerCase().includes(mentionSearchText)
                              )
                            ) && (
                              <p className="p-4 text-center text-sm text-slate-400">没有匹配的媒体</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* 提示词优化区域 */}
                    {isOptimizingPrompt && optimizedPrompt && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          <span className="text-sm font-medium text-blue-700">正在优化提示词...</span>
                        </div>
                        <p className="text-sm text-blue-600 whitespace-pre-wrap">
                          {optimizedPrompt}
                          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
                        </p>
                      </div>
                    )}
                    
                    {/* 提示词优化按钮 */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => optimizePrompt(prompt, setPrompt)}
                        disabled={isOptimizingPrompt || !prompt.trim()}
                        className="flex items-center gap-2"
                      >
                        {isOptimizingPrompt ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            优化中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4" />
                            AI 优化提示词
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* 批量生成模式 */}
                  <TabsContent value="batch" className="space-y-4 mt-4">
                    {batchTasks.map((sb, index) => (
                      <div key={sb.id} className="flex gap-2 items-start">
                        <div className="pt-2 font-medium text-sm text-slate-500 min-w-[60px]">
                          视频任务 {index + 1}
                        </div>
                        <div className="flex-1 space-y-2 relative">
                          <div className="relative">
                            <Textarea
                            placeholder={`描述视频任务 ${index + 1} 的内容... 输入 @ 可引用图片，也可直接 Ctrl+V 粘贴图片/视频/音频`}
                            value={sb.content}
                            onChange={(e) => updateStoryboard(sb.id, e.target.value)}
                            onSelect={() => updateCursorCache()}
                            onBlur={() => updateCursorCache()}
                            onFocus={() => {
                              const textarea = document.querySelector(`[data-batch-index="${index}"]`) as HTMLTextAreaElement;
                              activeTextareaRef.current = {
                                element: textarea,
                                id: `batch-${sb.id}`,
                                setter: (value) => updateStoryboard(sb.id, value),
                                getValue: () => sb.content
                              };
                            }}
                            rows={4}
                            className="resize-none pr-12"
                            data-batch-index={index}
                          />
                          {/* @ 引用按钮 */}
                          <button
                            onClick={handleMentionButtonClick}
                            onMouseDown={(e) => e.preventDefault()}
                            className="absolute right-3 bottom-3 w-8 h-8 rounded-full border-2 border-slate-300 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center text-slate-500 hover:text-primary"
                            title="引用素材"
                          >
                            <span className="text-sm font-bold">@</span>
                          </button>
                          </div>
                          {/* 时长选择 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">时长</span>
                            <Select
                              value={String(sb.duration)}
                              onValueChange={(val) => updateTaskDuration(sb.id, parseInt(val))}
                            >
                              <SelectTrigger className="h-7 w-[80px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {getDurationOptions(model).map((d) => (
                                  <SelectItem key={d} value={String(d)} className="text-xs">
                                    {d}秒
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* 素材条 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {sb.images.map((img) => (
                              <div key={img.id} className="relative group">
                                <img
                                  src={img.thumbnail || img.url}
                                  alt={img.id}
                                  className="w-12 h-12 object-cover rounded border cursor-pointer"
                                  title={img.name}
                                  onClick={() => setImagePreview({
                                    open: true,
                                    images: sb.images.map(i => ({
                                      id: i.id,
                                      url: i.url,
                                      name: i.name
                                    })),
                                    index: sb.images.findIndex(i => i.id === img.id)
                                  })}
                                />
                                <span
                                  className="absolute -top-1 -left-1 bg-primary text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    insertMediaReference('image', String(img.displayIndex), sb.content, (value) => updateStoryboard(sb.id, value));
                                  }}
                                  title={`插入 @图${img.displayIndex}`}
                                >
                                  {img.displayIndex}
                                </span>
                                <button
                                  onClick={() => removeTaskImage(sb.id, img.id)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {sb.videos.map((video) => (
                              <div key={video.id} className="relative group">
                                <div
                                  className="w-12 h-12 rounded border bg-slate-100 flex items-center justify-center cursor-pointer"
                                  title={video.name}
                                  onClick={() => insertMediaReference('video', video.id.replace('@视频', ''), sb.content, (value) => updateStoryboard(sb.id, value))}
                                >
                                  <Video className="h-5 w-5 text-slate-400" />
                                </div>
                                <span className="absolute -top-1 -left-1 bg-purple-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                  {video.id.replace('@视频', '')}
                                </span>
                                <button
                                  onClick={() => removeTaskVideo(sb.id, video.id)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {sb.audios.map((audio) => (
                              <div key={audio.id} className="relative group">
                                <div
                                  className="w-12 h-12 rounded border bg-slate-100 flex items-center justify-center cursor-pointer"
                                  title={audio.name}
                                  onClick={() => insertMediaReference('audio', audio.id.replace('@音频', ''), sb.content, (value) => updateStoryboard(sb.id, value))}
                                >
                                  <AudioLines className="h-5 w-5 text-slate-400" />
                                </div>
                                <span className="absolute -top-1 -left-1 bg-green-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                  {audio.id.replace('@音频', '')}
                                </span>
                                <button
                                  onClick={() => removeTaskAudio(sb.id, audio.id)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {/* 上传按钮 */}
                            <label className="w-12 h-12 rounded border border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 flex items-center justify-center cursor-pointer transition-colors">
                              <ImagePlus className="h-4 w-4 text-slate-400" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleTaskImageUpload(sb.id, e)}
                                multiple
                              />
                            </label>
                            {model === 'seedance2.0' && (
                              <>
                                <label className="w-12 h-12 rounded border border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 flex items-center justify-center cursor-pointer transition-colors">
                                  <Video className="h-4 w-4 text-slate-400" />
                                  <input
                                    type="file"
                                    accept="video/mp4,video/quicktime"
                                    className="hidden"
                                    onChange={(e) => handleTaskVideoUpload(sb.id, e)}
                                    multiple
                                  />
                                </label>
                                <label className="w-12 h-12 rounded border border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 flex items-center justify-center cursor-pointer transition-colors">
                                  <AudioLines className="h-4 w-4 text-slate-400" />
                                  <input
                                    type="file"
                                    accept="audio/wav,audio/mpeg,audio/mp3"
                                    className="hidden"
                                    onChange={(e) => handleTaskAudioUpload(sb.id, e)}
                                    multiple
                                  />
                                </label>
                              </>
                            )}
                          </div>
                          {/* @ 引用下拉列表 */}
                          {mentionDropdownOpen && activeTextareaRef.current?.id === `batch-${sb.id}` && (
                            <MentionDropdown
                              open={mentionDropdownOpen}
                              onClose={() => setMentionDropdownOpen(false)}
                              mediaState={buildTaskMediaState(sb)}
                              onSelect={handleMediaSelect}
                              onUpload={triggerMediaUpload}
                              position={{ top: -8, right: 0 }}
                              isLoading={isUploadingMedia}
                            />
                          )}
                          {/* 媒体引用下拉列表 */}
                          {mentionPopoverOpen && activeTextareaRef.current?.id === `batch-${sb.id}` && (
                            <div className="absolute left-0 right-0 z-50 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden" onMouseDown={(e) => e.preventDefault()}>
                              <div className="p-2 border-b bg-slate-50">
                                <p className="text-xs text-slate-500">
                                  选择媒体引用 {mentionSearchText && `（搜索: ${mentionSearchText}）`}
                                </p>
                              </div>
                              <div className="max-h-80 overflow-y-auto">
                                {/* 图片分组 */}
                                {(mentionType === 'all' || mentionType === 'image') && sb.images.length > 0 && (
                                  <>
                                    <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1">
                                      <Image className="h-3 w-3" /> 图片
                                    </div>
                                    {sb.images
                                      .filter(img => 
                                        mentionSearchText === '' || 
                                        img.id.toLowerCase().includes(mentionSearchText) || 
                                        img.name.toLowerCase().includes(mentionSearchText)
                                      )
                                      .map((img, imgIndex) => (
                                        <button
                                          key={img.id}
                                          className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                          onClick={() => insertMediaReference('image', String(imgIndex + 1), sb.content)}
                                        >
                                          <img
                                            src={img.url}
                                            alt={img.id}
                                            className="w-10 h-10 object-cover rounded border"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">@图{imgIndex + 1}</p>
                                            <p className="text-xs text-slate-400 truncate">{img.name}</p>
                                          </div>
                                        </button>
                                      ))}
                                  </>
                                )}
                                
                                {/* 视频分组 */}
                                {(mentionType === 'all' || mentionType === 'video') && sb.videos.length > 0 && (
                                  <>
                                    <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1 border-t">
                                      <Video className="h-3 w-3" /> 视频
                                    </div>
                                    {sb.videos
                                      .filter(video => 
                                        mentionSearchText === '' || 
                                        video.id.toLowerCase().includes(mentionSearchText) || 
                                        video.name.toLowerCase().includes(mentionSearchText)
                                      )
                                      .map((video, videoIndex) => (
                                        <button
                                          key={video.id}
                                          className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                          onClick={() => insertMediaReference('video', String(videoIndex + 1), sb.content)}
                                        >
                                          <Video className="h-10 w-10 text-slate-300 rounded border bg-slate-50 flex items-center justify-center" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">@视频{videoIndex + 1}</p>
                                            <p className="text-xs text-slate-400 truncate">{video.name}</p>
                                          </div>
                                        </button>
                                      ))}
                                  </>
                                )}
                                
                                {/* 音频分组 */}
                                {(mentionType === 'all' || mentionType === 'audio') && sb.audios.length > 0 && (
                                  <>
                                    <div className="px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1 border-t">
                                      <AudioLines className="h-3 w-3" /> 音频
                                    </div>
                                    {sb.audios
                                      .filter(audio => 
                                        mentionSearchText === '' || 
                                        audio.id.toLowerCase().includes(mentionSearchText) || 
                                        audio.name.toLowerCase().includes(mentionSearchText)
                                      )
                                      .map((audio, audioIndex) => (
                                        <button
                                          key={audio.id}
                                          className="w-full flex items-center gap-2 p-2 hover:bg-slate-100 transition-colors text-left"
                                          onClick={() => insertMediaReference('audio', String(audioIndex + 1), sb.content)}
                                        >
                                          <AudioLines className="h-10 w-10 text-slate-300 rounded border bg-slate-50 flex items-center justify-center" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">@音频{audioIndex + 1}</p>
                                            <p className="text-xs text-slate-400 truncate">{audio.name}</p>
                                          </div>
                                        </button>
                                      ))}
                                  </>
                                )}
                                
                                {/* 没有匹配项 */}
                                {!(
                                  (mentionType === 'all' || mentionType === 'image') && sb.images.some(img => 
                                    mentionSearchText === '' || 
                                    img.id.toLowerCase().includes(mentionSearchText) || 
                                    img.name.toLowerCase().includes(mentionSearchText)
                                  )
                                ) && !(
                                  (mentionType === 'all' || mentionType === 'video') && sb.videos.some(video => 
                                    mentionSearchText === '' || 
                                    video.id.toLowerCase().includes(mentionSearchText) || 
                                    video.name.toLowerCase().includes(mentionSearchText)
                                  )
                                ) && !(
                                  (mentionType === 'all' || mentionType === 'audio') && sb.audios.some(audio => 
                                    mentionSearchText === '' || 
                                    audio.id.toLowerCase().includes(mentionSearchText) || 
                                    audio.name.toLowerCase().includes(mentionSearchText)
                                  )
                                ) && (
                                  <p className="p-4 text-center text-sm text-slate-400">没有匹配的媒体</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {batchTasks.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeStoryboard(sb.id)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" onClick={addBatchTask} className="w-full" disabled={batchTasks.length >= MAX_BATCH_TASKS}>
                      <Plus className="h-4 w-4 mr-2" />
                      添加视频任务
                      <span className="ml-2 text-xs text-slate-400">({batchTasks.length}/{MAX_BATCH_TASKS})</span>
                    </Button>
                  </TabsContent>
                </Tabs>

                {mode !== 'batch' && (
                <>
                {/* 图片上传 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>上传参考图片（可选）</Label>
                    <span className="text-xs text-slate-400">最多9张</span>
                  </div>
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                    />
                    <Label htmlFor="image-upload" className="cursor-pointer">
                      <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                      <span className="text-sm text-slate-500">点击上传图片</span>
                      <p className="text-xs text-slate-400 mt-1">
                        支持 JPG、PNG 格式，最多9张
                      </p>
                    </Label>
                  </div>

                  {/* 图片预览 - 可拖拽排序 */}
                  {uploadedImages.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={uploadedImages.map(img => img.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-4 gap-2">
                          {uploadedImages.map((img) => {
                            // 从 mediaState 中查找对应的图片，获取上传进度
                            const mediaImage = mediaState.images.find(m => m.key === img.id || m.key === `@图${img.displayIndex}`);
                            return (
                              <SortableImage
                                key={img.id}
                                image={img}
                                onRemove={removeImage}
                                uploadProgress={mediaImage?.uploadProgress}
                                isUploading={mediaImage?.isUploading}
                                onPreview={(img) => setImagePreview({
                                  open: true,
                                  images: uploadedImages.map(i => ({
                                    id: i.id,
                                    url: i.url,
                                    name: i.name
                                  })),
                                  index: uploadedImages.findIndex(i => i.id === img.id)
                                })}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  {uploadedImages.length > 0 && (
                    <Alert>
                      <ImageIcon className="h-4 w-4" />
                      <AlertTitle>图片引用说明</AlertTitle>
                      <AlertDescription>
                        在剧本中使用 <code className="bg-slate-100 px-1 rounded">@图1</code>、<code className="bg-slate-100 px-1 rounded">@图2</code> 等格式引用上传的图片，可拖拽调整顺序
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* 视频参考和音频参考（仅 Seedance 2.0 支持） */}
                {model === 'seedance2.0' && (
                  <div className="space-y-3 border-t pt-4">
                    <Label className="text-sm font-medium">多模态参考（可选）</Label>
                    
                    {/* 视频参考 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-slate-600">视频参考</Label>
                        <span className="text-xs text-slate-400">mp4/mov，最多3个，单个≤100MB</span>
                      </div>
                      {uploadedVideos.length === 0 ? (
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-slate-300 transition-colors">
                          <Input
                            type="file"
                            accept="video/mp4,video/quicktime"
                            onChange={handleVideoUpload}
                            className="hidden"
                            id="video-upload"
                          />
                          <Label htmlFor="video-upload" className="cursor-pointer">
                            <Video className="h-6 w-6 mx-auto text-slate-400 mb-2" />
                            <span className="text-sm text-slate-500">点击上传视频参考</span>
                          </Label>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {uploadedVideos.map((video, index) => (
                            <div key={video.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                <Video className="h-5 w-5 text-slate-500" />
                                <span className="text-sm truncate max-w-[150px]">{video.name}</span>
                                <Badge variant="outline" className="text-xs ml-1">#{index + 1}</Badge>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => removeVideo(video.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {uploadedVideos.length < 3 && (
                            <div className="border border-dashed border-slate-200 rounded-lg p-2 text-center">
                              <Input
                                type="file"
                                accept="video/mp4,video/quicktime"
                                onChange={handleVideoUpload}
                                className="hidden"
                                id={`video-upload-${uploadedVideos.length}`}
                              />
                              <Label htmlFor={`video-upload-${uploadedVideos.length}`} className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                                + 添加更多视频
                              </Label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 音频参考 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-slate-600">音频参考</Label>
                        <span className="text-xs text-slate-400">wav/mp3，最多3个，单个≤15MB</span>
                      </div>
                      {uploadedAudios.length === 0 ? (
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-slate-300 transition-colors">
                          <Input
                            type="file"
                            accept="audio/wav,audio/mpeg,audio/mp3"
                            onChange={handleAudioUpload}
                            className="hidden"
                            id="audio-upload"
                          />
                          <Label htmlFor="audio-upload" className="cursor-pointer">
                            <AudioLines className="h-6 w-6 mx-auto text-slate-400 mb-2" />
                            <span className="text-sm text-slate-500">点击上传音频参考</span>
                          </Label>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {uploadedAudios.map((audio, index) => (
                            <div key={audio.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                <AudioLines className="h-5 w-5 text-slate-500" />
                                <span className="text-sm truncate max-w-[150px]">{audio.name}</span>
                                <Badge variant="outline" className="text-xs ml-1">#{index + 1}</Badge>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => removeAudio(audio.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {uploadedAudios.length < 3 && (
                            <div className="border border-dashed border-slate-200 rounded-lg p-2 text-center">
                              <Input
                                type="file"
                                accept="audio/wav,audio/mpeg,audio/mp3"
                                onChange={handleAudioUpload}
                                className="hidden"
                                id={`audio-upload-${uploadedAudios.length}`}
                              />
                              <Label htmlFor={`audio-upload-${uploadedAudios.length}`} className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                                + 添加更多音频
                              </Label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
                )}

                {/* 生成参数选项（仅单次生成和批量生成模式显示） */}
                {(mode === 'single' || mode === 'batch') && (
                  <div className="grid grid-cols-3 gap-3">
                    {/* 模型选择 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-600">模型</Label>
                      <Select value={model} onValueChange={(val) => {
                          const maxDuration = MODEL_CONFIG[val as keyof typeof MODEL_CONFIG]?.maxDuration || 12;
                          const maxResolution = MODEL_CONFIG[val as keyof typeof MODEL_CONFIG]?.maxResolution || '1080p';
                          
                          // 如果当前时长超过新模型的最大时长，重置为最大值
                          if (parseInt(duration) > maxDuration) {
                            setDuration(String(maxDuration));
                          }
                          
                          // 如果当前分辨率超过新模型的最大分辨率，重置为最大值
                          const resolutionOrder = ['480p', '720p', '1080p'];
                          const currentResIndex = resolutionOrder.indexOf(resolution);
                          const maxResIndex = resolutionOrder.indexOf(maxResolution);
                          if (currentResIndex > maxResIndex) {
                            setResolution(maxResolution);
                          }
                          
                          setModel(val);
                        }}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seedance2.0">Seedance 2.0</SelectItem>
                          <SelectItem value="doubao-seedance-1-5-pro">Seedance-1.5-pro</SelectItem>
                          <SelectItem value="seedance_pro">Seedance Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 画幅比例 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-600">画幅比例</Label>
                      <Select value={ratio} onValueChange={setRatio}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="9:16">9:16 竖屏</SelectItem>
                          <SelectItem value="16:9">16:9 横屏</SelectItem>
                          <SelectItem value="4:3">4:3</SelectItem>
                          <SelectItem value="3:4">3:4 竖屏</SelectItem>
                          <SelectItem value="1:1">1:1 方屏</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 分辨率 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-600">分辨率</Label>
                      <Select value={resolution} onValueChange={setResolution}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="480p">480p</SelectItem>
                          <SelectItem value="720p">720p</SelectItem>
                          <SelectItem value="1080p" disabled={model === 'seedance2.0'}>
                            1080p {model === 'seedance2.0' && '(不支持)'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 是否生成音频（仅 Seedance 2.0 支持） */}
                    {model === 'seedance2.0' && (
                      <div className="space-y-2">
                        <Label className="text-sm text-slate-600">生成音频</Label>
                        <div className="flex items-center h-10">
                          <Checkbox
                            id="generateAudio"
                            checked={generateAudio}
                            onCheckedChange={(checked) => setGenerateAudio(checked as boolean)}
                          />
                          <Label htmlFor="generateAudio" className="ml-2 text-sm cursor-pointer">
                            开启音频
                          </Label>
                        </div>
                      </div>
                    )}

                    {/* 离线推理开关（仅批量模式 + Seedance 2.0） */}
                    {mode === 'batch' && model === 'seedance2.0' && (
                      <div className="space-y-2">
                        <Label className="text-sm text-slate-600">离线推理</Label>
                        <div className="flex items-center h-10 gap-2">
                          <Switch
                            id="offlineInference"
                            checked={useOfflineInference}
                            onCheckedChange={(checked) => setUseOfflineInference(checked as boolean)}
                          />
                          <Label htmlFor="offlineInference" className="text-sm cursor-pointer text-slate-500">
                            {useOfflineInference ? '已启用' : '已关闭'}
                          </Label>
                        </div>
                      </div>
                    )}

                    {/* 生成时长 */}
                    <div className="space-y-2">
                      <Label className="text-sm text-slate-600">生成时长</Label>
                      <Select 
                        value={duration} 
                        onValueChange={(val) => {
                          const maxDuration = MODEL_CONFIG[model as keyof typeof MODEL_CONFIG]?.maxDuration || 12;
                          // 如果选择的值超过最大值，重置为最大值
                          if (parseInt(val) > maxDuration) {
                            setDuration(String(maxDuration));
                          } else {
                            setDuration(val);
                          }
                        }}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getDurationOptions(model).map((seconds) => (
                            <SelectItem key={seconds} value={String(seconds)}>
                              {seconds}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* 生成按钮 */}
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Video className="h-4 w-4 mr-2" />
                      {mode === 'single' ? '生成视频' : '批量生成视频'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：任务列表 */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>生成记录</CardTitle>
                    <CardDescription>
                      在线 {tasks.filter(t => t.service_tier !== 'flex').length} / 离线 {tasks.filter(t => t.service_tier === 'flex').length} 个任务
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadTasks}
                      disabled={isLoadingTasks}
                    >
                      {isLoadingTasks ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        '刷新'
                      )}
                    </Button>
                    {selectedTasks.size > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleBatchDownload}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        下载 ({selectedTasks.size})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>暂无生成记录</p>
                    <p className="text-sm">输入剧本开始创作吧</p>
                  </div>
                ) : (
                  <Tabs defaultValue="online" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="online">
                        在线任务
                        <Badge variant="outline" className="ml-2 text-xs">
                          {tasks.filter(t => t.service_tier !== 'flex').length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="offline">
                        离线任务
                        <Badge variant="outline" className="ml-2 text-xs">
                          {tasks.filter(t => t.service_tier === 'flex').length}
                        </Badge>
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="online">
                      <TaskListRenderer
                        tasks={tasks.filter(t => t.service_tier !== 'flex')}
                        selectedTasks={selectedTasks}
                        previewTaskId={previewTaskId}
                        onToggleSelect={toggleTaskSelection}
                        onSetPreview={setPreviewTaskId}
                        onDelete={handleDeleteTask}
                        onRetry={handleRetryGenerate}
                        emptyMessage="暂无在线生成记录"
                      />
                    </TabsContent>
                    
                    <TabsContent value="offline">
                      <TaskListRenderer
                        tasks={tasks.filter(t => t.service_tier === 'flex')}
                        selectedTasks={selectedTasks}
                        previewTaskId={previewTaskId}
                        onToggleSelect={toggleTaskSelection}
                        onSetPreview={setPreviewTaskId}
                        onDelete={handleDeleteTask}
                        onRetry={handleRetryGenerate}
                        emptyMessage="暂无离线生成记录"
                        isOffline
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
          </TabsContent>

          {/* 编辑视频标签页 */}
          <TabsContent value="edit" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 左侧：功能区域 */}
              <Card>
                <CardHeader>
                  <CardTitle>编辑视频</CardTitle>
                  <CardDescription>
                    对现有视频进行编辑修改，支持替换元素、延长时长等
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 子Tab切换 */}
                  <Tabs value={editSubMode} onValueChange={(v) => setEditSubMode(v as 'edit' | 'extend')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="edit" className="flex items-center gap-2">
                        <Wand2 className="h-4 w-4" />
                        编辑视频
                      </TabsTrigger>
                      <TabsTrigger value="extend" className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" />
                        延长视频
                      </TabsTrigger>
                    </TabsList>

                    {/* 编辑视频子Tab */}
                    <TabsContent value="edit" className="space-y-4 mt-4">
                      {/* 待编辑视频上传 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">待编辑视频</Label>
                          <span className="text-xs text-slate-400">mp4/mov，≤100MB</span>
                        </div>
                        {!editVideoFile ? (
                          <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors">
                            <Input
                              type="file"
                              accept="video/mp4,video/quicktime"
                              onChange={handleEditVideoUpload}
                              className="hidden"
                              id="edit-video-upload"
                            />
                            <Label htmlFor="edit-video-upload" className="cursor-pointer">
                              <Video className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                              <span className="text-sm text-slate-500">点击上传待编辑视频</span>
                              <p className="text-xs text-slate-400 mt-1">支持 MP4、MOV 格式</p>
                            </Label>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <Video className="h-5 w-5 text-slate-500" />
                              <span className="text-sm truncate max-w-[200px]">{editVideoFile.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={removeEditVideo}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* 参考图片上传（可选） */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">参考图片（可选）</Label>
                          <span className="text-xs text-slate-400">JPG/PNG/WebP，≤30MB</span>
                        </div>
                        {!editReferenceImage ? (
                          <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-slate-300 transition-colors">
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/jpg,image/webp"
                              onChange={handleEditImageUpload}
                              className="hidden"
                              id="edit-image-upload"
                            />
                            <Label htmlFor="edit-image-upload" className="cursor-pointer">
                              <Image className="h-6 w-6 mx-auto text-slate-400 mb-2" />
                              <span className="text-sm text-slate-500">点击上传参考图片</span>
                              <p className="text-xs text-slate-400 mt-1">用于替换视频中的元素</p>
                            </Label>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={editReferenceImage.url}
                                alt="预览"
                                className="w-12 h-12 object-cover rounded border cursor-pointer"
                                onClick={() => setImagePreview({
                                  open: true,
                                  images: [{
                                    id: editReferenceImage.url,
                                    url: editReferenceImage.url,
                                    name: editReferenceImage.name
                                  }],
                                  index: 0
                                })}
                              />
                              <span className="text-sm truncate max-w-[200px]">{editReferenceImage.name}</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={removeEditImage}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* 编辑指令 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">编辑指令</Label>
                          <span className="text-xs text-slate-400">描述修改内容</span>
                        </div>
                        <Textarea
                          placeholder="描述视频编辑指令...
例如：将视频中礼盒里的香水替换成面霜，运镜不变，也可直接 Ctrl+V 粘贴图片"
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          onSelect={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            if (el.selectionStart !== null) cachedCursorPosRef.current = el.selectionStart;
                          }}
                          onBlur={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            if (el.selectionStart !== null) cachedCursorPosRef.current = el.selectionStart;
                          }}
                          onFocus={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            activeTextareaRef.current = {
                              element: el,
                              id: 'edit',
                              setter: setEditPrompt,
                              getValue: () => editPrompt
                            };
                          }}
                          rows={4}
                          className="resize-none"
                        />
                      </div>

                      {/* 生成按钮 */}
                      <Button
                        className="w-full"
                        onClick={handleEditVideoGenerate}
                        disabled={!editVideoFile || !editPrompt.trim() || isGenerating}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            开始编辑
                          </>
                        )}
                      </Button>

                      {/* 提示信息 */}
                      <p className="text-xs text-slate-400 text-center">
                        编辑后的视频将保持原视频的画幅和时长，音频由模型自动处理
                      </p>
                    </TabsContent>

                    {/* 延长视频子Tab */}
                    <TabsContent value="extend" className="space-y-4 mt-4">
                      {/* 视频片段上传 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">上传视频片段（1-3个）</Label>
                          <span className="text-xs text-slate-400">mp4/mov，单个≤100MB</span>
                        </div>
                        {extendVideos.length === 0 ? (
                          <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors">
                            <Input
                              type="file"
                              accept="video/mp4,video/quicktime"
                              onChange={handleExtendVideoUpload}
                              className="hidden"
                              id="extend-video-upload"
                            />
                            <Label htmlFor="extend-video-upload" className="cursor-pointer">
                              <Video className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                              <span className="text-sm text-slate-500">点击上传视频片段</span>
                              <p className="text-xs text-slate-400 mt-1">拖拽或选择 1-3 个视频片段</p>
                            </Label>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {extendVideos.map((video, index) => (
                              <div key={video.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center gap-3">
                                  <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                                    {index + 1}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Video className="h-5 w-5 text-slate-500" />
                                    <span className="text-sm truncate max-w-[200px]">{video.name}</span>
                                  </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => removeExtendVideo(video.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            {extendVideos.length < 3 && (
                              <div className="border border-dashed border-slate-200 rounded-lg p-3 text-center">
                                <Input
                                  type="file"
                                  accept="video/mp4,video/quicktime"
                                  onChange={handleExtendVideoUpload}
                                  className="hidden"
                                  id={`extend-video-upload-${extendVideos.length}`}
                                />
                                <Label htmlFor={`extend-video-upload-${extendVideos.length}`} className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
                                  + 添加更多片段 ({extendVideos.length}/3)
                                </Label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 衔接描述 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">衔接描述</Label>
                          <span className="text-xs text-slate-400">描述视频片段之间的衔接逻辑</span>
                        </div>
                        <Textarea
                          placeholder="描述视频片段之间的衔接逻辑...
例如：视频1中的拱形窗户打开，进入美术馆室内，接视频2，也可直接 Ctrl+V 粘贴图片"
                          value={extendPrompt}
                          onChange={(e) => setExtendPrompt(e.target.value)}
                          onSelect={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            if (el.selectionStart !== null) cachedCursorPosRef.current = el.selectionStart;
                          }}
                          onBlur={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            if (el.selectionStart !== null) cachedCursorPosRef.current = el.selectionStart;
                          }}
                          onFocus={(e) => {
                            const el = e.target as HTMLTextAreaElement;
                            activeTextareaRef.current = {
                              element: el,
                              id: 'extend',
                              setter: setExtendPrompt,
                              getValue: () => extendPrompt
                            };
                          }}
                          rows={4}
                          className="resize-none"
                        />
                      </div>

                      {/* 生成按钮 */}
                      <Button
                        className="w-full"
                        onClick={handleExtendVideoGenerate}
                        disabled={extendVideos.length === 0 || !extendPrompt.trim() || isGenerating}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            开始延长
                          </>
                        )}
                      </Button>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* 右侧：编辑类任务列表 */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div>
                    <CardTitle className="text-base">编辑类任务</CardTitle>
                    <CardDescription className="text-xs">
                      共 {tasks.filter(t => t.mode === 'edit' || t.mode === 'extend').length} 个任务
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadTasks}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    刷新
                  </Button>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // 过滤出编辑和延长类任务
                    const editTasks = tasks.filter(t => t.mode === 'edit' || t.mode === 'extend');
                    
                    if (editTasks.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <Video className="h-12 w-12 mb-4 opacity-50" />
                          <p className="text-sm">暂无编辑类任务</p>
                        </div>
                      );
                    }

                    // 排序：处理中 > 排队 > 成功 > 失败
                    const sortedTasks = [...editTasks].sort((a, b) => {
                      const statusOrder = { 1: 0, 0: 1, 2: 2, '-1': 3 };
                      const aOrder = statusOrder[a.status as unknown as keyof typeof statusOrder] ?? 4;
                      const bOrder = statusOrder[b.status as unknown as keyof typeof statusOrder] ?? 4;
                      if (aOrder !== bOrder) return aOrder - bOrder;
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    });

                    return (
                      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                        {sortedTasks.map((task) => (
                          <TaskCard
                            key={task.task_id}
                            task={task}
                            selectedTasks={selectedTasks}
                            previewTaskId={previewTaskId}
                            onToggleSelect={toggleTaskSelection}
                            onSetPreview={setPreviewTaskId}
                            onDelete={handleDeleteTask}
                            onRetry={handleRetryGenerate}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============ 配音 Tab ============ */}
          <TabsContent value="audio" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>配音制作</CardTitle>
                <CardDescription>使用 AI 技术生成配音和背景音乐</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 配音功能子Tab */}
                <Tabs value={audioSubMode} onValueChange={(v) => setAudioSubMode(v as 'tts' | 'clone' | 'bgm')}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="tts" className="flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      TTS 音色制作
                    </TabsTrigger>
                    <TabsTrigger value="clone" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      人声复刻
                    </TabsTrigger>
                    <TabsTrigger value="bgm" className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      BGM 制作
                    </TabsTrigger>
                  </TabsList>

                  {/* TTS 音色制作 */}
                  <TabsContent value="tts" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="tts-prompt">配音内容</Label>
                        <Textarea
                          id="tts-prompt"
                          placeholder="请输入需要转换的文本内容..."
                          value={ttsPrompt}
                          onChange={(e) => setTtsPrompt(e.target.value)}
                          rows={4}
                          className="mt-1"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          建议单次输入不超过 500 字
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="tts-speaker">音色选择</Label>
                        <Select value={ttsSpeaker} onValueChange={setTtsSpeaker}>
                          <SelectTrigger id="tts-speaker" className="mt-1">
                            <SelectValue placeholder="选择音色" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>通用音色</SelectLabel>
                              {VOICE_OPTIONS.general.map((voice) => (
                                <SelectItem key={voice.value} value={voice.value}>
                                  {voice.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>视频配音音色</SelectLabel>
                              {VOICE_OPTIONS.dubbing.map((voice) => (
                                <SelectItem key={voice.value} value={voice.value}>
                                  {voice.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>角色扮演音色</SelectLabel>
                              {VOICE_OPTIONS.roleplay.map((voice) => (
                                <SelectItem key={voice.value} value={voice.value}>
                                  {voice.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        onClick={handleGenerateTTS}
                        disabled={!ttsPrompt.trim() || isGeneratingTTS}
                        className="w-full"
                      >
                        {isGeneratingTTS ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Mic className="mr-2 h-4 w-4" />
                            生成配音
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* 人声复刻 */}
                  <TabsContent value="clone" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="clone-prompt">配音内容</Label>
                        <Textarea
                          id="clone-prompt"
                          placeholder="请输入需要转换的文本内容..."
                          value={clonePrompt}
                          onChange={(e) => setClonePrompt(e.target.value)}
                          rows={4}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="clone-speaker-id">音色 ID（可选）</Label>
                        <Input
                          id="clone-speaker-id"
                          placeholder="从火山控制台获取的 Speaker ID，留空使用默认"
                          value={cloneSpeakerId}
                          onChange={(e) => setCloneSpeakerId(e.target.value)}
                          className="mt-1"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          在火山引擎「声音复刻」控制台创建音色后获取，格式如 S_xxxxx
                        </p>
                      </div>
                      
                      <div>
                        <Label>参考音频</Label>
                        {cloneReferenceUrl ? (
                          <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
                            <div className="flex items-center gap-2">
                              <Music className="h-4 w-4 text-slate-400" />
                              <span className="text-sm truncate max-w-[200px]">{cloneReferenceName || '参考音频'}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCloneReferenceUrl('');
                                setCloneReferenceName('');
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-1 border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors">
                            <Input
                              type="file"
                              accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/x-m4a,audio/aac"
                              onChange={handleCloneReferenceUpload}
                              className="hidden"
                              id="clone-audio-upload"
                            />
                            <Label htmlFor="clone-audio-upload" className="cursor-pointer">
                              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">点击上传参考音频</p>
                              <p className="text-xs text-slate-400 mt-1">支持 WAV、MP3、OGG、M4A、AAC 格式，最大 10MB</p>
                            </Label>
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={handleGenerateClone}
                        disabled={!clonePrompt.trim() || !cloneReferenceUrl || isGeneratingClone}
                        className="w-full"
                      >
                        {isGeneratingClone ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <User className="mr-2 h-4 w-4" />
                            生成复刻配音
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* BGM 制作 */}
                  <TabsContent value="bgm" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      {/* 模型选择 */}
                      <div>
                        <Label htmlFor="bgm-model">生成模式</Label>
                        <div className="mt-1 flex gap-2">
                          <Button
                            variant={bgmModel === 'music-2.6' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setBgmModel('music-2.6')}
                            className="flex-1"
                          >
                            文本生成
                          </Button>
                          <Button
                            variant={bgmModel === 'music-cover' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setBgmModel('music-cover')}
                            className="flex-1"
                          >
                            参考音频
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {bgmModel === 'music-2.6' ? '根据文本描述生成音乐' : '基于参考音频生成相似风格的音乐'}
                        </p>
                      </div>

                      {/* 参考音频上传（仅在 music-cover 模式下显示） */}
                      {bgmModel === 'music-cover' && (
                        <div>
                          <Label>参考音频</Label>
                          {bgmReferenceUrl ? (
                            <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
                              <div className="flex items-center gap-2">
                                <Music className="h-4 w-4 text-slate-400" />
                                <span className="text-sm truncate max-w-[200px]">{bgmReferenceName || '参考音频'}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setBgmReferenceUrl('');
                                  setBgmReferenceName('');
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-1 border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-slate-300 transition-colors">
                              <Input
                                type="file"
                                accept="audio/wav,audio/mpeg,audio/mp3"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  formData.append('type', 'audio');
                                  
                                  try {
                                    const response = await fetch('/api/v1/upload-media', {
                                      method: 'POST',
                                      headers: {
                                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                                      },
                                      body: formData,
                                    });
                                    
                                    const data = await response.json();
                                    if (data.success) {
                                      setBgmReferenceUrl(data.data.url);
                                      setBgmReferenceName(file.name);
                                    } else {
                                      toast.error(data.error || '上传失败');
                                    }
                                  } catch (error) {
                                    console.error('上传失败:', error);
                                    toast.error('上传失败');
                                  }
                                }}
                                className="hidden"
                                id="bgm-audio-upload"
                              />
                              <Label htmlFor="bgm-audio-upload" className="cursor-pointer">
                                <Upload className="h-6 w-6 text-slate-400 mx-auto mb-1" />
                                <p className="text-xs text-slate-500">点击上传参考音频</p>
                              </Label>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 音乐描述 */}
                      <div>
                        <Label htmlFor="bgm-prompt">
                          {bgmModel === 'music-cover' ? '风格描述' : '音乐描述'}
                        </Label>
                        <Textarea
                          id="bgm-prompt"
                          placeholder={
                            bgmModel === 'music-cover' 
                              ? "请描述期望的音乐风格，如：保持原曲的节奏感，但加入更多电子元素..."
                              : "请描述需要的背景音乐风格，如：欢快的电子音乐、悲伤的钢琴曲、紧张的战斗音乐..."
                          }
                          value={bgmPrompt}
                          onChange={(e) => setBgmPrompt(e.target.value)}
                          rows={4}
                          className="mt-1"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {bgmModel === 'music-cover' ? '描述越详细，生成的风格越接近预期' : '描述越详细，生成的音乐越符合预期'}
                        </p>
                      </div>

                      {/* 生成按钮 */}
                      <Button
                        onClick={handleGenerateBGM}
                        disabled={
                          !bgmPrompt.trim() || 
                          isGeneratingBGM ||
                          (bgmModel === 'music-cover' && !bgmReferenceUrl)
                        }
                        className="w-full"
                      >
                        {isGeneratingBGM ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Music className="mr-2 h-4 w-4" />
                            生成背景音乐
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* 配音任务历史 */}
                <div className="border-t pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <History className="h-4 w-4" />
                      配音任务历史
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => fetchAudioTasks()}>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      刷新
                    </Button>
                  </div>
                  
                  {audioTasksLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  ) : audioTasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无配音任务</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {audioTasks.map((task) => (
                        <AudioTaskCard key={task.task_id} task={task} />
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* 图片放大预览（Lightbox） */}
      <ImagePreviewDialog
        open={imagePreview.open}
        images={imagePreview.images}
        currentIndex={imagePreview.index}
        onClose={() => setImagePreview(prev => ({ ...prev, open: false }))}
        onNavigate={(index: number) => setImagePreview(prev => ({ ...prev, index }))}
      />

      {/* 底部 */}
      <footer className="border-t bg-white mt-8">
        <div className="container mx-auto px-4 py-4">
          <p className="text-center text-sm text-slate-500">
            AI制作中台 V1.0 | 模型无关性架构 | 支持热插拔
          </p>
        </div>
      </footer>
    </div>
  );
}
