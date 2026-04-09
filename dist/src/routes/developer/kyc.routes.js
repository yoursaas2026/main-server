import { Hono } from 'hono';
import { developerKycController } from '../../controllers/developer/kyc.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
const developerKycRoutes = new Hono();
// Protected routes
developerKycRoutes.use('/*', authMiddleware);
developerKycRoutes.post('/submit', (c) => developerKycController.submit(c));
export default developerKycRoutes;
