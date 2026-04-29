/**
 * 数据库客户端
 * 
 * 使用 Drizzle ORM 直接连接 PostgreSQL
 * 支持连接重试机制
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import { eq, desc, sql } from 'drizzle-orm';
import { execSync } from 'child_process';
import { videoTasks } from './shared/schema';

// ============== 重试配置 ==============
const RETRY_CONFIG = {
  maxRetries: 3,           // 最大重试次数
  initialDelay: 500,       // 初始延迟（毫秒）
  maxDelay: 5000,          // 最大延迟（毫秒）
  backoffMultiplier: 2,    // 退避倍数
};

// 连接池配置
const POOL_CONFIG = {
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
};

// ============== 状态管理 ==============
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let poolInitializationPromise: Promise<void> | null = null;
let isInitializing = false;

// ============== 工具函数 ==============

/**
 * 睡眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 计算退避延迟
 */
function getBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * 重试包装器
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = getBackoffDelay(attempt);
        console.warn(
          `[DB Retry] ${operationName} 失败 (尝试 ${attempt + 1}/${maxRetries + 1}), ` +
          `${delay}ms 后重试... 错误: ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * 重置连接池
 */
function resetPool(): void {
  if (pool) {
    pool.end().catch(err => {
      console.error('[DB] 关闭连接池失败:', err.message);
    });
    pool = null;
  }
  db = null;
}

// ============== 环境变量获取 ==============

/**
 * 获取环境变量（支持多种来源）
 */
function getEnvFromWorkloadIdentity(): Record<string, string> {
  // 优先使用 process.env 中的环境变量（生产环境）
  if (process.env.PGHOST) {
    return {
      PGHOST: process.env.PGHOST || '',
      PGPORT: process.env.PGPORT || '5432',
      PGUSER: process.env.PGUSER || 'postgres',
      PGPASSWORD: process.env.PGPASSWORD || '',
      PGDATABASE: process.env.PGDATABASE || 'postgres',
    };
  }

  // 开发环境：尝试使用 Python 脚本获取
  try {
    const output = execSync('python3 /workspace/projects/scripts/get_env.py', {
      encoding: 'utf-8',
      timeout: 10000,
    });

    const result: Record<string, string> = {};
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        const value = line.substring(eqIndex + 1);
        result[key] = value;
      }
    }
    
    return result;
  } catch (error) {
    console.error('[DB] 获取环境变量失败:', error);
    return {};
  }
}

// ============== 连接池管理 ==============

/**
 * 测试数据库连接
 */
async function testConnection(poolInstance: Pool): Promise<boolean> {
  try {
    const client = await poolInstance.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 创建数据库连接池
 */
async function createPool(): Promise<Pool> {
  const envVars = getEnvFromWorkloadIdentity();
  
  const pgHost = envVars['PGHOST'] || '';
  const pgPort = envVars['PGPORT'] || '5432';
  const pgUser = envVars['PGUSER'] || 'postgres';
  const pgPassword = envVars['PGPASSWORD'] || '';
  const pgDatabase = envVars['PGDATABASE'] || 'postgres';

  if (!pgHost) {
    throw new Error('[DB] PGHOST is not set');
  }

  const config: PoolConfig = {
    host: pgHost,
    port: parseInt(pgPort, 10),
    user: pgUser,
    password: pgPassword,
    database: pgDatabase,
    ...POOL_CONFIG,
  };

  const newPool = new Pool(config);

  // 添加错误监听
  newPool.on('error', (err) => {
    console.error('[DB] 连接池错误:', err.message);
  });

  // 测试连接
  const isConnected = await testConnection(newPool);
  if (!isConnected) {
    newPool.end();
    throw new Error('[DB] 数据库连接测试失败');
  }

  console.log('[DB] 数据库连接池创建成功');
  return newPool;
}

/**
 * 获取数据库连接池（带重试）
 */
async function getPostgresPool(): Promise<Pool> {
  if (pool) return pool;

  // 防止并发初始化
  if (isInitializing && poolInitializationPromise) {
    await poolInitializationPromise;
    if (pool) return pool;
  }

  isInitializing = true;
  
  poolInitializationPromise = withRetry(
    async () => {
      pool = await createPool();
    },
    '创建数据库连接池'
  );

  try {
    await poolInitializationPromise;
  } finally {
    isInitializing = false;
    poolInitializationPromise = null;
  }

  return pool!;
}

/**
 * 获取数据库实例（带重试）
 */
export async function getDb(): Promise<ReturnType<typeof drizzle>> {
  if (db) return db;
  
  const poolInstance = await getPostgresPool();
  db = drizzle(poolInstance);
  
  return db;
}

/**
 * 强制重新初始化数据库连接
 */
export async function reinitializeDb(): Promise<void> {
  resetPool();
  await getDb();
}

// ============== 数据库健康检查 ==============

/**
 * 数据库健康检查
 */
export async function healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  try {
    const start = Date.now();
    const dbInstance = await getDb();
    await dbInstance.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    
    return { healthy: true, latency };
  } catch (error) {
    return { 
      healthy: false, 
      error: (error as Error).message 
    };
  }
}

// ============== 兼容 Supabase SDK 风格的客户端 ==============

/**
 * 数据库操作结果包装器（带重试）
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const result = await withRetry(operation, operationName);
    return { data: result, error: null };
  } catch (err) {
    const error = err as Error;
    console.error(`[DB] ${operationName} 最终失败:`, error.message);
    return { data: null, error: { message: error.message } };
  }
}

// 任务类型（与 schema 对应）
export interface TaskRow {
  id: string;
  user_id: string;
  model_id: string;
  mode: string;
  prompt: string;
  original_prompt: string | null;
  image_urls: unknown | null;
  result_url: string | null;
  status: number;
  extra_data: unknown | null;
  metadata: unknown | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// 创建兼容 Supabase SDK 风格的客户端
export async function getSupabaseClient() {
  const database = await getDb();
  
  return {
    from: <T>(tableName: string) => {
      if (tableName !== 'video_tasks') {
        throw new Error(`Table ${tableName} not supported`);
      }
      
      return {
        select: (columns?: string | object, options?: { count?: 'exact' | 'planned' | 'estimated' }) => {
          return {
            eq: (column: string, value: unknown) => {
              return {
                single: async () => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .select()
                      .from(videoTasks)
                      .where(eq(videoTasks.id, value as string))
                      .limit(1);
                    return result[0] as T || null;
                  }, '查询单个任务');
                },
                maybeSingle: async () => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .select()
                      .from(videoTasks)
                      .where(eq(videoTasks.id, value as string))
                      .limit(1);
                    return result[0] as T || null;
                  }, '查询单个任务(maybeSingle)');
                },
                select: async () => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .select()
                      .from(videoTasks)
                      .where(eq(videoTasks.id, value as string));
                    return result as T[];
                  }, '查询任务列表(eq)');
                },
                update: (values: Record<string, unknown>) => {
                  return {
                    select: async () => {
                      return executeWithRetry(async () => {
                        const result = await database
                          .update(videoTasks)
                          .set(values as Partial<typeof videoTasks.$inferInsert>)
                          .where(eq(videoTasks.id, value as string))
                          .returning();
                        return result as T[];
                      }, '更新任务');
                    },
                  };
                },
                delete: async () => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .delete(videoTasks)
                      .where(eq(videoTasks.id, value as string))
                      .returning();
                    return result as T[];
                  }, '删除任务');
                },
              };
            },
            order: (column: string, options?: { ascending?: boolean }) => {
              return {
                range: (from: number, to: number) => {
                  return {
                    select: async (cols?: string | object, opts?: { count?: 'exact' | 'planned' | 'estimated' }) => {
                      return executeWithRetry(async () => {
                        const query = database
                          .select()
                          .from(videoTasks)
                          .orderBy(desc(videoTasks.createdAt))
                          .limit(to - from + 1)
                          .offset(from);

                        const result = await query;
                        
                        let count: number | undefined;
                        if (opts?.count) {
                          const countResult = await database
                            .select({ count: sql<number>`count(*)` })
                            .from(videoTasks);
                          count = Number(countResult[0]?.count) || 0;
                        }
                        
                        return { data: result as T[], count };
                      }, '分页查询(order.range)');
                    },
                  };
                },
                select: async (cols?: string | object, opts?: { count?: 'exact' | 'planned' | 'estimated' }) => {
                  return executeWithRetry(async () => {
                    const query = database
                      .select()
                      .from(videoTasks)
                      .orderBy(desc(videoTasks.createdAt));

                    const result = await query;
                    
                    let count: number | undefined;
                    if (opts?.count) {
                      const countResult = await database
                        .select({ count: sql<number>`count(*)` })
                        .from(videoTasks);
                      count = Number(countResult[0]?.count) || 0;
                    }
                    
                    return { data: result as T[], count };
                  }, '查询列表(order)');
                },
              };
            },
            range: (from: number, to: number) => {
              return {
                select: async (cols?: string | object, opts?: { count?: 'exact' | 'planned' | 'estimated' }) => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .select()
                      .from(videoTasks)
                      .orderBy(desc(videoTasks.createdAt))
                      .limit(to - from + 1)
                      .offset(from);
                    
                    let count: number | undefined;
                    if (opts?.count) {
                      const countResult = await database
                        .select({ count: sql<number>`count(*)` })
                        .from(videoTasks);
                      count = Number(countResult[0]?.count) || 0;
                    }
                    
                    return { data: result as T[], count };
                  }, '分页查询(range)');
                },
              };
            },
          };
        },
        
        insert: (values: Record<string, unknown>) => {
          return {
            select: () => ({
              single: async () => {
                return executeWithRetry(async () => {
                  const result = await database
                    .insert(videoTasks)
                    .values(values as typeof videoTasks.$inferInsert)
                    .returning();
                  return result[0] as T || null;
                }, '插入任务');
              },
            }),
          };
        },
        
        update: (values: Record<string, unknown>) => {
          return {
            eq: (column: string, value: unknown) => {
              return {
                select: async () => {
                  return executeWithRetry(async () => {
                    const result = await database
                      .update(videoTasks)
                      .set(values as Partial<typeof videoTasks.$inferInsert>)
                      .where(eq(videoTasks.id, value as string))
                      .returning();
                    return result as T[];
                  }, '更新任务(eq)');
                },
              };
            },
          };
        },
        
        delete: () => {
          return {
            eq: async (column: string, value: unknown) => {
              return executeWithRetry(async () => {
                const result = await database
                  .delete(videoTasks)
                  .where(eq(videoTasks.id, value as string))
                  .returning();
                return result as T[];
              }, '删除任务(eq)');
            },
          };
        },
      };
    },
  };
}
