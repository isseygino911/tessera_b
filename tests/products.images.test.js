import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { adminAgent } from './setup.js';

const app = createApp();

// Sunlit Amber (product 1) is seeded with a main, two gallery images inserted
// out of sort_order, and a banner with a focal point — see tests/setup.js.
const expectSunlitAmberImages = (images) => {
  expect(images).toHaveLength(4);
  expect(images.map((img) => img.role)).toEqual(['main', 'gallery', 'gallery', 'banner']);
  // gallery images must come back ordered by sort_order (1 before 2), not insert order.
  expect(images.map((img) => img.name)).toEqual(['main', 'reading', 'dish', 'story']);

  expect(images[0]).toMatchObject({
    name: 'main',
    url: 'https://s3.test/products/sunlit-amber/main.jpg',
    alt: 'Sunlit Amber cut-out bead',
    role: 'main',
    fit: 'cover',
    focalPoint: null,
    sortOrder: 0,
  });
  expect(images[3]).toMatchObject({
    name: 'story',
    url: 'https://s3.test/products/sunlit-amber/story.jpg',
    alt: 'Sunlit Amber story banner',
    role: 'banner',
    fit: 'cover',
    focalPoint: '55% 40%',
    sortOrder: 0,
  });
  for (const img of images) {
    expect(img).toHaveProperty('id');
    expect(img).toHaveProperty('sortOrder');
  }
};

describe('GET /api/products images', () => {
  it('includes ordered images with signed URLs for a product with a full set', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    const sunlitAmber = res.body.find((p) => p.slug === 'sunlit-amber');
    expectSunlitAmberImages(sunlitAmber.images);
  });

  it('includes just the main image for a product with only a main', async () => {
    const res = await request(app).get('/api/products');

    const forestEmerald = res.body.find((p) => p.slug === 'forest-emerald');
    expect(forestEmerald.images).toEqual([
      expect.objectContaining({
        name: 'main',
        url: 'https://s3.test/products/forest-emerald/main.jpg',
        role: 'main',
        sortOrder: 0,
      }),
    ]);
  });

  it('returns an empty images array for a product with none', async () => {
    const res = await request(app).get('/api/products');

    const oceanTopaz = res.body.find((p) => p.slug === 'ocean-topaz');
    expect(oceanTopaz.images).toEqual([]);
  });

  it('keeps existing public fields alongside images', async () => {
    const res = await request(app).get('/api/products');

    const sunlitAmber = res.body.find((p) => p.slug === 'sunlit-amber');
    expect(sunlitAmber).toMatchObject({
      id: 1,
      slug: 'sunlit-amber',
      name: 'Sunlit Amber',
      priceCents: 4800,
      stock: 20,
    });
  });
});

describe('GET /api/admin/products images', () => {
  it('includes ordered images with signed URLs', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products');

    expect(res.status).toBe(200);
    const sunlitAmber = res.body.find((p) => p.slug === 'sunlit-amber');
    expectSunlitAmberImages(sunlitAmber.images);
  });

  it('returns an empty images array for a product with none', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products');

    const oceanTopaz = res.body.find((p) => p.slug === 'ocean-topaz');
    expect(oceanTopaz.images).toEqual([]);
  });
});

describe('GET /api/admin/products/:id images', () => {
  it('includes ordered images with signed URLs', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products/1');

    expect(res.status).toBe(200);
    expectSunlitAmberImages(res.body.images);
  });

  it('returns an empty images array for a product with none', async () => {
    const agent = await adminAgent(app);

    const res = await agent.get('/api/admin/products/3');

    expect(res.status).toBe(200);
    expect(res.body.images).toEqual([]);
  });
});
