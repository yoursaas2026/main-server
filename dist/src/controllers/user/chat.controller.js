import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { clients, developers } from '../../db/schema.js';
import { absoluteMediaUrl, dmChannelId, getStreamServerClient, isStreamChatConfigured, streamClientUserId, streamDeveloperUserId, } from '../../services/stream-chat.service.js';
function notConfigured(c) {
    return c.json({ success: false, error: 'Chat is not configured on the server (missing Stream keys).' }, 503);
}
export class UserChatController {
    /** Issue a Stream token for the logged-in buyer and sync their profile to Stream. */
    async getToken(c) {
        if (!isStreamChatConfigured())
            return notConfigured(c);
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
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
            if (!client) {
                return c.json({ success: false, error: 'User not found' }, 404);
            }
            const streamUserId = streamClientUserId(client.id);
            const server = getStreamServerClient();
            await server.upsertUsers([
                {
                    id: streamUserId,
                    name: client.name || 'Buyer',
                    image: absoluteMediaUrl(client.profilePicture),
                },
            ]);
            const token = server.createToken(streamUserId);
            return c.json({
                success: true,
                data: {
                    apiKey: env.STREAM_API_KEY,
                    token,
                    streamUserId,
                    user: {
                        id: streamUserId,
                        name: client.name || 'Buyer',
                        image: absoluteMediaUrl(client.profilePicture) ?? null,
                    },
                },
            });
        }
        catch (err) {
            console.error('[UserChat] getToken error:', err);
            return c.json({ success: false, error: 'Failed to issue chat token' }, 500);
        }
    }
    /**
     * Create (or reuse) a 1:1 channel between the buyer and a seller, then return connection + channel info.
     * Body: { developerId: number }
     */
    async postThread(c) {
        if (!isStreamChatConfigured())
            return notConfigured(c);
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        const body = await c.req.json().catch(() => null);
        const developerId = Number(body?.developerId);
        if (!Number.isInteger(developerId) || developerId < 1) {
            return c.json({ success: false, error: 'Invalid developerId' }, 400);
        }
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
            if (!client) {
                return c.json({ success: false, error: 'User not found' }, 404);
            }
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
            if (!developer || developer.status !== 'active') {
                return c.json({ success: false, error: 'Seller not found or unavailable' }, 404);
            }
            const clientSid = streamClientUserId(client.id);
            const devSid = streamDeveloperUserId(developer.id);
            const channelId = dmChannelId(client.id, developer.id);
            const server = getStreamServerClient();
            await server.upsertUsers([
                {
                    id: clientSid,
                    name: client.name || 'Buyer',
                    image: absoluteMediaUrl(client.profilePicture),
                },
                {
                    id: devSid,
                    name: developer.name || 'Seller',
                    image: absoluteMediaUrl(developer.profilePicture),
                },
            ]);
            const existing = await server.queryChannels({ type: 'messaging', id: channelId }, {}, { limit: 1 });
            if (!existing.length) {
                const channel = server.channel('messaging', channelId, {
                    members: [clientSid, devSid],
                    created_by_id: clientSid,
                });
                await channel.create();
            }
            const token = server.createToken(clientSid);
            return c.json({
                success: true,
                data: {
                    apiKey: env.STREAM_API_KEY,
                    token,
                    streamUserId: clientSid,
                    user: {
                        id: clientSid,
                        name: client.name || 'Buyer',
                        image: absoluteMediaUrl(client.profilePicture) ?? null,
                    },
                    channelType: 'messaging',
                    channelId,
                    counterparty: {
                        streamUserId: devSid,
                        name: developer.name || 'Seller',
                        image: absoluteMediaUrl(developer.profilePicture) ?? null,
                    },
                },
            });
        }
        catch (err) {
            console.error('[UserChat] postThread error:', err);
            return c.json({ success: false, error: 'Failed to open chat thread' }, 500);
        }
    }
}
export const userChatController = new UserChatController();
