import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import env from '../config/env.js';
import { signToken } from '../middleware/auth.js';

const dummyPasswordHash = bcrypt.hashSync('not-a-real-password', 12);

export async function login(req, res, next) {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: { message: 'Username and password are required.', fields: {} } });
    }

    const [rows] = await pool.query('SELECT id, username, password_hash FROM admins WHERE username = ?', [username]);
    const admin = rows[0];

    const isValid = await bcrypt.compare(password, admin ? admin.password_hash : dummyPasswordHash);
    if (!admin || !isValid) {
      return res.status(401).json({ error: { message: 'Invalid username or password.', fields: {} } });
    }

    const token = signToken({ id: admin.id, username: admin.username });
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.COOKIE_SECURE,
      maxAge: 2 * 60 * 60 * 1000
    });

    return res.json({ data: { user: { id: admin.id, username: admin.username } } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: env.COOKIE_SECURE });
  res.json({ data: { loggedOut: true } });
}

export async function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: { message: 'Authentication required.', fields: {} } });
  }

  return res.json({ data: { user: { id: req.user.id, username: req.user.username } } });
}
