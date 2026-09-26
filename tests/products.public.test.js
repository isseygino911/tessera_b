import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

describe('GET /api/products', () => {
  it('returns active products sorted by sort_order with public fields', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((p) => p.slug)).toEqual(['sunlit-amber', 'forest-emerald', 'ocean-topaz']);

    expect(res.body[0]).toMatchObject({
      id: 1,
      slug: 'sunlit-amber',
      name: 'Sunlit Amber',
      hex: '#E0A030',
      tagline: 'Warmth you can carry',
      story: 'Late-afternoon light and quiet courage.',
      priceCents: 4800,
      stock: 20,
    });
    expect(res.body[0]).not.toHaveProperty('imageUrl');
  });

  it('excludes inactive products', async () => {
    await pool.query('UPDATE products SET active = 0 WHERE slug = ?', ['ocean-topaz']);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((p) => p.slug)).not.toContain('ocean-topaz');
  });
});
