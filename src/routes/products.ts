import { Router } from 'express';
import { bulkUpdate, create, list, search, sell } from '../controllers/productController.js';

export const productRouter = Router();
productRouter.post('/', create);
productRouter.get('/', list);
productRouter.post('/sell', sell);
productRouter.get('/search', search);
productRouter.put('/bulk-price-update', bulkUpdate);
