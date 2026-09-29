import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { createApp } from '../src/app.js';
import { buildOrderPayload, createUser, loginAgent } from './setup.js';

const app = createApp();

async function createCustomer(overrides = {}) {
  const email =
    overrides.email ?? `ada-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? 'correct-horse';
  const id = await createUser({ email, password, name: overrides.name ?? 'Ada Lovelace' });
  const agent = await loginAgent(app, email, password);
  return { id, email, password, agent };
}

function buildAddress(overrides = {}) {
  return {
    label: 'Home',
    recipientName: 'Ada Lovelace',
    phone: '555-0100',
    addressLine1: '1 Analytical Engine Way',
    addressLine2: 'Suite 2',
    city: 'London',
    region: 'LDN',
    postalCode: 'W1A 1AA',
    country: 'UK',
    ...overrides,
  };
}

describe('GET /api/addresses', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).get('/api/addresses');

    expect(res.status).toBe(401);
  });

  it("returns only the caller's own addresses", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    await mine.agent.post('/api/addresses').send(buildAddress({ label: 'Mine' }));
    await theirs.agent.post('/api/addresses').send(buildAddress({ label: 'Theirs' }));

    const res = await mine.agent.get('/api/addresses');

    expect(res.status).toBe(200);
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.addresses[0]).toMatchObject({ label: 'Mine' });
  });
});

describe('POST /api/addresses', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).post('/api/addresses').send(buildAddress());

    expect(res.status).toBe(401);
  });

  it('creates an address and returns the full list, 201', async () => {
    const { agent } = await createCustomer();

    const res = await agent.post('/api/addresses').send(buildAddress());

    expect(res.status).toBe(201);
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.addresses[0]).toMatchObject({
      label: 'Home',
      recipientName: 'Ada Lovelace',
      phone: '555-0100',
      addressLine1: '1 Analytical Engine Way',
      addressLine2: 'Suite 2',
      city: 'London',
      region: 'LDN',
      postalCode: 'W1A 1AA',
      country: 'UK',
    });
    expect(res.body.addresses[0]).toHaveProperty('id');
  });

  it('stores an empty label as null', async () => {
    const { agent } = await createCustomer();

    const res = await agent.post('/api/addresses').send(buildAddress({ label: '' }));

    expect(res.status).toBe(201);
    expect(res.body.addresses[0].label).toBeNull();
  });

  it('makes the first address the default automatically', async () => {
    const { agent } = await createCustomer();

    const res = await agent.post('/api/addresses').send(buildAddress());

    expect(res.body.addresses[0].isDefault).toBe(true);
  });

  it('does not make a second address the default', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/addresses').send(buildAddress({ label: 'Home' }));

    const res = await agent.post('/api/addresses').send(buildAddress({ label: 'Work' }));

    const work = res.body.addresses.find((a) => a.label === 'Work');
    expect(work.isDefault).toBe(false);
  });

  it('isDefault: true on create moves the default so only one address has it', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/addresses').send(buildAddress({ label: 'Home' }));

    const res = await agent
      .post('/api/addresses')
      .send(buildAddress({ label: 'Work', isDefault: true }));

    const defaults = res.body.addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].label).toBe('Work');
  });

  it('rejects an invalid body with 400', async () => {
    const { agent } = await createCustomer();
    const payload = buildAddress();
    delete payload.recipientName;

    const res = await agent.post('/api/addresses').send(payload);

    expect(res.status).toBe(400);
  });

  it('rejects an 11th address with 400', async () => {
    const { agent } = await createCustomer();
    for (let i = 0; i < 10; i++) {
      await agent.post('/api/addresses').send(buildAddress({ label: `Address ${i}` }));
    }

    const res = await agent.post('/api/addresses').send(buildAddress({ label: 'One too many' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You can save up to 10 addresses');
  });
});

describe('PUT /api/addresses/:id', () => {
  it('replaces the address fields', async () => {
    const { agent } = await createCustomer();
    const createRes = await agent.post('/api/addresses').send(buildAddress());
    const id = createRes.body.addresses[0].id;

    const res = await agent
      .put(`/api/addresses/${id}`)
      .send(buildAddress({ label: 'Work', city: 'Bristol' }));

    expect(res.status).toBe(200);
    const updated = res.body.addresses.find((a) => a.id === id);
    expect(updated).toMatchObject({ label: 'Work', city: 'Bristol' });
  });

  it('isDefault: true on update moves the default', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/addresses').send(buildAddress({ label: 'Home' }));
    const secondRes = await agent.post('/api/addresses').send(buildAddress({ label: 'Work' }));
    const workId = secondRes.body.addresses.find((a) => a.label === 'Work').id;

    const res = await agent
      .put(`/api/addresses/${workId}`)
      .send(buildAddress({ label: 'Work', isDefault: true }));

    const defaults = res.body.addresses.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(workId);
  });

  it("returns 404 'Address not found' for another user's address", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const createRes = await theirs.agent.post('/api/addresses').send(buildAddress());
    const theirId = createRes.body.addresses[0].id;

    const res = await mine.agent.put(`/api/addresses/${theirId}`).send(buildAddress());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Address not found');
  });

  it('returns 401 with no session', async () => {
    const res = await request(app).put('/api/addresses/1').send(buildAddress());

    expect(res.status).toBe(401);
  });

  it('rejects an invalid body with 400', async () => {
    const { agent } = await createCustomer();
    const createRes = await agent.post('/api/addresses').send(buildAddress());
    const id = createRes.body.addresses[0].id;
    const payload = buildAddress();
    delete payload.addressLine1;

    const res = await agent.put(`/api/addresses/${id}`).send(payload);

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/addresses/:id', () => {
  it('deletes the address and returns the remaining list', async () => {
    const { agent } = await createCustomer();
    const createRes = await agent.post('/api/addresses').send(buildAddress());
    const id = createRes.body.addresses[0].id;

    const res = await agent.delete(`/api/addresses/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.addresses).toHaveLength(0);
  });

  it('promotes the newest remaining address when the default is deleted', async () => {
    const { agent } = await createCustomer();
    const firstRes = await agent.post('/api/addresses').send(buildAddress({ label: 'Home' }));
    const defaultId = firstRes.body.addresses[0].id;
    const secondRes = await agent.post('/api/addresses').send(buildAddress({ label: 'Work' }));
    const newestId = secondRes.body.addresses.find((a) => a.label === 'Work').id;

    const res = await agent.delete(`/api/addresses/${defaultId}`);

    expect(res.status).toBe(200);
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.addresses[0]).toMatchObject({ id: newestId, isDefault: true });
  });

  it("returns 404 'Address not found' for another user's address", async () => {
    const mine = await createCustomer();
    const theirs = await createCustomer();
    const createRes = await theirs.agent.post('/api/addresses').send(buildAddress());
    const theirId = createRes.body.addresses[0].id;

    const res = await mine.agent.delete(`/api/addresses/${theirId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Address not found');
  });

  it('returns 401 with no session', async () => {
    const res = await request(app).delete('/api/addresses/1');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/orders with saveAddress', () => {
  it('adds the checkout address with recipientName from customer.name and no label', async () => {
    const { agent } = await createCustomer({ name: 'Ada Lovelace' });

    await agent
      .post('/api/orders')
      .send(buildOrderPayload({ saveAddress: true }))
      .expect(201);

    const res = await agent.get('/api/addresses');
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.addresses[0]).toMatchObject({
      label: null,
      recipientName: 'Ada Lovelace',
      phone: '555-0100',
      addressLine1: '1 Analytical Engine Way',
      city: 'London',
      region: 'LDN',
      postalCode: 'W1A 1AA',
      country: 'UK',
      isDefault: true,
    });
  });

  it('does not duplicate an identical address already saved', async () => {
    const { agent } = await createCustomer({ name: 'Ada Lovelace' });
    await agent
      .post('/api/orders')
      .send(buildOrderPayload({ saveAddress: true }))
      .expect(201);

    await agent
      .post('/api/orders')
      .send(buildOrderPayload({ saveAddress: true }))
      .expect(201);

    const res = await agent.get('/api/addresses');
    expect(res.body.addresses).toHaveLength(1);
  });

  it('adds nothing when saveAddress is absent', async () => {
    const { agent } = await createCustomer();

    await agent.post('/api/orders').send(buildOrderPayload()).expect(201);

    const res = await agent.get('/api/addresses');
    expect(res.body.addresses).toHaveLength(0);
  });

  it("editing the saved address afterwards leaves the order's own address unchanged", async () => {
    const { agent } = await createCustomer({ name: 'Ada Lovelace' });
    const orderRes = await agent
      .post('/api/orders')
      .send(buildOrderPayload({ saveAddress: true }));
    const orderId = orderRes.body.id;

    const addressesRes = await agent.get('/api/addresses');
    const addressId = addressesRes.body.addresses[0].id;
    await agent
      .put(`/api/addresses/${addressId}`)
      .send(buildAddress({ label: 'Changed', city: 'Manchester', addressLine1: 'New Street' }));

    const res = await agent.get(`/api/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      city: 'London',
      addressLine1: '1 Analytical Engine Way',
    });
  });
});
