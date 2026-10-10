import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { adminOverviewController } from '../../controllers/admin/overview.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const adminOverviewRoutes = new Hono<BlankEnv, BlankSchema, '/api/admin/overview'>();

adminOverviewRoutes.get('/', authMiddleware, (c) => adminOverviewController.getOverview(c));

export default adminOverviewRoutes;
