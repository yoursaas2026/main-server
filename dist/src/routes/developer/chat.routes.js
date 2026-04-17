import { Hono } from 'hono';
import { developerChatController } from '../../controllers/developer/chat.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
const developerChatRoutes = new Hono();
developerChatRoutes.get('/token', authMiddleware, (c) => developerChatController.getToken(c));
developerChatRoutes.post('/thread', authMiddleware, (c) => developerChatController.postThread(c));
export default developerChatRoutes;
