import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { adminClientController } from '../../controllers/admin/client.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const adminClientRoutes = new Hono<BlankEnv, BlankSchema, '/api/admin/clients'>();

adminClientRoutes.get('/', authMiddleware, (c) => adminClientController.listClients(c));
adminClientRoutes.get('/:id', authMiddleware, (c) => adminClientController.getClient(c));

export default adminClientRoutes;
