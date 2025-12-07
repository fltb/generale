import { drizzle } from 'drizzle-orm/bun-sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const DB_FILE = process.env["DB_FILE_NAME"] as string;

if (!DB_FILE) {
  throw new Error("Missing environment variable: DB_FILE_NAME");
}

const dir = path.dirname(DB_FILE);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

if (!existsSync(DB_FILE)) {
  writeFileSync(DB_FILE, '');
  console.log(`[db] created sqlite file: ${DB_FILE}`);
}

export const db = drizzle(DB_FILE);