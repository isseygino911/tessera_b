import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { cancelOrder } from '../../services/orders.js';

export const adminOrdersRouter = Router();

const STATUSES = ['new', 'contacted', 'paid', 'shipped', 'cancelled'];
const statusQuerySchema = z.enum(STATUSES);

function toAdminOrder(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    note: row.note,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

adminOrdersRouter.get('/', async (req, res, next) => {
  const { status } = req.query;
  if (status !== undefined) {
    const parsed = statusQuerySchema.safeParse(status);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status', details: parsed.error.flatten() });
    }
  }

  try {
    const params = [];
    let sql = 'SELECT * FROM orders';
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(toAdminOrder));
  } catch (err) {
    next(err);
  }
});

adminOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);

    res.json({
      ...toAdminOrder(order),
      items: items.map((item) => ({
        productId: item.product_id,
        productName: item.product_name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({
  status: statusQuerySchema,
});

adminOrdersRouter.patch('/:id', async (req, res, next) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid status', details: parsed.error.flatten() });
  }

  try {
    const [rows] = await pool.query('SELECT id FROM orders WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });

    if (parsed.data.status === 'cancelled') {
      await cancelOrder(req.params.id);
    } else {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [parsed.data.status, req.params.id]);
    }

    const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(toAdminOrder(updated[0]));
  } catch (err) {
    next(err);
  }
});
