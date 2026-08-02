/**
 * One-time backfill: rebuild interest_profile.base for all clients that have
 * questionnaire data but an empty interest base (pre-discovery buyers).
 *
 * Usage: npx tsx scripts/backfill-interest-profiles.ts
 */
import { config } from 'dotenv';
config();

import { db } from '../src/db/index.js';
import { clients } from '../src/db/schema.js';
import { parseInterestProfile } from '../src/services/discovery/interest-profile.js';
import { refreshClientInterestProfile } from '../src/services/discovery/rebuild-profile.js';

async function main() {
    const rows = await db.select({ id: clients.id, interestProfile: clients.interestProfile }).from(clients);
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const parsed = parseInterestProfile(row.interestProfile);
        if (Object.keys(parsed.base).length > 0) {
            skipped += 1;
            continue;
        }
        await refreshClientInterestProfile(row.id);
        updated += 1;
        console.log(`Rebuilt interest profile for client ${row.id}`);
    }

    console.log(`Done. updated=${updated} skipped=${skipped} total=${rows.length}`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
