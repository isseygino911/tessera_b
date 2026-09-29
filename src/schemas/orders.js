import { z } from 'zod';
import { shippingSchema } from './addresses.js';

const ORDER_STATUSES = ['new', 'contacted', 'paid', 'shipped', 'cancelled'];

const orderSchema = z.object({
  customer: shippingSchema.extend({
    name: z.string().min(1),
    email: z.string().email(),
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
  saveAddress: z.boolean().optional(),
});

const orderUpdateSchema = z
  .object({ status: z.enum(ORDER_STATUSES), adminNote: z.string() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export { orderSchema, orderUpdateSchema, orderListQuerySchema };
