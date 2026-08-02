import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../config/env.js';
let qdrant = null;
let ensurePromise = null;
function getClient() {
    if (!env.DISCOVERY_VECTOR_ENABLED || !env.QDRANT_URL)
        return null;
    if (!qdrant) {
        qdrant = new QdrantClient({
            url: env.QDRANT_URL,
            apiKey: env.QDRANT_API_KEY || undefined,
        });
    }
    return qdrant;
}
export function vectorStoreConfigured() {
    return Boolean(env.DISCOVERY_VECTOR_ENABLED && env.QDRANT_URL);
}
export async function ensureListingCollection() {
    const client = getClient();
    if (!client)
        return false;
    if (ensurePromise) {
        await ensurePromise;
        return true;
    }
    ensurePromise = (async () => {
        const name = env.QDRANT_COLLECTION;
        const existing = await client.getCollections();
        const found = existing.collections?.some((c) => c.name === name);
        if (!found) {
            await client.createCollection(name, {
                vectors: {
                    size: env.QDRANT_VECTOR_SIZE,
                    distance: 'Cosine',
                },
            });
            console.log(`[Discovery] Created Qdrant collection ${name} (dim=${env.QDRANT_VECTOR_SIZE})`);
        }
    })().catch((err) => {
        ensurePromise = null;
        console.error('[Discovery] ensureListingCollection failed:', err);
        throw err;
    });
    try {
        await ensurePromise;
        return true;
    }
    catch {
        return false;
    }
}
export async function upsertListingVector(productId, vector, payload) {
    const client = getClient();
    if (!client)
        return false;
    const ok = await ensureListingCollection();
    if (!ok)
        return false;
    try {
        await client.upsert(env.QDRANT_COLLECTION, {
            wait: true,
            points: [
                {
                    id: productId,
                    vector,
                    payload: { ...payload },
                },
            ],
        });
        return true;
    }
    catch (err) {
        console.error('[Discovery] upsertListingVector failed:', err);
        return false;
    }
}
export async function deleteListingVector(productId) {
    const client = getClient();
    if (!client)
        return;
    try {
        await client.delete(env.QDRANT_COLLECTION, {
            wait: true,
            points: [productId],
        });
    }
    catch (err) {
        // Collection may not exist yet
        console.error('[Discovery] deleteListingVector failed:', err);
    }
}
/** Cosine ANN search. Returns empty array on failure (caller falls back). */
export async function searchListingVectors(vector, options) {
    const client = getClient();
    if (!client)
        return [];
    const ok = await ensureListingCollection();
    if (!ok)
        return [];
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const must = [];
    if (options?.onlyLive !== false) {
        must.push({ key: 'listingStatus', match: { value: 'live' } });
    }
    if (options?.categoryId && options.categoryId > 0) {
        must.push({ key: 'categoryId', match: { value: options.categoryId } });
    }
    try {
        const res = await client.search(env.QDRANT_COLLECTION, {
            vector,
            limit,
            with_payload: true,
            filter: must.length ? { must } : undefined,
        });
        return (res || [])
            .map((hit) => {
            const id = typeof hit.id === 'number' ? hit.id : Number(hit.id);
            if (!Number.isFinite(id))
                return null;
            return {
                productId: id,
                score: hit.score ?? 0,
                payload: (hit.payload || {}),
            };
        })
            .filter((h) => h != null);
    }
    catch (err) {
        console.error('[Discovery] searchListingVectors failed:', err);
        return [];
    }
}
