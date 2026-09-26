import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { adminAgent, buildOrderPayload } from './setup.js';

const app = createApp();

function buildProductPayload(overrides = {}) {
  return {
    slug: 'midnight-garnet',
    name: 'Midnight Garnet',
    hex: '#7A1F2B',
    tagline: 'Bold after dark',
    story: 'Deep red for quiet confidence.',
    priceCents: 5200,
    stock: 15,
    sortOrder: 4,
    active: true,
    ...overrides,
  };
}

describe('admin products CRUD', () => {
  it('GET /api/admin/products lists all products including inactive ones', async () => {
    await pool.query('UPDATE products SET active = 0 WHERE id = 3');
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((p) => p.slug)).toContain('ocean-topaz');
  });

  it('POST /api/admin/products creates a product', async () => {
    const agent = await adminAgent(app);

    const res = await agent.post('/api/admin/products').send(buildProductPayload());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: 'midnight-garnet', name: 'Midnight Garnet', priceCents: 5200, stock: 15 });

    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', ['midnight-garnet']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Midnight Garnet', price_cents: 5200, stock: 15 });
  });

  it('POST /api/admin/products rejects an invalid body with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.post('/api/admin/products').send(buildProductPayload({ priceCents: -100, slug: '' }));

    expect(res.status).toBe(400);

    const [rows] = await pool.query('SELECT * FROM products');
    expect(rows).toHaveLength(3);
  });

  it('PUT /api/admin/products/:id updates fields', async () => {
    const agent = await adminAgent(app);

    const res = await agent.put('/api/admin/products/1').send({
      slug: 'sunlit-amber',
      name: 'Sunlit Amber',
      hex: '#E0A030',
      tagline: 'Warmth you can carry, always',
      story: 'Updated story.',
      priceCents: 5000,
      stock: 25,
      sortOrder: 1,
      active: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ priceCents: 5000, stock: 25, tagline: 'Warmth you can carry, always' });

    const [[row]] = await pool.query('SELECT * FROM products WHERE id = 1');
    expect(row).toMatchObject({ price_cents: 5000, stock: 25 });
  });

  it('PUT /api/admin/products/:id rejects an invalid body with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.put('/api/admin/products/1').send({ priceCents: 'not-a-number' });

    expect(res.status).toBe(400);
  });

  it('PUT /api/admin/products/:id 404s for an unknown product', async () => {
    const agent = await adminAgent(app);

    const res = await agent.put('/api/admin/products/999').send(buildProductPayload());

    expect(res.status).toBe(404);
  });

  it('DELETE /api/admin/products/:id hard-deletes a product with no orders', async () => {
    const agent = await adminAgent(app);

    const res = await agent.delete('/api/admin/products/2');

    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = 2');
    expect(rows).toHaveLength(0);
  });

  it('DELETE /api/admin/products/:id soft-deletes (active=0) when referenced by an order', async () => {
    await request(app).post('/api/orders').send(buildOrderPayload({ items: [{ productId: 2, qty: 1 }] }));
    const agent = await adminAgent(app);

    const res = await agent.delete('/api/admin/products/2');

    expect(res.status).toBe(200);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = 2');
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(0);

    const [orderItems] = await pool.query('SELECT * FROM order_items WHERE product_id = 2');
    expect(orderItems).toHaveLength(1);
  });

  it('DELETE /api/admin/products/:id 404s for an unknown product', async () => {
    const agent = await adminAgent(app);

    const res = await agent.delete('/api/admin/products/999');

    expect(res.status).toBe(404);
  });
});
