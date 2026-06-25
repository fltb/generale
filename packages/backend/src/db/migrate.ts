import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { db } from './client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'path';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, '../../drizzle');

export async function runMigrations() {
  if (!existsSync(MIGRATIONS_FOLDER)) {
    console.info('[db] no migration folder found, skipping');
    return;
  }

  try {
    const DB_FILE = process.env['DB_FILE_NAME'];
    if (DB_FILE && existsSync(DB_FILE)) {
      sealExistingMigrations(DB_FILE);
    }
    const start = performance.now();
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const ms = (performance.now() - start).toFixed(1);
    console.info(`[db] migrations applied in ${ms}ms`);
  } catch (err) {
    console.error('[db] migration failed:', err);
    throw err;
  }
}

/**
 * 预存 DB 首次遇到迁移系统时，把 _journal.json 里所有迁移标记为已应用，
 * 防止 migrate() 尝试重复 CREATE TABLE。
 */
function sealExistingMigrations(dbPath: string) {
  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
  if (!existsSync(journalPath)) return;

  const sqlite = new Database(dbPath);

  const hasMigrationsTable = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)
    .get();

  if (hasMigrationsTable) {
    sqlite.close();
    return;
  }

  const hasUsersTable = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get();

  if (!hasUsersTable) {
    sqlite.close();
    return;
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
    entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
  };

  sqlite.run(
    `CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER)`,
  );

  const insert = sqlite.prepare(
    `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
  );
  for (const entry of journal.entries) {
    insert.run(entry.tag, entry.when);
  }

  console.info(`[db] sealed ${journal.entries.length} existing migrations for pre-existing database`);
  sqlite.close();
}
