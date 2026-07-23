import { and, eq, inArray, lt, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { developers } from '../db/schema.js';

export type DeveloperPlanId = 'base' | 'pro' | 'ultimate';

export function normalizeDeveloperPlan(plan: string | null | undefined): DeveloperPlanId {
    const p = (plan || 'base').toLowerCase();
    if (p === 'pro' || p === 'ultimate') return p;
    return 'base';
}

/**
 * Paid plans without an end date (legacy rows) stay active.
 * Once `planEndDate` is in the past, entitlements fall back to Base.
 */
export function effectiveDeveloperPlan(
    plan: string | null | undefined,
    planEndDate: Date | string | null | undefined,
    now: Date = new Date()
): DeveloperPlanId {
    const normalized = normalizeDeveloperPlan(plan);
    if (normalized === 'base') return 'base';
    if (!planEndDate) return normalized;
    const end = planEndDate instanceof Date ? planEndDate : new Date(planEndDate);
    if (Number.isNaN(end.getTime())) return normalized;
    if (end.getTime() >= now.getTime()) return normalized;
    return 'base';
}

export function isDeveloperPaidPlanExpired(
    plan: string | null | undefined,
    planEndDate: Date | string | null | undefined,
    now: Date = new Date()
): boolean {
    const normalized = normalizeDeveloperPlan(plan);
    if (normalized === 'base') return false;
    if (!planEndDate) return false;
    const end = planEndDate instanceof Date ? planEndDate : new Date(planEndDate);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() < now.getTime();
}

/** Persist Base when a stored paid plan's term has ended. Returns the effective plan. */
export async function ensureDeveloperPlanNotExpired(developerId: number): Promise<DeveloperPlanId> {
    const [row] = await db
        .select({
            plan: developers.plan,
            planEndDate: developers.planEndDate,
        })
        .from(developers)
        .where(eq(developers.id, developerId))
        .limit(1);

    if (!row) return 'base';

    const effective = effectiveDeveloperPlan(row.plan, row.planEndDate);
    const stored = normalizeDeveloperPlan(row.plan);
    if (effective === 'base' && stored !== 'base') {
        await db
            .update(developers)
            .set({
                plan: 'base',
                updatedAt: new Date(),
            })
            .where(eq(developers.id, developerId));
    }
    return effective;
}

/** Cron: sticky paid plans with a past `plan_end_date` → Base. */
export async function downgradeExpiredDeveloperPlans(now: Date = new Date()): Promise<number> {
    const expired = await db
        .select({ id: developers.id })
        .from(developers)
        .where(and(inArray(developers.plan, ['pro', 'ultimate']), lt(developers.planEndDate, now)));

    if (expired.length === 0) return 0;

    await db
        .update(developers)
        .set({
            plan: 'base',
            updatedAt: now,
        })
        .where(
            and(
                inArray(
                    developers.id,
                    expired.map((r) => r.id)
                ),
                ne(developers.plan, 'base')
            )
        );

    return expired.length;
}
