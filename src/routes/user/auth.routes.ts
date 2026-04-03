import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { userAuthController } from '../../controllers/user/auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const userAuthRoutes = new Hono<BlankEnv, BlankSchema, '/api/user/auth'>();

// ── Email / Password ──────────────────────────────────────────────────────────
userAuthRoutes.post('/register', (c) => userAuthController.register(c));
userAuthRoutes.post('/login', (c) => userAuthController.login(c));

// ── Password Reset ────────────────────────────────────────────────────────────
userAuthRoutes.post('/forgot-password', (c) => userAuthController.forgotPassword(c));
userAuthRoutes.post('/reset-password', (c) => userAuthController.resetPassword(c));

// ── Google OAuth ──────────────────────────────────────────────────────────────
userAuthRoutes.get('/google', (c) => userAuthController.googleAuth(c));
userAuthRoutes.get('/google/callback', (c) => userAuthController.googleCallback(c));

// ── Microsoft OAuth ───────────────────────────────────────────────────────────
userAuthRoutes.get('/microsoft', (c) => userAuthController.microsoftAuth(c));
userAuthRoutes.get('/microsoft/callback', (c) => userAuthController.microsoftCallback(c));

// ── Apple OAuth (Apple uses POST for callback) ────────────────────────────────
userAuthRoutes.get('/apple', (c) => userAuthController.appleAuth(c));
userAuthRoutes.post('/apple/callback', (c) => userAuthController.appleCallback(c));

// ── Protected ─────────────────────────────────────────────────────────────────
userAuthRoutes.get('/me', authMiddleware, (c) => userAuthController.getCurrentUser(c));

export default userAuthRoutes;
