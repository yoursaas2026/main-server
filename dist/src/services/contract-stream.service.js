import { getStreamServerClient, isStreamChatConfigured, dmChannelId } from './stream-chat.service.js';
const BOT_ID = 'yoursaas_contract_bot';
/** Post a system-style line into the buyer–seller DM so both see contract state changes. */
export async function notifyContractParties(clientId, developerId, message) {
    if (!isStreamChatConfigured())
        return;
    try {
        const server = getStreamServerClient();
        await server.upsertUsers([
            {
                id: BOT_ID,
                name: 'YourSaaS Contracts',
                image: undefined,
            },
        ]);
        const channelId = dmChannelId(clientId, developerId);
        const channel = server.channel('messaging', channelId);
        const existing = await server.queryChannels({ type: 'messaging', id: channelId }, {}, { limit: 1 });
        if (!existing.length)
            return;
        await channel.addMembers([BOT_ID]);
        await channel.sendMessage({
            text: message,
            user: { id: BOT_ID },
        });
    }
    catch (e) {
        console.warn('[ContractStream] notify failed (non-fatal):', e);
    }
}
