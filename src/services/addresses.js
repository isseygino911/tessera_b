import { pool, withTransaction } from '../db.js';
import { HttpError } from '../lib/http.js';

const MAX_ADDRESSES = 10;

// Maps shipping fields (a saved address or the checkout customer) to the
// columns shared by the addresses and orders tables.
const toAddressRow = (address) => ({
  phone: address.phone,
  address_line1: address.addressLine1,
  address_line2: address.addressLine2 || null,
  city: address.city,
  region: address.region,
  postal_code: address.postalCode,
  country: address.country,
});

const toSavedRow = (address) => ({
  label: address.label || null,
  recipient_name: address.recipientName,
  ...toAddressRow(address),
});

const toAddress = (row) => ({
  id: row.id,
  label: row.label,
  recipientName: row.recipient_name,
  phone: row.phone,
  addressLine1: row.address_line1,
  addressLine2: row.address_line2,
  city: row.city,
  region: row.region,
  postalCode: row.postal_code,
  country: row.country,
  isDefault: Boolean(row.is_default),
});

// Locks the user's addresses so the limit and the single default hold under concurrent requests.
const lockAddresses = async (connection, userId) => {
  const [rows] = await connection.query('SELECT * FROM addresses WHERE user_id = ? FOR UPDATE', [userId]);
  return rows;
};

const findOwnAddress = async (connection, userId, id) => {
  const [[row]] = await connection.query('SELECT * FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE', [
    id,
    userId,
  ]);
  if (!row) throw new HttpError(404, 'Address not found');
  return row;
};

const clearDefault = (connection, userId) =>
  connection.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);

// The default first, then newest first.
const listAddresses = async (userId) => {
  const [rows] = await pool.query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [
    userId,
  ]);
  return { addresses: rows.map(toAddress) };
};

// A user's first address becomes the default.
const createAddress = async (userId, { isDefault, ...address }) => {
  await withTransaction(async (connection) => {
    const existing = await lockAddresses(connection, userId);
    if (existing.length >= MAX_ADDRESSES) {
      throw new HttpError(400, `You can save up to ${MAX_ADDRESSES} addresses`);
    }
    const makeDefault = existing.length === 0 || Boolean(isDefault);
    if (makeDefault) await clearDefault(connection, userId);
    await connection.query('INSERT INTO addresses SET ?', [
      { user_id: userId, ...toSavedRow(address), is_default: makeDefault },
    ]);
  });
  return listAddresses(userId);
};

// isDefault: false never unsets the default; another address has to take it.
const updateAddress = async (userId, id, { isDefault, ...address }) => {
  await withTransaction(async (connection) => {
    const row = await findOwnAddress(connection, userId, id);
    if (isDefault) await clearDefault(connection, userId);
    await connection.query('UPDATE addresses SET ? WHERE id = ?', [
      { ...toSavedRow(address), ...(isDefault && { is_default: true }) },
      row.id,
    ]);
  });
  return listAddresses(userId);
};

// Deleting the default promotes the newest remaining address.
const deleteAddress = async (userId, id) => {
  await withTransaction(async (connection) => {
    const row = await findOwnAddress(connection, userId, id);
    await connection.query('DELETE FROM addresses WHERE id = ?', [row.id]);
    if (row.is_default) {
      await connection.query('UPDATE addresses SET is_default = 1 WHERE user_id = ? ORDER BY id DESC LIMIT 1', [
        userId,
      ]);
    }
  });
  return listAddresses(userId);
};

// Saves the checkout address inside the order's transaction. Skipped silently
// when an identical address is already saved or the user is at the limit.
const saveCheckoutAddress = async (connection, userId, customer) => {
  const saved = toSavedRow({ ...customer, label: null, recipientName: customer.name });
  const existing = await lockAddresses(connection, userId);
  const isDuplicate = existing.some((row) => Object.keys(saved).every((column) => row[column] === saved[column]));
  if (isDuplicate || existing.length >= MAX_ADDRESSES) return;
  await connection.query('INSERT INTO addresses SET ?', [
    { user_id: userId, ...saved, is_default: existing.length === 0 },
  ]);
};

export { toAddressRow, listAddresses, createAddress, updateAddress, deleteAddress, saveCheckoutAddress };
