import { z } from 'zod';

const ORDER_STATUSES = ['new', 'contacted', 'paid', 'shipped', 'cancelled'];

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

const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
const orderListQuerySchema = orderStatusSchema.partial();

export { orderSchema, orderStatusSchema, orderListQuerySchema };
