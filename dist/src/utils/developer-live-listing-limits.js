import { and, count, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { developerProducts, developers } from '../db/schema.js';
/** `null` = unlimited (Ultimate). */
export function maxLiveListingsForPlan(plan) {
    const p = (plan || 'base').toLowerCase();
    if (p === 'ultimate')
        return null;
    if (p === 'pro')
        return 10;
    return 1;
}
export async function getDeveloperPlan(developerId) {
    const [row] = await db
        .select({ plan: developers.plan })
        .from(developers)
        .where(eq(developers.id, developerId))
        .limit(1);
    return (row?.plan || 'base').toLowerCase();
}
/** Count of products with `listing_status = live` for this developer, optionally excluding one id (e.g. current row while updating). */
export async function countDeveloperLiveListings(developerId, excludeProductId) {
    const conds = [eq(developerProducts.developerId, developerId), eq(developerProducts.listingStatus, 'live')];
    if (excludeProductId != null) {
        conds.push(ne(developerProducts.id, excludeProductId));
    }
    const [row] = await db
        .select({ c: count() })
        .from(developerProducts)
        .where(and(...conds));
    return Number(row?.c ?? 0);
}
export function liveListingLimitErrorMessage(plan, maxLive, liveCount) {
    const p = plan.toLowerCase();
    if (p === 'base') {
        return `Your Base plan allows only ${maxLive} live application on the marketplace. Move another listing to Draft or upgrade to Pro (up to 10 live) or Ultimate (unlimited) to publish more.`;
    }
    if (p === 'pro') {
        return `Your Pro plan allows up to ${maxLive} live applications (${liveCount} already live). Move one to Draft or upgrade to Ultimate for unlimited live listings.`;
    }
    return `You cannot add another live listing right now (${liveCount} live).`;
}
