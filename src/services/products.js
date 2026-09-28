import { pool } from '../db.js';
import { HttpError } from '../lib/http.js';
import { signedUrl } from './storage.js';

const COLUMNS = {
  slug: 'slug',
  name: 'name',
  hex: 'hex',
  tagline: 'tagline',
  story: 'story',
  priceCents: 'price_cents',
  stock: 'stock',
  sortOrder: 'sort_order',
  active: 'active',
};

const toProduct = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  hex: row.hex,
  tagline: row.tagline,
  story: row.story,
  priceCents: row.price_cents,
  stock: row.stock,
  sortOrder: row.sort_order,
  active: !!row.active,
});

// The storefront doesn't need the admin-only fields.
const toPublicProduct = (row) => {
  const { sortOrder, active, ...product } = toProduct(row);
  return product;
};

const toImage = async (row) => ({
  id: row.id,
  name: row.name,
  url: await signedUrl(row.s3_key),
  alt: row.alt,
  role: row.role,
  fit: row.fit,
  focalPoint: row.focal_point,
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

const toRow = (data) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [COLUMNS[key], key === 'active' ? Number(value) : value])
  );

const rethrowDuplicateSlug = (err) => {
  if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Slug already in use');
  throw err;
};

const listActiveProducts = async () => {
  const [rows] = await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, id');
  return attachImages(rows.map(toPublicProduct));
};

const listProducts = async () => {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY sort_order, id');
  return attachImages(rows.map(toProduct));
};

const getProduct = async (id) => {
  const [[row]] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Product not found');
  const [withImages] = await attachImages([toProduct(row)]);
  return withImages;
};

const createProduct = async (data) => {
  const [result] = await pool.query('INSERT INTO products SET ?', [toRow(data)]).catch(rethrowDuplicateSlug);
  return getProduct(result.insertId);
};

const updateProduct = async (id, data) => {
  if (Object.keys(data).length === 0) throw new HttpError(400, 'No fields to update');
  await pool.query('UPDATE products SET ? WHERE id = ?', [toRow(data), id]).catch(rethrowDuplicateSlug);
  return getProduct(id);
};

// Products that appear in past orders are hidden rather than deleted, so the
// orders keep their history.
const deleteProduct = async (id) => {
  await getProduct(id);
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?', [id]);
  if (count > 0) {
    await pool.query('UPDATE products SET active = 0 WHERE id = ?', [id]);
    return { ok: true, softDeleted: true };
  }
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
  return { ok: true, softDeleted: false };
};

export { listActiveProducts, listProducts, getProduct, createProduct, updateProduct, deleteProduct };
