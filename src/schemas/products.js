import { z } from 'zod';

const productSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tagline: z.string().min(1),
  story: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  sortOrder: z.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

const productUpdateSchema = productSchema.partial();

export { productSchema, productUpdateSchema };
