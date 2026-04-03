import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { developerKycController } from '../../controllers/developer/kyc.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const developerKycRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/kyc'>();

// Protected routes
developerKycRoutes.use('/*', authMiddleware);
developerKycRoutes.post('/submit', (c) => developerKycController.submit(c));

export default developerKycRoutes;
