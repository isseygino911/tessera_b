import { Router } from 'express';
import { pool } from '../db.js';

export const productsRouter = Router();

function toPublicProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    hex: row.hex,
    tagline: row.tagline,
    story: row.story,
    priceCents: row.price_cents,
    stock: row.stock,
  };
}

productsRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC'
    );
    res.json(rows.map(toPublicProduct));
  } catch (err) {
    next(err);
  }
});
