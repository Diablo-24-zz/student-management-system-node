import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Please try again later.', fields: {} } }
});

router.post('/auth/login', loginLimiter, login);
router.post('/auth/logout', logout);
router.get('/auth/me', requireAuth, me);

export default router;
