import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { adminContractController } from '../../controllers/admin/contract.controller.js';
const adminContractRoutes = new Hono();
adminContractRoutes.use('/*', authMiddleware);
adminContractRoutes.get('/disputes', (c) => adminContractController.listDisputes(c));
adminContractRoutes.post('/disputes/:disputeId/resolve', (c) => adminContractController.resolveDispute(c));
adminContractRoutes.get('/', (c) => adminContractController.listContracts(c));
export default adminContractRoutes;
