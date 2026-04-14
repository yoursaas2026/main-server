import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { adminProductController } from '../../controllers/admin/product.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const adminProductRoutes = new Hono<BlankEnv, BlankSchema, '/api/admin/products'>();

adminProductRoutes.get('/', authMiddleware, (c) => adminProductController.list(c));
adminProductRoutes.get('/categories', authMiddleware, (c) => adminProductController.listCategories(c));
adminProductRoutes.post('/categories', authMiddleware, (c) => adminProductController.createCategory(c));
adminProductRoutes.delete('/categories/:categoryId', authMiddleware, (c) => adminProductController.deleteCategory(c));
adminProductRoutes.patch('/:id/trust', authMiddleware, (c) => adminProductController.patchTrust(c));
adminProductRoutes.get('/:id', authMiddleware, (c) => adminProductController.getOne(c));

export default adminProductRoutes;
