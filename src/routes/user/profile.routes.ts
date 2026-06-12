import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { userProfileController } from '../../controllers/user/profile.controller.js';

const userProfileRoutes = new Hono<BlankEnv, BlankSchema, '/api/user/profile'>();

userProfileRoutes.get('/', authMiddleware, (c) => userProfileController.getProfile(c));
userProfileRoutes.put('/', authMiddleware, (c) => userProfileController.updateProfile(c));
userProfileRoutes.get('/recommendations', authMiddleware, (c) => userProfileController.getRecommendations(c));
userProfileRoutes.post('/saved-products', authMiddleware, (c) => userProfileController.toggleSavedProduct(c));
userProfileRoutes.post('/track', authMiddleware, (c) => userProfileController.trackListingEvent(c));

export default userProfileRoutes;
