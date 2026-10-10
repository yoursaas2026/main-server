import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { clients, contracts, developerProducts, developers, productReviews } from '../../db/schema.js';
import type { JWTPayload } from '../../utils/jwt.js';
import {
    STREAM_VIDEO_CALL_TYPE,
    absoluteMediaUrl,
    buildCallId,
    ensureStreamUsers,
    isStreamChatConfigured,
    issueVideoToken,
    notifyDmCallStarted,
    streamClientUserId,
    streamDeveloperUserId,
    videoApiKey,
    type VideoCallMode,
    type VideoInitPayload,
} from '../../services/stream-video.service.js';

const initiateSchema = z.object({
    clientId: z.number().int().positive(),
    mode: z.enum(['audio', 'video']).optional().default('video'),
});

function notConfigured(c: Context) {
    return c.json(
        { success: false, error: 'Video is not configured on the server (missing Stream keys).' },
        503
    );
}

export class DeveloperVideoController {
    async initiate(c: Context) {
        if (!isStreamChatConfigured()) return notConfigured(c);

        const jwtUser = c.get('user') as JWTPayload | undefined;
        if (!jwtUser || jwtUser.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json().catch(() => null);
        const parsed = initiateSchema.safeParse(body);
        if (!parsed.success) {
            return c.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
                400
            );
        }

        const { clientId, mode } = parsed.data as { clientId: number; mode: VideoCallMode };

        try {
            const [developer] = await db
                .select({
                    id: developers.id,
                    name: developers.name,
                    profilePicture: developers.profilePicture,
                })
                .from(developers)
                .where(eq(developers.id, jwtUser.id))
                .limit(1);
            if (!developer) return c.json({ success: false, error: 'Developer not found' }, 404);

            const [client] = await db
                .select({
                    id: clients.id,
                    name: clients.name,
                    profilePicture: clients.profilePicture,
                })
                .from(clients)
                .where(eq(clients.id, clientId))
                .limit(1);
            if (!client) return c.json({ success: false, error: 'Buyer not found' }, 404);

            const [reviewLink] = await db
                .select({ id: productReviews.id })
                .from(productReviews)
                .innerJoin(developerProducts, eq(productReviews.productId, developerProducts.id))
                .where(
                    and(
                        eq(developerProducts.developerId, developer.id),
                        eq(productReviews.clientId, clientId)
                    )
                )
                .limit(1);

            const [contractLink] = await db
                .select({ id: contracts.id })
                .from(contracts)
                .where(and(eq(contracts.developerId, developer.id), eq(contracts.clientId, clientId)))
                .limit(1);

            if (!reviewLink && !contractLink) {
                return c.json(
                    {
                        success: false,
                        error: 'You can only call buyers you have a contract or review relationship with.',
                    },
                    403
                );
            }

            const callerSid = streamDeveloperUserId(developer.id);
            const calleeSid = streamClientUserId(client.id);

            await ensureStreamUsers([
                {
                    id: callerSid,
                    name: developer.name || 'Seller',
                    image: developer.profilePicture,
                },
                {
                    id: calleeSid,
                    name: client.name || 'Buyer',
                    image: client.profilePicture,
                },
            ]);

            const token = await issueVideoToken(callerSid);
            const callId = buildCallId(mode, client.id, developer.id);

            void notifyDmCallStarted({
                clientDbId: client.id,
                developerDbId: developer.id,
                callerStreamUserId: callerSid,
                mode,
            });

            const data: VideoInitPayload = {
                apiKey: videoApiKey(),
                token,
                streamUserId: callerSid,
                user: {
                    id: callerSid,
                    name: developer.name || 'Seller',
                    image: absoluteMediaUrl(developer.profilePicture) ?? null,
                },
                call: {
                    type: STREAM_VIDEO_CALL_TYPE,
                    id: callId,
                    members: [callerSid, calleeSid],
                    mode,
                },
                counterparty: {
                    streamUserId: calleeSid,
                    name: client.name || 'Buyer',
                    image: absoluteMediaUrl(client.profilePicture) ?? null,
                },
            };

            return c.json({ success: true, data });
        } catch (err) {
            console.error('[DeveloperVideo] initiate error:', err);
            return c.json({ success: false, error: 'Failed to initiate video call' }, 500);
        }
    }
}

export const developerVideoController = new DeveloperVideoController();
