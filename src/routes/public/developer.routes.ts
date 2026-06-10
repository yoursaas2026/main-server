import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { publicDeveloperController } from '../../controllers/public/developer.controller.js';

const publicDeveloperRoutes = new Hono<BlankEnv, BlankSchema>();

publicDeveloperRoutes.get('/:id', (c) => publicDeveloperController.getById(c));

export default publicDeveloperRoutes;
