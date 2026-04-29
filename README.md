# 漫剧制作中台（Manga-Drama Hub）

面向内容创作场景的制作中台，提供视频生成、配音能力、任务管理与状态追踪。  
项目已整理为标准 GitHub 结构，可直接用于后续 Vercel 部署与 Codex 深度开发。

## 技术栈

- Next.js 16（App Router）
- TypeScript 5
- Supabase（对象存储/数据库能力）
- Drizzle ORM
- React 19 + Tailwind CSS 4 + shadcn/ui

## 本地启动

### 1) 安装依赖

```bash
pnpm install
```

### 2) 配置环境变量

复制 `.env.example` 为 `.env.local`，并填写真实值：

```bash
cp .env.example .env.local
```

### 3) 启动开发环境

```bash
pnpm dev
```

默认访问地址：`http://localhost:3000`（如项目脚本另有端口，以实际启动日志为准）。

## Vercel 部署说明

1. 将仓库推送到 GitHub。
2. 在 Vercel 中 Import 该仓库。
3. Framework Preset 选择 Next.js（通常会自动识别）。
4. 在 Vercel Project Settings -> Environment Variables 中填写所有环境变量。
5. 触发首次部署并验证核心 API 路由可用性。

## 环境变量说明

请参考 `.env.example`，常用变量如下：

- `OPENAI_API_KEY`：模型服务调用凭证
- `SUPABASE_URL`：Supabase 项目地址
- `SUPABASE_KEY`：Supabase 服务密钥（请按最小权限原则使用）
- `JWT_SECRET`：JWT 签名密钥

## 目录约定

当前项目重点保留以下目录与配置文件，适用于标准化协作与部署：

- `src/`、`public/`、`assets/`、`docs/`、`scripts/`、`skills/`
- `package.json`、`pnpm-lock.yaml`
- `tsconfig.json`、`next.config.ts`、`postcss.config.mjs`、`eslint.config.mjs`
- `components.json`、`next-env.d.ts`、`.babelrc`、`.gitignore`、`README.md`、`AGENTS.md`
