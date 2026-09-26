import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { ADMIN_PASSWORD } from './setup.js';

const app = createApp();

describe('POST /api/admin/login', () => {
  it('logs in with the correct password and sets an httpOnly cookie', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie']?.[0];
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/admin_token=/);
    expect(cookie.toLowerCase()).toMatch(/httponly/);
  });

  it('rejects the wrong password', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: 'wrong-password' });

    expect(res.status).toBe(401);
  });
});

describe('admin session lifecycle', () => {
  it('GET /api/admin/me is 401 without a cookie and 200 once logged in', async () => {
    const agent = request.agent(app);

    await agent.get('/api/admin/me').expect(401);
    await agent.post('/api/admin/login').send({ password: ADMIN_PASSWORD }).expect(200);
    await agent.get('/api/admin/me').expect(200);
  });

  it('POST /api/admin/logout clears the cookie, invalidating further requests', async () => {
    const agent = request.agent(app);

    await agent.post('/api/admin/login').send({ password: ADMIN_PASSWORD }).expect(200);
    await agent.get('/api/admin/me').expect(200);
    await agent.post('/api/admin/logout').expect(200);
    await agent.get('/api/admin/me').expect(401);
  });
});

describe('admin routes require authentication', () => {
  const protectedRoutes = [
    ['get', '/api/admin/me'],
    ['get', '/api/admin/products'],
    ['post', '/api/admin/products'],
    ['get', '/api/admin/orders'],
  ];

  it.each(protectedRoutes)('401s on %s %s without a session cookie', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
  });
});
