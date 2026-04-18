import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { developerPayoutController } from '../../controllers/developer/payout.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const developerPayoutRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/payout'>();

developerPayoutRoutes.use('/*', authMiddleware);
developerPayoutRoutes.get('/bank', (c) => developerPayoutController.getBank(c));
developerPayoutRoutes.put('/bank', (c) => developerPayoutController.putBank(c));

export default developerPayoutRoutes;
