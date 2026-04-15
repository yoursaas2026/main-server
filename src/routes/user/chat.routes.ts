import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { userChatController } from '../../controllers/user/chat.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const userChatRoutes = new Hono<BlankEnv, BlankSchema, '/api/user/chat'>();

userChatRoutes.get('/token', authMiddleware, (c) => userChatController.getToken(c));
userChatRoutes.post('/thread', authMiddleware, (c) => userChatController.postThread(c));

export default userChatRoutes;
