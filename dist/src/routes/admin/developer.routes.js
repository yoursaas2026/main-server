import { Hono } from 'hono';
import { adminDeveloperController } from '../../controllers/admin/developer.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
const adminDeveloperRoutes = new Hono();
// ── Developer Management by Admins ────────────────────────────────────────────────
adminDeveloperRoutes.get('/', authMiddleware, (c) => adminDeveloperController.getAllDevelopers(c));
adminDeveloperRoutes.get('/:id', authMiddleware, (c) => adminDeveloperController.getDeveloperDetails(c));
adminDeveloperRoutes.put('/:id/kyc', authMiddleware, (c) => adminDeveloperController.updateKycStatus(c));
adminDeveloperRoutes.put('/:id/block', authMiddleware, (c) => adminDeveloperController.blockDeveloper(c));
export default adminDeveloperRoutes;
