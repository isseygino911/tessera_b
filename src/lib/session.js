import jwt from 'jsonwebtoken';

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

const setSession = (res, userId) => {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(SESSION_COOKIE, token, { ...baseCookieOptions, maxAge: SESSION_MAX_AGE });
};

const clearSession = (res) => {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions);
};

// Returns the signed-in user's id, or null for a missing or invalid token.
const readSession = (req) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
};

export { baseCookieOptions, setSession, clearSession, readSession };
