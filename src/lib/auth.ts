/**
 * JWT 认证工具
 * 提供密码加密、验证、Token 生成和验证功能
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'manga-drama-hub-secret-key-2026';
const JWT_EXPIRES_IN = '7d'; // 7 天免登录

// 用户类型
export interface UserPayload {
  id: string;
  username: string;
  role: 'super_admin' | 'admin' | 'member';
}

/**
 * 密码加密
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * 密码验证
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 生成 JWT Token
 */
export function generateToken(user: UserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头提取 Token
 */
export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // 也支持从 cookie 中获取
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    return cookies['auth_token'] || null;
  }
  
  return null;
}

/**
 * 生成 Token 过期时间描述
 */
export function getTokenExpiry(): string {
  return JWT_EXPIRES_IN;
}
