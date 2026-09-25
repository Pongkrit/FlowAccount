import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function openDatabase() {
  const filename = process.env.DB_PATH ?? 'data/products.sqlite';
  if (filename !== ':memory:') await mkdir(dirname(filename), { recursive: true });
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      sku TEXT NOT NULL UNIQUE CHECK (length(trim(sku)) >= 3),
      price REAL NOT NULL CHECK (price > 0),
      stock REAL NOT NULL CHECK (stock >= 0),
      category TEXT NOT NULL CHECK (category IN ('อาหาร', 'เครื่องดื่ม', 'ของใช้', 'เสื้อผ้า')),
      createdAt TEXT NOT NULL
    );
  `);
  return db;
}

// One shared connection; sqlite's promise API keeps database calls awaitable.
export const database = openDatabase();
