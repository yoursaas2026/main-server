import {
    dmChannelId,
    getStreamServerClient,
    isStreamChatConfigured,
    streamClientUserId,
    streamDeveloperUserId,
} from './stream-chat.service.js';

const BOT_ID = 'yoursaas_contract_bot';

/**
 * Post a system-style line into the buyer–seller DM so both see contract state changes.
 * Creates the messaging channel if it does not exist yet (early lifecycle used to skip silently).
 */
export async function notifyContractParties(
    clientId: number,
    developerId: number,
    message: string,
): Promise<void> {
    if (!isStreamChatConfigured()) return;
    try {
        const server = getStreamServerClient();
        const clientSid = streamClientUserId(clientId);
        const devSid = streamDeveloperUserId(developerId);
        const channelId = dmChannelId(clientId, developerId);

        await server.upsertUsers([
            { id: BOT_ID, name: 'YourSaaS Contracts' },
            { id: clientSid, name: 'Buyer' },
            { id: devSid, name: 'Seller' },
        ]);

        const existing = await server.queryChannels({ type: 'messaging', id: channelId }, {}, { limit: 1 });
        if (!existing.length) {
            const channel = server.channel('messaging', channelId, {
                members: [clientSid, devSid, BOT_ID],
                created_by_id: BOT_ID,
            });
            await channel.create();
            await channel.sendMessage({
                text: message,
                user: { id: BOT_ID },
            });
            return;
        }

        const channel = server.channel('messaging', channelId);
        await channel.addMembers([BOT_ID]).catch(() => undefined);
        await channel.sendMessage({
            text: message,
            user: { id: BOT_ID },
        });
    } catch (e) {
        console.warn('[ContractStream] notify failed (non-fatal):', e);
    }
}
