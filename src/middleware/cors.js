// Only needed when the client is served from another origin (CLIENT_ORIGIN);
// in dev the Vite proxy makes every request same-origin.
const cors = (req, res, next) => {
  if (process.env.CLIENT_ORIGIN) {
    res.header('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

export { cors };
