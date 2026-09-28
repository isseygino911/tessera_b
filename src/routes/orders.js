import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middleware/requireUser.js';
import { validate } from '../middleware/validate.js';
import { orderSchema, orderUpdateSchema, orderListQuerySchema } from '../schemas/orders.js';
import * as orders from '../controllers/orders.js';

const ordersRouter = Router();
ordersRouter.post('/', requireUser, validate(orderSchema, 'Invalid order'), asyncHandler(orders.create));

const adminOrdersRouter = Router();
adminOrdersRouter.get('/', validate(orderListQuerySchema, 'Invalid query', 'query'), asyncHandler(orders.list));
adminOrdersRouter.get('/:id', asyncHandler(orders.get));
adminOrdersRouter.patch('/:id', validate(orderUpdateSchema, 'Invalid update'), asyncHandler(orders.update));

export { ordersRouter, adminOrdersRouter };
