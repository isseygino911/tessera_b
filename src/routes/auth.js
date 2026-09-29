import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middleware/requireUser.js';
import { validate } from '../middleware/validate.js';
import { signupSchema, loginSchema, profileSchema, passwordSchema } from '../schemas/auth.js';
import * as auth from '../controllers/auth.js';

const authRouter = Router();
authRouter.post('/signup', validate(signupSchema), asyncHandler(auth.signup));
authRouter.post('/login', validate(loginSchema), asyncHandler(auth.login));
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireUser, auth.me);
authRouter.patch('/me', requireUser, validate(profileSchema, 'Invalid profile'), asyncHandler(auth.updateMe));
authRouter.put('/me/password', requireUser, validate(passwordSchema, 'Invalid password'), asyncHandler(auth.changePassword));
authRouter.get('/google', auth.googleStart);
authRouter.get('/google/callback', auth.googleCallback);

export { authRouter };
