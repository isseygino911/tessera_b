import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middleware/requireUser.js';
import { validate } from '../middleware/validate.js';
import { orderSchema, orderStatusSchema, orderListQuerySchema } from '../schemas/orders.js';
import * as orders from '../controllers/orders.js';

const ordersRouter = Router();
ordersRouter.post('/', requireUser, validate(orderSchema, 'Invalid order'), asyncHandler(orders.create));

const adminOrdersRouter = Router();
adminOrdersRouter.get('/', validate(orderListQuerySchema, 'Invalid status', 'query'), asyncHandler(orders.list));
adminOrdersRouter.get('/:id', asyncHandler(orders.get));
adminOrdersRouter.patch('/:id', validate(orderStatusSchema, 'Invalid status'), asyncHandler(orders.updateStatus));

export { ordersRouter, adminOrdersRouter };
