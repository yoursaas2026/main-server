import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { clientListingEvents, clients, developerProducts, productCategories, productReviews, } from '../db/schema.js';
import { parseClientJsonIds } from '../utils/client-onboarding.js';
function parseJson(raw, fallback) {
    if (!raw?.trim())
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function listCoverImage(iconUrl, screenshotUrls) {
    if (iconUrl?.trim())
        return iconUrl;
    const shots = parseJson(screenshotUrls, []);
    return shots[0]?.trim() || null;
}
function minTierPriceInr(tiersJson) {
    const tiers = parseJson(tiersJson, []);
    const prices = tiers
        .map((t) => t.fixedPriceInr)
        .filter((p) => typeof p === 'number' && p > 0);
    if (prices.length === 0)
        return null;
    return Math.min(...prices);
}
const BUDGET_MAX_INR = {
    lt_50k: 50_000,
    '50k_2l': 200_000,
    '2l_10l': 1_000_000,
    gt_10l: Number.POSITIVE_INFINITY,
};
function budgetFits(band, minPrice) {
    if (!band || minPrice === null)
        return true;
    const max = BUDGET_MAX_INR[band];
    if (max === undefined)
        return true;
    return minPrice <= max;
}
function overlapScore(a, b) {
    const setB = new Set(b.map((s) => s.toLowerCase()));
    return a.filter((x) => setB.has(x.toLowerCase())).length;
}
function scoreProduct(row, client, viewedProductIds, savedProductIds) {
    let score = 0;
    const reasons = [];
    const interested = parseClientJsonIds(client.interestedCategoryIds);
    if (row.product.productCategoryId && interested.includes(row.product.productCategoryId)) {
        score += 30;
        reasons.push('Matches your categories');
    }
    const audienceTags = parseJson(row.product.audienceTags, []);
    const industry = (client.industry || '').trim();
    const companySize = (client.companySize || '').trim();
    const tagHits = overlapScore(audienceTags, [industry, companySize].filter(Boolean));
    if (tagHits > 0) {
        score += Math.min(20, tagHits * 10);
        reasons.push('Fits your industry or company size');
    }
    const goals = parseJson(client.primaryGoals, []);
    const haystack = [
        row.product.bestFor || '',
        row.product.tagline || '',
        row.product.shortDescription || '',
        ...parseJson(row.product.useCases, []),
    ]
        .join(' ')
        .toLowerCase();
    const goalHits = goals.filter((g) => haystack.includes(g.replace(/_/g, ' ')) || haystack.includes(g)).length;
    if (goalHits > 0) {
        score += 15;
        reasons.push('Aligned with your goals');
    }
    const problem = (client.problemStatement || '').trim().toLowerCase();
    if (problem.length >= 8) {
        const words = problem.split(/\s+/).filter((w) => w.length > 4);
        const wordHits = words.filter((w) => haystack.includes(w)).length;
        if (wordHits >= 2) {
            score += 12;
            reasons.push('Similar to your stated problem');
        }
    }
    const stacks = parseJson(client.preferredStacks, []);
    const techHay = (row.product.technicalStack || '').toLowerCase();
    const stackHits = stacks.filter((s) => techHay.includes(s.toLowerCase())).length;
    if (stackHits > 0) {
        score += 8;
        reasons.push('Uses your preferred stack');
    }
    const minPrice = minTierPriceInr(row.product.customizationTiers);
    if (budgetFits(client.budgetBand, minPrice)) {
        score += 10;
        reasons.push('Within your budget band');
    }
    else {
        score -= 15;
    }
    if (row.product.trustVerifiedByPlatform) {
        score += 8;
        reasons.push('Platform verified');
    }
    if (row.avgRating && row.avgRating >= 4 && row.reviewCount > 0) {
        score += 6;
        reasons.push('Highly rated');
    }
    if (savedProductIds.has(row.product.id)) {
        score += 12;
        reasons.push('Saved by you');
    }
    if (viewedProductIds.has(row.product.id)) {
        score += 5;
    }
    return { score, reasons: [...new Set(reasons)] };
}
export async function listLiveMarketplaceProducts(options) {
    const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = (options.search || '').trim().toLowerCase();
    let client = null;
    let viewedProductIds = new Set();
    let savedProductIds = new Set();
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
            .where(and(eq(clientListingEvents.clientId, options.clientId), eq(clientListingEvents.eventType, 'view')))
            .orderBy(desc(clientListingEvents.createdAt))
            .limit(200);
        viewedProductIds = new Set(views.map((v) => v.productId));
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
    const reviewStats = new Map();
    if (productIds.length > 0) {
        const stats = await db
            .select({
            productId: productReviews.productId,
            avgRating: sql `avg(${productReviews.rating})`,
            reviewCount: sql `count(*)::int`,
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
    let items = rows.map((row) => {
        const stats = reviewStats.get(row.product.id);
        const minPriceInr = minTierPriceInr(row.product.customizationTiers);
        let matchScore;
        let matchReasons;
        if (client) {
            const scored = scoreProduct({
                product: row.product,
                categoryName: row.categoryName,
                avgRating: stats?.avg ?? null,
                reviewCount: stats?.count ?? 0,
            }, client, viewedProductIds, savedProductIds);
            matchScore = scored.score;
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
            audienceTags: parseJson(row.product.audienceTags, []),
            matchScore,
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
    }
    else if (options.sort === 'name') {
        items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { products: items.slice(offset, offset + limit), total };
}
export async function getRecommendationsForClient(clientId, limit = 12) {
    const { products } = await listLiveMarketplaceProducts({
        clientId,
        limit: Math.min(limit, 48),
        offset: 0,
        sort: 'recommended',
    });
    return products.filter((p) => (p.matchScore ?? 0) > 0).slice(0, limit);
}
