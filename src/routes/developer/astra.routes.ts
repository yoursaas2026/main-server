import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { astraController } from '../../controllers/developer/astra.controller.js';

const developerAstraRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/astra'>();

developerAstraRoutes.use('/*', authMiddleware);
developerAstraRoutes.post('/listing-autofill', (c) => astraController.listingAutofill(c));

export default developerAstraRoutes;
