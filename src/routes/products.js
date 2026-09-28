import { Router, raw } from 'express';
import { asyncHandler } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { productSchema, productUpdateSchema, imageUpdateSchema } from '../schemas/products.js';
import * as products from '../controllers/products.js';

const rawImage = raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' });

const productsRouter = Router();
productsRouter.get('/', asyncHandler(products.listActive));

const adminProductsRouter = Router();
adminProductsRouter.get('/', asyncHandler(products.list));
adminProductsRouter.get('/:id', asyncHandler(products.get));
adminProductsRouter.post('/', validate(productSchema, 'Invalid product'), asyncHandler(products.create));
adminProductsRouter.put('/:id', validate(productUpdateSchema, 'Invalid product'), asyncHandler(products.update));
adminProductsRouter.delete('/:id', asyncHandler(products.remove));
adminProductsRouter.post('/:id/images', rawImage, asyncHandler(products.addImage));
adminProductsRouter.patch(
  '/:id/images/:imageId',
  validate(imageUpdateSchema, 'Invalid image update'),
  asyncHandler(products.updateImage)
);
adminProductsRouter.delete('/:id/images/:imageId', asyncHandler(products.removeImage));

export { productsRouter, adminProductsRouter };
