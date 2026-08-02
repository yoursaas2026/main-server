import { embedText, embeddingsConfigured } from './embeddings.js';
import { searchListingVectors, vectorStoreConfigured } from './vector-store.js';
import { effectiveWeights } from './interest-profile.js';
function makeQueryId() {
    return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function profileSyntheticQuery(profile) {
    const tags = Object.entries(effectiveWeights(profile))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag.replace(/^[^:]+:/, '').replace(/_/g, ' '));
    return tags.join(' ') || 'saas marketplace software';
}
/**
 * Semantic candidates for a search query.
 * On failure returns empty candidateIds → caller scores full live catalog.
 */
export async function getSearchCandidates(query, options) {
    const queryId = makeQueryId();
    const q = query.trim();
    if (!q || !embeddingsConfigured() || !vectorStoreConfigured()) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const vector = await embedText(q);
    if (!vector) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const hits = await searchListingVectors(vector, {
        limit: options?.limit ?? 50,
        categoryId: options?.categoryId,
        onlyLive: true,
    });
    return hitsToCandidateSet(hits, queryId);
}
/** Profile-based home candidates (synthetic query from interest tags). */
export async function getHomeCandidates(profile, options) {
    const queryId = makeQueryId();
    if (!embeddingsConfigured() || !vectorStoreConfigured()) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const synthetic = profileSyntheticQuery(profile);
    const vector = await embedText(synthetic);
    if (!vector) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const hits = await searchListingVectors(vector, {
        limit: options?.limit ?? 40,
        onlyLive: true,
    });
    return hitsToCandidateSet(hits, queryId);
}
/** Similar listings to a seed product (by re-embedding seed text or searching near seed vector via seed id). */
export async function getSimilarCandidates(seedText, options) {
    const queryId = makeQueryId();
    if (!embeddingsConfigured() || !vectorStoreConfigured()) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const vector = await embedText(seedText);
    if (!vector) {
        return { semanticScores: new Map(), candidateIds: [], mode: 'fallback', queryId };
    }
    const hits = await searchListingVectors(vector, {
        limit: (options?.limit ?? 12) + 2,
        onlyLive: true,
    });
    const filtered = options?.excludeProductId
        ? hits.filter((h) => h.productId !== options.excludeProductId)
        : hits;
    return hitsToCandidateSet(filtered.slice(0, options?.limit ?? 12), queryId);
}
function hitsToCandidateSet(hits, queryId) {
    const semanticScores = new Map();
    const candidateIds = [];
    for (const hit of hits) {
        // Qdrant cosine score is typically already 0..1 for Cosine distance
        const sim = Math.min(1, Math.max(0, hit.score));
        semanticScores.set(hit.productId, sim);
        candidateIds.push(hit.productId);
    }
    return {
        semanticScores,
        candidateIds,
        mode: candidateIds.length > 0 ? 'vector' : 'fallback',
        queryId,
    };
}
