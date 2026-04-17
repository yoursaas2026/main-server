import { and, eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { clients, developerProducts, developers, productReviews } from '../../db/schema.js';
import { absoluteMediaUrl, dmChannelId, getStreamServerClient, isStreamChatConfigured, streamClientUserId, streamDeveloperUserId, } from '../../services/stream-chat.service.js';
function notConfigured(c) {
    return c.json({ success: false, error: 'Chat is not configured on the server (missing Stream keys).' }, 503);
}
export class DeveloperChatController {
    async getToken(c) {
        if (!isStreamChatConfigured())
            return notConfigured(c);
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
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
            if (!developer) {
                return c.json({ success: false, error: 'Developer not found' }, 404);
            }
            const streamUserId = streamDeveloperUserId(developer.id);
            const server = getStreamServerClient();
            await server.upsertUsers([
                {
                    id: streamUserId,
                    name: developer.name || 'Seller',
                    image: absoluteMediaUrl(developer.profilePicture),
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
                        name: developer.name || 'Seller',
                        image: absoluteMediaUrl(developer.profilePicture) ?? null,
                    },
                },
            });
        }
        catch (err) {
            console.error('[DeveloperChat] getToken error:', err);
            return c.json({ success: false, error: 'Failed to issue chat token' }, 500);
        }
    }
    /**
     * Open (or reuse) a DM with a buyer. Allowed only if the buyer has reviewed at least one of this developer's products
     * (reduces unsolicited spam while still supporting post-purchase conversations).
     * Body: { clientId: number }
     */
    async postThread(c) {
        if (!isStreamChatConfigured())
            return notConfigured(c);
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        const body = await c.req.json().catch(() => null);
        const clientId = Number(body?.clientId);
        if (!Number.isInteger(clientId) || clientId < 1) {
            return c.json({ success: false, error: 'Invalid clientId' }, 400);
        }
        try {
            const [link] = await db
                .select({ id: productReviews.id })
                .from(productReviews)
                .innerJoin(developerProducts, eq(productReviews.productId, developerProducts.id))
                .where(and(eq(productReviews.clientId, clientId), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);
            if (!link) {
                return c.json({
                    success: false,
                    error: 'You can only message buyers who have left a review on one of your listings.',
                }, 403);
            }
            const [developer] = await db
                .select({
                id: developers.id,
                name: developers.name,
                profilePicture: developers.profilePicture,
                status: developers.status,
            })
                .from(developers)
                .where(eq(developers.id, jwtUser.id))
                .limit(1);
            if (!developer || developer.status !== 'active') {
                return c.json({ success: false, error: 'Account unavailable' }, 403);
            }
            const [client] = await db
                .select({
                id: clients.id,
                name: clients.name,
                profilePicture: clients.profilePicture,
            })
                .from(clients)
                .where(eq(clients.id, clientId))
                .limit(1);
            if (!client) {
                return c.json({ success: false, error: 'Buyer not found' }, 404);
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
                    created_by_id: devSid,
                });
                await channel.create();
            }
            const token = server.createToken(devSid);
            return c.json({
                success: true,
                data: {
                    apiKey: env.STREAM_API_KEY,
                    token,
                    streamUserId: devSid,
                    user: {
                        id: devSid,
                        name: developer.name || 'Seller',
                        image: absoluteMediaUrl(developer.profilePicture) ?? null,
                    },
                    channelType: 'messaging',
                    channelId,
                    counterparty: {
                        streamUserId: clientSid,
                        name: client.name || 'Buyer',
                        image: absoluteMediaUrl(client.profilePicture) ?? null,
                    },
                },
            });
        }
        catch (err) {
            console.error('[DeveloperChat] postThread error:', err);
            return c.json({ success: false, error: 'Failed to open chat thread' }, 500);
        }
    }
}
export const developerChatController = new DeveloperChatController();
