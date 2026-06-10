import { Hono } from 'hono';
import { developerProfileController } from '../../controllers/developer/profile.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const router = new Hono();

router.use('/*', authMiddleware);

// Get Developer Profile
router.get('/', developerProfileController.getProfile);

// Update Developer Profile (POST preferred for multipart; PUT kept for compatibility)
router.post('/', developerProfileController.updateProfile);
router.put('/', developerProfileController.updateProfile);

export const developerProfileRoutes = router;
