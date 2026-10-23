import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: { message: 'Authentication required.', fields: {} } });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: { message: 'Authentication required.', fields: {} } });
  }
}

export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, env.JWT_SECRET, { expiresIn: '2h' });
}
