import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { astraController } from '../../controllers/developer/astra.controller.js';
const developerAstraRoutes = new Hono();
developerAstraRoutes.use('/*', authMiddleware);
developerAstraRoutes.post('/listing-autofill', (c) => astraController.listingAutofill(c));
export default developerAstraRoutes;
