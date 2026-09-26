import express from 'express';
import cookieParser from 'cookie-parser';
import { productsRouter } from './routes/products.js';
import { ordersRouter } from './routes/orders.js';
import { adminAuthRouter } from './routes/admin/auth.js';
import { adminProductsRouter } from './routes/admin/products.js';
import { adminOrdersRouter } from './routes/admin/orders.js';
import { requireAdmin } from './middleware/requireAdmin.js';

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    if (process.env.CLIENT_ORIGIN) {
      res.header('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);

  app.use('/api/admin', adminAuthRouter);
  app.use('/api/admin/products', requireAdmin, adminProductsRouter);
  app.use('/api/admin/orders', requireAdmin, adminOrdersRouter);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
