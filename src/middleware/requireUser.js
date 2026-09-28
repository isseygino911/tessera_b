import { asyncHandler, HttpError } from '../lib/http.js';
import { readSession } from '../lib/session.js';
import { findUserById } from '../services/users.js';

// Loads the user on every request so role changes and deletions apply at once.
const requireUser = asyncHandler(async (req, res, next) => {
  const userId = readSession(req);
  const user = userId && (await findUserById(userId));
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.user = user;
  next();
});

export { requireUser };
