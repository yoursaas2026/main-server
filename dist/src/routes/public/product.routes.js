import { Hono } from 'hono';
import { publicProductController } from '../../controllers/public/product.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.middleware.js';
const publicProductRoutes = new Hono();
publicProductRoutes.get('/:slug', optionalAuthMiddleware, (c) => publicProductController.getBySlug(c));
publicProductRoutes.get('/:slug/reviews', optionalAuthMiddleware, (c) => publicProductController.listReviews(c));
publicProductRoutes.post('/:slug/reviews', authMiddleware, (c) => publicProductController.createReview(c));
publicProductRoutes.delete('/:slug/reviews/:reviewId', authMiddleware, (c) => publicProductController.deleteReview(c));
export default publicProductRoutes;
