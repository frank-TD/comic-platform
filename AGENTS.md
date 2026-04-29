# 项目上下文

### 项目名称
漫剧制作中台 (Manga-Drama Hub)

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: PostgreSQL (通过 Drizzle ORM)
- **模式**: V1.0 Mock 模式

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   ├── start.sh            # 生产环境启动脚本
│   └── get_env.py          # 获取环境变量脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── api/            # API 路由
│   │   │   └── v1/         # V1 API 版本
│   │   │       ├── generate/    # 统一调度接口
│   │   │       ├── status/      # 任务状态查询
│   │   │       ├── tasks/       # 任务列表管理
│   │   │       ├── audio/       # 预留：音频生成
│   │   │       └── image/       # 预留：图片生成
│   │   ├── layout.tsx
│   │   └── page.tsx        # 主页面
│   ├── components/ui/       # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   ├── config.ts       # 模型配置（统一调度配置）
│   │   ├── types.ts        # TypeScript 类型定义
│   │   └── api-client.ts   # 前端 API 客户端
│   ├── storage/            # 数据库相关
│   │   ├── database/
│   │   │   ├── supabase-client.ts  # 数据库客户端
│   │   │   └── shared/
│   │   │       └── schema.ts       # 数据表结构定义
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 核心功能

### 1. 统一调度接口 (F01)
- **路径**: `/api/v1/generate`
- **方法**: POST
- **功能**: 创建视频生成任务（集成 Doubao-Seedance-1.5-pro 真实模型）
- **参数**:
  - `prompt`: 剧本内容
  - `mode`: 生成模式 (`single` | `storyboard`)
  - `images`: 可选，图片 URL 数组
  - `model`: 模型选择 (`doubao-seedance-1-5-pro` | `seedance2.0` | `seedance_pro`)
  - `ratio`: 画幅比例 (`9:16` | `16:9` | `4:3` | `3:4` | `1:1`)
  - `duration`: 时长 (4-15s)

### 2. 图片上传接口
- **路径**: `/api/v1/upload-image`
- **方法**: POST
- **功能**: 将前端 base64 图片转存至对象存储
- **参数**: `image` (base64 格式)
- **返回**: 图片可访问 URL

### 3. @ 图片引用功能
- 在剧本输入框中输入 `@` 触发图片引用下拉列表
- 支持搜索过滤（按图片名称或编号）
- 选择图片后自动插入 `@图X` 引用
- 支持键盘操作（方向键选择、回车确认）

### 4. 任务状态查询
- **路径**: `/api/v1/status`
- **方法**: GET
- **参数**: `task_id`
- **返回**: 任务状态 (0=排队, 1=处理中, 2=成功, -1=失败)

### 5. 任务列表管理
- **路径**: `/api/v1/tasks`
- **方法**: GET (列表) / DELETE (删除)
- **参数**: `limit`, `offset`, `task_id`

### 6. 预留扩展接口
- `/api/v1/audio` - 音频生成（V1.0 Mock 实现）
- `/api/v1/image` - 图片生成（V1.0 未实现）

## 配音功能 (Audio)

### 7. 配音 Tab 接口

#### 7.1 TTS 音色制作
- **路径**: `/api/v1/audio/voice/tts`
- **方法**: POST
- **功能**: 使用豆包 TTS 生成配音（当前为 Mock 实现）
- **参数**:
  - `prompt`: 配音内容
  - `speaker`: 音色选择

#### 7.2 人声复刻
- **路径**: `/api/v1/audio/voice/clone`
- **方法**: POST
- **功能**: 基于参考音频复刻音色（接入豆包声音复刻 2.0 API）
- **参数**:
  - `prompt`: 配音内容
  - `referenceAudioUrl`: 参考音频 URL
  - `speakerId`: 可选，音色 ID（留空使用环境变量默认值）
  - `language`: 可选，语种（0=中文，1=英文，默认 0）
- **完整流程**:
  1. 下载参考音频并转为 base64
  2. 调用 voice_clone API V3 训练音色
  3. 轮询 get_voice 等待训练完成
  4. 使用训练好的 speaker_id 调用 V3 TTS API 合成语音
  5. 上传合成音频到对象存储
- **环境变量**: `VOICE_CLONE_APP_ID`, `VOICE_CLONE_ACCESS_KEY`, `VOICE_CLONE_DEFAULT_SPEAKER_ID`

#### 7.3 BGM 制作
- **路径**: `/api/v1/audio/bgm`
- **方法**: POST
- **功能**: 根据描述生成背景音乐（Mock 实现）
- **参数**:
  - `prompt`: 音乐描述
  - `referenceAudioUrl`: 可选，参考音频

#### 7.4 配音任务状态查询
- **路径**: `/api/v1/audio/status`
- **方法**: GET
- **参数**: `task_id`
- **返回**: 任务状态 (0=排队, 1=处理中, 2=成功, -1=失败)

#### 7.5 配音任务列表
- **路径**: `/api/v1/audio/tasks`
- **方法**: GET (列表) / DELETE (删除)
- **参数**: `limit`, `offset`, `task_id`, `type`

## 数据库设计

### video_tasks 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键，UUID |
| user_id | varchar(36) | 用户/设备 ID |
| model_id | varchar(50) | 模型标识 (默认 seedance2.0) |
| mode | varchar(20) | 生成模式 |
| prompt | varchar(4000) | 完整 prompt |
| original_prompt | varchar(4000) | 原始输入 |
| image_urls | jsonb | 图片 URL 数组 |
| result_url | varchar(1000) | 视频地址 |
| status | integer | 状态码 |
| extra_data | jsonb | 扩展数据 |
| metadata | jsonb | 模型特有参数 |
| error_message | varchar(1000) | 错误信息 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

### audio_tasks 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键，UUID |
| user_id | varchar(36) | 用户 ID |
| type | varchar(20) | 任务类型 (tts/clone/bgm) |
| prompt | varchar(4000) | 配音内容/音乐描述 |
| speaker | varchar(50) | TTS 音色选择 |
| reference_audio_url | varchar(1000) | 参考音频 URL |
| result_url | varchar(1000) | 生成结果 URL |
| duration | integer | 音频时长(秒) |
| status | integer | 状态码 |
| error_message | varchar(1000) | 错误信息 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

## 模型配置

配置文件: `src/lib/config.ts`

### 已接入模型

| 模型 ID | 名称 | API 类型 | 状态 |
|---------|------|---------|------|
| `doubao-seedance-1-5-pro` | Doubao-Seedance-1.5-pro | SDK | ✅ Live |
| `seedance2.0` | Seedance 2.0 | REST API (火山引擎 ARK) | ✅ Live |
| `seedance_pro` | Seedance Pro | - | 🚧 预留 |

### Seedance 2.0 API 配置

- **Base URL**: `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- **Model ID**: `doubao-seedance-2-0-260128`
- **环境变量**: `ARK_API_KEY`

### 声音复刻 2.0 API 配置

- **训练端点**: `https://openspeech.bytedance.com/api/v3/tts/voice_clone`
- **查询端点**: `https://openspeech.bytedance.com/api/v3/tts/get_voice`
- **TTS 端点**: `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- **Resource ID**: `seed-icl-2.0`
- **环境变量**: `VOICE_CLONE_APP_ID`, `VOICE_CLONE_ACCESS_KEY`, `VOICE_CLONE_DEFAULT_SPEAKER_ID`

### 支持的功能对比

| 功能 | Doubao-Seedance-1.5-pro | Seedance 2.0 |
|------|------------------------|--------------|
| 文生视频 | ✅ | ✅ |
| 图生视频（首帧） | ✅ | ✅ |
| 图生视频（首尾帧） | ✅ | ✅ |
| 参考图 | ❌ | ✅ |
| 参考视频 | ❌ | ✅ |
| 参考音频 | ❌ | ✅ |
| 音频生成 | ✅ | ✅ |
| 时长范围 | 4-12s | 4-15s |
| 分辨率 | 480p/720p/1080p | 480p/720p/1080p |
| 画幅比例 | 16:9/9:16/1:1/4:3/3:4/21:9/adaptive | 16:9/9:16/1:1/4:3/3:4 |

### Provider 架构

```
src/lib/providers/
├── base.ts                # 接口定义 (VideoProvider，含 getArkTaskStatus 方法)
├── doubao.ts              # Doubao SDK 适配器
├── seedance2.ts           # Seedance 2.0 REST API 适配器（支持离线推理）
├── factory.ts             # Provider 工厂函数
├── tts-provider.ts        # TTS Provider (豆包 TTS)
├── voice-clone-provider.ts # 声音复刻 2.0 Provider (豆包)
└── minimax-music.ts       # MiniMax 音乐生成 Provider
```

### 离线推理 (service_tier: flex)

**已验证结论**：
- ARK API `service_tier: flex` 在 Seedance 2.0 上**仅支持多模态模式**（i2v、r2v 等含图片/视频/音频输入的模式）
- **不支持 t2v 模式**（纯文本生成视频），API 返回 400 错误：`InvalidParameter: the specified parameter service_tier is not supported for model doubao-seedance-2-0 in t2v, must be empty`
- 官方文档虽标注支持，但实测 t2v 场景会被拒绝

**实现策略**：
1. **用户控制**：批量模式下提供「离线推理」Switch 开关，用户主动选择后才启用 `service_tier: flex`
2. **前置校验**：仅当 Seedance 2.0 + 任务包含图片/视频/音频引用时才允许启用，纯文本(t2v)任务即使开启也不会使用离线推理
3. **降级兜底**：若 ARK API 拒绝 `service_tier: flex`（检测错误消息中含 `service_tier`/`unsupported`/`InvalidParameter`），自动降级为实时模式重试
4. **过期处理**：ARK API 可返回 `expired`（任务超时）和 `cancelled`（任务取消）状态，均映射为 FAILED
5. **双轮询机制**：在线任务 3 秒间隔，离线任务 60 秒间隔
6. **前端分 Tab**：生成记录按在线/离线分 Tab 展示
7. **错误友好化**：`Seedance2Provider` 内置 `friendlyErrorMessage()` 方法，将 ARK API 英文错误转换为用户友好的中文提示：
   - `copyright restrictions` → "生成内容可能涉及版权限制，请避免使用具体角色名称、品牌标识或受版权保护的IP形象，尝试使用更通用的描述。"
   - `content moderation` / `safety` → "生成内容触发安全审核，请调整提示词，避免涉及敏感或违规内容。"
   - `rate limit` → "请求过于频繁，请稍后再试。"
8. **轮询超时**：实时模式 `pollTaskResult` 默认最大等待时间从 15 分钟延长至 30 分钟（`maxWaitTime = 1800`），以支持高复杂度任务的完成。
9. **批量创建事务化**：批量任务在数据库插入阶段使用 `db.transaction` 包裹，确保所有子任务要么全部创建成功，要么全部回滚，避免部分入库导致的状态不一致。

**ARK API 任务状态映射**：
| ARK 状态 | 含义 | 系统映射 |
|---------|------|---------|
| queued | 排队中 | QUEUE (0) |
| running | 运行中 | PROCESSING (1) |
| succeeded | 成功 | SUCCESS (2) |
| failed | 失败 | FAILED (-1) |
| expired | 超时 | FAILED (-1)，error_message 含超时提示 |
| cancelled | 已取消 | FAILED (-1)，error_message 含取消提示 |
```

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 代码审查修复记录

### 2024-04-22 视频生成模块代码审查修复

| 序号 | 问题 | 严重程度 | 修复文件 | 修复内容 |
|------|------|---------|---------|---------|
| 1 | `getAvailableProviders()` 缺少 `seedance2.0` | 必改 | `src/lib/providers/factory.ts` | 返回数组中补充 `{ id: 'seedance2.0', name: 'Seedance 2.0', status: 'live' }` |
| 2 | `status/route.ts` 降级路径错误未友好化 | 必改 | `src/app/api/v1/status/route.ts` | 新增 `friendlyErrorMessage` 函数，降级 HTTP 调用返回错误时应用该转换 |
| 3 | `taskVideoUrls/taskAudioUrls` 使用 `\|\|` 导致空数组被误判为 falsy | 必改 | `src/app/api/v1/generate/route.ts` | 改用空值合并运算符 `??` |
| 4 | `maxWaitTime` 配置与实际超时脱节（15分钟 vs 30分钟） | 必改 | `src/lib/providers/seedance2.ts` | `pollTaskResult` 默认 `maxWaitTime` 改为 `1800`（30分钟），`generate` 显式传递 `maxWaitTime: 1800` |
| 5 | `DoubaoProvider` 超时未统一（仍 15 分钟） | 必改 | `src/lib/providers/doubao.ts` | `pollTaskResult` 默认 `maxWaitTime` 改为 `1800` |
| 6 | 批量创建任务未使用事务 | 建议 | `src/app/api/v1/generate/route.ts` | 将批量任务创建循环改为 `db.transaction` 包裹，确保原子性 |
| 7 | `dedupArray` 可提取为工具函数 | 建议 | `src/app/api/v1/generate/route.ts` | 在文件末尾定义 `dedupArray` 工具函数并替换两处内联去重逻辑 |

### 2024-04-22 API 路由层代码审查修复

| 序号 | 问题 | 严重程度 | 修复文件 | 修复内容 |
|------|------|---------|---------|---------|
| 1 | `optimize-prompt/route.ts` 无任何鉴权 | P0 | `src/app/api/v1/optimize-prompt/route.ts` | 添加 JWT Token 鉴权；模型 ID 从 `LLM_CONFIG` 读取，替代硬编码 |
| 2 | `logs/route.ts` 无任何鉴权 + 未验证 `task_id` 归属 | P0 | `src/app/api/v1/logs/route.ts` | 添加 JWT 鉴权；查询前校验 `task_id` 是否属于当前用户，否则返回 403 |
| 3 | `upload-media/route.ts` PATCH 全局清空未按用户隔离 | P0 | `src/app/api/v1/upload-media/route.ts` | 修改 key 命名格式为 `upload/{userId}/...`；PATCH 仅列出并删除当前用户前缀的文件 |
| 4 | `upload-media/route.ts` DELETE 未验证文件归属 | P0 | `src/app/api/v1/upload-media/route.ts` | DELETE 时校验 key 是否包含当前用户路径前缀，否则返回 403 |
| 5 | `video/proxy/route.ts` 无域名白名单 + 无超时 + 大视频全量载入内存 | P0 | `src/app/api/v1/video/proxy/route.ts` | 新增 `VIDEO_PROXY_ALLOWLIST` 配置并在 `config.ts` 中维护；fetch 添加 30 秒 `AbortController` 超时；改用 `response.body` 流式传输替代 `arrayBuffer()` |
| 6 | `video/thumbnail/route.ts` 无域名白名单 + 无超时 + 错误路径未清理临时文件 | P0 | `src/app/api/v1/video/thumbnail/route.ts` | 新增白名单校验 + `fetch` 超时 + `timestamp` 正则格式校验；提取 `generateThumbnail` 函数并用 `try...finally` 确保临时文件在成功/失败路径均清理 |
| 7 | `tasks/route.ts` DELETE 未检查影响行数 | P1 | `src/app/api/v1/tasks/route.ts` | 使用 `.returning()` 获取删除结果，无匹配记录时返回 404 |
| 8 | `tasks/route.ts` GET `limit` 无上界限制 | P1 | `src/app/api/v1/tasks/route.ts` | `limit` 限制为 `1-200`，`offset` 限制为非负数 |
| 9 | `upload-media` 视频大小限制与 `upload-video` 不一致（50MB vs 100MB） | P1 | `src/app/api/v1/upload-media/route.ts` | 统一视频限制为 100MB；移除未使用的 `MAX_COUNT` dead code |
| 10 | `upload-image/route.ts` Base64 分支 `http` URL 直接返回未校验 | P1 | `src/app/api/v1/upload-image/route.ts` | 对 `http` 开头字符串使用 `new URL()` 校验协议，非法时返回 400 |

### 2024-04-22 前端主页面（page.tsx）代码审查修复

| 序号 | 问题 | 严重程度 | 修复文件 | 修复内容 |
|------|------|---------|---------|---------|
| 1 | `startAudioPolling` 闭包捕获旧 `audioTasks`，导致轮询停止判断失效 | P1 | `src/app/page.tsx` | 新增 `audioTasksRef`，通过 `useEffect` 同步最新 `audioTasks`；`startAudioPolling` 中所有读取 `audioTasks` 处改为 `audioTasksRef.current` |
| 2 | `handleMediaUpload` 上传失败分支未释放 `URL.createObjectURL` | P1 | `src/app/page.tsx` | 在失败回调中补充 `URL.revokeObjectURL(upload.localPreviewUrl)`，避免 blob URL 内存泄漏 |
| 3 | 全局使用 `alert()` 通知，已安装 `sonner` 但未使用 | P1 | `src/app/page.tsx` `src/app/layout.tsx` `src/components/ui/sonner.tsx` | 在 `layout.tsx` 中挂载 `<Toaster />`（增加 `mounted` 状态避免 Hydration）；批量将 60+ 处 `alert()` 替换为 `toast()` |
| 4 | 前端视频上传大小限制（50MB）与后端（100MB）不一致 | P1 | `src/app/page.tsx` | 将 `handleMediaUpload`、`handleVideoUpload`、`handleTaskVideoUpload`、`handleConcatVideoUpload` 及对应提示文本中的 50MB 统一改为 100MB |
| 5 | `paste` 事件监听器依赖 `[mediaState]`，频繁 add/remove | P2 | `src/app/page.tsx` | 新增 `mediaStateRef` 同步最新状态；将 `useEffect` 依赖改为 `[]`，仅在挂载时注册一次 |
| 6 | `AudioTaskCard` 在 `MangaDramaHub` 内部定义，每次渲染重新创建 | P2 | `src/app/page.tsx` | 将 `AudioTaskCard` 提取到 `MangaDramaHub` 外部；定义 `AudioTask` 接口替代 `typeof audioTasks[0]`；同步简化 `audioTasks` state 类型声明 |
| 7 | `handleBatchDownload` 下载失败无反馈 | P2 | `src/app/page.tsx` | 增加 `try/catch` 包裹单次下载，失败时 `toast.error`；汇总显示成功/失败数量 |
| 8 | `Toaster` 组件未处理 `next-themes` Hydration 不一致 | P2 | `src/components/ui/sonner.tsx` | 增加 `mounted` 状态，仅在客户端挂载后渲染 `Sonner`，消除 `useEffect` 依赖数组大小变化警告 |
