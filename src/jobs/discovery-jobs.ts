import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { clients } from '../db/schema.js';
import {
    decayLearnedWeights,
    parseInterestProfile,
    serializeInterestProfile,
} from '../services/discovery/interest-profile.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastWeeklyRunDay = '';

/**
 * Weekly soft-decay of learned interest tags (×0.95). Runs at most once per calendar day
 * when the scheduler ticks on/after the configured weekday (default Sunday UTC).
 */
export async function runWeeklyInterestDecay(factor = 0.95): Promise<number> {
    const rows = await db
        .select({ id: clients.id, interestProfile: clients.interestProfile })
        .from(clients)
        .where(and(isNotNull(clients.interestProfile), ne(clients.interestProfile, '')));

    let updated = 0;
    for (const row of rows) {
        const profile = parseInterestProfile(row.interestProfile);
        if (Object.keys(profile.learned).length === 0) continue;
        const next = decayLearnedWeights(profile, factor);
        if (JSON.stringify(next.learned) === JSON.stringify(profile.learned)) continue;
        await db
            .update(clients)
            .set({
                interestProfile: serializeInterestProfile(next),
                updatedAt: new Date(),
            })
            .where(eq(clients.id, row.id));
        updated++;
    }
    return updated;
}

export function startDiscoveryJobs(): void {
    if (intervalHandle) return;

    const weekday = Math.min(6, Math.max(0, parseInt(process.env.DISCOVERY_DECAY_WEEKDAY_UTC || '0', 10))); // 0=Sun
    const checkMs = Math.max(
        60_000,
        parseInt(process.env.DISCOVERY_DECAY_CHECK_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10),
    );

    const tick = async () => {
        const now = new Date();
        const dayKey = now.toISOString().slice(0, 10);
        if (now.getUTCDay() !== weekday) return;
        if (lastWeeklyRunDay === dayKey) return;

        try {
            const n = await runWeeklyInterestDecay(0.95);
            lastWeeklyRunDay = dayKey;
            console.log(`[DiscoveryJobs] Weekly learned decay updated ${n} buyer profile(s).`);
        } catch (e) {
            console.error('[DiscoveryJobs] Weekly decay failed:', e);
        }
    };

    void tick();
    intervalHandle = setInterval(tick, checkMs);
    console.log(
        `[DiscoveryJobs] Interest decay scheduler started (UTC weekday=${weekday}, check every ${Math.round(checkMs / 60000)}m).`,
    );
}
