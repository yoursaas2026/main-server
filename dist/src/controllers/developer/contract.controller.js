import { and, eq } from 'drizzle-orm';
import { buildContractSettlementPreview, contractService } from '../../services/contract.service.js';
import { db } from '../../db/index.js';
import { developerProducts } from '../../db/schema.js';
export class DeveloperContractController {
    async list(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        let productId = c.req.query('productId') ? parseInt(c.req.query('productId'), 10) : undefined;
        const projectId = c.req.query('projectId');
        if (!productId && projectId) {
            const [p] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(and(eq(developerProducts.projectId, projectId), eq(developerProducts.developerId, u.id)))
                .limit(1);
            productId = p?.id;
        }
        const rows = await contractService.listForDeveloper(u.id, productId);
        for (const row of rows)
            await contractService.maybeAutoCompleteClientDeadline(row.id);
        const refreshed = await contractService.listForDeveloper(u.id, productId);
        return c.json({ success: true, data: refreshed });
    }
    async getOne(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
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
    async accept(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        try {
            await contractService.developerAccept(row.id, u.id);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async reject(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        try {
            await contractService.developerReject(row.id, u.id);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async submit(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const body = await c.req.json().catch(() => null);
        const deliverablesText = typeof body?.deliverablesText === 'string' ? body.deliverablesText : '';
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        try {
            await contractService.submitDeliverables(row.id, u.id, deliverablesText);
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async proposeAmendment(c) {
        const u = c.get('user');
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
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
                actorDeveloperId: u.id,
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
        if (!u || u.role !== 'developer')
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const publicId = c.req.param('publicId');
        const row = await contractService.getByPublicId(publicId);
        if (!row || row.developerId !== u.id)
            return c.json({ success: false, error: 'Not found' }, 404);
        const amendmentId = parseInt(c.req.param('amendmentId') || '', 10);
        if (!Number.isInteger(amendmentId))
            return c.json({ success: false, error: 'Invalid id' }, 400);
        try {
            const r = await contractService.approveAmendment(amendmentId, undefined, u.id);
            return c.json({ success: true, data: r });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
}
export const developerContractController = new DeveloperContractController();
