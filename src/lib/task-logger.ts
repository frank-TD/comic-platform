/**
 * 任务日志服务
 * 统一管理视频任务的日志记录（文件 + 数据库）
 */

import { getDb } from '@/storage/database/supabase-client';
import { taskLogs } from '@/storage/database/shared/schema';
import { eq, desc } from 'drizzle-orm';

// 日志级别
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// 任务类型
export type TaskType = 'video_task' | 'extend_task' | 'edit_task';

// 日志条目接口
export interface LogEntry {
	taskId: string;
	level: LogLevel;
	type: TaskType;
	message: string;
	metadata?: Record<string, unknown>;
	errorCode?: string;
	errorDetail?: string;
}

// 文件日志格式
interface FileLogEntry {
	timestamp: string;
	level: string;
	type: string;
	task_id: string;
	message: string;
	[key: string]: unknown;
}

// 写入文件日志
function writeFileLog(entry: LogEntry): void {
	const fileEntry: FileLogEntry = {
		timestamp: new Date().toISOString(),
		level: entry.level,
		type: entry.type,
		task_id: entry.taskId,
		message: entry.message,
	};

	if (entry.metadata) {
		fileEntry.metadata = entry.metadata;
	}
	if (entry.errorCode) {
		fileEntry.error_code = entry.errorCode;
	}
	if (entry.errorDetail) {
		fileEntry.error_detail = entry.errorDetail;
	}

	// 写入文件日志
	const logLine = JSON.stringify(fileEntry);
	console.log(`[${entry.level}] [${entry.type}] [${entry.taskId}] ${entry.message}`);
	
	// 如果有 metadata 也记录
	if (entry.metadata) {
		console.log(`  metadata:`, entry.metadata);
	}
	// 如果有错误详情也记录
	if (entry.errorDetail) {
		console.log(`  error_detail:`, entry.errorDetail);
	}
}

// 写入数据库日志
async function writeDbLog(entry: LogEntry): Promise<void> {
	try {
		const db = await getDb();
		await db.insert(taskLogs).values({
			taskId: entry.taskId,
			level: entry.level,
			type: entry.type,
			message: entry.message,
			metadata: entry.metadata || null,
			errorCode: entry.errorCode || null,
			errorDetail: entry.errorDetail || null,
		});
	} catch (error) {
		// 数据库写入失败不影响主流程，只打印到控制台
		console.error(`[TaskLog] Failed to write DB log:`, error);
	}
}

/**
 * 记录任务日志
 * 同时写入文件日志和数据库
 */
export async function logTask(entry: LogEntry): Promise<void> {
	// 写入文件日志（同步）
	writeFileLog(entry);

	// 写入数据库日志（异步，不阻塞主流程）
	// 使用 Promise 不 await，避免影响主流程
	writeDbLog(entry).catch(err => {
		console.error(`[TaskLog] Async DB log failed:`, err);
	});
}

/**
 * 记录 INFO 级别日志
 */
export async function logInfo(
	taskId: string,
	type: TaskType,
	message: string,
	metadata?: Record<string, unknown>
): Promise<void> {
	return logTask({
		taskId,
		level: 'INFO',
		type,
		message,
		metadata,
	});
}

/**
 * 记录 WARN 级别日志
 */
export async function logWarn(
	taskId: string,
	type: TaskType,
	message: string,
	metadata?: Record<string, unknown>
): Promise<void> {
	return logTask({
		taskId,
		level: 'WARN',
		type,
		message,
		metadata,
	});
}

/**
 * 记录 ERROR 级别日志
 */
export async function logError(
	taskId: string,
	type: TaskType,
	message: string,
	errorCode?: string,
	errorDetail?: string,
	metadata?: Record<string, unknown>
): Promise<void> {
	return logTask({
		taskId,
		level: 'ERROR',
		type,
		message,
		errorCode,
		errorDetail,
		metadata,
	});
}

/**
 * 记录 DEBUG 级别日志（仅写入文件，不写入数据库）
 */
export function logDebug(
	taskId: string,
	type: TaskType,
	message: string,
	metadata?: Record<string, unknown>
): void {
	const entry: LogEntry = {
		taskId,
		level: 'DEBUG',
		type,
		message,
		metadata,
	};
	writeFileLog(entry);
}

/**
 * 查询任务日志
 */
export async function getTaskLogs(
	taskId: string,
	options?: {
		level?: LogLevel;
		limit?: number;
		offset?: number;
	}
): Promise<Array<{
	id: number;
	taskId: string;
	level: string;
	type: string;
	message: string;
	metadata: Record<string, unknown> | null;
	errorCode: string | null;
	errorDetail: string | null;
	createdAt: string;
}>> {
	const db = await getDb();
	
	const conditions = [eq(taskLogs.taskId, taskId)];
	if (options?.level) {
		conditions.push(eq(taskLogs.level, options.level));
	}

	const result = await db
		.select()
		.from(taskLogs)
		.where(conditions.length === 1 ? conditions[0] : undefined)
		.orderBy(desc(taskLogs.createdAt))
		.limit(options?.limit || 100)
		.offset(options?.offset || 0);

	return result.map((row) => ({
		...row,
		metadata: (row.metadata as Record<string, unknown>) ?? null,
	}));
}
