import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { adminAgent, customerAgent } from './setup.js';
import { sendTestEmail } from '../src/services/mailer.js';
import { HttpError } from '../src/lib/http.js';

const app = createApp();

beforeEach(() => {
  vi.mocked(sendTestEmail).mockClear();
});

describe('POST /api/admin/email/test', () => {
  it('sends a test email and returns the result from the mailer', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: 'Hello there' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: 'shop@test.local', to: 'friend@example.com' });
    expect(sendTestEmail).toHaveBeenCalledTimes(1);
    expect(sendTestEmail).toHaveBeenCalledWith({ to: 'friend@example.com', message: 'Hello there' });
  });

  it('401s for an anonymous user', async () => {
    const res = await request(app)
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: 'Hello there' });

    expect(res.status).toBe(401);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it('403s for a signed-in customer', async () => {
    const agent = await customerAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: 'Hello there' });

    expect(res.status).toBe(403);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it('400s for an invalid "to" address and does not call the mailer', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'not-an-email', message: 'Hello there' });

    expect(res.status).toBe(400);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it('400s for a whitespace-only message', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: '   ' });

    expect(res.status).toBe(400);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it('400s for a message over 5000 characters', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: 'a'.repeat(5001) });

    expect(res.status).toBe(400);
    expect(sendTestEmail).not.toHaveBeenCalled();
  });

  it('502s with the mailer error when sending fails', async () => {
    vi.mocked(sendTestEmail).mockRejectedValueOnce(new HttpError(502, 'Email not sent: Invalid login'));
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/email/test')
      .send({ to: 'friend@example.com', message: 'Hello there' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Email not sent: Invalid login');
  });
});
