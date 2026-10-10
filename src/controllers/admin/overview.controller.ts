import type { Context } from 'hono';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    clients,
    contractDisputes,
    contracts,
    developerProducts,
    developers,
} from '../../db/schema.js';

function assertAdmin(c: Context) {
    const jwtUser = c.get('user') as { role?: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'admin') return null;
    return jwtUser;
}

export class AdminOverviewController {
    async getOverview(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        try {
            const [
                [developersTotalRow],
                [developersPendingKycRow],
                [productsLiveRow],
                [clientsTotalRow],
                [openDisputesRow],
                [settlementIssuesRow],
                recentPendingKyc,
                recentOpenDisputes,
            ] = await Promise.all([
                db.select({ value: count() }).from(developers),
                db
                    .select({ value: count() })
                    .from(developers)
                    .where(eq(developers.kycStatus, 'submitted')),
                db
                    .select({ value: count() })
                    .from(developerProducts)
                    .where(eq(developerProducts.listingStatus, 'live')),
                db.select({ value: count() }).from(clients),
                db
                    .select({ value: count() })
                    .from(contractDisputes)
                    .where(eq(contractDisputes.status, 'open')),
                db
                    .select({ value: count() })
                    .from(contracts)
                    .where(
                        and(
                            eq(contracts.status, 'completed'),
                            inArray(contracts.settlementStatus, [
                                'failed',
                                'partial',
                                'skipped',
                                'pending',
                            ]),
                        ),
                    ),
                db
                    .select({
                        id: developers.id,
                        name: developers.name,
                        email: developers.email,
                        kycStatus: developers.kycStatus,
                        kycSubmittedAt: developers.kycSubmittedAt,
                    })
                    .from(developers)
                    .where(eq(developers.kycStatus, 'submitted'))
                    .orderBy(desc(developers.kycSubmittedAt))
                    .limit(5),
                db
                    .select({
                        id: contractDisputes.id,
                        contractId: contractDisputes.contractId,
                        status: contractDisputes.status,
                        createdAt: contractDisputes.createdAt,
                        publicId: contracts.publicId,
                    })
                    .from(contractDisputes)
                    .innerJoin(contracts, eq(contractDisputes.contractId, contracts.id))
                    .where(eq(contractDisputes.status, 'open'))
                    .orderBy(desc(contractDisputes.createdAt))
                    .limit(5),
            ]);

            return c.json({
                success: true,
                data: {
                    counts: {
                        developersTotal: Number(developersTotalRow?.value ?? 0),
                        developersPendingKyc: Number(developersPendingKycRow?.value ?? 0),
                        productsLive: Number(productsLiveRow?.value ?? 0),
                        clientsTotal: Number(clientsTotalRow?.value ?? 0),
                        openDisputes: Number(openDisputesRow?.value ?? 0),
                        settlementIssues: Number(settlementIssuesRow?.value ?? 0),
                    },
                    queues: {
                        pendingKyc: recentPendingKyc,
                        openDisputes: recentOpenDisputes,
                    },
                    generatedAt: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error('[AdminOverview] getOverview error:', error);
            return c.json({ success: false, error: 'Failed to load overview' }, 500);
        }
    }
}

export const adminOverviewController = new AdminOverviewController();
