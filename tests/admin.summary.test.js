import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { adminAgent, customerAgent, seedOrder } from './setup.js';

const app = createApp();

function startOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe('GET /api/admin/summary', () => {
  it('counts new orders', async () => {
    await seedOrder({ status: 'new' });
    await seedOrder({ status: 'new' });
    await seedOrder({ status: 'contacted' });
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.status).toBe(200);
    expect(res.body.newOrders).toBe(2);
  });

  it('sums revenue for orders placed this month, excluding cancelled orders and last month', async () => {
    const thisMonth = startOfThisMonth();
    const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 15);

    await seedOrder({ total_cents: 1000, status: 'paid', created_at: new Date() });
    await seedOrder({ total_cents: 2000, status: 'new', created_at: new Date() });
    await seedOrder({ total_cents: 5000, status: 'cancelled', created_at: new Date() });
    await seedOrder({ total_cents: 9000, status: 'paid', created_at: lastMonth });
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.body.revenueThisMonthCents).toBe(3000);
  });

  it('lists active products with stock of 5 or fewer as lowStock', async () => {
    await pool.query('UPDATE products SET stock = 3 WHERE id = 1');
    await pool.query('UPDATE products SET stock = 5 WHERE id = 2');
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.body.lowStock).toEqual(
      expect.arrayContaining([
        { id: 1, name: 'Sunlit Amber', stock: 3 },
        { id: 2, name: 'Forest Emerald', stock: 5 },
      ])
    );
  });

  it('excludes products with stock above 5 from lowStock', async () => {
    await pool.query('UPDATE products SET stock = 6 WHERE id = 1');
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.body.lowStock.find((p) => p.id === 1)).toBeUndefined();
  });

  it('excludes inactive products from lowStock even when their stock is low', async () => {
    await pool.query('UPDATE products SET stock = 2, active = 0 WHERE id = 3');
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.body.lowStock.find((p) => p.id === 3)).toBeUndefined();
  });

  it('returns at most 5 recent orders, newest first', async () => {
    const ids = [];
    for (let i = 0; i < 7; i += 1) {
      ids.push(await seedOrder({ created_at: daysAgo(i) }));
    }
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.body.recentOrders).toHaveLength(5);
    expect(res.body.recentOrders.map((o) => o.id)).toEqual(ids.slice(0, 5));
  });

  it('403s for a signed-in customer', async () => {
    const agent = await customerAgent(app);

    const res = await agent.get('/api/admin/summary');

    expect(res.status).toBe(403);
  });

  it('401s for an anonymous user', async () => {
    const res = await request(app).get('/api/admin/summary');

    expect(res.status).toBe(401);
  });
});
