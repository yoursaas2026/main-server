import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts, productCategories } from '../../db/schema.js';
import { embedText, embeddingsConfigured } from './embeddings.js';
import { deleteListingVector, upsertListingVector, vectorStoreConfigured, } from './vector-store.js';
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
function minTierPriceInr(tiersJson) {
    const tiers = parseJson(tiersJson, []);
    const prices = tiers
        .map((t) => t.fixedPriceInr)
        .filter((p) => typeof p === 'number' && p > 0);
    if (prices.length === 0)
        return null;
    return Math.min(...prices);
}
export function buildListingEmbedDocument(input) {
    return [
        input.name,
        input.tagline,
        input.shortDescription,
        input.categoryName ? `Category: ${input.categoryName}` : null,
        input.audienceTags.length ? `Audience: ${input.audienceTags.join(', ')}` : null,
        input.useCases.length ? `Use cases: ${input.useCases.join(', ')}` : null,
        input.bestFor ? `Best for: ${input.bestFor}` : null,
        input.problem ? `Problem: ${input.problem}` : null,
        input.solution ? `Solution: ${input.solution}` : null,
        input.technicalStack ? `Stack: ${input.technicalStack}` : null,
        input.technicalIntegrations ? `Integrations: ${input.technicalIntegrations}` : null,
    ]
        .filter(Boolean)
        .join('. ')
        .replace(/\s+/g, ' ')
        .trim();
}
export function indexingAvailable() {
    return embeddingsConfigured() && vectorStoreConfigured();
}
/** Index or remove a listing from the vector store. Safe to call fire-and-forget. */
export async function syncListingVectorIndex(productId) {
    if (!indexingAvailable()) {
        return { ok: false, reason: 'vector_disabled' };
    }
    const [row] = await db
        .select({
        product: developerProducts,
        categoryName: productCategories.name,
    })
        .from(developerProducts)
        .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
        .where(eq(developerProducts.id, productId))
        .limit(1);
    if (!row) {
        await deleteListingVector(productId);
        return { ok: false, reason: 'not_found' };
    }
    const status = (row.product.listingStatus || '').toLowerCase();
    if (status !== 'live') {
        await deleteListingVector(productId);
        return { ok: true, reason: 'removed_draft' };
    }
    const doc = buildListingEmbedDocument({
        name: row.product.name,
        tagline: row.product.tagline,
        shortDescription: row.product.shortDescription,
        problem: row.product.problem,
        solution: row.product.solution,
        bestFor: row.product.bestFor,
        categoryName: row.categoryName,
        audienceTags: parseJson(row.product.audienceTags, []),
        useCases: parseJson(row.product.useCases, []),
        technicalStack: row.product.technicalStack,
        technicalIntegrations: row.product.technicalIntegrations,
    });
    if (!doc)
        return { ok: false, reason: 'empty_doc' };
    const vector = await embedText(doc);
    if (!vector)
        return { ok: false, reason: 'embed_failed' };
    const upserted = await upsertListingVector(productId, vector, {
        productId,
        slug: row.product.slug,
        name: row.product.name,
        categoryId: row.product.productCategoryId ?? null,
        listingStatus: 'live',
        minPriceInr: minTierPriceInr(row.product.customizationTiers),
        verified: row.product.trustVerifiedByPlatform ?? false,
    });
    return upserted ? { ok: true } : { ok: false, reason: 'upsert_failed' };
}
export function queueListingVectorSync(productId) {
    void syncListingVectorIndex(productId).catch((err) => {
        console.error(`[Discovery] syncListingVectorIndex(${productId}) error:`, err);
    });
}
/** Reindex all live listings (startup / admin script). */
export async function reindexAllLiveListings() {
    const rows = await db
        .select({ id: developerProducts.id })
        .from(developerProducts)
        .where(eq(developerProducts.listingStatus, 'live'));
    let indexed = 0;
    let failed = 0;
    for (const row of rows) {
        const res = await syncListingVectorIndex(row.id);
        if (res.ok && res.reason !== 'removed_draft')
            indexed += 1;
        else if (!res.ok && res.reason !== 'vector_disabled')
            failed += 1;
    }
    return { indexed, failed };
}
