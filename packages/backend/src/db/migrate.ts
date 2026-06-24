import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from './client';
import { existsSync } from 'node:fs';
import path from 'path';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, '../../drizzle');

export async function runMigrations() {
  if (!existsSync(MIGRATIONS_FOLDER)) {
    console.info('[db] no migration folder found, skipping');
    return;
  }
  try {
    const start = performance.now();
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const ms = (performance.now() - start).toFixed(1);
    console.info(`[db] migrations applied in ${ms}ms`);
  } catch (err) {
    console.error('[db] migration failed:', err);
    throw err;
  }
}
