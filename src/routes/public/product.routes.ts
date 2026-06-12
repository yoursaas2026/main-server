import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { publicProductController } from '../../controllers/public/product.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.middleware.js';

const publicProductRoutes = new Hono<BlankEnv, BlankSchema, '/api/public/products'>();

publicProductRoutes.get('/categories/list', (c) => publicProductController.listCategories(c));
publicProductRoutes.get('/', optionalAuthMiddleware, (c) => publicProductController.listLive(c));
publicProductRoutes.get('/by-id/:id/contract-pricing', optionalAuthMiddleware, (c) =>
    publicProductController.getContractPricingById(c)
);
publicProductRoutes.get('/card/:id', optionalAuthMiddleware, (c) => publicProductController.getCardById(c));
publicProductRoutes.get('/:slug', optionalAuthMiddleware, (c) => publicProductController.getBySlug(c));
publicProductRoutes.get('/:slug/reviews', optionalAuthMiddleware, (c) => publicProductController.listReviews(c));
publicProductRoutes.post('/:slug/reviews', authMiddleware, (c) => publicProductController.createReview(c));
publicProductRoutes.delete('/:slug/reviews/:reviewId', authMiddleware, (c) => publicProductController.deleteReview(c));

export default publicProductRoutes;
