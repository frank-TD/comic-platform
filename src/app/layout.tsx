import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI制作中台',
    template: 'AI制作中台',
  },
  description:
    'AI制作中台是一款智能视频生成平台，支持多模型视频生成、提示词优化、图片引用等功能。',
  keywords: [
    'AI制作中台',
    'AI视频生成',
    '视频生成',
    '智能视频',
    '多模型',
  ],
  authors: [{ name: 'AI制作中台' }],
  generator: 'AI制作中台',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'AI制作中台 | 智能视频生成平台',
    description:
      'AI制作中台，智能视频生成平台，支持多模型视频生成、提示词优化、图片引用等功能。',
    siteName: 'AI制作中台',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
