import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { testEmailSchema } from '../schemas/email.js';
import * as email from '../controllers/email.js';

const adminEmailRouter = Router();
adminEmailRouter.post('/test', validate(testEmailSchema, 'Invalid email'), asyncHandler(email.sendTest));

export { adminEmailRouter };
