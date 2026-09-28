import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { adminAgent } from './setup.js';

const app = createApp();

// express.json() throws a SyntaxError with `err.expose` and `err.status` set
// (400) when the body can't be parsed; errorHandler must forward that status
// instead of falling through to a 500.
describe('errorHandler: Express client errors', () => {
  it('answers malformed JSON on an admin endpoint with 400, not 500', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/products')
      .set('Content-Type', 'application/json')
      .send('{ this is not valid json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('answers malformed JSON on an unauthenticated endpoint with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ bad json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
