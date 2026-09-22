import type { Context } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { contractService } from '../../services/contract.service.js';
import { contractSettlementService } from '../../services/contract-settlement.service.js';
import { contracts } from '../../db/schema.js';
import { db } from '../../db/index.js';
import { env } from '../../config/env.js';

function assertAdmin(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'admin') return null;
    return jwtUser;
}

const resolveSchema = z.object({
    refundClientPaise: z.number().int().min(0),
    releaseDeveloperPaise: z.number().int().min(0),
    retainPlatformPaise: z.number().int().min(0),
    adminResolution: z.string().trim().min(10).max(5000),
});

export class AdminContractController {
    async listDisputes(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const rows = await contractService.listDisputesForAdmin();
        const enriched = await Promise.all(
            rows.map(async (d) => {
                const [ct] = await db.select().from(contracts).where(eq(contracts.id, d.contractId)).limit(1);
                return { dispute: d, contract: ct ?? null };
            })
        );
        return c.json({ success: true, data: enriched });
    }

    async resolveDispute(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const disputeId = parseInt(c.req.param('disputeId') || '', 10);
        if (!Number.isInteger(disputeId)) return c.json({ success: false, error: 'Invalid dispute' }, 400);
        const body = await c.req.json().catch(() => null);
        const parsed = resolveSchema.safeParse(body);
        if (!parsed.success) return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }, 400);
        try {
            await contractService.resolveDispute({
                disputeId,
                adminId: admin.id,
                ...parsed.data,
            });
            return c.json({ success: true });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async listContracts(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const status = c.req.query('status');
        const settlement = c.req.query('settlementStatus');
        let rows;
        if (settlement) {
            rows = await db
                .select()
                .from(contracts)
                .where(eq(contracts.settlementStatus, settlement))
                .orderBy(desc(contracts.createdAt))
                .limit(200);
        } else if (status) {
            rows = await db
                .select()
                .from(contracts)
                .where(eq(contracts.status, status))
                .orderBy(desc(contracts.createdAt))
                .limit(200);
        } else {
            rows = await db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(200);
        }
        return c.json({
            success: true,
            data: rows,
            meta: { autoSettlementEnabled: env.CONTRACT_AUTO_SETTLEMENT_ENABLED },
        });
    }

    async listSettlementIssues(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const rows = await db
            .select()
            .from(contracts)
            .where(
                and(
                    eq(contracts.status, 'completed'),
                    inArray(contracts.settlementStatus, ['failed', 'partial', 'skipped', 'pending'])
                )
            )
            .orderBy(desc(contracts.completedAt))
            .limit(100);
        return c.json({
            success: true,
            data: rows,
            meta: { autoSettlementEnabled: env.CONTRACT_AUTO_SETTLEMENT_ENABLED },
        });
    }

    async retrySettlement(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const contractId = parseInt(c.req.param('contractId') || '', 10);
        if (!Number.isInteger(contractId)) return c.json({ success: false, error: 'Invalid contract' }, 400);
        try {
            const result = await contractSettlementService.retrySettlement(contractId);
            return c.json({ success: true, data: result });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Retry failed' }, 400);
        }
    }
}

export const adminContractController = new AdminContractController();
