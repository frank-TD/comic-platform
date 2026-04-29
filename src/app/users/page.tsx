'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, Edit2, Users, AlertCircle, Loader2 } from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'member' | 'super_admin';
  dailyLimit: number;
  tokenUsedToday: number;
  createdAt: string;
}

interface CurrentUser {
  id: string;
  username: string;
  role: 'admin' | 'member' | 'super_admin';
}

export default function UsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // 添加/编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'member' as 'admin' | 'member',
    dailyLimit: 30
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 验证登录状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (!['admin', 'super_admin'].includes(user.role)) {
        router.push('/');
        return;
      }
      setCurrentUser(user);
    } catch {
      router.push('/login');
    }
  }, [router]);

  // 加载成员列表
  const loadUsers = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setUsers(data.data.members);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUsers();
    }
  }, [currentUser, loadUsers]);

  // 打开添加弹窗
  const openAddDialog = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', role: 'member', dailyLimit: 30 });
    setDialogOpen(true);
  };

  // 打开编辑弹窗
  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role as 'admin' | 'member',
      dailyLimit: user.dailyLimit
    });
    setDialogOpen(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!formData.username || (!editingUser && !formData.password)) {
      setError(editingUser ? '用户名不能为空' : '用户名和密码不能为空');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const url = editingUser
        ? `/api/v1/users/${editingUser.id}`
        : '/api/v1/users';

      const body: Record<string, unknown> = {
        username: formData.username,
        role: formData.role,
        dailyLimit: formData.dailyLimit
      };

      if (formData.password) {
        body.password = formData.password;
      }

      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.success) {
        setDialogOpen(false);
        loadUsers();
      } else {
        setError(data.error || '操作失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除成员
  const handleDelete = async (user: User) => {
    if (!confirm(`确定删除成员 "${user.username}" 吗？`)) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const response = await fetch(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        loadUsers();
      } else {
        alert(data.error || '删除失败');
      }
    } catch {
      alert('网络错误');
    }
  };

  // 登出
  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/')}>
              返回首页
            </Button>
            <h1 className="text-xl font-bold">成员管理</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              当前用户: <strong>{currentUser.username}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              登出
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  成员列表
                </CardTitle>
                <CardDescription>管理系统成员账号</CardDescription>
              </div>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                添加成员
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>每日限额</TableHead>
                    <TableHead>今日已用</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? '管理员' : user.role === 'super_admin' ? '超级管理员' : '成员'}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.dailyLimit} 分钟</TableCell>
                      <TableCell>{user.tokenUsedToday} 分钟</TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.role !== 'super_admin' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(user)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(user)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 添加/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? '编辑成员' : '添加成员'}</DialogTitle>
            <DialogDescription>
              {editingUser ? '修改成员信息' : '创建新成员账号'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                密码 {editingUser && <span className="text-slate-400 font-normal">(留空则不修改)</span>}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingUser ? '留空保持原密码' : '请输入密码'}
                required={!editingUser}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'admin' | 'member') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">成员</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dailyLimit">每日生成限额 (分钟)</Label>
              <Input
                id="dailyLimit"
                type="number"
                min={0}
                max={1000}
                value={formData.dailyLimit}
                onChange={(e) => setFormData({ ...formData, dailyLimit: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
