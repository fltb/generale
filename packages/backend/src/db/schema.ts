import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  // Store UUIDs as TEXT; generate by default in JS
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => randomUUID()),

  username: text("username").notNull().unique(),

  email: text("email").notNull(),

  password: text("password").notNull(),

  // Boolean stored as 0/1
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),

  /** 上次修改 username 的时间，null 表示从未修改。用于限制修改频率（如每 7 天一改） */
  usernameChangedAt: integer("username_changed_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),

  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const verificationTokens = sqliteTable("verification_tokens", {
  token: text("token").primaryKey().notNull(),

  // Reference user.id (TEXT)
  userId: text("user_id")
    .notNull()
    .references(() => users.id),

  /**
   * Token 用途。不同用途隔离，防止 register token 被拿去 reset 别人密码这类滥用。
   * - 'register':       新注册邮箱验证
   * - 'reset-password': 忘记密码流程
   * - 'change-email':   登录态改邮箱，配合下面 newEmail 字段
   */
  purpose: text("purpose").notNull().default("register"),

  /** 仅 change-email 用：存目标新邮箱，确认时把 users.email 改成这个 */
  newEmail: text("new_email"),

  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

/**
 * 登录 session。一个用户在任一时刻只允许一个有效 session：
 * 新登录会调用 sessionService.deleteAllForUser(userId) 把这里的旧记录清掉。
 *
 * 老实现是 in-memory Map，重启即丢；落到 DB 之后服务端可以平滑重启不掉登录。
 */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),
  /** 滑动过期：每次访问会把这个字段往后推 */
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Custom maps: DB stores metadata only; tiles are in ./public/maps/<id>.json
export const customMaps = sqliteTable("custom_maps", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  authorName: text("author_name").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  tileCount: integer("tile_count").notNull(),
  minPlayers: integer("min_players").default(2).notNull(),
  maxPlayers: integer("max_players").default(8).notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).default(false).notNull(),
  isDraft: integer("is_draft", { mode: "boolean" }).default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  tags: text("tags"), // JSON array
  hasCustomThumbnail: integer("has_custom_thumbnail", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// User profiles
export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  displayName: text("display_name"),
  /** 原图 URL（profile 页用） */
  avatarUrl: text("avatar_url"),
  /** 缩略图 URL（Nav、PlayerList 等小尺寸场景用） */
  avatarThumbUrl: text("avatar_thumb_url"),
  bio: text("bio"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(CURRENT_TIMESTAMP)`),
});

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  }),
);

export const gameResults = sqliteTable("game_results", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  gameType: text("game_type").notNull(),
  endedAt: integer("ended_at").notNull(),
  durationMs: integer("duration_ms"),
  participants: text("participants").notNull(),
  stateSnapshot: text("state_snapshot"),
});

export const gameUserSettings = sqliteTable(
  "game_user_settings",
  {
    userId: text("user_id").notNull(),
    gameType: text("game_type").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.gameType, table.key] }),
  }),
);
