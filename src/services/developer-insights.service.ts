import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    clientListingEvents,
    clients,
    contracts,
    developerProducts,
    developers,
    productReleases,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { ContractStatus } from './contract.service.js';

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

async function ownedProductIds(developerId: number, productId?: number): Promise<number[]> {
    if (productId != null) {
        const [row] = await db
            .select({ id: developerProducts.id })
            .from(developerProducts)
            .where(and(eq(developerProducts.id, productId), eq(developerProducts.developerId, developerId)))
            .limit(1);
        return row ? [row.id] : [];
    }
    const rows = await db
        .select({ id: developerProducts.id })
        .from(developerProducts)
        .where(eq(developerProducts.developerId, developerId));
    return rows.map((r) => r.id);
}

async function eventCountsByType(productIds: number[], since?: Date) {
    const counts: Record<string, number> = {};
    if (productIds.length === 0) return counts;

    const conditions = [inArray(clientListingEvents.productId, productIds)];
    if (since) conditions.push(gte(clientListingEvents.createdAt, since));

    const rows = await db
        .select({
            eventType: clientListingEvents.eventType,
            count: sql<number>`count(*)::int`,
        })
        .from(clientListingEvents)
        .where(and(...conditions))
        .groupBy(clientListingEvents.eventType);

    for (const r of rows) {
        counts[r.eventType] = Number(r.count) || 0;
    }
    return counts;
}

async function dailyViews(productIds: number[], days: number) {
    const out: { date: string; views: number }[] = [];
    if (productIds.length === 0) {
        const today = startOfUtcDay(new Date());
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setUTCDate(d.getUTCDate() - i);
            out.push({ date: dayKey(d), views: 0 });
        }
        return out;
    }

    const since = startOfUtcDay(new Date());
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const rows = await db
        .select({
            day: sql<string>`to_char(date_trunc('day', ${clientListingEvents.createdAt}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
        .from(clientListingEvents)
        .where(
            and(
                inArray(clientListingEvents.productId, productIds),
                inArray(clientListingEvents.eventType, ['view', 'click', 'impression']),
                gte(clientListingEvents.createdAt, since)
            )
        )
        .groupBy(sql`date_trunc('day', ${clientListingEvents.createdAt})`);

    const map = new Map(rows.map((r) => [r.day, Number(r.count) || 0]));
    const today = startOfUtcDay(new Date());
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        const key = dayKey(d);
        out.push({ date: key, views: map.get(key) ?? 0 });
    }
    return out;
}

export type SellerCustomerRow = {
    clientId: number;
    name: string;
    email: string;
    companyName: string | null;
    productId: number;
    productName: string;
    contractPublicId: string;
    planTier: string | null;
    status: string;
    grossAmountPaise: number;
    developerReleasedPaise: number | null;
    createdAt: string | null;
    completedAt: string | null;
};

export const developerInsightsService = {
    async getAccountInsights(developerId: number) {
        const productIds = await ownedProductIds(developerId);
        const since30 = startOfUtcDay(new Date());
        since30.setUTCDate(since30.getUTCDate() - 29);

        const events = await eventCountsByType(productIds);
        const events30 = await eventCountsByType(productIds, since30);

        const contractRows =
            productIds.length === 0
                ? []
                : await db
                      .select({
                          status: contracts.status,
                          developerReleasedPaise: contracts.developerReleasedPaise,
                          grossAmountPaise: contracts.grossAmountPaise,
                      })
                      .from(contracts)
                      .where(eq(contracts.developerId, developerId));

        const totalOrders = contractRows.length;
        const completed = contractRows.filter((c) => c.status === ContractStatus.COMPLETED);
        const revenuePaise = completed.reduce((sum, c) => sum + (c.developerReleasedPaise ?? 0), 0);
        const activeStatuses = new Set<string>([
            ContractStatus.ACTIVE,
            ContractStatus.SUBMITTED,
            ContractStatus.AWAITING_CLIENT_PAYMENT,
            ContractStatus.AWAITING_AMENDMENT_PAYMENT,
            ContractStatus.PENDING_DEVELOPER_ACCEPTANCE,
            ContractStatus.DISPUTED,
        ]);
        const activeContracts = contractRows.filter((c) => activeStatuses.has(c.status)).length;

        const views = (events.view || 0) + (events.click || 0);
        const views30 = (events30.view || 0) + (events30.click || 0);
        const conversionRate =
            views > 0 ? Math.round(((events.contract_started || 0) / views) * 1000) / 10 : null;

        const series = await dailyViews(productIds, 14);

        const products =
            productIds.length === 0
                ? []
                : await db
                      .select({
                          id: developerProducts.id,
                          name: developerProducts.name,
                          listingStatus: developerProducts.listingStatus,
                      })
                      .from(developerProducts)
                      .where(eq(developerProducts.developerId, developerId))
                      .orderBy(desc(developerProducts.updatedAt));

        return {
            totals: {
                revenuePaise,
                totalOrders,
                completedOrders: completed.length,
                activeContracts,
                productViews: views,
                productViewsLast30Days: views30,
                demoOpens: events.demo_open || 0,
                messages: events.message_seller || 0,
                saves: events.save || 0,
                contractStarts: events.contract_started || 0,
                conversionRatePercent: conversionRate,
                liveListings: products.filter((p) => (p.listingStatus || '').toLowerCase() === 'live').length,
                totalListings: products.length,
            },
            dailyViews: series,
            products: products.map((p) => ({
                id: p.id,
                name: p.name,
                listingStatus: p.listingStatus,
            })),
        };
    },

    async getProductAnalytics(developerId: number, productId: number) {
        const ids = await ownedProductIds(developerId, productId);
        if (ids.length === 0) throw new Error('Product not found');

        const [product] = await db
            .select({
                id: developerProducts.id,
                name: developerProducts.name,
                listingStatus: developerProducts.listingStatus,
                metaVersion: developerProducts.metaVersion,
            })
            .from(developerProducts)
            .where(eq(developerProducts.id, productId))
            .limit(1);

        const since30 = startOfUtcDay(new Date());
        since30.setUTCDate(since30.getUTCDate() - 29);
        const events = await eventCountsByType(ids);
        const events30 = await eventCountsByType(ids, since30);

        const contractRows = await db
            .select({
                status: contracts.status,
                developerReleasedPaise: contracts.developerReleasedPaise,
            })
            .from(contracts)
            .where(and(eq(contracts.developerId, developerId), eq(contracts.productId, productId)));

        const completed = contractRows.filter((c) => c.status === ContractStatus.COMPLETED);
        const revenuePaise = completed.reduce((sum, c) => sum + (c.developerReleasedPaise ?? 0), 0);
        const views = (events.view || 0) + (events.click || 0);
        const conversionRate =
            views > 0 ? Math.round(((events.contract_started || 0) / views) * 1000) / 10 : null;

        return {
            product,
            totals: {
                listingViews: views,
                listingViewsLast30Days: (events30.view || 0) + (events30.click || 0),
                impressions: events.impression || 0,
                demoOpens: events.demo_open || 0,
                messages: events.message_seller || 0,
                saves: events.save || 0,
                compares: events.compare || 0,
                contractStarts: events.contract_started || 0,
                contractsTotal: contractRows.length,
                contractsCompleted: completed.length,
                revenuePaise,
                conversionRatePercent: conversionRate,
            },
            byEventType: events,
            dailyViews: await dailyViews(ids, 14),
        };
    },

    async listCustomers(
        developerId: number,
        options?: { productId?: number; search?: string }
    ): Promise<SellerCustomerRow[]> {
        const conditions = [eq(contracts.developerId, developerId)];
        if (options?.productId) {
            const ids = await ownedProductIds(developerId, options.productId);
            if (ids.length === 0) return [];
            conditions.push(eq(contracts.productId, options.productId));
        }

        const rows = await db
            .select({
                clientId: clients.id,
                name: clients.name,
                email: clients.email,
                companyName: clients.companyName,
                productId: developerProducts.id,
                productName: developerProducts.name,
                contractPublicId: contracts.publicId,
                planTier: contracts.planTier,
                status: contracts.status,
                grossAmountPaise: contracts.grossAmountPaise,
                developerReleasedPaise: contracts.developerReleasedPaise,
                createdAt: contracts.createdAt,
                completedAt: contracts.completedAt,
            })
            .from(contracts)
            .innerJoin(clients, eq(contracts.clientId, clients.id))
            .innerJoin(developerProducts, eq(contracts.productId, developerProducts.id))
            .where(and(...conditions))
            .orderBy(desc(contracts.createdAt))
            .limit(200);

        const q = (options?.search || '').trim().toLowerCase();
        const filtered = q
            ? rows.filter((r) => {
                  const blob = [r.name, r.email, r.companyName, r.productName].filter(Boolean).join(' ').toLowerCase();
                  return blob.includes(q);
              })
            : rows;

        return filtered.map((r) => ({
            clientId: r.clientId,
            name: r.name,
            email: r.email,
            companyName: r.companyName,
            productId: r.productId,
            productName: r.productName,
            contractPublicId: r.contractPublicId,
            planTier: r.planTier,
            status: r.status,
            grossAmountPaise: r.grossAmountPaise,
            developerReleasedPaise: r.developerReleasedPaise,
            createdAt: r.createdAt ? r.createdAt.toISOString() : null,
            completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        }));
    },

    async assertProductOwned(developerId: number, productId: number) {
        const [row] = await db
            .select()
            .from(developerProducts)
            .where(and(eq(developerProducts.id, productId), eq(developerProducts.developerId, developerId)))
            .limit(1);
        if (!row) throw new Error('Product not found');
        return row;
    },

    async listReleases(developerId: number, productId: number) {
        const product = await this.assertProductOwned(developerId, productId);
        let rows = await db
            .select()
            .from(productReleases)
            .where(eq(productReleases.productId, productId))
            .orderBy(desc(productReleases.releasedAt), desc(productReleases.id));

        // Bootstrap first history row from existing listing meta (buyer-details version field)
        if (rows.length === 0 && product.metaVersion?.trim()) {
            const [seeded] = await db
                .insert(productReleases)
                .values({
                    productId,
                    version: product.metaVersion.trim(),
                    changelog: null,
                    releaseNotesUrl: product.metaReleaseNotesUrl,
                    isCurrent: true,
                    releasedAt: product.updatedAt ?? new Date(),
                })
                .returning();
            if (seeded) rows = [seeded];
        }

        return rows;
    },

    async createRelease(
        developerId: number,
        productId: number,
        input: {
            version: string;
            title?: string | null;
            changelog?: string | null;
            releaseNotesUrl?: string | null;
            makeCurrent?: boolean;
            releasedAt?: Date | null;
        }
    ) {
        await this.assertProductOwned(developerId, productId);
        const version = input.version.trim();
        if (!version) throw new Error('Version is required');

        const makeCurrent = input.makeCurrent !== false;
        if (makeCurrent) {
            await db
                .update(productReleases)
                .set({ isCurrent: false, updatedAt: new Date() })
                .where(eq(productReleases.productId, productId));
        }

        const [row] = await db
            .insert(productReleases)
            .values({
                productId,
                version,
                title: input.title?.trim() || null,
                changelog: input.changelog?.trim() || null,
                releaseNotesUrl: input.releaseNotesUrl?.trim() || null,
                isCurrent: makeCurrent,
                releasedAt: input.releasedAt ?? new Date(),
            })
            .returning();

        if (makeCurrent && row) {
            await db
                .update(developerProducts)
                .set({
                    metaVersion: version,
                    metaReleaseNotesUrl: input.releaseNotesUrl?.trim() || null,
                    updatedAt: new Date(),
                })
                .where(eq(developerProducts.id, productId));
        }

        return row!;
    },

    async updateRelease(
        developerId: number,
        productId: number,
        releaseId: number,
        input: {
            version?: string;
            title?: string | null;
            changelog?: string | null;
            releaseNotesUrl?: string | null;
        }
    ) {
        await this.assertProductOwned(developerId, productId);
        const [existing] = await db
            .select()
            .from(productReleases)
            .where(and(eq(productReleases.id, releaseId), eq(productReleases.productId, productId)))
            .limit(1);
        if (!existing) throw new Error('Release not found');

        const version = input.version?.trim() || existing.version;
        const [row] = await db
            .update(productReleases)
            .set({
                version,
                title: input.title !== undefined ? input.title?.trim() || null : existing.title,
                changelog: input.changelog !== undefined ? input.changelog?.trim() || null : existing.changelog,
                releaseNotesUrl:
                    input.releaseNotesUrl !== undefined
                        ? input.releaseNotesUrl?.trim() || null
                        : existing.releaseNotesUrl,
                updatedAt: new Date(),
            })
            .where(eq(productReleases.id, releaseId))
            .returning();

        if (existing.isCurrent && row) {
            await db
                .update(developerProducts)
                .set({
                    metaVersion: row.version,
                    metaReleaseNotesUrl: row.releaseNotesUrl,
                    updatedAt: new Date(),
                })
                .where(eq(developerProducts.id, productId));
        }

        return row!;
    },

    async makeReleaseCurrent(developerId: number, productId: number, releaseId: number) {
        await this.assertProductOwned(developerId, productId);
        const [existing] = await db
            .select()
            .from(productReleases)
            .where(and(eq(productReleases.id, releaseId), eq(productReleases.productId, productId)))
            .limit(1);
        if (!existing) throw new Error('Release not found');

        await db
            .update(productReleases)
            .set({ isCurrent: false, updatedAt: new Date() })
            .where(eq(productReleases.productId, productId));

        const [row] = await db
            .update(productReleases)
            .set({ isCurrent: true, updatedAt: new Date() })
            .where(eq(productReleases.id, releaseId))
            .returning();

        await db
            .update(developerProducts)
            .set({
                metaVersion: row!.version,
                metaReleaseNotesUrl: row!.releaseNotesUrl,
                updatedAt: new Date(),
            })
            .where(eq(developerProducts.id, productId));

        return row!;
    },

    async deleteRelease(developerId: number, productId: number, releaseId: number) {
        await this.assertProductOwned(developerId, productId);
        const [existing] = await db
            .select()
            .from(productReleases)
            .where(and(eq(productReleases.id, releaseId), eq(productReleases.productId, productId)))
            .limit(1);
        if (!existing) throw new Error('Release not found');
        const wasCurrent = existing.isCurrent;
        await db.delete(productReleases).where(eq(productReleases.id, releaseId));

        // Keep PDP metaVersion in sync: promote newest remaining release, or clear meta.
        if (wasCurrent) {
            const [next] = await db
                .select()
                .from(productReleases)
                .where(eq(productReleases.productId, productId))
                .orderBy(desc(productReleases.releasedAt), desc(productReleases.id))
                .limit(1);

            if (next) {
                await db
                    .update(productReleases)
                    .set({ isCurrent: true, updatedAt: new Date() })
                    .where(eq(productReleases.id, next.id));
                await db
                    .update(developerProducts)
                    .set({
                        metaVersion: next.version,
                        metaReleaseNotesUrl: next.releaseNotesUrl,
                        updatedAt: new Date(),
                    })
                    .where(eq(developerProducts.id, productId));
            } else {
                await db
                    .update(developerProducts)
                    .set({
                        metaVersion: null,
                        metaReleaseNotesUrl: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(developerProducts.id, productId));
            }
        }

        return { deleted: true, wasCurrent };
    },

    /**
     * Derived activity feed for the Notifications page (no separate inbox table yet).
     * Built from contracts, listings, KYC/bank, and email verification state.
     */
    async getActivityFeed(developerId: number) {
        const [dev] = await db
            .select({
                name: developers.name,
                email: developers.email,
                isEmailVerified: developers.isEmailVerified,
                kycStatus: developers.kycStatus,
                kycVerifiedAt: developers.kycVerifiedAt,
                kycRejectedAt: developers.kycRejectedAt,
                payoutBankValidationStatus: developers.payoutBankValidationStatus,
                payoutBankValidationAccountStatus: developers.payoutBankValidationAccountStatus,
                payoutBankValidationAt: developers.payoutBankValidationAt,
                createdAt: developers.createdAt,
            })
            .from(developers)
            .where(eq(developers.id, developerId))
            .limit(1);

        if (!dev) throw new Error('Developer not found');

        type ActivityItem = {
            id: string;
            type: 'contract' | 'listing' | 'kyc' | 'payout' | 'account' | 'settlement';
            severity: 'info' | 'success' | 'warning' | 'action';
            title: string;
            message: string;
            href: string | null;
            createdAt: string;
        };

        const items: ActivityItem[] = [];
        const push = (item: ActivityItem) => items.push(item);

        if (!dev.isEmailVerified) {
            push({
                id: 'email-unverified',
                type: 'account',
                severity: 'warning',
                title: 'Verify your email',
                message: `Confirm ${dev.email} to secure your seller account.`,
                href: '/verify-email',
                createdAt: (dev.createdAt ?? new Date()).toISOString(),
            });
        }

        const kyc = (dev.kycStatus || 'pending').toLowerCase();
        if (kyc === 'rejected') {
            push({
                id: 'kyc-rejected',
                type: 'kyc',
                severity: 'warning',
                title: 'KYC rejected',
                message: 'Update your documents and resubmit KYC to unlock payouts and listing.',
                href: '/dashboard/kyc',
                createdAt: (dev.kycRejectedAt ?? new Date()).toISOString(),
            });
        } else if (kyc === 'submitted' || kyc === 'pending') {
            push({
                id: `kyc-${kyc}`,
                type: 'kyc',
                severity: kyc === 'submitted' ? 'info' : 'action',
                title: kyc === 'submitted' ? 'KYC under review' : 'Complete KYC',
                message:
                    kyc === 'submitted'
                        ? 'We are reviewing your documents. You will be able to list once verified.'
                        : 'Submit KYC to unlock marketplace listing and payouts.',
                href: '/dashboard/kyc',
                createdAt: (dev.createdAt ?? new Date()).toISOString(),
            });
        }

        const bankOk =
            (dev.payoutBankValidationStatus || '').toLowerCase() === 'completed' &&
            (dev.payoutBankValidationAccountStatus || '').toLowerCase() === 'valid';
        if (!bankOk) {
            push({
                id: 'bank-incomplete',
                type: 'payout',
                severity: 'action',
                title: 'Add payout bank',
                message: 'Verify a bank account so Cashfree can settle completed contracts.',
                href: '/dashboard/payout-bank',
                createdAt: (dev.payoutBankValidationAt ?? dev.createdAt ?? new Date()).toISOString(),
            });
        }

        const productRows = await db
            .select({
                id: developerProducts.id,
                name: developerProducts.name,
                slug: developerProducts.slug,
                listingStatus: developerProducts.listingStatus,
                updatedAt: developerProducts.updatedAt,
                createdAt: developerProducts.createdAt,
                projectId: developerProducts.projectId,
            })
            .from(developerProducts)
            .where(eq(developerProducts.developerId, developerId))
            .orderBy(desc(developerProducts.updatedAt))
            .limit(40);

        for (const p of productRows) {
            const live = (p.listingStatus || '').toLowerCase() === 'live';
            if (!live) continue;
            push({
                id: `listing-${p.id}`,
                type: 'listing',
                severity: 'success',
                title: 'Listing is live',
                message: `"${p.name}" is visible on the marketplace.`,
                href: p.projectId ? `/project/${p.projectId}/listing` : '/dashboard/products',
                createdAt: (p.updatedAt ?? p.createdAt ?? new Date()).toISOString(),
            });
        }

        const contractRows = await db
            .select({
                id: contracts.id,
                publicId: contracts.publicId,
                status: contracts.status,
                settlementStatus: contracts.settlementStatus,
                productName: developerProducts.name,
                updatedAt: contracts.updatedAt,
                completedAt: contracts.completedAt,
                createdAt: contracts.createdAt,
            })
            .from(contracts)
            .leftJoin(developerProducts, eq(contracts.productId, developerProducts.id))
            .where(eq(contracts.developerId, developerId))
            .orderBy(desc(contracts.updatedAt))
            .limit(60);

        for (const c of contractRows) {
            const href = `/dashboard/contracts/${c.publicId}`;
            const when = (c.updatedAt ?? c.completedAt ?? c.createdAt ?? new Date()).toISOString();
            const label = c.productName || 'Contract';

            if (c.status === ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) {
                push({
                    id: `contract-pending-${c.id}`,
                    type: 'contract',
                    severity: 'action',
                    title: 'Contract awaiting your acceptance',
                    message: `${label} · ${c.publicId}`,
                    href,
                    createdAt: when,
                });
            } else if (c.status === ContractStatus.DISPUTED) {
                push({
                    id: `contract-disputed-${c.id}`,
                    type: 'contract',
                    severity: 'warning',
                    title: 'Contract in dispute',
                    message: `${label} is disputed — wait for admin resolution.`,
                    href,
                    createdAt: when,
                });
            } else if (c.status === ContractStatus.SUBMITTED) {
                push({
                    id: `contract-submitted-${c.id}`,
                    type: 'contract',
                    severity: 'info',
                    title: 'Delivery submitted',
                    message: `${label} is awaiting the buyer decision.`,
                    href,
                    createdAt: when,
                });
            } else if (c.status === ContractStatus.COMPLETED) {
                push({
                    id: `contract-done-${c.id}`,
                    type: 'contract',
                    severity: 'success',
                    title: 'Contract completed',
                    message: `${label} finished. Settlement: ${c.settlementStatus || 'pending'}.`,
                    href,
                    createdAt: when,
                });
                if (
                    c.settlementStatus &&
                    ['failed', 'partial', 'pending', 'skipped'].includes(c.settlementStatus)
                ) {
                    push({
                        id: `settlement-${c.id}`,
                        type: 'settlement',
                        severity: 'warning',
                        title: 'Settlement needs attention',
                        message: `${label} settlement is ${c.settlementStatus}. Check Earnings for details.`,
                        href: '/dashboard/earnings',
                        createdAt: when,
                    });
                }
            }
        }

        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
            items: items.slice(0, 80),
            generatedAt: new Date().toISOString(),
            note: 'This feed is generated from your live account activity. A persistent notification inbox is not in v1.',
        };
    },

    /** Real escrow earnings + payout bank snapshot for the Earnings page. */
    async getEarnings(developerId: number) {
        const [dev] = await db
            .select({
                payoutBankName: developers.payoutBankName,
                payoutAccountHolderName: developers.payoutAccountHolderName,
                payoutAccountNumber: developers.payoutAccountNumber,
                payoutBankValidationStatus: developers.payoutBankValidationStatus,
                payoutBankValidationAccountStatus: developers.payoutBankValidationAccountStatus,
                payoutCashfreeBeneficiaryId: developers.payoutCashfreeBeneficiaryId,
            })
            .from(developers)
            .where(eq(developers.id, developerId))
            .limit(1);

        if (!dev) throw new Error('Developer not found');

        const rows = await db
            .select({
                id: contracts.id,
                publicId: contracts.publicId,
                status: contracts.status,
                productId: contracts.productId,
                productName: developerProducts.name,
                grossAmountPaise: contracts.grossAmountPaise,
                escrowAmountPaise: contracts.escrowAmountPaise,
                developerReleasedPaise: contracts.developerReleasedPaise,
                platformReleasedPaise: contracts.platformReleasedPaise,
                settlementStatus: contracts.settlementStatus,
                completedAt: contracts.completedAt,
                createdAt: contracts.createdAt,
                clientName: clients.name,
            })
            .from(contracts)
            .leftJoin(developerProducts, eq(contracts.productId, developerProducts.id))
            .leftJoin(clients, eq(contracts.clientId, clients.id))
            .where(eq(contracts.developerId, developerId))
            .orderBy(desc(contracts.createdAt))
            .limit(200);

        const platformPct = env.CONTRACT_PLATFORM_COMMISSION_PERCENT;
        const developerPct = Math.max(0, 100 - platformPct);

        const estimateDeveloperShare = (escrowPaise: number) =>
            Math.floor((escrowPaise * developerPct) / 100);

        const inFlightStatuses = new Set<string>([
            ContractStatus.ACTIVE,
            ContractStatus.SUBMITTED,
            ContractStatus.AWAITING_CLIENT_PAYMENT,
            ContractStatus.AWAITING_AMENDMENT_PAYMENT,
            ContractStatus.PENDING_DEVELOPER_ACCEPTANCE,
            ContractStatus.DISPUTED,
        ]);

        let lifetimePaidPaise = 0;
        let inEscrowPaise = 0;
        let pendingSettlementPaise = 0;

        const payoutHistory: {
            contractId: number;
            publicId: string;
            productName: string | null;
            clientName: string | null;
            amountPaise: number;
            settlementStatus: string | null;
            completedAt: string | null;
        }[] = [];

        const openContracts: {
            contractId: number;
            publicId: string;
            productName: string | null;
            status: string;
            estimatedDeveloperPaise: number;
            escrowAmountPaise: number;
        }[] = [];

        for (const row of rows) {
            const released = row.developerReleasedPaise;
            const settlementOk = (row.settlementStatus || '').toLowerCase() === 'executed';
            // Only count Cashfree-executed settlements as "lifetime paid" (ledger release alone is not payout truth).
            if (typeof released === 'number' && released > 0 && settlementOk) {
                lifetimePaidPaise += released;
                payoutHistory.push({
                    contractId: row.id,
                    publicId: row.publicId,
                    productName: row.productName,
                    clientName: row.clientName,
                    amountPaise: released,
                    settlementStatus: row.settlementStatus,
                    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
                });
            }

            if (inFlightStatuses.has(row.status)) {
                const est = estimateDeveloperShare(row.escrowAmountPaise);
                inEscrowPaise += est;
                openContracts.push({
                    contractId: row.id,
                    publicId: row.publicId,
                    productName: row.productName,
                    status: row.status,
                    estimatedDeveloperPaise: est,
                    escrowAmountPaise: row.escrowAmountPaise,
                });
            }

            if (row.status === ContractStatus.COMPLETED && !settlementOk) {
                const pendingAmt =
                    typeof released === 'number' && released > 0
                        ? released
                        : estimateDeveloperShare(row.escrowAmountPaise);
                pendingSettlementPaise += pendingAmt;
            }
        }

        const acct = (dev.payoutAccountNumber || '').replace(/\s+/g, '');
        const last4 = acct.length >= 4 ? acct.slice(-4) : null;
        const bankReady =
            (dev.payoutBankValidationStatus || '').toLowerCase() === 'completed' &&
            (dev.payoutBankValidationAccountStatus || '').toLowerCase() === 'valid';

        return {
            currency: 'INR',
            totals: {
                lifetimePaidPaise,
                inEscrowEstimatedPaise: inEscrowPaise,
                pendingSettlementPaise,
                completedPayoutCount: payoutHistory.length,
                openContractCount: openContracts.length,
            },
            payoutMethod: {
                configured: Boolean(acct || dev.payoutBankName),
                bankReady,
                bankName: dev.payoutBankName,
                accountHolderName: dev.payoutAccountHolderName,
                accountLast4: last4,
                hasCashfreeBeneficiary: Boolean(dev.payoutCashfreeBeneficiaryId),
                validationStatus: dev.payoutBankValidationStatus,
            },
            note: 'Payouts run automatically via Cashfree when a contract completes (and after dispute resolution). There is no manual “request payout” — ensure your bank is verified.',
            developerEscrowSplitPercent: developerPct,
            payoutHistory: payoutHistory.slice(0, 50),
            openContracts: openContracts.slice(0, 50),
        };
    },
};
