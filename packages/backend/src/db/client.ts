import { drizzle } from 'drizzle-orm/bun-sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

let _db: ReturnType<typeof drizzle> | undefined;

function initDb() {
  if (_db) return _db;
  const DB_FILE = process.env["DB_FILE_NAME"];
  if (!DB_FILE) throw new Error("Missing environment variable: DB_FILE_NAME");
  if (DB_FILE !== ':memory:') {
    const dir = path.dirname(DB_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(DB_FILE)) writeFileSync(DB_FILE, '');
  }
  _db = drizzle(DB_FILE);
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (initDb() as any)[prop];
  },
});