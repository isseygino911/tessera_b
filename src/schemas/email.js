import { z } from 'zod';

const testEmailSchema = z.object({
  to: z.string().trim().email(),
  message: z.string().trim().min(1).max(5000),
});

export { testEmailSchema };
