import type { Context } from 'hono';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { contractService } from '../../services/contract.service.js';
import { contractSettlementService } from '../../services/contract-settlement.service.js';
import { clients, contracts, developerProducts, developers } from '../../db/schema.js';
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

        const status = c.req.query('status')?.trim() || undefined;
        const settlement = c.req.query('settlementStatus')?.trim() || undefined;
        const q = c.req.query('q')?.trim() || undefined;
        const clientIdRaw = c.req.query('clientId');
        const developerIdRaw = c.req.query('developerId');
        const clientId = clientIdRaw ? parseInt(clientIdRaw, 10) : undefined;
        const developerId = developerIdRaw ? parseInt(developerIdRaw, 10) : undefined;
        const limitRaw = parseInt(c.req.query('limit') || '100', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

        const conditions = [];
        if (status) conditions.push(eq(contracts.status, status));
        if (settlement) conditions.push(eq(contracts.settlementStatus, settlement));
        if (Number.isInteger(clientId) && (clientId as number) > 0) {
            conditions.push(eq(contracts.clientId, clientId as number));
        }
        if (Number.isInteger(developerId) && (developerId as number) > 0) {
            conditions.push(eq(contracts.developerId, developerId as number));
        }
        if (q) {
            const asId = parseInt(q, 10);
            const parts = [ilike(contracts.publicId, `%${q}%`)];
            if (Number.isInteger(asId) && asId > 0) {
                parts.push(eq(contracts.id, asId));
            }
            conditions.push(or(...parts));
        }

        const where = conditions.length ? and(...conditions) : undefined;

        const rows = await db
            .select({
                id: contracts.id,
                publicId: contracts.publicId,
                clientId: contracts.clientId,
                developerId: contracts.developerId,
                productId: contracts.productId,
                status: contracts.status,
                planTier: contracts.planTier,
                scopeText: contracts.scopeText,
                deadlineAt: contracts.deadlineAt,
                grossAmountPaise: contracts.grossAmountPaise,
                nonRefundableFeePaise: contracts.nonRefundableFeePaise,
                escrowAmountPaise: contracts.escrowAmountPaise,
                currency: contracts.currency,
                escrowFrozen: contracts.escrowFrozen,
                developerReleasedPaise: contracts.developerReleasedPaise,
                platformReleasedPaise: contracts.platformReleasedPaise,
                settlementStatus: contracts.settlementStatus,
                settlementMetaJson: contracts.settlementMetaJson,
                submittedAt: contracts.submittedAt,
                completedAt: contracts.completedAt,
                createdAt: contracts.createdAt,
                updatedAt: contracts.updatedAt,
                clientName: clients.name,
                clientEmail: clients.email,
                developerName: developers.name,
                developerEmail: developers.email,
                productName: developerProducts.name,
                productSlug: developerProducts.slug,
            })
            .from(contracts)
            .leftJoin(clients, eq(contracts.clientId, clients.id))
            .leftJoin(developers, eq(contracts.developerId, developers.id))
            .leftJoin(developerProducts, eq(contracts.productId, developerProducts.id))
            .where(where)
            .orderBy(desc(contracts.createdAt))
            .limit(limit);

        return c.json({
            success: true,
            data: rows,
            meta: {
                autoSettlementEnabled: env.CONTRACT_AUTO_SETTLEMENT_ENABLED,
                count: rows.length,
                limit,
            },
        });
    }

    async getContract(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const idParam = c.req.param('contractId') || '';
        const asNum = parseInt(idParam, 10);
        const byPublicId = !Number.isInteger(asNum) || idParam.includes('-');

        try {
            const [row] = await db
                .select({
                    contract: contracts,
                    clientName: clients.name,
                    clientEmail: clients.email,
                    developerName: developers.name,
                    developerEmail: developers.email,
                    productName: developerProducts.name,
                    productSlug: developerProducts.slug,
                })
                .from(contracts)
                .leftJoin(clients, eq(contracts.clientId, clients.id))
                .leftJoin(developers, eq(contracts.developerId, developers.id))
                .leftJoin(developerProducts, eq(contracts.productId, developerProducts.id))
                .where(
                    byPublicId
                        ? eq(contracts.publicId, idParam)
                        : eq(contracts.id, asNum)
                )
                .limit(1);

            if (!row) return c.json({ success: false, error: 'Contract not found' }, 404);

            return c.json({
                success: true,
                data: {
                    ...row.contract,
                    clientName: row.clientName,
                    clientEmail: row.clientEmail,
                    developerName: row.developerName,
                    developerEmail: row.developerEmail,
                    productName: row.productName,
                    productSlug: row.productSlug,
                },
            });
        } catch (e) {
            console.error('[AdminContract] getContract error:', e);
            return c.json({ success: false, error: 'Failed to load contract' }, 500);
        }
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
