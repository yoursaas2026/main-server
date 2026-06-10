import { Hono } from 'hono';
import { publicDeveloperController } from '../../controllers/public/developer.controller.js';
const publicDeveloperRoutes = new Hono();
publicDeveloperRoutes.get('/:id', (c) => publicDeveloperController.getById(c));
export default publicDeveloperRoutes;
