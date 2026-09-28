import crypto from 'node:crypto';
import { pool, withTransaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { putObject, signedUrl, deleteObject } from './storage.js';

const EXTENSION_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const IMAGE_COLUMNS = {
  alt: 'alt',
  role: 'role',
  fit: 'fit',
  focalPoint: 'focal_point',
  sortOrder: 'sort_order',
};

const toImage = async (row) => ({
  id: row.id,
  name: row.name,
  url: await signedUrl(row.s3_key),
  alt: row.alt,
  role: row.role,
  fit: row.fit,
  focalPoint: row.focal_point,
  sortOrder: row.sort_order,
});

// Loads every image for the given products in one query and attaches them,
// grouped by product, as `images` (empty array when a product has none).
const attachImages = async (products) => {
  if (products.length === 0) return products;
  const [rows] = await pool.query(
    `SELECT * FROM product_images WHERE product_id IN (?)
     ORDER BY FIELD(role, 'main', 'gallery', 'banner', 'other'), sort_order, id`,
    [products.map((p) => p.id)]
  );
  const imagesByProduct = new Map();
  for (const row of rows) {
    const image = await toImage(row);
    if (!imagesByProduct.has(row.product_id)) imagesByProduct.set(row.product_id, []);
    imagesByProduct.get(row.product_id).push(image);
  }
  return products.map((product) => ({ ...product, images: imagesByProduct.get(product.id) ?? [] }));
};

const getImageRow = async (productId, imageId, runner = pool) => {
  const [[row]] = await runner.query('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [
    imageId,
    productId,
  ]);
  if (!row) throw new HttpError(404, 'Image not found');
  return row;
};

const addImage = async (productId, buffer, contentType) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new HttpError(400, 'Upload a JPG, PNG or WebP image');
  }
  const [[product]] = await pool.query('SELECT id, slug FROM products WHERE id = ?', [productId]);
  if (!product) throw new HttpError(404, 'Product not found');

  const ext = EXTENSION_BY_CONTENT_TYPE[contentType];
  const name = crypto.randomBytes(4).toString('hex');
  const key = `products/${product.slug}/${name}.${ext}`;

  const [[{ mains, maxSortOrder }]] = await pool.query(
    "SELECT SUM(role = 'main') AS mains, MAX(sort_order) AS maxSortOrder FROM product_images WHERE product_id = ?",
    [productId]
  );

  await putObject(key, buffer, contentType);
  await pool.query('INSERT INTO product_images SET ?', [
    {
      product_id: productId,
      s3_key: key,
      name,
      role: mains > 0 ? 'gallery' : 'main',
      sort_order: (maxSortOrder ?? -1) + 1,
    },
  ]);
};

const toRow = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [IMAGE_COLUMNS[key], value]));

const updateImage = async (productId, imageId, data) => {
  await withTransaction(async (connection) => {
    const row = await getImageRow(productId, imageId, connection);

    // Only one main and one banner image per product: moving another image
    // into that role bumps the current holder to 'other' first.
    if ((data.role === 'main' || data.role === 'banner') && data.role !== row.role) {
      await connection.query("UPDATE product_images SET role = 'other' WHERE product_id = ? AND role = ?", [
        productId,
        data.role,
      ]);
    }

    await connection.query('UPDATE product_images SET ? WHERE id = ?', [toRow(data), imageId]);
  });
};

const deleteImage = async (productId, imageId) => {
  const row = await getImageRow(productId, imageId);
  await pool.query('DELETE FROM product_images WHERE id = ?', [imageId]);
  await deleteObject(row.s3_key);
};

export { attachImages, addImage, updateImage, deleteImage };
