import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { newsletterController } from '../../controllers/public/newsletter.controller.js';

const newsletterRoutes = new Hono<BlankEnv, BlankSchema>();

newsletterRoutes.post('/subscribe', (c) => newsletterController.subscribe(c));
newsletterRoutes.get('/unsubscribe', (c) => newsletterController.unsubscribe(c));

export default newsletterRoutes;
