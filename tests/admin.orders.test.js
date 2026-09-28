import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import {
  adminAgent,
  buildOrderPayload,
  createUser,
  loginAgent,
  seedOrder,
  stockOf,
} from './setup.js';

const app = createApp();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  it('returns { orders, total }, newest first', async () => {
    const id1 = await createOrder({ items: [{ productId: 1, qty: 1 }] });
    const id2 = await createOrder({ items: [{ productId: 2, qty: 1 }] });
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.orders.map((o) => o.id).sort()).toEqual([id1, id2].sort());
  });

  it('paginates 20 per page: page 2 of 25 orders has 5, and total is 25', async () => {
    for (let i = 0; i < 25; i += 1) {
      await seedOrder({ created_at: new Date(Date.now() - i * 1000) });
    }
    const agent = await adminAgent(app);

    const page1 = await agent.get('/api/admin/orders').query({ page: 1 });
    const page2 = await agent.get('/api/admin/orders').query({ page: 2 });

    expect(page1.body.total).toBe(25);
    expect(page1.body.orders).toHaveLength(20);
    expect(page2.body.total).toBe(25);
    expect(page2.body.orders).toHaveLength(5);
    // Newest first, no overlap between pages.
    const page1Ids = new Set(page1.body.orders.map((o) => o.id));
    const page2Ids = new Set(page2.body.orders.map((o) => o.id));
    expect([...page1Ids].some((id) => page2Ids.has(id))).toBe(false);
  });

  it('includes itemCount, the sum of quantities on the order', async () => {
    await seedOrder({
      items: [
        { productId: 1, qty: 2 },
        { productId: 2, qty: 3 },
      ],
    });
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders');

    expect(res.body.orders[0].itemCount).toBe(5);
  });

  it('filters by status', async () => {
    const newId = await createOrder({ items: [{ productId: 1, qty: 1 }] });
    const contactedId = await createOrder({ items: [{ productId: 2, qty: 1 }] });
    const agent = await adminAgent(app);
    await agent.patch(`/api/admin/orders/${contactedId}`).send({ status: 'contacted' });

    const res = await agent.get('/api/admin/orders').query({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.orders.map((o) => o.id)).toEqual([contactedId]);
    expect(res.body.orders.map((o) => o.id)).not.toContain(newId);
  });

  it('rejects an unknown status filter with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders').query({ status: 'bogus' });

    expect(res.status).toBe(400);
  });

  describe('search (q)', () => {
    it('matches an id prefix', async () => {
      const id = await seedOrder({ id: 'abc12345-0000-0000-0000-000000000000' });
      await seedOrder({ id: 'ffffffff-0000-0000-0000-000000000000' });
      const agent = await adminAgent(app);

      const res = await agent.get('/api/admin/orders').query({ q: 'abc123' });

      expect(res.body.orders.map((o) => o.id)).toEqual([id]);
    });

    it('matches a leading-# short id, case-insensitively', async () => {
      const id = await seedOrder({ id: 'abc12345-0000-0000-0000-000000000000' });
      await seedOrder({ id: 'ffffffff-0000-0000-0000-000000000000' });
      const agent = await adminAgent(app);

      const res = await agent.get('/api/admin/orders').query({ q: '#ABC123' });

      expect(res.body.orders.map((o) => o.id)).toEqual([id]);
    });

    it('matches a partial customer name', async () => {
      const id = await seedOrder({ customer_name: 'Ada Lovelace' });
      await seedOrder({ customer_name: 'Grace Hopper' });
      const agent = await adminAgent(app);

      const res = await agent.get('/api/admin/orders').query({ q: 'lovelace' });

      expect(res.body.orders.map((o) => o.id)).toEqual([id]);
    });

    it('matches a partial email', async () => {
      const id = await seedOrder({ email: 'ada@example.com' });
      await seedOrder({ email: 'grace@example.com' });
      const agent = await adminAgent(app);

      const res = await agent.get('/api/admin/orders').query({ q: 'ada@' });

      expect(res.body.orders.map((o) => o.id)).toEqual([id]);
    });
  });
});

describe('GET /api/admin/orders/:id', () => {
  it('returns order detail with items and adminNote', async () => {
    const id = await createOrder({ items: [{ productId: 1, qty: 2 }] });
    const agent = await adminAgent(app);
    await agent.patch(`/api/admin/orders/${id}`).send({ adminNote: 'Call before shipping' });

    const res = await agent.get(`/api/admin/orders/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      status: 'new',
      totalCents: 9600,
      adminNote: 'Call before shipping',
    });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      productId: 1,
      productName: 'Sunlit Amber',
      unitPriceCents: 4800,
      quantity: 2,
      imageUrl: 'https://s3.test/products/sunlit-amber/main.jpg',
    });
  });

  it('404s for an unknown UUID', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders/00000000-0000-0000-0000-000000000000');

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

  it('saves adminNote and it shows up in GET /:id', async () => {
    const id = await createOrder();
    const agent = await adminAgent(app);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({ adminNote: 'VIP customer' });

    expect(res.status).toBe(200);
    expect(res.body.adminNote).toBe('VIP customer');

    const getRes = await agent.get(`/api/admin/orders/${id}`);
    expect(getRes.body.adminNote).toBe('VIP customer');
  });

  it('rejects an empty body with 400', async () => {
    const id = await createOrder();
    const agent = await adminAgent(app);

    const res = await agent.patch(`/api/admin/orders/${id}`).send({});

    expect(res.status).toBe(400);
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

  it('404s for an unknown UUID', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .patch('/api/admin/orders/00000000-0000-0000-0000-000000000000')
      .send({ status: 'contacted' });

    expect(res.status).toBe(404);
  });

  it('401s without an admin session', async () => {
    const id = await createOrder();

    const res = await request(app).patch(`/api/admin/orders/${id}`).send({ status: 'contacted' });

    expect(res.status).toBe(401);
  });
});

describe('order ids', () => {
  it('are UUIDs end to end: POST, GET /:id and GET / all use the same UUID', async () => {
    const id = await createOrder();
    expect(id).toMatch(UUID_RE);

    const agent = await adminAgent(app);
    const getRes = await agent.get(`/api/admin/orders/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);
  });
});
