import crypto from 'node:crypto';

const randomToken = () => crypto.randomBytes(32).toString('base64url');
const redirectUri = () => `${process.env.APP_ORIGIN}/api/auth/google/callback`;

const isGoogleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_ORIGIN);

// Returns the Google consent URL plus the state and PKCE verifier the
// callback must be given back.
const createGoogleAuthRequest = () => {
  const state = randomToken();
  const verifier = randomToken();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { state, verifier, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
};

const statesMatch = (expected, actual) => {
  const a = Buffer.from(expected ?? '');
  const b = Buffer.from(actual ?? '');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Exchanges the code for a token and returns the Google profile. Throws if
// either call fails or Google hasn't verified the email.
const fetchGoogleProfile = async (code, verifier) => {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) throw new Error('Google token exchange failed');
  const { access_token: accessToken } = await tokenResponse.json();

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) throw new Error('Google userinfo request failed');
  const profile = await profileResponse.json();

  if (profile.email_verified !== true) throw new Error('Google email is not verified');
  return profile;
};

export { isGoogleConfigured, createGoogleAuthRequest, statesMatch, fetchGoogleProfile };
