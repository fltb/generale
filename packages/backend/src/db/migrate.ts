import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "path";
import { db } from "./client";

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle");

export function runMigrations() {
  if (!existsSync(MIGRATIONS_FOLDER)) {
    console.info("[db] no migration folder found, skipping");
    return;
  }

  try {
    const DB_FILE = process.env["DB_FILE_NAME"];
    if (DB_FILE && existsSync(DB_FILE)) {
      sealExistingMigrations(DB_FILE);
    }
    const start = performance.now();
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const ms = (performance.now() - start).toFixed(1);
    console.info(`[db] migrations applied in ${ms}ms`);
  } catch (err) {
    console.error("[db] migration failed:", err);
    throw err;
  }
}

/**
 * 预存 DB 首次遇到迁移系统及后续新增迁移时，检测对应表是否已存在。
 * 若存在但迁移未记录，用文件 SHA-256 hash 标记为已应用，
 * 防止 migrate() 尝试重复 CREATE TABLE / ALTER TABLE。
 */
function sealExistingMigrations(dbPath: string) {
  const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  if (!existsSync(journalPath)) return;

  const sqlite = new Database(dbPath);

  const hasUsersTable = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();

  if (!hasUsersTable) {
    sqlite.close();
    return;
  }

  // ensure migrations tracking table exists (idempotent)
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER)`,
  );

  // which hashes are already recorded (real drizzle hashes, not legacy tag strings)
  const applied = new Set(
    (sqlite.prepare(`SELECT hash FROM __drizzle_migrations`).all() as Array<{ hash: string }>).map((r) => r.hash),
  );

  // remove any legacy tag entries inserted by old versions of this function
  for (const h of applied) {
    if (h.includes("_")) {
      sqlite.prepare(`DELETE FROM __drizzle_migrations WHERE hash = ?`).run(h);
    }
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
  };

  // tables introduced by each migration — used to detect pre-existing tables
  const migrationTables: Record<string, string[]> = {
    "0000_clammy_korath": ["users", "profiles", "sessions", "verification_tokens"],
    "0002_sparkling_stranger": ["custom_maps"],
  };

  let sealed = 0;
  for (const entry of journal.entries) {
    const sqlPath = path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) continue;
    const content = readFileSync(sqlPath, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");
    if (applied.has(hash)) continue;

    const tables = migrationTables[entry.tag];
    if (!tables || tables.length === 0) {
      if ((sqlite.prepare(`SELECT COUNT(*) as c FROM __drizzle_migrations`).get() as { c: number })?.c === 0) {
        sqlite.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(hash, entry.when);
        sealed++;
      }
      continue;
    }
    if (
      tables.every((t) => sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).get())
    ) {
      sqlite.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(hash, entry.when);
      sealed++;
    }
  }

  if (sealed > 0) console.info(`[db] sealed ${sealed} migration(s) for pre-existing tables`);
  sqlite.close();
}
