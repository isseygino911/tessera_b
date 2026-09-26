import { Router } from 'express';
import { z } from 'zod';
import { createOrder, OversellError } from '../services/orders.js';

export const ordersRouter = Router();

const orderSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    addressLine1: z.string().min(1),
    addressLine2: z.string().optional(),
    city: z.string().min(1),
    region: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
    note: z.string().optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().positive(),
      })
    )
    .min(1),
});

ordersRouter.post('/', async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid order', details: parsed.error.flatten() });
  }

  try {
    const order = await createOrder(parsed.data);
    res.status(201).json(order);
  } catch (err) {
    if (err instanceof OversellError) {
      return res.status(409).json({ error: `Not enough stock for ${err.productName}`, productId: err.productId });
    }
    if (err.name === 'InvalidProductError') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});
