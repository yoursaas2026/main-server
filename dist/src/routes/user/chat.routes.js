import { Hono } from 'hono';
import { userChatController } from '../../controllers/user/chat.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
const userChatRoutes = new Hono();
userChatRoutes.get('/token', authMiddleware, (c) => userChatController.getToken(c));
userChatRoutes.post('/thread', authMiddleware, (c) => userChatController.postThread(c));
export default userChatRoutes;
