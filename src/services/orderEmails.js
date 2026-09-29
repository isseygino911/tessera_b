import { send } from './mailer.js';

// Order confirmation emails: one to the buyer (the checkout email), one to the
// shop owner (ORDER_NOTIFY_EMAIL). `order` is the shape getOrderWithItems returns.
// Mail apps ignore <style> blocks and web fonts, so the HTML is table-based
// with inline styles only.

const COLORS = { page: '#f6f4ef', card: '#ffffff', text: '#111113', dim: '#6f6c76', line: '#e6e2d8', accent: '#b98a2f' };
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const formatCents = (cents) => `$${(cents / 100).toFixed(2)}`;
const orderNumber = (id) => `#${id.slice(0, 8).toUpperCase()}`;
const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const imageCid = (item) => `item-${item.productId}@tessera`;

const addressLines = (order) =>
  [
    order.addressLine1,
    order.addressLine2,
    `${order.city}, ${order.region} ${order.postalCode}`,
    order.country,
  ].filter(Boolean);

// Product photos travel inside the email (cid:) because the S3 links expire;
// nodemailer downloads each one from its signed URL when it sends.
const imageAttachments = (order) =>
  order.items
    .filter((item) => item.imageUrl)
    .map((item) => ({ filename: `${item.productId}.jpg`, path: item.imageUrl, cid: imageCid(item) }));

const itemRowsHtml = (order) =>
  order.items
    .map((item) => {
      const image = item.imageUrl
        ? `<img src="cid:${imageCid(item)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border:1px solid ${COLORS.line};">`
        : '';
      return `<tr>
  <td width="76" style="padding:12px 12px 12px 0;border-bottom:1px solid ${COLORS.line};vertical-align:top;">${image}</td>
  <td style="padding:12px 0;border-bottom:1px solid ${COLORS.line};font:15px/1.4 ${SANS};color:${COLORS.text};vertical-align:top;">
    ${escapeHtml(item.productName)}<br>
    <span style="font-size:13px;color:${COLORS.dim};">${item.quantity} × ${formatCents(item.unitPriceCents)}</span>
  </td>
  <td align="right" style="padding:12px 0;border-bottom:1px solid ${COLORS.line};font:15px/1.4 ${SANS};color:${COLORS.text};vertical-align:top;white-space:nowrap;">${formatCents(item.unitPriceCents * item.quantity)}</td>
</tr>`;
    })
    .join('');

const sectionHtml = (title, bodyHtml) => `
<p style="margin:28px 0 6px;font:600 11px/1 ${SANS};letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.dim};">${title}</p>
<p style="margin:0;font:15px/1.6 ${SANS};color:${COLORS.text};">${bodyHtml}</p>`;

const buttonHtml = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0;"><tr>
  <td style="background:${COLORS.text};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font:600 12px/1 ${SANS};letter-spacing:0.12em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${label}</a></td>
</tr></table>`;

// The shared page: wordmark, a heading block, the items table with total, then `details`.
const layoutHtml = ({ preheader, eyebrow, heading, intro, order, details }) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 4px 20px;font:900 20px/1 ${SANS};letter-spacing:0.04em;color:${COLORS.text};">TESSERA<span style="color:${COLORS.accent};">.</span></td></tr>
  <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.line};padding:36px 32px;">
    <p style="margin:0 0 10px;font:600 11px/1 ${SANS};letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.accent};">${eyebrow}</p>
    <h1 style="margin:0 0 12px;font:400 30px/1.2 ${SERIF};color:${COLORS.text};">${heading}</h1>
    <p style="margin:0 0 24px;font:15px/1.6 ${SANS};color:${COLORS.dim};">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.line};">
      ${itemRowsHtml(order)}
      <tr>
        <td></td>
        <td style="padding:16px 0 0;font:600 15px/1 ${SANS};color:${COLORS.text};">Total</td>
        <td align="right" style="padding:16px 0 0;font:400 22px/1 ${SERIF};color:${COLORS.text};white-space:nowrap;">${formatCents(order.totalCents)}</td>
      </tr>
    </table>
    ${details}
  </td></tr>
  <tr><td style="padding:20px 4px 0;font:12px/1.6 ${SANS};color:${COLORS.dim};">Tessera · Faceted crystal bead bracelets</td></tr>
</table>
</td></tr></table>
</body></html>`;

const itemLinesText = (order) =>
  order.items
    .map((item) => `- ${item.productName}: ${item.quantity} x ${formatCents(item.unitPriceCents)} = ${formatCents(item.unitPriceCents * item.quantity)}`)
    .join('\n');

const buyerEmail = (order) => {
  const number = orderNumber(order.id);
  const firstName = order.customerName.split(' ')[0];
  const orderUrl = `${process.env.APP_ORIGIN}/account/orders/${order.id}`;
  const address = addressLines(order);

  const details = [
    sectionHtml('Shipping to', [order.customerName, ...address].map(escapeHtml).join('<br>')),
    order.note ? sectionHtml('Your note', escapeHtml(order.note)) : '',
    buttonHtml(orderUrl, 'View your order'),
    `<p style="margin:28px 0 0;font:14px/1.6 ${SANS};color:${COLORS.dim};">We'll email you again when your order ships. Questions? Just reply to this email.</p>`,
  ].join('');

  return {
    to: order.email,
    subject: `Your Tessera order ${number}`,
    html: layoutHtml({
      preheader: `Thank you — we've received order ${number}.`,
      eyebrow: `Order ${number} · ${formatDate(order.createdAt)}`,
      heading: `Thank you for your order, ${escapeHtml(firstName)}`,
      intro: "We've received your order and will get it ready for you.",
      order,
      details,
    }),
    text: `Thank you for your order, ${firstName}.

Order ${number} · ${formatDate(order.createdAt)}

${itemLinesText(order)}
Total: ${formatCents(order.totalCents)}

Shipping to:
${[order.customerName, ...address].join('\n')}
${order.note ? `\nYour note: ${order.note}\n` : ''}
View your order: ${orderUrl}

We'll email you again when your order ships. Questions? Just reply to this email.
— Tessera`,
    attachments: imageAttachments(order),
  };
};

const adminEmail = (order) => {
  const number = orderNumber(order.id);
  const adminUrl = `${process.env.APP_ORIGIN}/admin/orders/${order.id}`;
  const address = addressLines(order);
  const contact = [
    escapeHtml(order.customerName),
    `<a href="mailto:${escapeHtml(order.email)}" style="color:${COLORS.accent};">${escapeHtml(order.email)}</a>`,
    escapeHtml(order.phone),
  ].filter(Boolean);

  const details = [
    sectionHtml('Customer', contact.join('<br>')),
    sectionHtml('Ship to', address.map(escapeHtml).join('<br>')),
    order.note ? sectionHtml('Customer note', escapeHtml(order.note)) : '',
    buttonHtml(adminUrl, 'Open in admin'),
  ].join('');

  return {
    to: process.env.ORDER_NOTIFY_EMAIL,
    subject: `New order ${number} from ${order.customerName} — ${formatCents(order.totalCents)}`,
    html: layoutHtml({
      preheader: `${order.customerName} placed order ${number} (${formatCents(order.totalCents)}).`,
      eyebrow: `New order · ${formatDate(order.createdAt)}`,
      heading: `Order ${number}`,
      intro: `${escapeHtml(order.customerName)} just placed an order.`,
      order,
      details,
    }),
    text: `New order ${number} · ${formatDate(order.createdAt)}

Customer: ${order.customerName} <${order.email}>${order.phone ? `, ${order.phone}` : ''}

${itemLinesText(order)}
Total: ${formatCents(order.totalCents)}

Ship to:
${address.join('\n')}
${order.note ? `\nCustomer note: ${order.note}\n` : ''}
Open in admin: ${adminUrl}`,
    attachments: imageAttachments(order),
  };
};

// Both sends start right away; the order is already saved, so any failure
// (building or sending) is only logged and never reaches the caller.
const sendOrderEmails = (order) =>
  Promise.all(
    [
      ['buyer', buyerEmail],
      ['admin', adminEmail],
    ].map(async ([who, build]) => {
      try {
        await send(build(order));
      } catch (err) {
        console.error(`Failed to send ${who} order email for ${order.id}:`, err);
      }
    })
  );

export { buyerEmail, adminEmail, sendOrderEmails };
