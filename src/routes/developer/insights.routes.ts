import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { developerInsightsController } from '../../controllers/developer/insights.controller.js';

const developerInsightsRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/insights'>();

developerInsightsRoutes.use('/*', authMiddleware);
developerInsightsRoutes.get('/', (c) => developerInsightsController.accountInsights(c));
developerInsightsRoutes.get('/customers', (c) => developerInsightsController.accountCustomers(c));

export default developerInsightsRoutes;
