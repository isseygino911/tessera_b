import express from 'express';
import cookieParser from 'cookie-parser';
import { cors } from './middleware/cors.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { productsRouter, adminProductsRouter } from './routes/products.js';
import { ordersRouter, adminOrdersRouter } from './routes/orders.js';
import { adminSummaryRouter } from './routes/summary.js';
import { adminEmailRouter } from './routes/email.js';
import { authRouter } from './routes/auth.js';
import { addressesRouter } from './routes/addresses.js';
import { requireUser } from './middleware/requireUser.js';

const createApp = () => {
  const app = express();

  app.use(cors);
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/addresses', requireUser, addressesRouter);
  app.use('/api/admin/products', requireAdmin, adminProductsRouter);
  app.use('/api/admin/orders', requireAdmin, adminOrdersRouter);
  app.use('/api/admin/summary', requireAdmin, adminSummaryRouter);
  app.use('/api/admin/email', requireAdmin, adminEmailRouter);

  app.use(errorHandler);

  return app;
};

export { createApp };
