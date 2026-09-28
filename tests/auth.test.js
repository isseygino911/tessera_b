import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { createUser, loginAgent } from './setup.js';

const app = createApp();

function buildSignupPayload(overrides = {}) {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse',
    ...overrides,
  };
}

describe('POST /api/auth/signup', () => {
  it('creates a user, sets an httpOnly session cookie, and returns the public user shape', async () => {
    const res = await request(app).post('/api/auth/signup').send(buildSignupPayload());

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      role: 'customer',
    });
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('avatarUrl');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('session='));
    expect(cookie).toBeDefined();
    expect(cookie.toLowerCase()).toMatch(/httponly/);
  });

  it('lower-cases and trims the email before storing it', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(buildSignupPayload({ email: '  Ada@Example.COM  ' }));

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ada@example.com');

    const [[row]] = await pool.query('SELECT email FROM users WHERE id = ?', [res.body.user.id]);
    expect(row.email).toBe('ada@example.com');
  });

  it('rejects a duplicate email with 409', async () => {
    await createUser({ email: 'ada@example.com', password: 'whatever1' });

    const res = await request(app).post('/api/auth/signup').send(buildSignupPayload());

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'An account with this email already exists' });
  });

  it('treats a duplicate email as a conflict regardless of case', async () => {
    await createUser({ email: 'ada@example.com', password: 'whatever1' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send(buildSignupPayload({ email: 'ADA@EXAMPLE.COM' }));

    expect(res.status).toBe(409);
  });

  it.each([
    ['missing name', { name: undefined }],
    ['missing email', { email: undefined }],
    ['invalid email', { email: 'not-an-email' }],
    ['missing password', { password: undefined }],
    ['password under 8 characters', { password: 'short1' }],
  ])('rejects an invalid signup body: %s', async (_label, overrides) => {
    const payload = { ...buildSignupPayload(), ...overrides };

    const res = await request(app).post('/api/auth/signup').send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the correct password and sets a session cookie', async () => {
    await createUser({ email: 'ada@example.com', password: 'correct-horse' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correct-horse' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ada@example.com' });
    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('session='));
    expect(cookie).toBeDefined();
  });

  it('updates last_login_at on a successful login', async () => {
    const id = await createUser({ email: 'ada@example.com', password: 'correct-horse' });

    await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'correct-horse' });

    const [[row]] = await pool.query('SELECT last_login_at FROM users WHERE id = ?', [id]);
    expect(row.last_login_at).not.toBeNull();
  });

  it('rejects the wrong password with a generic 401', async () => {
    await createUser({ email: 'ada@example.com', password: 'correct-horse' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email or password is incorrect' });
  });

  it('rejects an unknown email with the same generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email or password is incorrect' });
  });

  it('rejects a login attempt on an OAuth-only account (null password hash) with the same generic 401', async () => {
    await createUser({ email: 'oauth@example.com', emailVerified: true }); // no password

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'oauth@example.com', password: 'whatever1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Email or password is incorrect' });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie, invalidating further requests', async () => {
    await createUser({ email: 'ada@example.com', password: 'correct-horse' });
    const agent = await loginAgent(app, 'ada@example.com', 'correct-horse');

    await agent.get('/api/auth/me').expect(200);

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    await agent.get('/api/auth/me').expect(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 with no session cookie', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not authenticated' });
  });

  it('returns the current user once logged in', async () => {
    await createUser({ email: 'ada@example.com', password: 'correct-horse', name: 'Ada Lovelace' });
    const agent = await loginAgent(app, 'ada@example.com', 'correct-horse');

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ada@example.com', name: 'Ada Lovelace' });
  });

  it('returns 401 for a valid session token whose user has since been deleted', async () => {
    const id = await createUser({ email: 'ada@example.com', password: 'correct-horse' });
    const agent = await loginAgent(app, 'ada@example.com', 'correct-horse');
    await agent.get('/api/auth/me').expect(200);

    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('old admin auth routes are removed', () => {
  it.each([
    ['post', '/api/admin/login'],
    ['post', '/api/admin/logout'],
    ['get', '/api/admin/me'],
  ])('404s on %s %s', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(404);
  });
});
