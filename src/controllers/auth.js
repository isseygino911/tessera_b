import * as users from '../services/users.js';
import * as google from '../services/google.js';
import { baseCookieOptions, setSession, clearSession } from '../lib/session.js';

const OAUTH_COOKIE = 'oauth_google';
const OAUTH_COOKIE_OPTIONS = { ...baseCookieOptions, path: '/api/auth/google' };
const GOOGLE_ERROR_REDIRECT = '/login?error=google';

// Only same-site paths. "//host" and "/\host" are rejected because browsers
// can treat them as a URL on another origin.
const safeReturnTo = (returnTo) =>
  typeof returnTo === 'string' && /^\/(?![/\\])/.test(returnTo) ? returnTo : '/';

const signup = async (req, res) => {
  const user = await users.signup(req.body);
  setSession(res, user.id);
  res.status(201).json({ user });
};

const login = async (req, res) => {
  const user = await users.login(req.body);
  setSession(res, user.id);
  res.json({ user });
};

const logout = (req, res) => {
  clearSession(res);
  res.json({ ok: true });
};

const me = (req, res) => {
  res.json({ user: req.user });
};

const googleStart = (req, res) => {
  if (!google.isGoogleConfigured()) {
    console.warn('GET /api/auth/google: Google OAuth is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/APP_ORIGIN).');
    return res.redirect(GOOGLE_ERROR_REDIRECT);
  }
  const { state, verifier, url } = google.createGoogleAuthRequest();
  const saved = { state, verifier, returnTo: safeReturnTo(req.query.returnTo) };
  res.cookie(OAUTH_COOKIE, JSON.stringify(saved), { ...OAUTH_COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
  res.redirect(url);
};

// Any failure sends the user back to the login page with an error.
const googleCallback = async (req, res) => {
  res.clearCookie(OAUTH_COOKIE, OAUTH_COOKIE_OPTIONS);
  try {
    const saved = JSON.parse(req.cookies?.[OAUTH_COOKIE]);
    const { code, state } = req.query;
    if (typeof code !== 'string' || !google.statesMatch(saved.state, state)) {
      return res.redirect(GOOGLE_ERROR_REDIRECT);
    }
    const profile = await google.fetchGoogleProfile(code, saved.verifier);
    const user = await users.findOrCreateGoogleUser(profile);
    setSession(res, user.id);
    res.redirect(safeReturnTo(saved.returnTo));
  } catch {
    res.redirect(GOOGLE_ERROR_REDIRECT);
  }
};

export { signup, login, logout, me, googleStart, googleCallback };
