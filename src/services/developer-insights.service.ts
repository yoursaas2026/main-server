import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    clientListingEvents,
    clients,
    contracts,
    developerProducts,
    productReleases,
} from '../db/schema.js';
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
        await db.delete(productReleases).where(eq(productReleases.id, releaseId));
        return { deleted: true, wasCurrent: existing.isCurrent };
    },
};
