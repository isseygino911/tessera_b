import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db.js';
import { HttpError } from '../lib/http.js';

// A real hash (of a value nobody will type) so bcrypt.compare costs the same
// for an unknown email, an OAuth-only account and a wrong password.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const toPublicUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatar_url,
  role: row.role,
  hasPassword: Boolean(row.password_hash),
});

const findUserById = async (id) => {
  const [[row]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return row ? toPublicUser(row) : null;
};

const signup = async ({ name, email, password }) => {
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [result] = await pool.query('INSERT INTO users SET ?', [
      { email, password_hash: passwordHash, name, role: 'customer' },
    ]);
    return findUserById(result.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
};

// One generic error for every failure, so it doesn't reveal which emails exist.
const login = async ({ email, password }) => {
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user?.password_hash || !valid) throw new HttpError(401, 'Email or password is incorrect');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  return toPublicUser(user);
};

// Links or creates a user from a verified Google profile:
//   1. An existing (google, sub) identity always wins: log in as its user.
//   2. Otherwise, if a user has that email, link the identity to them. If that
//      account's email was never verified, clear its password too, so nobody
//      who signed up with someone else's email keeps access once the real
//      owner links Google.
//   3. Otherwise, create a new user (no password, email verified) plus the identity.
// profile: { sub, email, name, picture }
const findOrCreateGoogleUser = (profile) =>
  withTransaction(async (connection) => {
    const email = profile.email.trim().toLowerCase();
    const [[identity]] = await connection.query(
      "SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_user_id = ? FOR UPDATE",
      [profile.sub]
    );

    let userId = identity?.user_id;
    if (!userId) {
      const [[existing]] = await connection.query('SELECT * FROM users WHERE email = ? FOR UPDATE', [email]);
      if (existing) {
        userId = existing.id;
        if (!existing.email_verified_at) {
          await connection.query('UPDATE users SET email_verified_at = NOW(), password_hash = NULL WHERE id = ?', [userId]);
        }
      } else {
        const [result] = await connection.query(
          "INSERT INTO users SET email_verified_at = NOW(), role = 'customer', ?",
          [{ email, name: profile.name, avatar_url: profile.picture ?? null }]
        );
        userId = result.insertId;
      }
      await connection.query('INSERT INTO user_identities SET ?', [
        { user_id: userId, provider: 'google', provider_user_id: profile.sub, email },
      ]);
    }

    await connection.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);
    const [[row]] = await connection.query('SELECT * FROM users WHERE id = ?', [userId]);
    return toPublicUser(row);
  });

const updateProfile = async (userId, { name }) => {
  await pool.query('UPDATE users SET ? WHERE id = ?', [{ name }, userId]);
  return findUserById(userId);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!user.password_hash) throw new HttpError(400, 'This account signs in with Google and has no password');
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new HttpError(401, 'Current password is incorrect');
  }
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), userId]);
};

export { findUserById, signup, login, findOrCreateGoogleUser, updateProfile, changePassword };
