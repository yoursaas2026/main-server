import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { userContractController } from '../../controllers/user/contract.controller.js';

const userContractRoutes = new Hono<BlankEnv, BlankSchema, '/api/user/contracts'>();

userContractRoutes.use('/*', authMiddleware);
userContractRoutes.get('/', (c) => userContractController.list(c));
userContractRoutes.post('/', (c) => userContractController.create(c));
userContractRoutes.post('/:publicId/amendments/:amendmentId/approve', (c) => userContractController.approveAmendment(c));
userContractRoutes.get('/:publicId', (c) => userContractController.getOne(c));
userContractRoutes.post('/:publicId/cancel-pending', (c) => userContractController.cancelPending(c));
userContractRoutes.post('/:publicId/pay-escrow', (c) => userContractController.payEscrow(c));
userContractRoutes.post('/:publicId/amendments/:amendmentId/pay', (c) => userContractController.payAmendment(c));
userContractRoutes.post('/:publicId/accept-completion', (c) => userContractController.acceptCompletion(c));
userContractRoutes.post('/:publicId/request-revision', (c) => userContractController.requestRevision(c));
userContractRoutes.post('/:publicId/open-dispute', (c) => userContractController.openDispute(c));
userContractRoutes.post('/:publicId/amendments', (c) => userContractController.proposeAmendment(c));

export default userContractRoutes;
