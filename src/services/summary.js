import { pool } from '../db.js';
import { listOrders } from './orders.js';

const LOW_STOCK = 5;

const getSummary = async () => {
  const [[{ newOrders }]] = await pool.query("SELECT COUNT(*) AS newOrders FROM orders WHERE status = 'new'");
  const [[{ revenueThisMonthCents }]] = await pool.query(
    `SELECT CAST(COALESCE(SUM(total_cents), 0) AS UNSIGNED) AS revenueThisMonthCents FROM orders
     WHERE status != 'cancelled' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  const [lowStock] = await pool.query(
    'SELECT id, name, stock FROM products WHERE active = 1 AND stock <= ? ORDER BY stock, name',
    [LOW_STOCK]
  );
  const { orders: recentOrders } = await listOrders({ page: 1 });

  return { newOrders, revenueThisMonthCents, lowStock, recentOrders: recentOrders.slice(0, 5) };
};

export { getSummary };
