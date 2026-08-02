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
import { getHomeCandidates, getSearchCandidates, getSimilarCandidates } from './discovery/candidates.js';
import {
    humanizeInterestTag,
    parseInterestProfile,
    topLearnedTags,
} from './discovery/interest-profile.js';
import { buildListingEmbedDocument } from './discovery/listing-indexer.js';
import { ensureClientInterestProfile } from './discovery/rebuild-profile.js';
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

export type MarketplaceListResult = {
    products: MarketplaceListItem[];
    total: number;
    queryId?: string;
    retrievalMode?: 'vector' | 'fallback';
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

async function loadBuyer(clientId: number): Promise<{
    client: typeof clients.$inferSelect;
    buyer: BuyerScoreContext;
} | null> {
    await ensureClientInterestProfile(clientId);
    const [c] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!c) return null;
    const savedProductIds = new Set(parseClientJsonIds(c.savedProductIds));
    const views = await db
        .select({ productId: clientListingEvents.productId })
        .from(clientListingEvents)
        .where(and(eq(clientListingEvents.clientId, clientId), eq(clientListingEvents.eventType, 'view')))
        .orderBy(desc(clientListingEvents.createdAt))
        .limit(200);
    const viewedProductIds = new Set(views.map((v) => v.productId));
    return { client: c, buyer: buyerContextFromClient(c, viewedProductIds, savedProductIds) };
}

async function loadLiveRows() {
    return db
        .select({
            product: developerProducts,
            categoryName: productCategories.name,
        })
        .from(developerProducts)
        .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
        .where(eq(developerProducts.listingStatus, 'live'))
        .orderBy(desc(developerProducts.updatedAt));
}

async function loadReviewStats(productIds: number[]) {
    const reviewStats = new Map<number, { avg: number | null; count: number }>();
    if (productIds.length === 0) return reviewStats;
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
    return reviewStats;
}

function scoreRow(
    row: { product: typeof developerProducts.$inferSelect; categoryName: string | null },
    stats: { avg: number | null; count: number } | undefined,
    buyer: BuyerScoreContext | null,
    semanticSimilarity?: number
): MarketplaceListItem {
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
            buyer,
            semanticSimilarity != null ? { semanticSimilarity } : undefined
        );
        matchScore = scored.total;
        matchPercent = scored.matchPercent;
        matchReasons = scored.reasons;
    } else if (semanticSimilarity != null && semanticSimilarity > 0) {
        matchScore = Math.round(semanticSimilarity * 100);
        matchPercent = Math.round(semanticSimilarity * 100);
        matchReasons = semanticSimilarity >= 0.35 ? ['Matches your search'] : undefined;
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
}

export async function listLiveMarketplaceProducts(options: {
    limit?: number;
    offset?: number;
    search?: string;
    categoryId?: number;
    clientId?: number | null;
    sort?: 'recommended' | 'newest' | 'name';
}): Promise<MarketplaceListResult> {
    const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const searchRaw = (options.search || '').trim();
    const search = searchRaw.toLowerCase();

    let buyer: BuyerScoreContext | null = null;
    let client: typeof clients.$inferSelect | null = null;
    if (options.clientId) {
        const loaded = await loadBuyer(options.clientId);
        if (loaded) {
            client = loaded.client;
            buyer = loaded.buyer;
        }
    }

    let retrievalMode: 'vector' | 'fallback' = 'fallback';
    let queryId: string | undefined;
    let semanticScores = new Map<number, number>();
    let candidateIdSet: Set<number> | null = null;

    // Semantic retrieval when user typed a search query
    if (searchRaw.length >= 2) {
        const candidates = await getSearchCandidates(searchRaw, {
            limit: 50,
            categoryId: options.categoryId,
        });
        queryId = candidates.queryId;
        retrievalMode = candidates.mode;
        semanticScores = candidates.semanticScores;
        if (candidates.candidateIds.length > 0) {
            candidateIdSet = new Set(candidates.candidateIds);
        }
    } else if (options.sort === 'recommended' && buyer) {
        // Home-style: soft vector recall from interest profile
        const candidates = await getHomeCandidates(buyer.interestProfile, { limit: 40 });
        queryId = candidates.queryId;
        if (candidates.mode === 'vector' && candidates.candidateIds.length > 0) {
            retrievalMode = 'vector';
            semanticScores = candidates.semanticScores;
            // Don't restrict to only candidates — boost them via semanticScores while scoring all
        }
    }

    let rows = await loadLiveRows();

    if (options.categoryId) {
        rows = rows.filter((r) => r.product.productCategoryId === options.categoryId);
    }

    if (candidateIdSet) {
        rows = rows.filter((r) => candidateIdSet!.has(r.product.id));
        // Preserve ANN order as a soft preference before scoring
        const order = new Map([...candidateIdSet].map((id, i) => [id, i]));
        rows.sort((a, b) => (order.get(a.product.id) ?? 999) - (order.get(b.product.id) ?? 999));
    } else if (search) {
        rows = rows.filter((r) => {
            const blob = [
                r.product.name,
                r.product.tagline,
                r.product.slug,
                r.categoryName,
                ...parseJson<string[]>(r.product.audienceTags, []),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return blob.includes(search);
        });
    }

    const reviewStats = await loadReviewStats(rows.map((r) => r.product.id));

    let items: MarketplaceListItem[] = rows.map((row) =>
        scoreRow(row, reviewStats.get(row.product.id), buyer, semanticScores.get(row.product.id))
    );

    const total = items.length;

    if (options.sort === 'recommended' && (buyer || semanticScores.size > 0)) {
        items.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    } else if (options.sort === 'name') {
        items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
        products: items.slice(offset, offset + limit),
        total,
        queryId,
        retrievalMode,
    };
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

function slugFromTagValue(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

function listingMatchesLearnedTag(
    row: { product: typeof developerProducts.$inferSelect; categoryName: string | null },
    tag: string
): boolean {
    const [prefix, ...rest] = tag.split(':');
    const value = rest.join(':');
    if (!prefix || !value) return false;

    const catSlug = row.categoryName ? slugFromTagValue(row.categoryName) : '';
    const audience = parseJson<string[]>(row.product.audienceTags, []).map(slugFromTagValue);
    const useCases = parseJson<string[]>(row.product.useCases, []).map(slugFromTagValue);
    const bestFor = slugFromTagValue(row.product.bestFor || '');
    const integ = (row.product.technicalIntegrations || '').toLowerCase();
    const hay = [
        row.product.name,
        row.product.tagline,
        row.product.shortDescription,
        row.product.bestFor,
        ...parseJson<string[]>(row.product.audienceTags, []),
        ...parseJson<string[]>(row.product.useCases, []),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (prefix === 'category') {
        return catSlug === value || catSlug.includes(value) || value.includes(catSlug);
    }
    if (prefix === 'audience' || prefix === 'topic' || prefix === 'usecase') {
        return (
            audience.includes(value) ||
            useCases.includes(value) ||
            bestFor.includes(value) ||
            hay.includes(value.replace(/_/g, ' '))
        );
    }
    if (prefix === 'integration') {
        return integ.includes(value.replace(/_/g, ' ')) || integ.includes(value);
    }
    if (prefix === 'goal') {
        return catSlug.includes(value) || hay.includes(value.replace(/_/g, ' '));
    }
    return hay.includes(value.replace(/_/g, ' '));
}

export type HomeRecommendationRails = {
    recommended: MarketplaceListItem[];
    explored: {
        topicLabel: string;
        topTags: string[];
        products: MarketplaceListItem[];
    } | null;
    saved: MarketplaceListItem[];
};

/**
 * Dashboard rails:
 * - recommended: questionnaire + effective profile (base + learned)
 * - explored: “Because you’ve been exploring {topic}” from top learned tags
 * - saved: Saved for later
 */
export async function getHomeRecommendationRails(
    clientId: number,
    limit = 8
): Promise<HomeRecommendationRails> {
    const cap = Math.min(Math.max(limit, 1), 24);
    const loaded = await loadBuyer(clientId);
    if (!loaded) {
        return { recommended: [], explored: null, saved: [] };
    }

    const { buyer } = loaded;
    const profile = parseInterestProfile(loaded.client.interestProfile);

    const recommended = await getRecommendationsForClient(clientId, cap);
    const recommendedIds = new Set(recommended.map((p) => p.id));

    const learned = topLearnedTags(profile, 5, 8);
    let explored: HomeRecommendationRails['explored'] = null;

    if (learned.length > 0) {
        const topicLabel = humanizeInterestTag(learned[0]!.tag);
        const rows = await loadLiveRows();
        const reviewStats = await loadReviewStats(rows.map((r) => r.product.id));

        const scored: MarketplaceListItem[] = [];
        for (const row of rows) {
            if (recommendedIds.has(row.product.id)) continue;
            const hitCount = learned.filter((t) => listingMatchesLearnedTag(row, t.tag)).length;
            if (hitCount === 0) continue;
            const item = scoreRow(row, reviewStats.get(row.product.id), buyer);
            const boost =
                hitCount * 12 +
                (learned[0] && listingMatchesLearnedTag(row, learned[0].tag) ? 20 : 0);
            scored.push({
                ...item,
                matchScore: (item.matchScore ?? 0) + boost,
                matchReasons: [
                    `Because you’ve been exploring ${topicLabel}`,
                    ...(item.matchReasons || []).slice(0, 2),
                ].slice(0, 3),
            });
        }

        scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
        const products = scored.slice(0, cap);
        if (products.length > 0) {
            explored = {
                topicLabel,
                topTags: learned.map((t) => t.tag),
                products,
            };
        }
    }

    const savedIds = [...buyer.savedProductIds];
    let saved: MarketplaceListItem[] = [];
    if (savedIds.length > 0) {
        const rows = await loadLiveRows();
        const byId = new Map(rows.map((r) => [r.product.id, r]));
        const reviewStats = await loadReviewStats(savedIds);
        saved = savedIds
            .map((id) => byId.get(id))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((row) => {
                const item = scoreRow(row, reviewStats.get(row.product.id), buyer);
                return {
                    ...item,
                    matchReasons: ['Saved for later', ...(item.matchReasons || []).slice(0, 2)].slice(
                        0,
                        3
                    ),
                };
            })
            .slice(0, cap);
    }

    return { recommended, explored, saved };
}

/** Similar live listings for a PDP (vector neighbors + profile score when authed). */
export async function getRelatedMarketplaceProducts(
    productId: number,
    options?: { limit?: number; clientId?: number | null }
): Promise<MarketplaceListResult> {
    const limit = Math.min(Math.max(options?.limit ?? 8, 1), 24);

    const [seed] = await db
        .select({
            product: developerProducts,
            categoryName: productCategories.name,
        })
        .from(developerProducts)
        .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
        .where(eq(developerProducts.id, productId))
        .limit(1);

    if (!seed) return { products: [], total: 0, retrievalMode: 'fallback' };

    const seedText = buildListingEmbedDocument({
        name: seed.product.name,
        tagline: seed.product.tagline,
        shortDescription: seed.product.shortDescription,
        problem: seed.product.problem,
        solution: seed.product.solution,
        bestFor: seed.product.bestFor,
        categoryName: seed.categoryName,
        audienceTags: parseJson<string[]>(seed.product.audienceTags, []),
        useCases: parseJson<string[]>(seed.product.useCases, []),
        technicalStack: seed.product.technicalStack,
        technicalIntegrations: seed.product.technicalIntegrations,
    });

    const candidates = await getSimilarCandidates(seedText, {
        limit: limit + 5,
        excludeProductId: productId,
    });

    let buyer: BuyerScoreContext | null = null;
    if (options?.clientId) {
        const loaded = await loadBuyer(options.clientId);
        buyer = loaded?.buyer ?? null;
    }

    let rows = await loadLiveRows();
    rows = rows.filter((r) => r.product.id !== productId);

    if (candidates.candidateIds.length > 0) {
        const allow = new Set(candidates.candidateIds);
        rows = rows.filter((r) => allow.has(r.product.id));
    } else if (seed.product.productCategoryId) {
        // Fallback: same category
        rows = rows.filter((r) => r.product.productCategoryId === seed.product.productCategoryId);
    }

    const reviewStats = await loadReviewStats(rows.map((r) => r.product.id));
    let items = rows.map((row) =>
        scoreRow(row, reviewStats.get(row.product.id), buyer, candidates.semanticScores.get(row.product.id))
    );

    items.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

    return {
        products: items.slice(0, limit),
        total: items.length,
        queryId: candidates.queryId,
        retrievalMode: candidates.mode,
    };
}
