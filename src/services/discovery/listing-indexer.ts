import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts, productCategories } from '../../db/schema.js';
import { embedText, embeddingsConfigured } from './embeddings.js';
import {
    deleteListingVector,
    upsertListingVector,
    vectorStoreConfigured,
} from './vector-store.js';

type TierRow = { fixedPriceInr?: number | null };

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw?.trim()) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function minTierPriceInr(tiersJson: string | null): number | null {
    const tiers = parseJson<TierRow[]>(tiersJson, []);
    const prices = tiers
        .map((t) => t.fixedPriceInr)
        .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length === 0) return null;
    return Math.min(...prices);
}

export function buildListingEmbedDocument(input: {
    name: string;
    tagline: string | null;
    shortDescription: string | null;
    problem: string | null;
    solution: string | null;
    bestFor: string | null;
    categoryName: string | null;
    audienceTags: string[];
    useCases: string[];
    technicalStack: string | null;
    technicalIntegrations: string | null;
}): string {
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

export function indexingAvailable(): boolean {
    return embeddingsConfigured() && vectorStoreConfigured();
}

/** Index or remove a listing from the vector store. Safe to call fire-and-forget. */
export async function syncListingVectorIndex(productId: number): Promise<{ ok: boolean; reason?: string }> {
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
        audienceTags: parseJson<string[]>(row.product.audienceTags, []),
        useCases: parseJson<string[]>(row.product.useCases, []),
        technicalStack: row.product.technicalStack,
        technicalIntegrations: row.product.technicalIntegrations,
    });

    if (!doc) return { ok: false, reason: 'empty_doc' };

    const vector = await embedText(doc);
    if (!vector) return { ok: false, reason: 'embed_failed' };

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

export function queueListingVectorSync(productId: number): void {
    void syncListingVectorIndex(productId).catch((err) => {
        console.error(`[Discovery] syncListingVectorIndex(${productId}) error:`, err);
    });
}

/** Reindex all live listings (startup / admin script). */
export async function reindexAllLiveListings(): Promise<{ indexed: number; failed: number }> {
    const rows = await db
        .select({ id: developerProducts.id })
        .from(developerProducts)
        .where(eq(developerProducts.listingStatus, 'live'));

    let indexed = 0;
    let failed = 0;
    for (const row of rows) {
        const res = await syncListingVectorIndex(row.id);
        if (res.ok && res.reason !== 'removed_draft') indexed += 1;
        else if (!res.ok && res.reason !== 'vector_disabled') failed += 1;
    }
    return { indexed, failed };
}
