import { z } from 'zod';

const emailField = z.preprocess(
  (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
  z.string().email('A valid email is required')
);

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export { signupSchema, loginSchema };
