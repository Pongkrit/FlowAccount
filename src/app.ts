import express, { type ErrorRequestHandler } from 'express';
import { productRouter } from './routes/products.js';
import { HttpError } from './services/errors.js';

export const app = express();
app.use(express.json());
app.use('/api/products', productRouter);
app.use((_req, res) => { res.status(404).json({ errors: ['Route not found'] }); });

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ errors: error.errors });
    return;
  }
  // Body parser errors (malformed JSON, oversized body, unsupported encoding).
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ errors: ['Invalid JSON request body'] });
    return;
  }
  console.error(error);
  res.status(500).json({ errors: ['Internal server error'] });
};
// Express 5 forwards rejected async handlers to this middleware.
app.use(errorHandler);
