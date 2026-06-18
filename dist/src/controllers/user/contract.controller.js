import { z } from 'zod';
import { buildContractSettlementPreview, contractService } from '../../services/contract.service.js';
import { cashfreeCheckoutMode } from '../../config/cashfree.js';
import { assertClientMayStartContract } from '../../utils/client-onboarding.js';
const createSchema = z.object({
    productId: z.number().int().positive(),
    scopeText: z.string().trim().min(10).max(20000),
    deadlineAt: z.string().min(1),
    planTier: z.enum(['base', 'plus', 'pro']),
    /** Required when the listing’s Pro tier has no fixed INR price (custom quote), in paise. */
    quotedGrossPaise: z.number().int().positive().optional(),
});
export class UserContractController {
    async list(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = c.req.query('productId');
        const rows = await contractService.listForClient(u.id, productId ? parseInt(productId, 10) : undefined);
        for (const row of rows)
            await contractService.maybeAutoCompleteClientDeadline(row.id);
        const refreshed = await contractService.listForClient(u.id, productId ? parseInt(productId, 10) : undefined);
        return c.json({ success: true, data: refreshed });
    }
    async create(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const onboardingBlock = await assertClientMayStartContract(c, u.id);
        if (onboardingBlock)
            return onboardingBlock;
        const body = await c.req.json().catch(() => null);
        const parsed = createSchema.safeParse(body);
        if (!parsed.success)
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }, 400);
        const deadline = new Date(parsed.data.deadlineAt);
        if (Number.isNaN(deadline.getTime()))
            return c.json({ success: false, error: 'Invalid deadline' }, 400);
        try {
            const row = await contractService.createContract({
                clientId: u.id,
                productId: parsed.data.productId,
                scopeText: parsed.data.scopeText,
                deadlineAt: deadline,
                planTier: parsed.data.planTier,
                quotedGrossPaise: parsed.data.quotedGrossPaise,
            });
            return c.json({ success: true, data: row });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed';
            return c.json({ success: false, error: msg }, 400);
        }
    }
    async getOne(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.clientId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        await contractService.maybeAutoCompleteClientDeadline(row.id);
        const fresh = await contractService.getByPublicId(publicId);
        const events = await contractService.listEvents(row.id);
        const amendments = await contractService.listAmendments(row.id);
        return c.json({
            success: true,
            data: {
                contract: fresh,
                events,
                amendments,
                settlementPreview: buildContractSettlementPreview(fresh),
            },
        });
    }
    async payEscrow(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        try {
            const { orderId, paymentSessionId, amount, currency, contract } = await contractService.createInitialEscrowOrder(publicId, u.id);
            return c.json({
                success: true,
                data: {
                    orderId,
                    paymentSessionId,
                    amount,
                    currency,
                    cashfreeMode: cashfreeCheckoutMode(),
                    contractPublicId: contract.publicId,
                },
            });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async payAmendment(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const amendmentId = parseInt(c.req.param('amendmentId') || '', 10);
        if (!Number.isInteger(amendmentId))
            return c.json({ success: false, error: 'Invalid amendment' }, 400);
        try {
            const r = await contractService.createAmendmentEscrowOrder(publicId, u.id, amendmentId);
            return c.json({
                success: true,
                data: {
                    orderId: r.orderId,
                    paymentSessionId: r.paymentSessionId,
                    amount: r.amount,
                    currency: r.currency,
                    cashfreeMode: r.cashfreeMode,
                },
            });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async verifyEscrowPayment(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const body = await c.req.json().catch(() => null);
        const orderId = body?.order_id;
        if (!orderId || typeof orderId !== 'string') {
            return c.json({ success: false, error: 'order_id required' }, 400);
        }
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.clientId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        try {
            await contractService.verifyEscrowPayment(orderId, u.id);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async cancelPending(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.clientId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        try {
            await contractService.clientCancelBeforeAccept(row.id, u.id);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async acceptCompletion(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        try {
            await contractService.clientAcceptCompletion(publicId, u.id);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async requestRevision(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const body = await c.req.json().catch(() => ({}));
        const note = typeof body?.note === 'string' ? body.note : undefined;
        try {
            await contractService.clientRequestRevision(publicId, u.id, note);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async openDispute(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const body = await c.req.json().catch(() => null);
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
        if (reason.length < 10)
            return c.json({ success: false, error: 'Please provide a clear reason (10+ chars).' }, 400);
        try {
            await contractService.clientOpenDispute(publicId, u.id, reason);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async proposeAmendment(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.clientId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        const body = await c.req.json().catch(() => null);
        const scopeText = typeof body?.scopeText === 'string' ? body.scopeText : '';
        const deadlineAt = typeof body?.deadlineAt === 'string' ? new Date(body.deadlineAt) : null;
        const additionalAmountPaise = typeof body?.additionalAmountPaise === 'number' ? body.additionalAmountPaise : 0;
        if (scopeText.trim().length < 10 || !deadlineAt || Number.isNaN(deadlineAt.getTime())) {
            return c.json({ success: false, error: 'scopeText and valid deadlineAt required' }, 400);
        }
        try {
            const am = await contractService.proposeAmendment({
                contractId: row.id,
                actorClientId: u.id,
                scopeText: scopeText.trim(),
                deadlineAt,
                additionalAmountPaise,
            });
            return c.json({ success: true, data: am });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async approveAmendment(c) {
        const u = c.get('user');
        if (!u || u.role !== 'client')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.clientId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        const amendmentId = parseInt(c.req.param('amendmentId') || '', 10);
        if (!Number.isInteger(amendmentId))
            return c.json({ success: false, error: 'Invalid id' }, 400);
        try {
            const r = await contractService.approveAmendment(amendmentId, u.id, undefined);
            return c.json({ success: true, data: r });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
}
export const userContractController = new UserContractController();
