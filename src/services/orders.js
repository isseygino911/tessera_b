import { pool } from '../db.js';
import { sendOrderNotification } from './mailer.js';

export class OversellError extends Error {
  constructor(productId, productName) {
    super(`Not enough stock for ${productName}`);
    this.name = 'OversellError';
    this.productId = productId;
    this.productName = productName;
  }
}

// Merge duplicate productIds into a single line so stock/price are only
// checked and charged once per product. Sorted by productId so concurrent
// orders always acquire row locks in the same order and can't deadlock.
function mergeItems(items) {
  const byProductId = new Map();
  for (const { productId, qty } of items) {
    byProductId.set(productId, (byProductId.get(productId) ?? 0) + qty);
  }
  return [...byProductId.entries()]
    .map(([productId, qty]) => ({ productId, qty }))
    .sort((a, b) => a.productId - b.productId);
}

export async function createOrder({ customer, items }) {
  const merged = mergeItems(items);
  const connection = await pool.getConnection();

  let order;
  try {
    await connection.beginTransaction();

    const orderItems = [];
    let totalCents = 0;

    for (const { productId, qty } of merged) {
      const [rows] = await connection.query(
        'SELECT id, name, price_cents, stock, active FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      const product = rows[0];
      if (!product || !product.active) {
        const err = new Error(`Unknown or inactive product ${productId}`);
        err.name = 'InvalidProductError';
        throw err;
      }
      if (qty > product.stock) {
        throw new OversellError(product.id, product.name);
      }

      await connection.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, productId]);

      orderItems.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.price_cents,
        quantity: qty,
      });
      totalCents += product.price_cents * qty;
    }

    const [orderResult] = await connection.query(
      `INSERT INTO orders
         (customer_name, email, phone, address_line1, address_line2, city, region, postal_code, country, note, status, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      [
        customer.name,
        customer.email,
        customer.phone,
        customer.addressLine1,
        customer.addressLine2 ?? null,
        customer.city,
        customer.region,
        customer.postalCode,
        customer.country,
        customer.note ?? null,
        totalCents,
      ]
    );
    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.productName, item.unitPriceCents, item.quantity]
      );
    }

    await connection.commit();
    order = { id: orderId, customer_name: customer.name, email: customer.email, total_cents: totalCents, items: orderItems.map((i) => ({
      product_name: i.productName,
      unit_price_cents: i.unitPriceCents,
      quantity: i.quantity,
    })) };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  try {
    await sendOrderNotification(order);
  } catch (err) {
    console.error('Failed to send order notification email:', err);
  }

  return { id: order.id };
}

export async function cancelOrder(orderId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.query('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = orderRows[0];
    if (!order) {
      const err = new Error('Order not found');
      err.name = 'NotFoundError';
      throw err;
    }

    if (order.status !== 'cancelled') {
      const [items] = await connection.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
        [orderId]
      );
      for (const item of items) {
        await connection.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
      await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [orderId]);
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
