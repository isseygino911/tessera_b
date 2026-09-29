import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import './setup.js';
import { createApp } from '../src/app.js';
import { buildOrderPayload, createUser, loginAgent } from './setup.js';

const app = createApp();

async function createCustomer(overrides = {}) {
  const email = overrides.email ?? `ada-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? 'correct-horse';
  const id = await createUser({ email, password, name: overrides.name ?? 'Ada Lovelace' });
  const agent = await loginAgent(app, email, password);
  return { id, email, password, agent };
}

async function placeOrder(agent, overrides = {}) {
  const res = await agent.post('/api/orders').send(buildOrderPayload(overrides));
  return res.body.id;
}

// Google-only accounts (password_hash NULL) can't authenticate through
// POST /api/auth/login, which is the only route that issues a session
// cookie. To exercise requireUser-gated routes for such an account, sign a
// session cookie directly the same way lib/session.js does, and attach it
// to a fresh agent.
async function googleOnlyAgent() {
  const email = `google-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const userId = await createUser({ email, name: 'Grace Hopper', emailVerified: true }); // no password
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const agent = request.agent(app);
  agent.jar.setCookie(`session=${token}`);
  return agent;
}

describe('GET /api/orders', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).get('/api/orders');

    expect(res.status).toBe(401);
  });

  it("returns only the caller's orders, not another user's", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const myOrderId = await placeOrder(mine.agent);
    await placeOrder(theirs.agent);

    const res = await mine.agent.get('/api/orders');

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].id).toBe(myOrderId);
  });

  it('does not expose adminNote or userId on any order', async () => {
    const { agent } = await createCustomer();
    await placeOrder(agent);

    const res = await agent.get('/api/orders');

    expect(res.status).toBe(200);
    expect(res.body.orders.length).toBeGreaterThan(0);
    for (const order of res.body.orders) {
      expect(order).not.toHaveProperty('adminNote');
      expect(order).not.toHaveProperty('userId');
    }
  });
});

describe('GET /api/orders/:id', () => {
  it("returns the caller's own order with its items", async () => {
    const { agent } = await createCustomer();
    const orderId = await placeOrder(agent, { items: [{ productId: 1, qty: 2 }] });

    const res = await agent.get(`/api/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      productId: 1,
      productName: 'Sunlit Amber',
      unitPriceCents: 4800,
      quantity: 2,
    });
    expect(res.body.items[0]).toHaveProperty('imageUrl');
  });

  it("returns 404 for another user's order", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const theirOrderId = await placeOrder(theirs.agent);

    const res = await mine.agent.get(`/api/orders/${theirOrderId}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 with no session', async () => {
    const { agent } = await createCustomer();
    const orderId = await placeOrder(agent);

    const res = await request(app).get(`/api/orders/${orderId}`);

    expect(res.status).toBe(401);
  });

  it('does not include adminNote in the response body', async () => {
    const { agent } = await createCustomer();
    const orderId = await placeOrder(agent);

    const res = await agent.get(`/api/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('adminNote');
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates the name and returns the updated public user', async () => {
    const { agent } = await createCustomer({ name: 'Ada Lovelace' });

    const res = await agent.patch('/api/auth/me').send({ name: 'Grace Hopper' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Grace Hopper' });
  });

  it('returns hasPassword but no address on the updated user', async () => {
    const { agent } = await createCustomer();

    const res = await agent.patch('/api/auth/me').send({ name: 'Grace Hopper' });

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('hasPassword', true);
    expect(res.body.user).not.toHaveProperty('address');
  });

  it('ignores an address field and only updates the name', async () => {
    const { agent } = await createCustomer();

    const res = await agent
      .patch('/api/auth/me')
      .send({ name: 'Grace Hopper', address: { city: 'Bristol' } });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Grace Hopper' });
    expect(res.body.user).not.toHaveProperty('address');
  });

  it('rejects an empty body with 400', async () => {
    const { agent } = await createCustomer();

    const res = await agent.patch('/api/auth/me').send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 with no session', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'Grace Hopper' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/me/password', () => {
  it('returns 401 when the current password is wrong', async () => {
    const { agent } = await createCustomer({ password: 'correct-horse' });

    const res = await agent
      .put('/api/auth/me/password')
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a Google-only account (no password set)', async () => {
    const agent = await googleOnlyAgent();

    const res = await agent
      .put('/api/auth/me/password')
      .send({ currentPassword: 'anything123', newPassword: 'new-password-123' });

    expect(res.status).toBe(400);
  });

  it('success: changes the password and the user can log in with the new one', async () => {
    const { agent, email } = await createCustomer({ password: 'correct-horse' });

    const res = await agent
      .put('/api/auth/me/password')
      .send({ currentPassword: 'correct-horse', newPassword: 'new-password-123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'new-password-123' });
    expect(loginRes.status).toBe(200);

    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'correct-horse' });
    expect(oldLoginRes.status).toBe(401);
  });

  it('rejects a new password under 8 characters with 400', async () => {
    const { agent } = await createCustomer({ password: 'correct-horse' });

    const res = await agent
      .put('/api/auth/me/password')
      .send({ currentPassword: 'correct-horse', newPassword: 'short1' });

    expect(res.status).toBe(400);
  });

  it('returns 401 with no session', async () => {
    const res = await request(app)
      .put('/api/auth/me/password')
      .send({ currentPassword: 'whatever1', newPassword: 'new-password-123' });

    expect(res.status).toBe(401);
  });
});
