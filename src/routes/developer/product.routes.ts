import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { developerProductController } from '../../controllers/developer/product.controller.js';
import { developerInsightsController } from '../../controllers/developer/insights.controller.js';

const developerProductRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/products'>();

developerProductRoutes.use('/*', authMiddleware);

developerProductRoutes.post('/', (c) => developerProductController.create(c));
developerProductRoutes.get('/', (c) => developerProductController.listMine(c));
developerProductRoutes.get('/categories', (c) => developerProductController.listCategories(c));
developerProductRoutes.get('/check-slug', (c) => developerProductController.checkSlugAvailability(c));
developerProductRoutes.get('/live-limits', (c) => developerProductController.getLiveLimits(c));
developerProductRoutes.get('/:id/reviews', (c) => developerProductController.listProductReviews(c));
developerProductRoutes.put('/:id/reviews/:reviewId/reply', (c) => developerProductController.upsertReviewReply(c));
developerProductRoutes.get('/:id/analytics', (c) => developerInsightsController.productAnalytics(c));
developerProductRoutes.get('/:id/customers', (c) => developerInsightsController.productCustomers(c));
developerProductRoutes.get('/:id/releases', (c) => developerInsightsController.listReleases(c));
developerProductRoutes.post('/:id/releases', (c) => developerInsightsController.createRelease(c));
developerProductRoutes.put('/:id/releases/:releaseId', (c) => developerInsightsController.updateRelease(c));
developerProductRoutes.post('/:id/releases/:releaseId/make-current', (c) =>
    developerInsightsController.makeReleaseCurrent(c)
);
developerProductRoutes.delete('/:id/releases/:releaseId', (c) => developerInsightsController.deleteRelease(c));
developerProductRoutes.get('/:id', (c) => developerProductController.getOne(c));
developerProductRoutes.post('/:id', (c) => developerProductController.update(c));
developerProductRoutes.put('/:id', (c) => developerProductController.update(c));
developerProductRoutes.delete('/:id', (c) => developerProductController.remove(c));

export default developerProductRoutes;
