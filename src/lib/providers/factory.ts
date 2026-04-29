/**
 * 视频生成提供商工厂
 * 根据模型 ID 获取对应的提供商实例
 */

import { VideoProvider } from './base';
import { DoubaoProvider } from './doubao';
import { Seedance2Provider } from './seedance2';

// 提供商实例缓存
const providerCache = new Map<string, VideoProvider>();

/**
 * 获取视频生成提供商实例
 * @param providerId 提供商 ID
 * @returns 提供商实例
 */
export function getVideoProvider(providerId: string): VideoProvider {
  // 检查缓存
  if (providerCache.has(providerId)) {
    return providerCache.get(providerId)!;
  }

  // 根据 ID 创建对应提供商
  let provider: VideoProvider;

  switch (providerId) {
    case 'doubao-seedance-1-5-pro':
      provider = new DoubaoProvider();
      break;
    
    // 预留：Kling (快手) 提供商
    case 'kling':
      // TODO: 实现 KlingProvider
      throw new Error('Kling 提供商尚未实现');
    
    // 预留：Minimax 提供商
    case 'minimax':
      // TODO: 实现 MinimaxProvider
      throw new Error('Minimax 提供商尚未实现');
    
    // Seedance 2.0 提供商
    case 'seedance2.0':
      provider = new Seedance2Provider();
      break;
    
    // 预留：其他模型
    case 'seedance_pro':
      // TODO: 实现对应的真实提供商
      throw new Error(`${providerId} 提供商尚未实现`);
    
    default:
      throw new Error(`未知的视频提供商: ${providerId}`);
  }

  // 缓存实例
  providerCache.set(providerId, provider);
  return provider;
}

/**
 * 获取所有可用提供商列表
 */
export function getAvailableProviders(): Array<{ id: string; name: string; status: string }> {
  return [
    { id: 'doubao-seedance-1-5-pro', name: 'Doubao-Seedance-1.5-pro', status: 'live' },
    { id: 'seedance2.0', name: 'Seedance 2.0', status: 'live' },
    // TODO: 接入其他提供商时添加
    // { id: 'kling', name: 'Kling', status: 'coming_soon' },
  ];
}

/**
 * 清除提供商缓存
 */
export function clearProviderCache(): void {
  providerCache.clear();
}
