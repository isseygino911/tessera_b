import { pool, withTransaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { sendOrderNotification } from './mailer.js';

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
  status: row.status,
  totalCents: row.total_cents,
  createdAt: row.created_at,
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

const createOrder = async ({ customer, items, user }) => {
  if (user.role === 'admin') throw new HttpError(403, "Admin accounts can't place orders");

  const order = await withTransaction(async (connection) => {
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

    const [result] = await connection.query('INSERT INTO orders SET ?', [
      {
        user_id: user.id,
        customer_name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address_line1: customer.addressLine1,
        address_line2: customer.addressLine2 ?? null,
        city: customer.city,
        region: customer.region,
        postal_code: customer.postalCode,
        country: customer.country,
        note: customer.note ?? null,
        status: 'new',
        total_cents: totalCents,
      },
    ]);
    for (const line of lines) {
      await connection.query('INSERT INTO order_items SET ?', [{ order_id: result.insertId, ...line }]);
    }

    return { id: result.insertId, customer_name: customer.name, email: customer.email, total_cents: totalCents, items: lines };
  });

  // The order is saved either way; a mail failure is only logged.
  try {
    await sendOrderNotification(order);
  } catch (err) {
    console.error('Failed to send order notification email:', err);
  }

  return { id: order.id };
};

const listOrders = async (status) => {
  const [rows] = status
    ? await pool.query('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', [status])
    : await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  return rows.map(toOrder);
};

const getOrder = async (id) => {
  const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Order not found');
  return toOrder(row);
};

const getOrderWithItems = async (id) => {
  const order = await getOrder(id);
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
  return {
    ...order,
    items: items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
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

const updateOrderStatus = async (id, status) => {
  if (status === 'cancelled') {
    await cancelOrder(id);
  } else {
    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  }
  return getOrder(id);
};

export { createOrder, listOrders, getOrderWithItems, updateOrderStatus };
