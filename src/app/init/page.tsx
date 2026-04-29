'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Video, AlertCircle, CheckCircle } from 'lucide-react';

interface InitResponse {
  success: boolean;
  message?: string;
  data?: {
    username: string;
    password: string;
    role: string;
    dailyLimit: number;
    note: string;
  };
  error?: string;
}

export default function InitPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [initData, setInitData] = useState<{
    username: string;
    password: string;
    role: string;
    dailyLimit: number;
  } | null>(null);

  // 检查是否已登录
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      router.push('/');
    }
  }, [router]);

  const handleInit = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/auth/init', {
        method: 'POST'
      });
      const data: InitResponse = await response.json();

      if (data.success && data.data) {
        setInitData(data.data);
        setMessage({
          type: 'success',
          text: data.message || '初始化成功'
        });
      } else {
        setMessage({
          type: 'error',
          text: data.error || '初始化失败'
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: '网络请求失败'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-full">
              <Video className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">AI制作中台</CardTitle>
          <CardDescription>系统初始化</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {message && (
            <Alert variant={message.type === 'success' ? 'default' : 'destructive'}>
              {message.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {initData ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">
                  请保存以下登录信息，首次登录后请立即修改密码！
                </AlertDescription>
              </Alert>

              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">用户名:</span>
                  <span className="font-mono font-medium">{initData.username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">密码:</span>
                  <span className="font-mono font-medium text-red-600">{initData.password}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">角色:</span>
                  <span className="font-medium">{initData.role === 'super_admin' ? '超级管理员' : initData.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">每日限额:</span>
                  <span className="font-medium">{initData.dailyLimit} 分钟</span>
                </div>
              </div>

              <Button className="w-full" onClick={() => router.push('/login')}>
                前往登录
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-slate-600">
                点击下方按钮初始化系统，创建超级管理员账号。
              </p>
              <Button 
                className="w-full" 
                onClick={handleInit} 
                disabled={isLoading}
              >
                {isLoading ? '初始化中...' : '初始化系统'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
