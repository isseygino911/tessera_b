// The storefront (tessera.isseylab.com) calls the API on its own subdomain, so
// its origin is always allowed. CLIENT_ORIGIN adds one more (optional); in dev
// the Vite proxy makes every request same-origin anyway.
const allowedOrigins = () => ['https://tessera.isseylab.com', process.env.CLIENT_ORIGIN].filter(Boolean);

const cors = (req, res, next) => {
  const { origin } = req.headers;
  res.vary('Origin');
  if (origin && allowedOrigins().includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

export { cors };
