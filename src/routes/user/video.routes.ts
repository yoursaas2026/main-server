import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { userVideoController } from '../../controllers/user/video.controller.js';

const userVideoRoutes = new Hono<BlankEnv, BlankSchema, '/api/user/video'>();

userVideoRoutes.post('/initiate', authMiddleware, (c) => userVideoController.initiate(c));

export default userVideoRoutes;
