import { Hono } from 'hono';
import { newsletterController } from '../../controllers/public/newsletter.controller.js';
const newsletterRoutes = new Hono();
newsletterRoutes.post('/subscribe', (c) => newsletterController.subscribe(c));
newsletterRoutes.get('/unsubscribe', (c) => newsletterController.unsubscribe(c));
export default newsletterRoutes;
