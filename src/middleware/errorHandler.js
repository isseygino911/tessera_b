import { HttpError } from '../lib/http.js';

// Express recognises an error handler by its four arguments, so `next` stays.
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.expose && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

export { errorHandler };
