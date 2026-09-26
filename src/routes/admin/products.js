import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';

export const adminProductsRouter = Router();

function toAdminProduct(row) {
  return {
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
  };
}

const productSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tagline: z.string().min(1),
  story: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  sortOrder: z.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

const productUpdateSchema = productSchema.partial();

adminProductsRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
    res.json(rows.map(toAdminProduct));
  } catch (err) {
    next(err);
  }
});

adminProductsRouter.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(toAdminProduct(rows[0]));
  } catch (err) {
    next(err);
  }
});

adminProductsRouter.post('/', async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid product', details: parsed.error.flatten() });
  }
  const p = parsed.data;

  try {
    const [result] = await pool.query(
      `INSERT INTO products (slug, name, hex, tagline, story, price_cents, stock, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.slug, p.name, p.hex, p.tagline, p.story, p.priceCents, p.stock, p.sortOrder, p.active ? 1 : 0]
    );
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(toAdminProduct(rows[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Slug already in use' });
    }
    next(err);
  }
});

adminProductsRouter.put('/:id', async (req, res, next) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid product', details: parsed.error.flatten() });
  }
  const updates = parsed.data;

  const columns = {
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

  const setClauses = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in updates) {
      setClauses.push(`${column} = ?`);
      values.push(key === 'active' ? (updates[key] ? 1 : 0) : updates[key]);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const [rows] = await pool.query('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });

    values.push(req.params.id);
    await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(toAdminProduct(updated[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Slug already in use' });
    }
    next(err);
  }
});

adminProductsRouter.delete('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });

    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?',
      [req.params.id]
    );

    if (count > 0) {
      await pool.query('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
      return res.json({ ok: true, softDeleted: true });
    }

    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ ok: true, softDeleted: false });
  } catch (err) {
    next(err);
  }
});
