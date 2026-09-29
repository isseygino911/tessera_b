import crypto from 'node:crypto';
import { pool, withTransaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { sendOrderEmails } from './orderEmails.js';
import { attachImages } from './productImages.js';
import { toAddressRow, saveCheckoutAddress } from './addresses.js';

const PAGE_SIZE = 20;

const toOrder = (row) => ({
  id: row.id,
  userId: row.user_id,
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
  adminNote: row.admin_note,
  status: row.status,
  totalCents: row.total_cents,
  createdAt: row.created_at,
  itemCount: row.item_count,
});

// Merge duplicate productIds into a single line so stock/price are only
// checked and charged once per product. Sorted by productId so concurrent
// orders always acquire row locks in the same order and can't deadlock.
const mergeItems = (items) => {
  const qtyByProductId = new Map();
  for (const { productId, qty } of items) {
    qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + qty);
  }
  return [...qtyByProductId].map(([productId, qty]) => ({ productId, qty })).sort((a, b) => a.productId - b.productId);
};

const createOrder = async ({ customer, items, saveAddress, user }) => {
  if (user.role === 'admin') throw new HttpError(403, "Admin accounts can't place orders");

  const id = await withTransaction(async (connection) => {
    const lines = [];
    let totalCents = 0;

    for (const { productId, qty } of mergeItems(items)) {
      const [[product]] = await connection.query(
        'SELECT id, name, price_cents, stock, active FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      if (!product || !product.active) {
        throw new HttpError(400, `Unknown or inactive product ${productId}`);
      }
      if (qty > product.stock) {
        throw new HttpError(409, `Not enough stock for ${product.name}`, { productId: product.id });
      }
      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, productId]);
      lines.push({ product_id: product.id, product_name: product.name, unit_price_cents: product.price_cents, quantity: qty });
      totalCents += product.price_cents * qty;
    }

    const id = crypto.randomUUID();
    await connection.query('INSERT INTO orders SET ?', [
      {
        id,
        user_id: user.id,
        customer_name: customer.name,
        email: customer.email,
        ...toAddressRow(customer),
        note: customer.note ?? null,
        status: 'new',
        total_cents: totalCents,
      },
    ]);
    for (const line of lines) {
      await connection.query('INSERT INTO order_items SET ?', [{ order_id: id, ...line }]);
    }
    if (saveAddress) await saveCheckoutAddress(connection, user.id, customer);

    return id;
  });

  // Not awaited: checkout doesn't wait for SMTP or the image downloads.
  sendOrderEmails(await getOrderWithItems(id));

  return { id };
};

// With a userId (a customer's own orders) there is no paging: a customer has only a few.
const listOrders = async ({ status, q, page = 1, userId } = {}) => {
  const where = [];
  const params = [];

  if (userId) {
    where.push('user_id = ?');
    params.push(userId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    const prefix = q.replace(/^#/, '').toLowerCase();
    where.push('(LOWER(id) LIKE ? OR customer_name LIKE ? OR email LIKE ?)');
    params.push(`${prefix}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT orders.*, (SELECT CAST(COALESCE(SUM(quantity), 0) AS UNSIGNED) FROM order_items WHERE order_items.order_id = orders.id) AS item_count
     FROM orders ${whereSql} ORDER BY created_at DESC ${userId ? '' : 'LIMIT ? OFFSET ?'}`,
    userId ? params : [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );
  return { orders: rows.map(toOrder), total };
};

// A customer's view of an order leaves out the admin-only fields.
const toOwnOrder = ({ adminNote, userId, ...order }) => order;

const listOwnOrders = async (userId) => {
  const { orders } = await listOrders({ userId });
  return { orders: orders.map(toOwnOrder) };
};

// 404 (not 403) for someone else's order, so it doesn't reveal that the order exists.
const getOwnOrder = async (id, userId) => {
  const order = await getOrderWithItems(id);
  if (order.userId !== userId) throw new HttpError(404, 'Order not found');
  return toOwnOrder(order);
};

const getOrder = async (id) => {
  const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Order not found');
  return toOrder(row);
};

const getOrderWithItems = async (id) => {
  const order = await getOrder(id);
  const [rows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
  const items = await attachImages(rows.map((row) => ({ ...row, id: row.product_id })));

  return {
    ...order,
    items: items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
      imageUrl: item.images[0]?.url ?? null,
    })),
  };
};

// Cancelling puts the items back in stock (once, even if cancelled twice).
const cancelOrder = (id) =>
  withTransaction(async (connection) => {
    const [[order]] = await connection.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.status === 'cancelled') return;

    const [items] = await connection.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id]);
    for (const item of items) {
      await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
    }
    await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);
  });

const updateOrder = async (id, { status, adminNote }) => {
  if (status === 'cancelled') {
    await cancelOrder(id);
  } else if (status) {
    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  }
  if (adminNote !== undefined) {
    await pool.query('UPDATE orders SET admin_note = ? WHERE id = ?', [adminNote, id]);
  }
  return getOrder(id);
};

export { createOrder, listOrders, listOwnOrders, getOrderWithItems, getOwnOrder, updateOrder };
