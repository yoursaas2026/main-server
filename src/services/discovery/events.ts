import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clientListingEvents } from '../../db/schema.js';
import { applyEventToInterestProfile } from './profile-learner.js';
import { DISCOVERY_EVENT_TYPES, type DiscoveryEventType } from './weights.js';

export type TrackDiscoveryInput = {
    clientId: number;
    productId: number;
    eventType: DiscoveryEventType;
    surface?: string | null;
    queryId?: string | null;
    sessionId?: string | null;
    meta?: Record<string, unknown> | null;
};

export function isDiscoveryEventType(value: unknown): value is DiscoveryEventType {
    return typeof value === 'string' && (DISCOVERY_EVENT_TYPES as readonly string[]).includes(value);
}

/** Dedupe identical view within the same session (or 6h window). */
async function shouldSkipDuplicateView(
    clientId: number,
    productId: number,
    sessionId?: string | null
): Promise<boolean> {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const rows = await db
        .select({
            id: clientListingEvents.id,
            sessionId: clientListingEvents.sessionId,
            createdAt: clientListingEvents.createdAt,
        })
        .from(clientListingEvents)
        .where(
            and(
                eq(clientListingEvents.clientId, clientId),
                eq(clientListingEvents.productId, productId),
                eq(clientListingEvents.eventType, 'view'),
                gte(clientListingEvents.createdAt, since)
            )
        )
        .orderBy(desc(clientListingEvents.createdAt))
        .limit(5);

    if (rows.length === 0) return false;
    if (sessionId) {
        return rows.some((r) => r.sessionId && r.sessionId === sessionId);
    }
    // No session: skip if viewed in last 30 minutes
    const recent = rows[0]?.createdAt;
    if (!recent) return false;
    return Date.now() - recent.getTime() < 30 * 60 * 1000;
}

export async function trackDiscoveryEvent(input: TrackDiscoveryInput): Promise<{ recorded: boolean }> {
    if (input.eventType === 'view') {
        const skip = await shouldSkipDuplicateView(input.clientId, input.productId, input.sessionId);
        if (skip) return { recorded: false };
    }

    await db.insert(clientListingEvents).values({
        clientId: input.clientId,
        productId: input.productId,
        eventType: input.eventType,
        surface: input.surface?.slice(0, 40) || null,
        queryId: input.queryId?.slice(0, 64) || null,
        sessionId: input.sessionId?.slice(0, 64) || null,
        meta: input.meta ? JSON.stringify(input.meta) : null,
    });

    // Fire-and-forget learning; don't fail the track call if learner errors
    try {
        await applyEventToInterestProfile(input.clientId, input.productId, input.eventType);
    } catch (e) {
        console.error('[Discovery] profile learner failed:', e);
    }

    return { recorded: true };
}
