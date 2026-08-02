/**
 * Reindex all live listings into Qdrant.
 * Usage: npx tsx scripts/reindex-listings.ts
 * Requires: OPENAI_API_KEY, Qdrant running (docker compose -f docker-compose.qdrant.yml up -d)
 */
import { config } from 'dotenv';
config();
import { reindexAllLiveListings, indexingAvailable } from '../src/services/discovery/listing-indexer.js';
async function main() {
    if (!indexingAvailable()) {
        console.error('Vector indexing unavailable. Set OPENAI_API_KEY, QDRANT_URL, and DISCOVERY_VECTOR_ENABLED=true');
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
