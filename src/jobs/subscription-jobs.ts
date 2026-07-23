import { env } from '../config/env.js';
import { downgradeExpiredDeveloperPlans } from '../utils/developer-plan.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startSubscriptionJobs(): void {
    if (intervalHandle) return;

    const run = async () => {
        try {
            const n = await downgradeExpiredDeveloperPlans();
            if (n > 0) {
                console.log(`[SubscriptionJobs] Downgraded ${n} expired paid plan(s) to Base.`);
            }
        } catch (e) {
            console.error('[SubscriptionJobs] Expiry sweep failed:', e);
        }
    };

    void run();
    intervalHandle = setInterval(run, env.SUBSCRIPTION_EXPIRY_INTERVAL_MS);
    console.log(
        `[SubscriptionJobs] Plan expiry scheduler started (every ${Math.round(env.SUBSCRIPTION_EXPIRY_INTERVAL_MS / 1000)}s).`
    );
}
