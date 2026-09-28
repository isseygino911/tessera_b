import { beforeEach, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// The test DB is separate from dev; everything else (host/user/password) comes
// from server/.env, already pointed at a local MySQL instance.
process.env.DB_NAME = 'simple_ecom_test';
process.env.JWT_SECRET = 'test-secret';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

// Global mocks: every test file gets these automatically (registered here
// before app.js/db.js are ever imported), so individual tests only need to
// import the mocked module to assert on calls or override a return value.
vi.mock('../src/services/mailer.js', () => ({
  sendOrderNotification: vi.fn(async () => {}),
}));

const { pool, closePool } = await import('../src/db.js');
const { sendOrderNotification } = await import('../src/services/mailer.js');

export const SEED_PRODUCTS = [
  {
    id: 1,
    slug: 'sunlit-amber',
    name: 'Sunlit Amber',
    hex: '#E0A030',
    tagline: 'Warmth you can carry',
    story: 'Late-afternoon light and quiet courage.',
    price_cents: 4800,
    stock: 20,
    sort_order: 1,
    active: 1,
  },
  {
    id: 2,
    slug: 'forest-emerald',
    name: 'Forest Emerald',
    hex: '#1E7A4C',
    tagline: 'Growth, quietly',
    story: 'Renewal and patience, one bead at a time.',
    price_cents: 4800,
    stock: 20,
    sort_order: 2,
    active: 1,
  },
  {
    id: 3,
    slug: 'ocean-topaz',
    name: 'Ocean Topaz',
    hex: '#1F7A9C',
    tagline: 'Calm in every wave',
    story: 'Clarity and calm from the deep sea.',
    price_cents: 4800,
    stock: 20,
    sort_order: 3,
    active: 1,
  },
];

export async function resetDb() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('TRUNCATE TABLE order_items');
  await pool.query('TRUNCATE TABLE orders');
  await pool.query('TRUNCATE TABLE products');
  await pool.query('TRUNCATE TABLE user_identities');
  await pool.query('TRUNCATE TABLE users');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  for (const p of SEED_PRODUCTS) {
    await pool.query(
      `INSERT INTO products
         (id, slug, name, hex, tagline, story, price_cents, stock, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.slug, p.name, p.hex, p.tagline, p.story, p.price_cents, p.stock, p.sort_order, p.active]
    );
  }
}

export async function stockOf(productId) {
  const [rows] = await pool.query('SELECT stock FROM products WHERE id = ?', [productId]);
  return rows[0]?.stock;
}

export function buildOrderPayload(overrides = {}) {
  return {
    customer: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '555-0100',
      addressLine1: '1 Analytical Engine Way',
      city: 'London',
      region: 'LDN',
      postalCode: 'W1A 1AA',
      country: 'UK',
      ...overrides.customer,
    },
    items: overrides.items ?? [{ productId: 1, qty: 2 }],
  };
}

// Inserts a user row directly (bypassing the signup endpoint) so tests can set
// up fixtures without depending on the route under test. `password` is
// optional: omitting it creates an OAuth-only account (password_hash NULL).
export async function createUser({
  email,
  password,
  name = 'Test User',
  role = 'customer',
  emailVerified = false,
}) {
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const normalizedEmail = email.trim().toLowerCase();
  const [result] = await pool.query(
    `INSERT INTO users (email, email_verified_at, password_hash, name, role)
     VALUES (?, ?, ?, ?, ?)`,
    [normalizedEmail, emailVerified ? new Date() : null, passwordHash, name, role]
  );
  return result.insertId;
}

// Logs a user session in against `app` and returns a supertest agent that
// carries the resulting cookie on every subsequent request.
export async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

// Creates a seeded admin user and returns a logged-in agent for it.
export async function adminAgent(app) {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'admin-pass-123';
  await createUser({ email, password, name: 'Test Admin', role: 'admin', emailVerified: true });
  return loginAgent(app, email, password);
}

beforeEach(async () => {
  await resetDb();
  vi.mocked(sendOrderNotification).mockClear();
});

afterAll(async () => {
  await closePool();
});
