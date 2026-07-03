import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { marketingAuthController } from '../../controllers/marketing/auth.controller.js';
import { marketingListsController } from '../../controllers/marketing/lists.controller.js';
import { marketingTemplatesController } from '../../controllers/marketing/templates.controller.js';
import { marketingCampaignsController } from '../../controllers/marketing/campaigns.controller.js';

const marketingAuthRoutes = new Hono<BlankEnv, BlankSchema>();
marketingAuthRoutes.post('/login', (c) => marketingAuthController.login(c));
marketingAuthRoutes.post('/forgot-password', (c) => marketingAuthController.forgotPassword(c));
marketingAuthRoutes.post('/reset-password', (c) => marketingAuthController.resetPassword(c));
marketingAuthRoutes.get('/me', authMiddleware, (c) => marketingAuthController.getCurrentUser(c));

const marketingListsRoutes = new Hono<BlankEnv, BlankSchema>();
marketingListsRoutes.use('*', authMiddleware);
marketingListsRoutes.get('/', (c) => marketingListsController.list(c));
marketingListsRoutes.post('/', (c) => marketingListsController.create(c));
marketingListsRoutes.put('/:id', (c) => marketingListsController.update(c));
marketingListsRoutes.delete('/:id', (c) => marketingListsController.remove(c));
marketingListsRoutes.get('/:id/subscribers', (c) => marketingListsController.listSubscribers(c));
marketingListsRoutes.post('/:id/subscribers', (c) => marketingListsController.addSubscriber(c));
marketingListsRoutes.post('/:id/subscribers/import', (c) => marketingListsController.importSubscribers(c));
marketingListsRoutes.delete('/:id/subscribers/:subId', (c) => marketingListsController.removeSubscriber(c));

const marketingTemplatesRoutes = new Hono<BlankEnv, BlankSchema>();
marketingTemplatesRoutes.use('*', authMiddleware);
marketingTemplatesRoutes.get('/', (c) => marketingTemplatesController.list(c));
marketingTemplatesRoutes.post('/', (c) => marketingTemplatesController.create(c));
marketingTemplatesRoutes.put('/:id', (c) => marketingTemplatesController.update(c));
marketingTemplatesRoutes.delete('/:id', (c) => marketingTemplatesController.remove(c));

const marketingCampaignsRoutes = new Hono<BlankEnv, BlankSchema>();
marketingCampaignsRoutes.use('*', authMiddleware);
marketingCampaignsRoutes.get('/dashboard', (c) => marketingCampaignsController.dashboard(c));
marketingCampaignsRoutes.get('/', (c) => marketingCampaignsController.list(c));
marketingCampaignsRoutes.get('/:id', (c) => marketingCampaignsController.getOne(c));
marketingCampaignsRoutes.post('/', (c) => marketingCampaignsController.create(c));
marketingCampaignsRoutes.put('/:id', (c) => marketingCampaignsController.update(c));
marketingCampaignsRoutes.post('/:id/send', (c) => marketingCampaignsController.send(c));
marketingCampaignsRoutes.delete('/:id', (c) => marketingCampaignsController.remove(c));

export {
    marketingAuthRoutes,
    marketingListsRoutes,
    marketingTemplatesRoutes,
    marketingCampaignsRoutes,
};
