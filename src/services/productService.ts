import { database } from '../db/database.js';
import type { Product, ProductInput } from '../types/product.js';
import { HttpError } from './errors.js';

const duplicateSku = () => new HttpError(400, ['รหัสสินค้าต้องไม่ซ้ำกับสินค้าที่มีอยู่แล้ว']);

export async function createProduct(input: ProductInput): Promise<Product> {
  const db = await database;
  if (await db.get('SELECT id FROM products WHERE sku = ?', input.sku)) throw duplicateSku();
  try {
    return (await db.get<Product>(
      `INSERT INTO products (name, sku, price, stock, category, createdAt)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      input.name, input.sku, input.price, input.stock, input.category, new Date().toISOString(),
    ))!;
  } catch (error) {
    // A competing insert can pass the pre-check. UNIQUE is the final authority.
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: products.sku')) throw duplicateSku();
    throw error;
  }
}

export async function listProducts(category?: string): Promise<Product[]> {
  const db = await database;
  return category === undefined
    ? db.all<Product[]>('SELECT * FROM products ORDER BY id')
    : db.all<Product[]>('SELECT * FROM products WHERE category = ? ORDER BY id', category);
}

export async function sellProduct(productId: number, quantity: number): Promise<Product> {
  const db = await database;
  const existing = await db.get<Product>('SELECT * FROM products WHERE id = ?', productId);
  if (!existing) throw new HttpError(404, ['Product not found']);
  // Check and decrement in ONE statement. Never write a stock value from an earlier SELECT.
  const updated = await db.get<Product>(
    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? RETURNING *',
    quantity, productId, quantity,
  );
  if (!updated) throw new HttpError(400, ['Insufficient stock']);
  return updated;
}

export async function searchProducts(keyword: string): Promise<Product[]> {
  const needle = keyword.toLowerCase();
  // Small exercise dataset: JS supports Unicode lowercasing, unlike SQLite's default LOWER.
  // includes() treats SQL wildcard characters such as % and _ as literal text.
  return (await listProducts()).filter(product =>
    product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle),
  );
}

export async function bulkUpdatePrices(updates: { productId: number; newPrice: number }[]) {
  const db = await database;
  let updatedCount = 0;
  for (const update of updates) {
    const result = await db.run('UPDATE products SET price = ? WHERE id = ?', update.newPrice, update.productId);
    updatedCount += result.changes ?? 0;
  }
  return { updatedCount };
}
