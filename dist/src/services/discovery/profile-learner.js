import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients, developerProducts, productCategories } from '../../db/schema.js';
import { applyLearnedDelta, parseInterestProfile, serializeInterestProfile, } from './interest-profile.js';
import { LEARNING_DELTAS } from './weights.js';
function parseJsonArray(raw) {
    if (!raw?.trim())
        return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    }
    catch {
        return [];
    }
}
function slugTag(prefix, value) {
    const v = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    return v ? `${prefix}:${v}` : '';
}
/** Derive interest tags from a listing for profile learning. */
export async function listingInterestTags(productId) {
    const [row] = await db
        .select({
        product: developerProducts,
        categoryName: productCategories.name,
    })
        .from(developerProducts)
        .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
        .where(eq(developerProducts.id, productId))
        .limit(1);
    if (!row)
        return [];
    const tags = [];
    if (row.categoryName)
        tags.push(slugTag('category', row.categoryName));
    for (const t of parseJsonArray(row.product.audienceTags)) {
        tags.push(slugTag('audience', t));
        tags.push(slugTag('topic', t));
    }
    for (const t of parseJsonArray(row.product.useCases)) {
        tags.push(slugTag('usecase', t));
    }
    if (row.product.bestFor?.trim()) {
        tags.push(slugTag('topic', row.product.bestFor.split(/[,/|]/)[0] || row.product.bestFor));
    }
    const integ = (row.product.technicalIntegrations || '').toLowerCase();
    for (const name of ['gmail', 'slack', 'whatsapp', 'shopify', 'stripe', 'microsoft']) {
        if (integ.includes(name))
            tags.push(slugTag('integration', name));
    }
    // Deduplicate
    return [...new Set(tags.filter(Boolean))].slice(0, 12);
}
export async function applyEventToInterestProfile(clientId, productId, eventType) {
    const delta = LEARNING_DELTAS[eventType];
    if (delta === undefined || delta === 0)
        return null;
    // impression / search don't bump product tags
    if (eventType === 'impression' || eventType === 'search')
        return null;
    const [client] = await db
        .select({ interestProfile: clients.interestProfile })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
    if (!client)
        return null;
    const tags = await listingInterestTags(productId);
    if (tags.length === 0 && eventType !== 'unsave')
        return null;
    const current = parseInterestProfile(client.interestProfile);
    const next = applyLearnedDelta(current, tags, delta);
    await db
        .update(clients)
        .set({
        interestProfile: serializeInterestProfile(next),
        updatedAt: new Date(),
    })
        .where(eq(clients.id, clientId));
    return next;
}
