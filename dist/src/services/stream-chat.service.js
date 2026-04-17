import { StreamChat } from 'stream-chat';
import { env } from '../config/env.js';
let serverClient = null;
export function isStreamChatConfigured() {
    return Boolean(env.STREAM_API_KEY && env.STREAM_API_SECRET);
}
export function getStreamServerClient() {
    if (!isStreamChatConfigured()) {
        throw new Error('STREAM_API_KEY and STREAM_API_SECRET must be set');
    }
    if (!serverClient) {
        serverClient = StreamChat.getInstance(env.STREAM_API_KEY, env.STREAM_API_SECRET);
    }
    return serverClient;
}
/** Stream user id for marketplace buyers (clients table). */
export function streamClientUserId(clientDbId) {
    return `client_${clientDbId}`;
}
/** Stream user id for sellers (developers table). */
export function streamDeveloperUserId(developerDbId) {
    return `dev_${developerDbId}`;
}
/** Deterministic DM channel id for a buyer ↔ seller pair. */
export function dmChannelId(clientDbId, developerDbId) {
    return `dm_c_${clientDbId}_d_${developerDbId}`;
}
export function absoluteMediaUrl(path) {
    if (!path?.trim())
        return undefined;
    const p = path.trim();
    if (p.startsWith('http://') || p.startsWith('https://')) {
        return p;
    }
    const base = env.API_PUBLIC_ORIGIN;
    const normalized = p.replace(/^\/?public\/uploads\//, '/uploads/').replace(/^public\/uploads\//, '/uploads/');
    const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${base}${withSlash}`;
}
