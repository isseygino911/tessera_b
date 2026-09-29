import { describe, it, expect, beforeAll } from 'vitest';
import { buyerEmail, adminEmail, shippedEmail } from '../src/services/orderEmails.js';

beforeAll(() => {
  process.env.APP_ORIGIN = 'http://localhost:5173';
  process.env.ORDER_NOTIFY_EMAIL = 'owner@test.local';
});

const orderNumber = '#1A2B3C4D';

function buildOrder(overrides = {}) {
  const { items, ...rest } = overrides;
  return {
    id: '1a2b3c4d-0000-0000-0000-000000000000',
    customerName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '555-0100',
    addressLine1: '1 Analytical Engine Way',
    addressLine2: null,
    city: 'London',
    region: 'LDN',
    postalCode: 'W1A 1AA',
    country: 'UK',
    note: null,
    totalCents: 9600,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'new',
    items: items ?? [
      {
        productId: 1,
        productName: 'Sunlit Amber',
        unitPriceCents: 4800,
        quantity: 2,
        imageUrl: 'https://s3.test/products/sunlit-amber/main.jpg',
      },
    ],
    ...rest,
  };
}

describe('buyerEmail', () => {
  it('addresses the buyer, includes the order number, item names, and total', () => {
    const order = buildOrder();

    const mail = buyerEmail(order);

    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toContain(orderNumber);
    expect(mail.html).toContain('Sunlit Amber');
    expect(mail.html).toContain('$96.00');
    expect(mail.html).toContain(`http://localhost:5173/account/orders/${order.id}`);
  });

  it('includes the order number and total in the text version', () => {
    const order = buildOrder();

    const mail = buyerEmail(order);

    expect(mail.text).toContain(orderNumber);
    expect(mail.text).toContain('$96.00');
  });

  it('attaches an inline image for an item with an imageUrl, referenced by cid in html', () => {
    const order = buildOrder();

    const mail = buyerEmail(order);

    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({
      path: 'https://s3.test/products/sunlit-amber/main.jpg',
      cid: 'item-1@tessera',
    });
    expect(mail.html).toContain('src="cid:item-1@tessera"');
  });

  it('omits the attachment and the inline image markup for an item with no imageUrl', () => {
    const order = buildOrder({
      items: [
        {
          productId: 2,
          productName: 'Forest Emerald',
          unitPriceCents: 4800,
          quantity: 1,
          imageUrl: null,
        },
      ],
    });

    const mail = buyerEmail(order);

    expect(mail.attachments).toHaveLength(0);
    expect(mail.html).not.toContain('<img');
  });

  it('HTML-escapes user-supplied text in the customer name and note', () => {
    const order = buildOrder({
      customerName: '<script>alert(1)</script>',
      note: '<b>rush please</b>',
    });

    const mail = buyerEmail(order);

    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<b>rush please</b>');
  });
});

describe('adminEmail', () => {
  it('addresses ORDER_NOTIFY_EMAIL and includes the order number, customer name, and email', () => {
    const order = buildOrder();

    const mail = adminEmail(order);

    expect(mail.to).toBe('owner@test.local');
    expect(mail.subject).toContain(orderNumber);
    expect(mail.subject).toContain('Ada Lovelace');
    expect(mail.html).toContain('ada@example.com');
    expect(mail.html).toContain(`http://localhost:5173/admin/orders/${order.id}`);
  });

  it('HTML-escapes user-supplied text in address fields and phone', () => {
    const order = buildOrder({
      addressLine1: '<script>alert(1)</script>',
      phone: '<img src=x onerror=alert(1)>',
    });

    const mail = adminEmail(order);

    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('attaches an inline image for an item with an imageUrl, referenced by cid in html', () => {
    const order = buildOrder();

    const mail = adminEmail(order);

    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({
      path: 'https://s3.test/products/sunlit-amber/main.jpg',
      cid: 'item-1@tessera',
    });
    expect(mail.html).toContain('src="cid:item-1@tessera"');
  });

  it('omits the attachment and the inline image markup for an item with no imageUrl', () => {
    const order = buildOrder({
      items: [
        {
          productId: 3,
          productName: 'Ocean Topaz',
          unitPriceCents: 4800,
          quantity: 1,
          imageUrl: null,
        },
      ],
    });

    const mail = adminEmail(order);

    expect(mail.attachments).toHaveLength(0);
    expect(mail.html).not.toContain('<img');
  });
});

describe('shippedEmail', () => {
  it('addresses the buyer and includes a subject with "shipped" and the order number', () => {
    const order = buildOrder();

    const mail = shippedEmail(order);

    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject.toLowerCase()).toContain('shipped');
    expect(mail.subject).toContain(orderNumber);
  });

  it('includes the account order link and the product name', () => {
    const order = buildOrder();

    const mail = shippedEmail(order);

    expect(mail.html).toContain(`http://localhost:5173/account/orders/${order.id}`);
    expect(mail.html).toContain('Sunlit Amber');
  });

  it('attaches an inline image for an item with an imageUrl, referenced by cid in html', () => {
    const order = buildOrder();

    const mail = shippedEmail(order);

    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({
      path: 'https://s3.test/products/sunlit-amber/main.jpg',
      cid: 'item-1@tessera',
    });
    expect(mail.html).toContain('src="cid:item-1@tessera"');
  });

  it('omits the attachment and the inline image markup for an item with no imageUrl', () => {
    const order = buildOrder({
      items: [
        {
          productId: 2,
          productName: 'Forest Emerald',
          unitPriceCents: 4800,
          quantity: 1,
          imageUrl: null,
        },
      ],
    });

    const mail = shippedEmail(order);

    expect(mail.attachments).toHaveLength(0);
    expect(mail.html).not.toContain('<img');
  });

  it('HTML-escapes user-supplied text in the customer name, address, and note', () => {
    const order = buildOrder({
      customerName: '<script>alert(1)</script>',
      addressLine1: '<img src=x onerror=alert(1)>',
      note: '<b>leave at door</b>',
    });

    const mail = shippedEmail(order);

    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(mail.html).not.toContain('<b>leave at door</b>');
  });
});
