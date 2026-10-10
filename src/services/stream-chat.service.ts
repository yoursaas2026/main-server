import { StreamChat } from 'stream-chat';
import { env } from '../config/env.js';

let serverClient: StreamChat | null = null;

export function isStreamChatConfigured(): boolean {
    return Boolean(env.STREAM_API_KEY && env.STREAM_API_SECRET);
}

export function getStreamServerClient(): StreamChat {
    if (!isStreamChatConfigured()) {
        throw new Error('STREAM_API_KEY and STREAM_API_SECRET must be set');
    }
    if (!serverClient) {
        serverClient = StreamChat.getInstance(env.STREAM_API_KEY, env.STREAM_API_SECRET);
    }
    return serverClient;
}

/** Stream user id for marketplace buyers (clients table). */
export function streamClientUserId(clientDbId: number): string {
    return `client_${clientDbId}`;
}

/** Stream user id for sellers (developers table). */
export function streamDeveloperUserId(developerDbId: number): string {
    return `dev_${developerDbId}`;
}

/** Deterministic DM channel id for a buyer ↔ seller pair. */
export function dmChannelId(clientDbId: number, developerDbId: number): string {
    return `dm_c_${clientDbId}_d_${developerDbId}`;
}

export function absoluteMediaUrl(path: string | null | undefined): string | undefined {
    if (!path?.trim()) return undefined;
    const p = path.trim();
    if (p.startsWith('http://') || p.startsWith('https://')) {
        return p;
    }
    const base = env.API_PUBLIC_ORIGIN;
    const normalized = p.replace(/^\/?public\/uploads\//, '/uploads/').replace(/^public\/uploads\//, '/uploads/');
    const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${base}${withSlash}`;
}

export type ParsedStreamParty =
    | { role: 'client'; id: number }
    | { role: 'developer'; id: number };

/** Parse `client_12` / `dev_5` Stream user ids. */
export function parseStreamUserId(streamUserId: string | undefined | null): ParsedStreamParty | null {
    if (!streamUserId) return null;
    const client = /^client_(\d+)$/.exec(streamUserId);
    if (client) return { role: 'client', id: parseInt(client[1], 10) };
    const dev = /^dev_(\d+)$/.exec(streamUserId);
    if (dev) return { role: 'developer', id: parseInt(dev[1], 10) };
    return null;
}

/**
 * Enable Stream unread reminders (default 5 min) and point webhooks at our API.
 * Safe to call on every boot — idempotent settings updates.
 */
export async function ensureStreamUnreadReminders(): Promise<void> {
    if (!isStreamChatConfigured()) return;

    const client = getStreamServerClient();
    const webhookUrl = `${env.API_PUBLIC_ORIGIN}/api/webhooks/stream`;

    try {
        await client.updateChannelType('messaging', {
            reminders: true,
            read_events: true,
        });
    } catch (err) {
        console.error('[Stream] Failed to enable messaging reminders:', err);
    }

    try {
        await client.updateAppSettings({
            reminders_interval: env.STREAM_UNREAD_REMINDER_SECONDS,
            webhook_url: webhookUrl,
            webhook_events: ['user.unread_message_reminder'],
        });
        console.log(
            `[Stream] Unread reminders → ${env.STREAM_UNREAD_REMINDER_SECONDS}s, webhook ${webhookUrl}`,
        );
    } catch (err) {
        console.error('[Stream] Failed to configure unread reminder webhook:', err);
    }
}
