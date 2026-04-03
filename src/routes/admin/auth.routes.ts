import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { adminAuthController } from '../../controllers/admin/auth.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const adminAuthRoutes = new Hono<BlankEnv, BlankSchema, '/api/admin/auth'>();

// ── Public Routes ─────────────────────────────────────────────────────────────
adminAuthRoutes.post('/login', (c) => adminAuthController.login(c));

// ── Protected ─────────────────────────────────────────────────────────────────
adminAuthRoutes.get('/me', authMiddleware, (c) => adminAuthController.getCurrentUser(c));

// ── Admin Management by Admins ────────────────────────────────────────────────
adminAuthRoutes.get('/list', authMiddleware, (c) => adminAuthController.getAllAdmins(c));
adminAuthRoutes.post('/create', authMiddleware, (c) => adminAuthController.createAdmin(c));
adminAuthRoutes.put('/:id', authMiddleware, (c) => adminAuthController.updateAdmin(c));
adminAuthRoutes.delete('/:id', authMiddleware, (c) => adminAuthController.deleteAdmin(c));

export default adminAuthRoutes;
