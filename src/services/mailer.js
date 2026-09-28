import nodemailer from 'nodemailer';

const formatCents = (cents) => `$${(cents / 100).toFixed(2)}`;
const orderNumber = (id) => `#${id.slice(0, 8).toUpperCase()}`;

const sendOrderNotification = async (order) => {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const lines = order.items
    .map((item) => `  ${item.quantity} x ${item.product_name} @ ${formatCents(item.unit_price_cents)}`)
    .join('\n');

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.ORDER_NOTIFY_EMAIL,
    subject: `New order ${orderNumber(order.id)} from ${order.customer_name}`,
    text: `New order ${orderNumber(order.id)}\n\nCustomer: ${order.customer_name} <${order.email}>\n\nItems:\n${lines}\n\nTotal: ${formatCents(order.total_cents)}`,
  });
};

export { sendOrderNotification };
