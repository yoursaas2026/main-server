/**
 * Reindex all live listings into Qdrant.
 * Usage: npx tsx scripts/reindex-listings.ts
 *
 * Requires: OPENAI_API_KEY, QDRANT_URL (local Docker or Qdrant Cloud), DISCOVERY_VECTOR_ENABLED=true
 *
 * Free Qdrant Cloud clusters suspend after ~1 week idle — resume in the Cloud console first,
 * wait ~30–60s, then run this script.
 */
import { config } from 'dotenv';
config();

import { reindexAllLiveListings, indexingAvailable } from '../src/services/discovery/listing-indexer.js';
import { pingQdrant } from '../src/services/discovery/vector-store.js';

async function waitForQdrant(attempts = 8, delayMs = 5000): Promise<boolean> {
    for (let i = 1; i <= attempts; i++) {
        const ping = await pingQdrant();
        if (ping.ok) {
            console.log('Qdrant reachable.');
            return true;
        }
        console.warn(
            `[Discovery] Qdrant not reachable (attempt ${i}/${attempts}): ${ping.error || 'unknown'}`
        );
        if (i < attempts) {
            console.log(
                'If this is a free Cloud cluster, open https://cloud.qdrant.io → Resume the cluster, then wait…'
            );
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    return false;
}

async function main() {
    if (!indexingAvailable()) {
        console.error(
            'Vector indexing unavailable. Set OPENAI_API_KEY, QDRANT_URL, and DISCOVERY_VECTOR_ENABLED=true'
        );
        process.exit(1);
    }

    console.log('Checking Qdrant…');
    const ready = await waitForQdrant();
    if (!ready) {
        console.error(`
Could not connect to Qdrant (ECONNRESET usually means the cluster is suspended/asleep).

Fix:
  1. Open https://cloud.qdrant.io and sign in
  2. Select your cluster → click Resume / Start (free tier sleeps after ~1 week idle)
  3. Wait until status is Healthy (~30–60s)
  4. Confirm QDRANT_URL + QDRANT_API_KEY in .env match this cluster
  5. Re-run: npm run discovery:reindex

Until Qdrant is up, search still works in keyword/category fallback mode.
`);
        process.exit(1);
    }

    console.log('Reindexing live listings…');
    const result = await reindexAllLiveListings();
    console.log(`Done. indexed=${result.indexed} failed=${result.failed}`);
    process.exit(result.failed > 0 ? 2 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
