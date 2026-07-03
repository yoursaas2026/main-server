/**
 * Baseline a migration that was already applied manually (tables exist, drizzle history missing).
 * Usage: tsx scripts/baseline-migration.ts 0027_far_rictor
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import postgres from 'postgres';
import 'dotenv/config';

const tag = process.argv[2] ?? '0027_far_rictor';
const migrationsFolder = './drizzle';
const journalPath = `${migrationsFolder}/meta/_journal.json`;

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
}

const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
};

const entry = journal.entries.find((e) => e.tag === tag);
if (!entry) {
    throw new Error(`Migration tag not found in journal: ${tag}`);
}

const sqlPath = `${migrationsFolder}/${tag}.sql`;
const query = fs.readFileSync(sqlPath, 'utf8');
const hash = crypto.createHash('sha256').update(query).digest('hex');

const sql = postgres(process.env.DATABASE_URL);

try {
    const existing = await sql<{ hash: string }[]>`
        SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;

    if (existing.length > 0) {
        console.log(`✅ Migration ${tag} is already recorded (hash: ${hash.slice(0, 12)}…)`);
        process.exit(0);
    }

    const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'marketing_lists',
            'marketing_users',
            'marketing_subscribers',
            'marketing_templates',
            'marketing_campaigns',
            'marketing_campaign_sends'
          )
    `;

    if (tables.length < 6) {
        console.error(
            `❌ Expected 6 marketing tables in DB, found ${tables.length}. Run npm run db:migrate instead of baselining.`,
        );
        process.exit(1);
    }

    await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
    `;

    console.log(`✅ Baselined ${tag}`);
    console.log(`   hash: ${hash}`);
    console.log(`   created_at: ${entry.when}`);
} finally {
    await sql.end();
}
