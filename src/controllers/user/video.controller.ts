import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { clients, developers } from '../../db/schema.js';
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
    developerId: z.number().int().positive(),
    mode: z.enum(['audio', 'video']).optional().default('video'),
});

function notConfigured(c: Context) {
    return c.json(
        { success: false, error: 'Video is not configured on the server (missing Stream keys).' },
        503
    );
}

export class UserVideoController {
    async initiate(c: Context) {
        if (!isStreamChatConfigured()) return notConfigured(c);

        const jwtUser = c.get('user') as JWTPayload | undefined;
        if (!jwtUser || jwtUser.role !== 'client') {
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

        const { developerId, mode } = parsed.data as { developerId: number; mode: VideoCallMode };

        try {
            const [client] = await db
                .select({
                    id: clients.id,
                    name: clients.name,
                    profilePicture: clients.profilePicture,
                })
                .from(clients)
                .where(eq(clients.id, jwtUser.id))
                .limit(1);
            if (!client) return c.json({ success: false, error: 'Buyer not found' }, 404);

            const [developer] = await db
                .select({
                    id: developers.id,
                    name: developers.name,
                    profilePicture: developers.profilePicture,
                    status: developers.status,
                })
                .from(developers)
                .where(eq(developers.id, developerId))
                .limit(1);
            if (!developer) return c.json({ success: false, error: 'Seller not found' }, 404);
            if ((developer.status || '').toLowerCase() === 'blocked') {
                return c.json({ success: false, error: 'This seller is not available for calls' }, 403);
            }

            const callerSid = streamClientUserId(client.id);
            const calleeSid = streamDeveloperUserId(developer.id);

            await ensureStreamUsers([
                {
                    id: callerSid,
                    name: client.name || 'Buyer',
                    image: client.profilePicture,
                },
                {
                    id: calleeSid,
                    name: developer.name || 'Seller',
                    image: developer.profilePicture,
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
                    name: client.name || 'Buyer',
                    image: absoluteMediaUrl(client.profilePicture) ?? null,
                },
                call: {
                    type: STREAM_VIDEO_CALL_TYPE,
                    id: callId,
                    members: [callerSid, calleeSid],
                    mode,
                },
                counterparty: {
                    streamUserId: calleeSid,
                    name: developer.name || 'Seller',
                    image: absoluteMediaUrl(developer.profilePicture) ?? null,
                },
            };

            return c.json({ success: true, data });
        } catch (err) {
            console.error('[UserVideo] initiate error:', err);
            return c.json({ success: false, error: 'Failed to initiate video call' }, 500);
        }
    }
}

export const userVideoController = new UserVideoController();
