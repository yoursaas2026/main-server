import { env } from '../config/env.js';
import { contractService } from '../services/contract.service.js';
import { contractSettlementService } from '../services/contract-settlement.service.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startContractJobs(): void {
    if (intervalHandle) return;

    const run = async () => {
        try {
            const n = await contractService.runDueAutoCompletions();
            if (n > 0) {
                console.log(`[ContractJobs] Auto-completed ${n} contract(s) past client decision deadline.`);
            }
        } catch (e) {
            console.error('[ContractJobs] Auto-complete run failed:', e);
        }

        try {
            const settled = await contractSettlementService.retryPendingSettlements(15);
            if (settled > 0) {
                console.log(`[ContractJobs] Retried Cashfree settlement for ${settled} contract(s).`);
            }
        } catch (e) {
            console.error('[ContractJobs] Settlement retry run failed:', e);
        }
    };

    void run();
    intervalHandle = setInterval(run, env.CONTRACT_AUTO_COMPLETE_INTERVAL_MS);
    console.log(
        `[ContractJobs] Auto-complete + settlement retry scheduler started (every ${Math.round(env.CONTRACT_AUTO_COMPLETE_INTERVAL_MS / 1000)}s). Auto settlement=${env.CONTRACT_AUTO_SETTLEMENT_ENABLED ? 'ON' : 'OFF'}.`
    );
}
