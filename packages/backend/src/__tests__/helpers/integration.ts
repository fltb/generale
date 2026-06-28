import { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authPlugin } from "../../middleware/authPlugin";
import { userRoutes } from "../../routes/user";
import { profileRoutes } from "../../routes/profile";
import { gameRoutes } from "../../routes/game";
import { mapRoutes } from "../../routes/map";
import { pbkdf2Sync, randomBytes } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 1000, 32, "sha256").toString("hex");
  return `${salt}$${hash}`;
}

export interface SeedUser {
  userId: string;
  username: string;
  password: string;
}

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL, password TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, username_changed_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verification_tokens (token TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL DEFAULT 'register', new_email TEXT, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id), display_name TEXT, avatar_url TEXT, avatar_thumb_url TEXT, bio TEXT, updated_at INTEGER DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS custom_maps (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', author_id TEXT NOT NULL REFERENCES users(id), author_name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, tile_count INTEGER NOT NULL, min_players INTEGER DEFAULT 2 NOT NULL, max_players INTEGER DEFAULT 8 NOT NULL, is_public INTEGER DEFAULT 0 NOT NULL, is_draft INTEGER DEFAULT 1 NOT NULL, usage_count INTEGER DEFAULT 0 NOT NULL, tags TEXT, has_custom_thumbnail INTEGER DEFAULT 0 NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), PRIMARY KEY (user_id, key));
`;

export async function createTestApp() {
  process.env["DB_FILE_NAME"] = ":memory:";
  const { db, resetDb } = await import("../../db/client");
  resetDb(); // Force fresh connection for test isolation
  const rawDb = (db as any).session?.client as Database;
  if (!rawDb) throw new Error("Cannot access underlying SQLite database");
  for (const sql of TABLE_DDL.split(";").filter(Boolean)) {
    const trimmed = sql.trim();
    if (trimmed) rawDb.prepare(trimmed).run();
  }
  const app = new Elysia()
    .use(cors())
    .use(authPlugin)
    .group("/api", (api) =>
      api.use(userRoutes).use(profileRoutes).use(gameRoutes).use(mapRoutes).get("/health", () => ({ status: "ok" })),
    );
  return { app, rawDb };
}

export function seedUser(rawDb: Database, overrides?: Partial<SeedUser>): SeedUser {
  const userId = overrides?.userId ?? `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = overrides?.username ?? `tu_${Math.random().toString(36).slice(2, 8)}`;
  const password = overrides?.password ?? "testpass123";
  const hashed = hashPassword(password);
  rawDb.prepare(`INSERT INTO users (id, username, email, password, verified) VALUES (?, ?, ?, ?, 1)`).run(userId, username, `${username}@t.com`, hashed);
  rawDb.prepare(`INSERT INTO profiles (user_id, display_name) VALUES (?, ?)`).run(userId, username);
  return { userId, username, password };
}

export async function loginAs(app: Elysia, username: string, password: string) {
  const res = await app.handle(new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }));
  const body = await res.json();
  const sid = (res.headers.get("set-cookie") ?? "").match(/sid=([^;]+)/)?.[1] ?? "";
  return { sid, body, status: res.status };
}
