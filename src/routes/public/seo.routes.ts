import { Hono } from 'hono';
import { publicSeoController } from '../../controllers/public/seo.controller.js';

const publicSeoRoutes = new Hono();

publicSeoRoutes.get('/sitemap', (c) => publicSeoController.sitemap(c));

export default publicSeoRoutes;
