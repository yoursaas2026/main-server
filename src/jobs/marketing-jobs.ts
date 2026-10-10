import { and, eq, lte } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { marketingCampaigns } from '../db/schema.js';
import { campaignService } from '../services/campaign.service.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function dispatchDueCampaigns(): Promise<number> {
    const now = new Date();
    const due = await db
        .select({ id: marketingCampaigns.id })
        .from(marketingCampaigns)
        .where(
            and(
                eq(marketingCampaigns.status, 'scheduled'),
                lte(marketingCampaigns.scheduledAt, now),
            ),
        )
        .limit(20);

    for (const row of due) {
        campaignService.sendCampaignAsync(row.id);
    }
    return due.length;
}

export function startMarketingJobs(): void {
    if (intervalHandle) return;

    const run = async () => {
        try {
            const n = await dispatchDueCampaigns();
            if (n > 0) {
                console.log(`[MarketingJobs] Dispatched ${n} due scheduled campaign(s).`);
            }
        } catch (e) {
            console.error('[MarketingJobs] Schedule sweep failed:', e);
        }
    };

    void run();
    intervalHandle = setInterval(run, env.MARKETING_SCHEDULE_INTERVAL_MS);
    console.log(
        `[MarketingJobs] Campaign schedule scheduler started (every ${Math.round(env.MARKETING_SCHEDULE_INTERVAL_MS / 1000)}s).`,
    );
}
