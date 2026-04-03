import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { paymentController } from '../../controllers/developer/payment.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

const paymentRoutes = new Hono<BlankEnv, BlankSchema>();

// ── Developer Subscriptions ──────────────────────────────────────────────────
// Public endpoints
paymentRoutes.get('/pricing', (c) => paymentController.getPricing(c));

// Protected endpoints for initiating payment and client-side verification
paymentRoutes.post('/create-order', authMiddleware, (c) => paymentController.createSubscriptionOrder(c));
paymentRoutes.post('/verify', authMiddleware, (c) => paymentController.verifyPaymentClientSide(c));

// Public webhook endpoint for Razorpay to POST to
paymentRoutes.post('/webhook/razorpay', (c) => paymentController.razorpayWebhook(c));

export default paymentRoutes;
