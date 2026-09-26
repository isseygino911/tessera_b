import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAdmin } from '../../middleware/requireAdmin.js';

export const adminAuthRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

adminAuthRouter.post('/login', async (req, res, next) => {
  try {
    const { password } = req.body ?? {};
    const valid = typeof password === 'string' && (await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH));
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('admin_token', token, COOKIE_OPTIONS);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminAuthRouter.post('/logout', (req, res) => {
  res.clearCookie('admin_token', COOKIE_OPTIONS);
  res.json({ ok: true });
});

adminAuthRouter.get('/me', requireAdmin, (req, res) => {
  res.json({ ok: true });
});
