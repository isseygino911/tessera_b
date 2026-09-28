import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { adminAgent, createUser, loginAgent } from './setup.js';

const app = createApp();

describe('admin routes require authentication and the admin role', () => {
  const protectedRoutes = [
    ['get', '/api/admin/products'],
    ['post', '/api/admin/products'],
    ['get', '/api/admin/orders'],
  ];

  it.each(protectedRoutes)('401s on %s %s without a session cookie', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it.each(protectedRoutes)('403s on %s %s for a logged-in customer', async (method, path) => {
    await createUser({ email: 'customer@example.com', password: 'correct-horse' });
    const agent = await loginAgent(app, 'customer@example.com', 'correct-horse');

    const res = await agent[method](path);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('allows a logged-in admin through to GET /api/admin/products', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products');

    expect(res.status).toBe(200);
  });

  it('allows a logged-in admin through to GET /api/admin/orders', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/orders');

    expect(res.status).toBe(200);
  });
});
