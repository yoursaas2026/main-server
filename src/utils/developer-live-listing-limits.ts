import { and, count, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { developerProducts, developers } from '../db/schema.js';
import { ensureDeveloperPlanNotExpired, normalizeDeveloperPlan } from './developer-plan.js';

/** `null` = unlimited (Ultimate). */
export function maxLiveListingsForPlan(plan: string | null | undefined): number | null {
    const p = normalizeDeveloperPlan(plan);
    if (p === 'ultimate') return null;
    if (p === 'pro') return 10;
    return 1;
}

/** Effective plan (expired paid terms count as Base) with lazy DB write-down. */
export async function getDeveloperPlan(developerId: number): Promise<string> {
    return ensureDeveloperPlanNotExpired(developerId);
}

/** Count of products with `listing_status = live` for this developer, optionally excluding one id (e.g. current row while updating). */
export async function countDeveloperLiveListings(developerId: number, excludeProductId?: number): Promise<number> {
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

export function liveListingLimitErrorMessage(plan: string, maxLive: number, liveCount: number): string {
    const p = plan.toLowerCase();
    if (p === 'base') {
        return `Your Base plan allows only ${maxLive} live application on the marketplace. Move another listing to Draft or upgrade to Pro (up to 10 live) or Ultimate (unlimited) to publish more.`;
    }
    if (p === 'pro') {
        return `Your Pro plan allows up to ${maxLive} live applications (${liveCount} already live). Move one to Draft or upgrade to Ultimate for unlimited live listings.`;
    }
    return `You cannot add another live listing right now (${liveCount} live).`;
}
