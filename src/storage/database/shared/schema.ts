import { pgTable, serial, timestamp, index, pgPolicy, varchar, jsonb, integer, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户表
export const users = pgTable("users", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	username: varchar("username", { length: 50 }).unique().notNull(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	role: varchar("role", { length: 20 }).default("member").notNull(), // admin, member
	dailyLimit: integer("daily_limit").default(30).notNull(), // 每日生成限额（分钟）
	tokenUsedToday: integer("token_used_today").default(0).notNull(), // 今日已使用
	lastResetDate: varchar("last_reset_date", { length: 10 }), // 上次重置日期 YYYY-MM-DD
	isDeleted: boolean("is_deleted").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("users_username_idx").on(table.username),
	index("users_role_idx").on(table.role),
]);

export const videoTasks = pgTable("video_tasks", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	modelId: varchar("model_id", { length: 50 }).default("seedance2.0").notNull(),
	mode: varchar("mode", { length: 20 }).default("single").notNull(),
	prompt: varchar("prompt", { length: 4000 }).notNull(),
	originalPrompt: varchar("original_prompt", { length: 4000 }),
	imageUrls: jsonb("image_urls"),
	resultUrl: varchar("result_url", { length: 1000 }),
	status: integer("status").default(0).notNull(),
	extraData: jsonb("extra_data"),
	metadata: jsonb("metadata"),
	errorMessage: varchar("error_message", { length: 1000 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("video_tasks_created_at_idx").on(table.createdAt),
	index("video_tasks_status_idx").on(table.status),
	index("video_tasks_user_id_idx").on(table.userId),
	index("video_tasks_user_status_idx").on(table.userId, table.status),
]);

// 任务日志表
export const taskLogs = pgTable("task_logs", {
	id: serial("id").primaryKey(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	level: varchar("level", { length: 10 }).notNull(),  // INFO, WARN, ERROR
	type: varchar("type", { length: 50 }).notNull(),    // video_task, extend_task, edit_task, audio_task
	message: varchar("message", { length: 500 }).notNull(),
	metadata: jsonb("metadata"),                       // 附加数据
	errorCode: varchar("error_code", { length: 50 }),  // 错误码
	errorDetail: varchar("error_detail", { length: 2000 }), // 详细错误信息
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("task_logs_task_id_idx").on(table.taskId),
	index("task_logs_level_idx").on(table.level),
	index("task_logs_created_at_idx").on(table.createdAt),
]);

// 配音任务表
export const audioTasks = pgTable("audio_tasks", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	type: varchar("type", { length: 20 }).notNull(),  // 'tts' | 'clone' | 'bgm'
	prompt: varchar("prompt", { length: 4000 }),
	speaker: varchar("speaker", { length: 100 }),       // TTS 音色 ID
	referenceAudioUrl: varchar("reference_audio_url", { length: 1000 }),  // 参考音频 URL
	resultUrl: varchar("result_url", { length: 1000 }), // 生成结果 URL
	duration: integer("duration"),                     // 时长（秒）
	status: integer("status").default(0).notNull(),    // 0=排队, 1=处理中, 2=成功, -1=失败
	metadata: jsonb("metadata"),                       // 扩展数据
	errorMessage: varchar("error_message", { length: 1000 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("audio_tasks_user_id_idx").on(table.userId),
	index("audio_tasks_type_idx").on(table.type),
	index("audio_tasks_status_idx").on(table.status),
	index("audio_tasks_created_at_idx").on(table.createdAt),
]);
