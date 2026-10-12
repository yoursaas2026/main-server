import { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { developerContractController } from '../../controllers/developer/contract.controller.js';

const developerContractRoutes = new Hono<BlankEnv, BlankSchema, '/api/developer/contracts'>();

developerContractRoutes.use('/*', authMiddleware);
developerContractRoutes.get('/', (c) => developerContractController.list(c));
developerContractRoutes.post('/:publicId/amendments/:amendmentId/approve', (c) => developerContractController.approveAmendment(c));
developerContractRoutes.post('/:publicId/amendments/:amendmentId/reject', (c) => developerContractController.rejectAmendment(c));
developerContractRoutes.get('/:publicId', (c) => developerContractController.getOne(c));
developerContractRoutes.post('/:publicId/accept', (c) => developerContractController.accept(c));
developerContractRoutes.post('/:publicId/reject', (c) => developerContractController.reject(c));
developerContractRoutes.post('/:publicId/submit', (c) => developerContractController.submit(c));
developerContractRoutes.post('/:publicId/open-dispute', (c) => developerContractController.openDispute(c));
developerContractRoutes.post('/:publicId/amendments', (c) => developerContractController.proposeAmendment(c));

export default developerContractRoutes;
