import { env } from '../config/env.js';
import {
    absoluteMediaUrl,
    dmChannelId,
    getStreamServerClient,
    isStreamChatConfigured,
    streamClientUserId,
    streamDeveloperUserId,
} from './stream-chat.service.js';

export type VideoCallMode = 'audio' | 'video';

export type VideoInitPayload = {
    apiKey: string;
    token: string;
    streamUserId: string;
    user: { id: string; name: string; image: string | null };
    call: { type: string; id: string; members: string[]; mode: VideoCallMode };
    counterparty: { streamUserId: string; name: string; image: string | null };
};

/** Stream Video call type — default "default" works on Stream Video apps. */
export const STREAM_VIDEO_CALL_TYPE = 'default';

export function buildCallId(
    mode: VideoCallMode,
    clientDbId: number,
    developerDbId: number
): string {
    const prefix = mode === 'audio' ? 'ac' : 'vc';
    return `${prefix}_c${clientDbId}_d${developerDbId}_${Date.now().toString(36)}`;
}

export function parseCallModeFromId(callId: string): VideoCallMode {
    return callId.startsWith('ac_') ? 'audio' : 'video';
}

export async function ensureStreamUsers(users: {
    id: string;
    name: string;
    image?: string | null;
}[]) {
    const server = getStreamServerClient();
    await server.upsertUsers(
        users.map((u) => ({
            id: u.id,
            name: u.name,
            image: absoluteMediaUrl(u.image) ?? undefined,
        }))
    );
}

export async function issueVideoToken(streamUserId: string): Promise<string> {
    return getStreamServerClient().createToken(streamUserId);
}

/** Best-effort note in the DM thread when a call starts. */
export async function notifyDmCallStarted(opts: {
    clientDbId: number;
    developerDbId: number;
    callerStreamUserId: string;
    mode: VideoCallMode;
}): Promise<void> {
    if (!isStreamChatConfigured()) return;
    try {
        const server = getStreamServerClient();
        const cid = dmChannelId(opts.clientDbId, opts.developerDbId);
        const channel = server.channel('messaging', cid);
        await channel.create();
        const label = opts.mode === 'audio' ? 'Voice' : 'Video';
        await channel.sendMessage({
            text: `${label} call started — join from the call banner if you missed the ring.`,
            user_id: opts.callerStreamUserId,
        });
    } catch (err) {
        console.warn('[StreamVideo] DM call notify skipped:', err);
    }
}

export function videoApiKey(): string {
    return env.STREAM_API_KEY;
}

export { streamClientUserId, streamDeveloperUserId, absoluteMediaUrl, isStreamChatConfigured };
