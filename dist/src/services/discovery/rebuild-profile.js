import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients, productCategories } from '../../db/schema.js';
import { parseClientJsonIds, serializeJsonArray } from '../../utils/client-onboarding.js';
import { parseInterestProfile, rebuildBaseInterestProfile, serializeInterestProfile, } from './interest-profile.js';
function parseStringArray(raw) {
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
/** Rebuild interest `base` from current client questionnaire fields; keep `learned`. */
export async function refreshClientInterestProfile(clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!client)
        return;
    const categoryIds = parseClientJsonIds(client.interestedCategoryIds);
    let categoryNames = [];
    if (categoryIds.length > 0) {
        const cats = await db
            .select({ id: productCategories.id, name: productCategories.name })
            .from(productCategories)
            .where(inArray(productCategories.id, categoryIds));
        categoryNames = cats.map((c) => c.name);
    }
    const existing = parseInterestProfile(client.interestProfile);
    const next = rebuildBaseInterestProfile(existing, {
        industry: client.industry,
        companySize: client.companySize,
        budgetBand: client.budgetBand,
        technicalComfort: client.technicalComfort,
        primaryGoals: parseStringArray(client.primaryGoals),
        painPoints: parseStringArray(client.painPoints),
        preferredIntegrations: parseStringArray(client.preferredIntegrations),
        preferredStacks: parseStringArray(client.preferredStacks),
        categoryNames,
    });
    await db
        .update(clients)
        .set({
        interestProfile: serializeInterestProfile(next),
        updatedAt: new Date(),
    })
        .where(eq(clients.id, clientId));
}
export { serializeJsonArray, parseStringArray };
