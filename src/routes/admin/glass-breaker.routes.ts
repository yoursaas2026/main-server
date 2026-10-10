import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { adminGlassBreakerController } from '../../controllers/admin/glass-breaker.controller.js';

const adminGlassBreakerRoutes = new Hono<BlankEnv, BlankSchema, '/api/admin/glass-breaker'>();

adminGlassBreakerRoutes.use('*', authMiddleware);

adminGlassBreakerRoutes.get('/actions', (c) => adminGlassBreakerController.listActions(c));
adminGlassBreakerRoutes.get('/events', (c) => adminGlassBreakerController.listEvents(c));
adminGlassBreakerRoutes.post('/execute', (c) => adminGlassBreakerController.execute(c));

export default adminGlassBreakerRoutes;
