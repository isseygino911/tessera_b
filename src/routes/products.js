import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { productSchema, productUpdateSchema } from '../schemas/products.js';
import * as products from '../controllers/products.js';

const productsRouter = Router();
productsRouter.get('/', asyncHandler(products.listActive));

const adminProductsRouter = Router();
adminProductsRouter.get('/', asyncHandler(products.list));
adminProductsRouter.get('/:id', asyncHandler(products.get));
adminProductsRouter.post('/', validate(productSchema, 'Invalid product'), asyncHandler(products.create));
adminProductsRouter.put('/:id', validate(productUpdateSchema, 'Invalid product'), asyncHandler(products.update));
adminProductsRouter.delete('/:id', asyncHandler(products.remove));

export { productsRouter, adminProductsRouter };
