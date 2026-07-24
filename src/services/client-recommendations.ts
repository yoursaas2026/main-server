import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    clientListingEvents,
    clients,
    developerProducts,
    productCategories,
    productReviews,
} from '../db/schema.js';
import { parseClientJsonIds } from '../utils/client-onboarding.js';
import { parseInterestProfile } from './discovery/interest-profile.js';
import { scoreListingCandidate, type BuyerScoreContext } from './discovery/scoring-engine.js';

type TierRow = { id?: string; fixedPriceInr?: number | null };

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw?.trim()) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function listCoverImage(iconUrl: string | null, screenshotUrls: string | null): string | null {
    if (iconUrl?.trim()) return iconUrl;
    const shots = parseJson<string[]>(screenshotUrls, []);
    return shots[0]?.trim() || null;
}

function minTierPriceInr(tiersJson: string | null): number | null {
    const tiers = parseJson<TierRow[]>(tiersJson, []);
    const prices = tiers
        .map((t) => t.fixedPriceInr)
        .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length === 0) return null;
    return Math.min(...prices);
}

export type MarketplaceListItem = {
    id: number;
    slug: string;
    name: string;
    tagline: string | null;
    categoryId: number | null;
    categoryName: string | null;
    coverImageUrl: string | null;
    trustVerifiedByPlatform: boolean;
    minPriceInr: number | null;
    audienceTags: string[];
    matchScore?: number;
    matchPercent?: number;
    matchReasons?: string[];
};

function buyerContextFromClient(
    client: typeof clients.$inferSelect,
    viewedProductIds: Set<number>,
    savedProductIds: Set<number>
): BuyerScoreContext {
    return {
        industry: client.industry,
        companySize: client.companySize,
        budgetBand: client.budgetBand,
        primaryGoals: parseJson<string[]>(client.primaryGoals, []),
        interestedCategoryIds: parseClientJsonIds(client.interestedCategoryIds),
        painPoints: parseJson<string[]>(client.painPoints, []),
        preferredIntegrations: parseJson<string[]>(client.preferredIntegrations, []),
        preferredStacks: parseJson<string[]>(client.preferredStacks, []),
        problemStatement: client.problemStatement,
        interestProfile: parseInterestProfile(client.interestProfile),
        viewedProductIds,
        savedProductIds,
    };
}

export async function listLiveMarketplaceProducts(options: {
    limit?: number;
    offset?: number;
    search?: string;
    categoryId?: number;
    clientId?: number | null;
    sort?: 'recommended' | 'newest' | 'name';
}): Promise<{ products: MarketplaceListItem[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = (options.search || '').trim().toLowerCase();

    let client: typeof clients.$inferSelect | null = null;
    let viewedProductIds = new Set<number>();
    let savedProductIds = new Set<number>();
    let buyer: BuyerScoreContext | null = null;

    if (options.clientId) {
        const [c] = await db
            .select()
            .from(clients)
            .where(eq(clients.id, options.clientId))
            .limit(1);
        client = c ?? null;
        savedProductIds = new Set(parseClientJsonIds(client?.savedProductIds));

        const views = await db
            .select({ productId: clientListingEvents.productId })
            .from(clientListingEvents)
            .where(
                and(
                    eq(clientListingEvents.clientId, options.clientId),
                    eq(clientListingEvents.eventType, 'view')
                )
            )
            .orderBy(desc(clientListingEvents.createdAt))
            .limit(200);
        viewedProductIds = new Set(views.map((v) => v.productId));

        if (client) {
            buyer = buyerContextFromClient(client, viewedProductIds, savedProductIds);
        }
    }

    const rows = await db
        .select({
            product: developerProducts,
            categoryName: productCategories.name,
        })
        .from(developerProducts)
        .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
        .where(eq(developerProducts.listingStatus, 'live'))
        .orderBy(desc(developerProducts.updatedAt));

    const productIds = rows.map((r) => r.product.id);
    const reviewStats = new Map<number, { avg: number | null; count: number }>();
    if (productIds.length > 0) {
        const stats = await db
            .select({
                productId: productReviews.productId,
                avgRating: sql<number>`avg(${productReviews.rating})`,
                reviewCount: sql<number>`count(*)::int`,
            })
            .from(productReviews)
            .where(inArray(productReviews.productId, productIds))
            .groupBy(productReviews.productId);
        for (const s of stats) {
            reviewStats.set(s.productId, {
                avg: s.avgRating != null ? Number(s.avgRating) : null,
                count: Number(s.reviewCount ?? 0),
            });
        }
    }

    let items: MarketplaceListItem[] = rows.map((row) => {
        const stats = reviewStats.get(row.product.id);
        const minPriceInr = minTierPriceInr(row.product.customizationTiers);
        const shots = parseJson<string[]>(row.product.screenshotUrls, []);
        const tiers = parseJson<TierRow[]>(row.product.customizationTiers, []);

        let matchScore: number | undefined;
        let matchPercent: number | undefined;
        let matchReasons: string[] | undefined;

        if (buyer) {
            const scored = scoreListingCandidate(
                {
                    id: row.product.id,
                    categoryId: row.product.productCategoryId ?? null,
                    categoryName: row.categoryName,
                    audienceTags: parseJson<string[]>(row.product.audienceTags, []),
                    useCases: parseJson<string[]>(row.product.useCases, []),
                    bestFor: row.product.bestFor || '',
                    tagline: row.product.tagline || '',
                    shortDescription: row.product.shortDescription || '',
                    technicalStack: row.product.technicalStack || '',
                    technicalIntegrations: row.product.technicalIntegrations || '',
                    minPriceInr,
                    trustVerifiedByPlatform: row.product.trustVerifiedByPlatform ?? false,
                    avgRating: stats?.avg ?? null,
                    reviewCount: stats?.count ?? 0,
                    updatedAt: row.product.updatedAt,
                    hasIcon: Boolean(row.product.iconUrl?.trim()),
                    screenshotCount: shots.length,
                    hasSupportEmail: Boolean(row.product.supportEmail?.trim()),
                    hasTiers: tiers.some((t) => typeof t.fixedPriceInr === 'number' && t.fixedPriceInr > 0),
                },
                buyer
            );
            matchScore = scored.total;
            matchPercent = scored.matchPercent;
            matchReasons = scored.reasons;
        }

        return {
            id: row.product.id,
            slug: row.product.slug,
            name: row.product.name,
            tagline: row.product.tagline,
            categoryId: row.product.productCategoryId ?? null,
            categoryName: row.categoryName ?? null,
            coverImageUrl: listCoverImage(row.product.iconUrl, row.product.screenshotUrls),
            trustVerifiedByPlatform: row.product.trustVerifiedByPlatform ?? false,
            minPriceInr,
            audienceTags: parseJson<string[]>(row.product.audienceTags, []),
            matchScore,
            matchPercent,
            matchReasons,
        };
    });

    if (search) {
        items = items.filter((p) => {
            const blob = [p.name, p.tagline, p.slug, p.categoryName, ...(p.audienceTags || [])]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return blob.includes(search);
        });
    }

    if (options.categoryId) {
        items = items.filter((p) => p.categoryId === options.categoryId);
    }

    const total = items.length;

    if (options.sort === 'recommended' && client) {
        items.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    } else if (options.sort === 'name') {
        items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return { products: items.slice(offset, offset + limit), total };
}

export async function getRecommendationsForClient(
    clientId: number,
    limit = 12
): Promise<MarketplaceListItem[]> {
    const { products } = await listLiveMarketplaceProducts({
        clientId,
        limit: Math.min(limit, 48),
        offset: 0,
        sort: 'recommended',
    });
    return products.filter((p) => (p.matchScore ?? 0) > 0).slice(0, limit);
}
