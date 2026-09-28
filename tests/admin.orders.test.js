import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { adminAgent, buildOrderPayload, createUser, loginAgent, stockOf } from './setup.js';

const app = createApp();

let orderCounter = 0;

async function createOrder(overrides = {}) {
  // Each order needs a signed-in customer; a fresh email per call keeps
  // fixtures independent of each other.
  orderCounter += 1;
  const email = `customer-${orderCounter}@example.com`;
  await createUser({ email, password: 'correct-horse' });
  const agent = await loginAgent(app, email, 'correct-horse');

  const res = await agent.post('/api/orders').send(buildOrderPayload(overrides));
  return res.body.id;
}

describe('GET /api/admin/orders', () => {
  it('lists all orders', async () => {
    const id1 = await createOrder({ items: [{ productId: 1, qty: 1 }] });
    const id2 = await createOrder({ items: [{ productId: 2, qty: 1 }] });
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders');

    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.id).sort()).toEqual([id1, id2].sort());
  });

  it('filters by status', async () => {
    const newId = await createOrder({ items: [{ productId: 1, qty: 1 }] });
    const contactedId = await createOrder({ items: [{ productId: 2, qty: 1 }] });
    const agent = await adminAgent(app);
    await agent.patch(`/api/admin/orders/${contactedId}`).send({ status: 'contacted' });

    const res = await agent.get('/api/admin/orders').query({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.id)).toEqual([contactedId]);
    expect(res.body.map((o) => o.id)).not.toContain(newId);
  });

  it('rejects an unknown status filter with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders').query({ status: 'bogus' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/orders/:id', () => {
  it('returns order detail with items', async () => {
    const id = await createOrder({ items: [{ productId: 1, qty: 2 }] });
    const agent = await adminAgent(app);

    const res = await agent.get(`/api/admin/orders/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'new', totalCents: 9600 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      productId: 1,
      productName: 'Sunlit Amber',
      unitPriceCents: 4800,
      quantity: 2,
    });
  });

  it('404s for an unknown order', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders/999999');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/orders/:id', () => {
  it('updates the status', async () => {
    const id = await createOrder();
    const agent = await adminAgent(app);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'contacted' });

    const [[row]] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
    expect(row.status).toBe('contacted');
  });

  it('rejects an invalid status with 400 and leaves the order unchanged', async () => {
    const id = await createOrder();
    const agent = await adminAgent(app);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({ status: 'not-a-real-status' });

    expect(res.status).toBe(400);
    const [[row]] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
    expect(row.status).toBe('new');
  });

  it('setting status to cancelled restores stock', async () => {
    const id = await createOrder({ items: [{ productId: 1, qty: 3 }] });
    expect(await stockOf(1)).toBe(17);
    const agent = await adminAgent(app);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(await stockOf(1)).toBe(20);
  });

  it('cancelling twice does not double-restore stock', async () => {
    const id = await createOrder({ items: [{ productId: 1, qty: 3 }] });
    const agent = await adminAgent(app);

    await agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' });
    expect(await stockOf(1)).toBe(20);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(await stockOf(1)).toBe(20);
  });

  it('under concurrent double-cancel requests, restores stock exactly once', async () => {
    const id = await createOrder({ items: [{ productId: 1, qty: 3 }] });
    const agent = await adminAgent(app);

    const [resA, resB] = await Promise.all([
      agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' }),
      agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' }),
    ]);

    expect([resA.status, resB.status]).toEqual([200, 200]);
    expect(await stockOf(1)).toBe(20);

    const [[row]] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
    expect(row.status).toBe('cancelled');
  });

  it('restores stock for every line item in a multi-item cancelled order', async () => {
    const id = await createOrder({
      items: [
        { productId: 1, qty: 2 },
        { productId: 2, qty: 4 },
      ],
    });
    const agent = await adminAgent(app);

    await agent.patch(`/api/admin/orders/${id}`).send({ status: 'cancelled' });

    expect(await stockOf(1)).toBe(20);
    expect(await stockOf(2)).toBe(20);
  });

  it('404s for an unknown order', async () => {
    const agent = await adminAgent(app);

    const res = await agent.patch('/api/admin/orders/999999').send({ status: 'contacted' });

    expect(res.status).toBe(404);
  });

  it('401s without an admin session', async () => {
    const id = await createOrder();

    const res = await request(app).patch(`/api/admin/orders/${id}`).send({ status: 'contacted' });

    expect(res.status).toBe(401);
  });
});
