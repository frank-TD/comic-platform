/**
 * 全局任务并发控制器
 * 
 * ARK 官方并发限制：Seedance 2.0 最多 10 条任务同时运行
 * 所有用户共享同一组并发槽（单 API Key 场景）
 * 
 * 设计原则：
 * 1. 状态诚实：任务在获取并发槽之前保持 QUEUE 状态，获取槽后才更新为 PROCESSING
 * 2. 全局排队：所有入口（generate/extend-video/edit-video）共享同一组并发槽
 */

import pLimit from 'p-limit';

// ARK 官方并发限制：10 条任务同时运行
export const taskLimiter = pLimit(10);
