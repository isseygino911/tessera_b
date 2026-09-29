import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { addressSchema } from '../schemas/addresses.js';
import * as addresses from '../controllers/addresses.js';

// Mounted behind requireUser in app.js.
const addressesRouter = Router();
addressesRouter.get('/', asyncHandler(addresses.list));
addressesRouter.post('/', validate(addressSchema, 'Invalid address'), asyncHandler(addresses.create));
addressesRouter.put('/:id', validate(addressSchema, 'Invalid address'), asyncHandler(addresses.update));
addressesRouter.delete('/:id', asyncHandler(addresses.remove));

export { addressesRouter };
