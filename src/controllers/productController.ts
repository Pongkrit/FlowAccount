import type { Request, Response } from 'express';
import * as products from '../services/productService.js';
import { HttpError } from '../services/errors.js';
import { isPositiveNumber, objectBody, validateId, validateProduct } from '../services/validation.js';

export async function create(req: Request, res: Response) {
  res.status(201).json(await products.createProduct(validateProduct(req.body)));
}

export async function list(req: Request, res: Response) {
  const category = req.query.category;
  if (category !== undefined && typeof category !== 'string') throw new HttpError(400, ['category must be a single string']);
  res.json(await products.listProducts(category));
}

export async function sell(req: Request, res: Response) {
  const body = objectBody(req.body);
  // Preserve the exercise's order: quantity, product existence, sufficient stock.
  if (!isPositiveNumber(body.quantity)) throw new HttpError(400, ['quantity must be a finite number greater than 0']);
  validateId(body.productId);
  res.json(await products.sellProduct(body.productId, body.quantity));
}

export async function search(req: Request, res: Response) {
  if (typeof req.query.keyword !== 'string') throw new HttpError(400, ['keyword must be a single string']);
  res.json(await products.searchProducts(req.query.keyword));
}

export async function bulkUpdate(req: Request, res: Response) {
  if (!Array.isArray(req.body)) throw new HttpError(400, ['Request body must be an array']);
  // Validate every entry before writing so bad input cannot partially update prices.
  const updates = req.body.map((value: unknown) => {
    const entry = objectBody(value);
    validateId(entry.productId);
    if (!isPositiveNumber(entry.newPrice)) throw new HttpError(400, ['newPrice must be a finite number greater than 0']);
    return { productId: entry.productId, newPrice: entry.newPrice };
  });
  res.json(await products.bulkUpdatePrices(updates));
}
