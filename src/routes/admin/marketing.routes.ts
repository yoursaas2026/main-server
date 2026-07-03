import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { adminMarketingUsersController } from '../../controllers/admin/marketing-users.controller.js';

const adminMarketingRoutes = new Hono<BlankEnv, BlankSchema>();

adminMarketingRoutes.use('*', authMiddleware);
adminMarketingRoutes.get('/users', (c) => adminMarketingUsersController.list(c));
adminMarketingRoutes.post('/users', (c) => adminMarketingUsersController.create(c));
adminMarketingRoutes.put('/users/:id', (c) => adminMarketingUsersController.update(c));
adminMarketingRoutes.delete('/users/:id', (c) => adminMarketingUsersController.delete(c));

export default adminMarketingRoutes;
