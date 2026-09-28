import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { createUser } from './setup.js';

const app = createApp();

function stateFromLocation(location) {
  return new URL(location).searchParams.get('state');
}

// Starts the OAuth flow on `agent`, returning the state Google would echo
// back, so the caller only has to supply the userinfo `fetch` responds with.
async function startGoogleFlow(agent, returnTo = '/checkout') {
  const startRes = await agent.get('/api/auth/google').query({ returnTo });
  return stateFromLocation(startRes.headers.location);
}

function mockGoogleResponses({ tokenOk = true, userinfo } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const href = String(url);
    if (href.startsWith('https://oauth2.googleapis.com/token')) {
      return tokenOk
        ? { ok: true, json: async () => ({ access_token: 'test-access-token' }) }
        : { ok: false, json: async () => ({ error: 'invalid_grant' }) };
    }
    if (href.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
      return { ok: true, json: async () => userinfo };
    }
    throw new Error(`Unexpected fetch to ${href}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function googleUser(overrides = {}) {
  return {
    sub: 'google-sub-1',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Lovelace',
    picture: 'https://example.com/avatar.png',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/auth/google', () => {
  it('redirects to Google with the expected query params and sets the oauth_google cookie', async () => {
    const res = await request(app).get('/api/auth/google').query({ returnTo: '/checkout' });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(location.searchParams.get('client_id')).toBe('test-client');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/auth/google/callback'
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('scope')).toEqual(expect.stringContaining('openid'));
    expect(location.searchParams.get('scope')).toEqual(expect.stringContaining('email'));
    expect(location.searchParams.get('scope')).toEqual(expect.stringContaining('profile'));
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');

    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('oauth_google='));
    expect(cookie).toBeDefined();
    expect(cookie.toLowerCase()).toMatch(/httponly/);
  });

  it.each(['//evil.com', 'https://evil.com', 'evil'])(
    'replaces an unsafe returnTo (%s) with / in the state it carries through',
    async (returnTo) => {
      const agent = request.agent(app);
      const state = await startGoogleFlow(agent, returnTo);
      mockGoogleResponses({ userinfo: googleUser() });

      const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    }
  );
});

describe('GET /api/auth/google/callback', () => {
  it('creates a new user for a first-time Google sign-in and redirects to returnTo', async () => {
    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });

    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/checkout');
    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('session='));
    expect(cookie).toBeDefined();

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', ['ada@example.com']);
    expect(user).toBeDefined();
    expect(user.password_hash).toBeNull();
    expect(user.email_verified_at).not.toBeNull();

    const [[identity]] = await pool.query(
      'SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?',
      ['google', 'google-sub-1']
    );
    expect(identity).toBeDefined();
    expect(identity.user_id).toBe(user.id);
  });

  it('sends the code, verifier and client credentials to the token endpoint', async () => {
    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    const fetchMock = mockGoogleResponses({ userinfo: googleUser() });

    await agent.get('/api/auth/google/callback').query({ code: 'the-auth-code', state });

    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('https://oauth2.googleapis.com/token')
    );
    expect(tokenCall).toBeDefined();
    const [, init] = tokenCall;
    expect(init.method).toBe('POST');
    const bodyText =
      init.body instanceof URLSearchParams ? init.body.toString() : String(init.body);
    const params = new URLSearchParams(bodyText);
    expect(params.get('code')).toBe('the-auth-code');
    expect(params.get('code_verifier')).toBeTruthy();
    expect(params.get('client_id')).toBe('test-client');
    expect(params.get('client_secret')).toBe('test-secret');
    expect(params.get('redirect_uri')).toBe('http://localhost:5173/api/auth/google/callback');
    expect(params.get('grant_type')).toBe('authorization_code');
  });

  it('sends the access token as a Bearer header to the userinfo endpoint', async () => {
    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    const fetchMock = mockGoogleResponses({ userinfo: googleUser() });

    await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    const userinfoCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('https://openidconnect.googleapis.com/v1/userinfo')
    );
    expect(userinfoCall).toBeDefined();
    const [, init] = userinfoCall;
    expect(init.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('logs in as the same user on a second login with the same Google sub, without creating a duplicate', async () => {
    const agent1 = request.agent(app);
    const state1 = await startGoogleFlow(agent1, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });
    await agent1.get('/api/auth/google/callback').query({ code: 'abc', state: state1 });

    const agent2 = request.agent(app);
    const state2 = await startGoogleFlow(agent2, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });
    const res2 = await agent2.get('/api/auth/google/callback').query({ code: 'abc', state: state2 });

    expect(res2.status).toBe(302);
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', ['ada@example.com']);
    expect(users).toHaveLength(1);
    const [identities] = await pool.query(
      'SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?',
      ['google', 'google-sub-1']
    );
    expect(identities).toHaveLength(1);
  });

  it('links to an existing password account with a verified matching email, keeping the password', async () => {
    const userId = await createUser({
      email: 'ada@example.com',
      password: 'correct-horse',
      emailVerified: true,
    });

    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });
    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/checkout');

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    expect(user.password_hash).not.toBeNull();

    const [[identity]] = await pool.query(
      'SELECT * FROM user_identities WHERE provider = ? AND provider_user_id = ?',
      ['google', 'google-sub-1']
    );
    expect(identity.user_id).toBe(userId);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correct-horse' });
    expect(loginRes.status).toBe(200);
  });

  it('links to an existing unverified-email password account and clears its password', async () => {
    await createUser({
      email: 'ada@example.com',
      password: 'correct-horse',
      emailVerified: false,
    });

    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });
    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/checkout');

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', ['ada@example.com']);
    expect(user.password_hash).toBeNull();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correct-horse' });
    expect(loginRes.status).toBe(401);
  });

  it('redirects to /login?error=google and sets no session on a state mismatch', async () => {
    const agent = request.agent(app);
    await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ userinfo: googleUser() });

    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state: 'wrong-state' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=google');
    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('session='));
    expect(cookie).toBeUndefined();
  });

  it('redirects to /login?error=google when the oauth_google cookie is missing', async () => {
    mockGoogleResponses({ userinfo: googleUser() });

    const res = await request(app).get('/api/auth/google/callback').query({ code: 'abc', state: 'anything' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=google');
  });

  it('redirects to /login?error=google when the token exchange fails', async () => {
    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ tokenOk: false, userinfo: googleUser() });

    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=google');
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', ['ada@example.com']);
    expect(users).toHaveLength(0);
  });

  it('redirects to /login?error=google when Google reports the email as unverified', async () => {
    const agent = request.agent(app);
    const state = await startGoogleFlow(agent, '/checkout');
    mockGoogleResponses({ userinfo: googleUser({ email_verified: false }) });

    const res = await agent.get('/api/auth/google/callback').query({ code: 'abc', state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=google');
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', ['ada@example.com']);
    expect(users).toHaveLength(0);
  });
});
