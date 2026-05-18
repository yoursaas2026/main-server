import { z } from 'zod';
import { contractService } from '../../services/contract.service.js';
import { contracts } from '../../db/schema.js';
import { db } from '../../db/index.js';
import { desc, eq } from 'drizzle-orm';
function assertAdmin(c) {
    const jwtUser = c.get('user');
    if (!jwtUser || jwtUser.role !== 'admin')
        return null;
    return jwtUser;
}
const resolveSchema = z.object({
    refundClientPaise: z.number().int().min(0),
    releaseDeveloperPaise: z.number().int().min(0),
    retainPlatformPaise: z.number().int().min(0),
    adminResolution: z.string().trim().min(10).max(5000),
});
export class AdminContractController {
    async listDisputes(c) {
        const admin = assertAdmin(c);
        if (!admin)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const rows = await contractService.listDisputesForAdmin();
        const enriched = await Promise.all(rows.map(async (d) => {
            const [ct] = await db.select().from(contracts).where(eq(contracts.id, d.contractId)).limit(1);
            return { dispute: d, contract: ct ?? null };
        }));
        return c.json({ success: true, data: enriched });
    }
    async resolveDispute(c) {
        const admin = assertAdmin(c);
        if (!admin)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const disputeId = parseInt(c.req.param('disputeId') || '', 10);
        if (!Number.isInteger(disputeId))
            return c.json({ success: false, error: 'Invalid dispute' }, 400);
        const body = await c.req.json().catch(() => null);
        const parsed = resolveSchema.safeParse(body);
        if (!parsed.success)
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }, 400);
        try {
            await contractService.resolveDispute({
                disputeId,
                adminId: admin.id,
                ...parsed.data,
            });
            return c.json({ success: true });
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
    async listContracts(c) {
        const admin = assertAdmin(c);
        if (!admin)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const status = c.req.query('status');
        const rows = status
            ? await db.select().from(contracts).where(eq(contracts.status, status)).orderBy(desc(contracts.createdAt)).limit(200)
            : await db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(200);
        return c.json({ success: true, data: rows });
    }
}
export const adminContractController = new AdminContractController();
