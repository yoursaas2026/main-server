import { Hono } from 'hono';
import { streamWebhookController } from '../../controllers/webhooks/stream.controller.js';

const streamWebhookRoutes = new Hono();

/** Public — GetStream signs with STREAM_API_SECRET (X-Signature). */
streamWebhookRoutes.post('/', (c) => streamWebhookController.handle(c));

export default streamWebhookRoutes;
