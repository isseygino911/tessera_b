import { describe, it, expect } from 'vitest';
import './setup.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { putObject, deleteObject } from '../src/services/storage.js';
import { adminAgent, createUser, loginAgent } from './setup.js';

const app = createApp();

// Bodies don't need to be real, decodable images: the route only inspects
// Content-Type and byte length, and storage.putObject is mocked (see setup.js).
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = Buffer.from('RIFF....WEBPVP8 ');

async function customerAgent(app) {
  await createUser({ email: 'shopper@example.com', password: 'correct-horse' });
  return loginAgent(app, 'shopper@example.com', 'correct-horse');
}

describe('POST /api/admin/products/:id/images', () => {
  it.each([
    ['image/jpeg', JPEG_BYTES],
    ['image/png', PNG_BYTES],
    ['image/webp', WEBP_BYTES],
  ])('uploads a %s image, storing it under products/<slug>/', async (contentType, bytes) => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/products/3/images')
      .set('Content-Type', contentType)
      .send(bytes);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(3);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0]).toMatchObject({ role: 'main' });

    expect(putObject).toHaveBeenCalledTimes(1);
    const [key] = putObject.mock.calls[0];
    expect(key).toMatch(/^products\/ocean-topaz\//);
  });

  it('makes the first image on a product with no main become role "main"', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/products/3/images')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_BYTES);

    expect(res.status).toBe(201);
    expect(res.body.images.map((img) => img.role)).toEqual(['main']);
  });

  it('makes a new image role "gallery" when the product already has a main image', async () => {
    const agent = await adminAgent(app);

    // Product 2 (forest-emerald) is seeded with exactly one image, role main.
    const res = await agent
      .post('/api/admin/products/2/images')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_BYTES);

    expect(res.status).toBe(201);
    const newImage = res.body.images.find((img) => img.role !== 'main');
    expect(newImage).toBeDefined();
    expect(newImage.role).toBe('gallery');
  });

  it('rejects a wrong content type with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent
      .post('/api/admin/products/3/images')
      .set('Content-Type', 'text/plain')
      .send('not an image');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Upload a JPG, PNG or WebP image' });
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects an empty body with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.post('/api/admin/products/3/images').set('Content-Type', 'image/jpeg').send('');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Upload a JPG, PNG or WebP image' });
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects a body over 10MB with 413', async () => {
    const agent = await adminAgent(app);
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1);

    const res = await agent.post('/api/admin/products/3/images').set('Content-Type', 'image/jpeg').send(oversized);

    expect(res.status).toBe(413);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('gives a customer 403', async () => {
    const agent = await customerAgent(app);

    const res = await agent.post('/api/admin/products/3/images').set('Content-Type', 'image/jpeg').send(JPEG_BYTES);

    expect(res.status).toBe(403);
    expect(putObject).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/products/:id/images/:imageId', () => {
  it('updates alt, fit, focalPoint and sortOrder', async () => {
    const agent = await adminAgent(app);

    const res = await agent.patch('/api/admin/products/1/images/2').send({
      alt: 'Updated alt text',
      fit: 'contain',
      focalPoint: '20% 80%',
      sortOrder: 9,
    });

    expect(res.status).toBe(200);
    const updated = res.body.images.find((img) => img.id === 2);
    expect(updated).toMatchObject({
      alt: 'Updated alt text',
      fit: 'contain',
      focalPoint: '20% 80%',
      sortOrder: 9,
    });

    const [[row]] = await pool.query('SELECT sort_order FROM product_images WHERE id = 2');
    expect(row.sort_order).toBe(9);
  });

  it('moves the old main to "other" when a different image is set to role main', async () => {
    const agent = await adminAgent(app);

    // Image 1 is the seeded main for product 1; image 2 is a gallery image.
    const res = await agent.patch('/api/admin/products/1/images/2').send({ role: 'main' });

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.images.map((img) => [img.id, img]));
    expect(byId[2].role).toBe('main');
    expect(byId[1].role).toBe('other');
  });

  it('moves the old banner to "other" when a different image is set to role banner', async () => {
    const agent = await adminAgent(app);

    // Image 4 is the seeded banner for product 1; image 3 is a gallery image.
    const res = await agent.patch('/api/admin/products/1/images/3').send({ role: 'banner' });

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.images.map((img) => [img.id, img]));
    expect(byId[3].role).toBe('banner');
    expect(byId[4].role).toBe('other');
  });

  it('rejects an empty body with 400', async () => {
    const agent = await adminAgent(app);

    const res = await agent.patch('/api/admin/products/1/images/2').send({});

    expect(res.status).toBe(400);
  });

  it('404s for an image belonging to another product', async () => {
    const agent = await adminAgent(app);

    // Image 5 belongs to product 2 (forest-emerald), not product 1.
    const res = await agent.patch('/api/admin/products/1/images/5').send({ alt: 'Nope' });

    expect(res.status).toBe(404);
  });

  it('gives a customer 403', async () => {
    const agent = await customerAgent(app);

    const res = await agent.patch('/api/admin/products/1/images/2').send({ alt: 'Nope' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/admin/products/:id/images/:imageId', () => {
  it('removes the row and calls deleteObject with the image key', async () => {
    const agent = await adminAgent(app);

    const res = await agent.delete('/api/admin/products/1/images/2');

    expect(res.status).toBe(200);
    expect(res.body.images.find((img) => img.id === 2)).toBeUndefined();

    const [rows] = await pool.query('SELECT * FROM product_images WHERE id = 2');
    expect(rows).toHaveLength(0);

    expect(deleteObject).toHaveBeenCalledWith('products/sunlit-amber/dish.jpg');
  });

  it('404s for an image belonging to another product', async () => {
    const agent = await adminAgent(app);

    const res = await agent.delete('/api/admin/products/1/images/5');

    expect(res.status).toBe(404);
    expect(deleteObject).not.toHaveBeenCalled();
    const [rows] = await pool.query('SELECT * FROM product_images WHERE id = 5');
    expect(rows).toHaveLength(1);
  });

  it('gives a customer 403', async () => {
    const agent = await customerAgent(app);

    const res = await agent.delete('/api/admin/products/1/images/2');

    expect(res.status).toBe(403);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/products/:id hard delete removes S3 objects', () => {
  it('calls deleteObject for each image of a product with no orders', async () => {
    const agent = await adminAgent(app);

    // Product 1 (sunlit-amber) is seeded with 4 images and has no orders.
    const res = await agent.delete('/api/admin/products/1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ softDeleted: false });
    expect(deleteObject).toHaveBeenCalledTimes(4);
    const keysCalled = deleteObject.mock.calls.map(([key]) => key);
    expect(keysCalled).toEqual(
      expect.arrayContaining([
        'products/sunlit-amber/main.jpg',
        'products/sunlit-amber/dish.jpg',
        'products/sunlit-amber/reading.jpg',
        'products/sunlit-amber/story.jpg',
      ])
    );
  });
});
