import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { developerVideoController } from '../../controllers/developer/video.controller.js';

const developerVideoRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/video'>();

developerVideoRoutes.post('/initiate', authMiddleware, (c) => developerVideoController.initiate(c));

export default developerVideoRoutes;
