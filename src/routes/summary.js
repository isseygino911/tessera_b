import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import * as summary from '../controllers/summary.js';

const adminSummaryRouter = Router();
adminSummaryRouter.get('/', asyncHandler(summary.get));

export { adminSummaryRouter };
