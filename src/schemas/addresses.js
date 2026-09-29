import { z } from 'zod';

// The shipping fields shared by a saved address and the checkout's customer.
const shippingSchema = z.object({
  phone: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().nullish(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

const addressSchema = shippingSchema.extend({
  label: z.string().max(64).nullish(),
  recipientName: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export { shippingSchema, addressSchema };
