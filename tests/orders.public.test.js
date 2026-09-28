import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { sendOrderNotification } from '../src/services/mailer.js';
import { buildOrderPayload, createUser, loginAgent, stockOf } from './setup.js';

const app = createApp();

let customerAgent;
let customerId;

beforeEach(async () => {
  customerId = await createUser({ email: 'ada@example.com', password: 'correct-horse' });
  customerAgent = await loginAgent(app, 'ada@example.com', 'correct-horse');
});

describe('POST /api/orders', () => {
  it('creates an order, decrements stock, snapshots price/name, and stores the signed-in user_id', async () => {
    const res = await customerAgent.post('/api/orders').send(buildOrderPayload());

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(await stockOf(1)).toBe(18);

    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [res.body.id]);
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]).toMatchObject({ total_cents: 9600, status: 'new', user_id: customerId });

    const [itemRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [res.body.id]);
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0]).toMatchObject({
      product_id: 1,
      product_name: 'Sunlit Amber',
      unit_price_cents: 4800,
      quantity: 2,
    });

    expect(sendOrderNotification).toHaveBeenCalledTimes(1);
  });

  it('rejects an order attempt with no session with 401', async () => {
    const res = await request(app).post('/api/orders').send(buildOrderPayload());

    expect(res.status).toBe(401);
    const [orders] = await pool.query('SELECT * FROM orders');
    expect(orders).toHaveLength(0);
  });

  it('merges duplicate productIds in items into a single snapshot line', async () => {
    const res = await customerAgent.post('/api/orders').send(
      buildOrderPayload({
        items: [
          { productId: 1, qty: 2 },
          { productId: 1, qty: 3 },
        ],
      })
    );

    expect(res.status).toBe(201);

    const [itemRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [res.body.id]);
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0].quantity).toBe(5);

    const [[order]] = await pool.query('SELECT total_cents FROM orders WHERE id = ?', [res.body.id]);
    expect(order.total_cents).toBe(4800 * 5);
    expect(await stockOf(1)).toBe(15);
  });

  const requiredCustomerFields = [
    'name',
    'email',
    'phone',
    'addressLine1',
    'city',
    'region',
    'postalCode',
    'country',
  ];

  it.each(requiredCustomerFields)('rejects an order missing customer.%s', async (field) => {
    const payload = buildOrderPayload();
    delete payload.customer[field];

    const res = await customerAgent.post('/api/orders').send(payload);

    expect(res.status).toBe(400);
  });

  it('rejects an order with no items', async () => {
    const res = await customerAgent.post('/api/orders').send(buildOrderPayload({ items: [] }));

    expect(res.status).toBe(400);
  });

  it.each([0, -1, 1.5, 'two', null])('rejects a non-positive-integer qty (%s)', async (qty) => {
    const res = await customerAgent
      .post('/api/orders')
      .send(buildOrderPayload({ items: [{ productId: 1, qty }] }));

    expect(res.status).toBe(400);
    expect(await stockOf(1)).toBe(20);
  });

  it('rejects an order for an inactive product', async () => {
    await pool.query('UPDATE products SET active = 0 WHERE id = 1');

    const res = await customerAgent.post('/api/orders').send(buildOrderPayload());

    expect(res.status).toBe(400);
  });

  it('rejects an order for an unknown product', async () => {
    const res = await customerAgent
      .post('/api/orders')
      .send(buildOrderPayload({ items: [{ productId: 999, qty: 1 }] }));

    expect(res.status).toBe(400);
  });

  it('rejects an order when qty exceeds stock, leaving stock and orders untouched', async () => {
    const res = await customerAgent
      .post('/api/orders')
      .send(buildOrderPayload({ items: [{ productId: 1, qty: 21 }] }));

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toMatchObject({ productId: 1 });
    expect(await stockOf(1)).toBe(20);

    const [orders] = await pool.query('SELECT * FROM orders');
    expect(orders).toHaveLength(0);
  });

  it('still returns 201 if the order-notification email fails to send', async () => {
    vi.mocked(sendOrderNotification).mockRejectedValueOnce(new Error('smtp down'));

    const res = await customerAgent.post('/api/orders').send(buildOrderPayload());

    expect(res.status).toBe(201);
  });

  it('under concurrent requests for more than the remaining stock, allows exactly one', async () => {
    // stock is seeded at 20; two parallel requests for 15 each can't both succeed.
    const payload = buildOrderPayload({ items: [{ productId: 1, qty: 15 }] });

    const [resA, resB] = await Promise.all([
      customerAgent.post('/api/orders').send(payload),
      customerAgent.post('/api/orders').send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await stockOf(1)).toBe(5);

    const [orders] = await pool.query('SELECT * FROM orders');
    expect(orders).toHaveLength(1);
  });
});
