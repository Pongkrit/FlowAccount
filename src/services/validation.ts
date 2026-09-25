import { categories, type ProductInput } from '../types/product.js';
import { HttpError } from './errors.js';

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, ['Request body must be a JSON object']);
  }
  return value as Record<string, unknown>;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateId(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, ['productId must be a positive safe integer']);
  }
}

export function validateProduct(value: unknown): ProductInput {
  const body = objectBody(value);
  const errors: string[] = [];
  if (typeof body.name !== 'string' || !body.name.trim()) errors.push('ชื่อสินค้าต้องไม่ว่าง');
  if (typeof body.sku !== 'string' || [...body.sku.trim()].length < 3) errors.push('รหัสสินค้าต้องมีอย่างน้อย 3 ตัวอักษร');
  if (!isPositiveNumber(body.price)) errors.push('ราคาต้องมากกว่า 0');
  if (typeof body.stock !== 'number' || !Number.isFinite(body.stock) || body.stock < 0) errors.push('จำนวนคงเหลือต้องไม่ติดลบ');
  if (!categories.includes(body.category as ProductInput['category'])) errors.push('หมวดหมู่ไม่ถูกต้อง');
  if (errors.length) throw new HttpError(400, errors);
  return {
    name: (body.name as string).trim(), sku: (body.sku as string).trim(),
    price: body.price as number, stock: body.stock as number,
    category: body.category as ProductInput['category'],
  };
}
