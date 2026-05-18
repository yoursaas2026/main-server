import { env } from '../config/env.js';
import { contractService } from '../services/contract.service.js';
let intervalHandle = null;
export function startContractJobs() {
    if (intervalHandle)
        return;
    const run = async () => {
        try {
            const n = await contractService.runDueAutoCompletions();
            if (n > 0) {
                console.log(`[ContractJobs] Auto-completed ${n} contract(s) past client decision deadline.`);
            }
        }
        catch (e) {
            console.error('[ContractJobs] Auto-complete run failed:', e);
        }
    };
    void run();
    intervalHandle = setInterval(run, env.CONTRACT_AUTO_COMPLETE_INTERVAL_MS);
    console.log(`[ContractJobs] Auto-complete scheduler started (every ${Math.round(env.CONTRACT_AUTO_COMPLETE_INTERVAL_MS / 1000)}s).`);
}
