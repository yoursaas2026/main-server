import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { developerAuthController } from '../../controllers/developer/auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const developerAuthRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/auth'>();

// ── Email / Password ──────────────────────────────────────────────────────────
developerAuthRoutes.post('/register', (c) => developerAuthController.register(c));
developerAuthRoutes.post('/login', (c) => developerAuthController.login(c));

// ── Password Reset ────────────────────────────────────────────────────────────
developerAuthRoutes.post('/forgot-password', (c) => developerAuthController.forgotPassword(c));
developerAuthRoutes.post('/reset-password', (c) => developerAuthController.resetPassword(c));

// ── Google OAuth ──────────────────────────────────────────────────────────────
developerAuthRoutes.get('/google', (c) => developerAuthController.googleAuth(c));
developerAuthRoutes.get('/google/callback', (c) => developerAuthController.googleCallback(c));

// ── Microsoft OAuth ───────────────────────────────────────────────────────────
developerAuthRoutes.get('/microsoft', (c) => developerAuthController.microsoftAuth(c));
developerAuthRoutes.get('/microsoft/callback', (c) => developerAuthController.microsoftCallback(c));

// ── Apple OAuth (Apple uses POST for callback) ────────────────────────────────
developerAuthRoutes.get('/apple', (c) => developerAuthController.appleAuth(c));
developerAuthRoutes.post('/apple/callback', (c) => developerAuthController.appleCallback(c));

// ── Protected ─────────────────────────────────────────────────────────────────
developerAuthRoutes.get('/me', authMiddleware, (c) => developerAuthController.getCurrentUser(c));

export default developerAuthRoutes;
