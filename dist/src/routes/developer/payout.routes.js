import { Hono } from 'hono';
import { developerPayoutController } from '../../controllers/developer/payout.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
const developerPayoutRoutes = new Hono();
// Public — Cashfree Payouts must POST here without a Bearer token
developerPayoutRoutes.post('/webhook/cashfree', (c) => developerPayoutController.cashfreeWebhook(c));
developerPayoutRoutes.use('/*', authMiddleware);
developerPayoutRoutes.get('/bank', (c) => developerPayoutController.getBank(c));
developerPayoutRoutes.put('/bank', (c) => developerPayoutController.putBank(c));
developerPayoutRoutes.post('/bank/verify', (c) => developerPayoutController.verifyBank(c));
developerPayoutRoutes.post('/bank/validation/sync', (c) => developerPayoutController.syncBankValidation(c));
export default developerPayoutRoutes;
