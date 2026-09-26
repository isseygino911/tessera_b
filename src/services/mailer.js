import nodemailer from 'nodemailer';

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendOrderNotification(order) {
  const transport = buildTransport();
  const lines = order.items
    .map((item) => `  ${item.quantity} x ${item.product_name} @ $${(item.unit_price_cents / 100).toFixed(2)}`)
    .join('\n');

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.ORDER_NOTIFY_EMAIL,
    subject: `New order #${order.id} from ${order.customer_name}`,
    text: `New order #${order.id}\n\nCustomer: ${order.customer_name} <${order.email}>\n\nItems:\n${lines}\n\nTotal: $${(order.total_cents / 100).toFixed(2)}`,
  });
}
