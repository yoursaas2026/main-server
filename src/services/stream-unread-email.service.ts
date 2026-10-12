import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { clients, developers } from '../db/schema.js';
import { notificationService } from './notification.service.js';
import { parseStreamUserId } from './stream-chat.service.js';
import { parseClientNotificationPrefs } from '../utils/client-notification-prefs.js';

type ReminderChannelPayload = {
    channel?: {
        id?: string;
        cid?: string;
        members?: Array<{ user_id?: string; user?: { id?: string; name?: string } }>;
        created_by?: { id?: string; name?: string };
    };
    messages?: Array<{ text?: string; user?: { id?: string; name?: string }; type?: string }>;
};

type UnreadReminderEvent = {
    type?: string;
    user?: { id?: string; name?: string };
    channels?: Record<string, ReminderChannelPayload>;
};

function truncatePreview(text: string, max = 160): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'You have a new message on YourSaaS.';
    return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function pickPreview(channels: ReminderChannelPayload[]): {
    preview: string;
    fromName: string;
    fromStreamId: string | null;
} {
    for (const entry of channels) {
        const msgs = entry.messages || [];
        for (const msg of msgs) {
            if (msg.type && msg.type !== 'regular' && msg.type !== 'system') continue;
            const text = (msg.text || '').trim();
            if (!text) continue;
            return {
                preview: truncatePreview(text),
                fromName: msg.user?.name || 'Someone',
                fromStreamId: msg.user?.id || null,
            };
        }
    }
    return { preview: 'You have a new message on YourSaaS.', fromName: 'Someone', fromStreamId: null };
}

function counterpartyName(
    recipientStreamId: string,
    channels: ReminderChannelPayload[],
    fallback: string,
): string {
    for (const entry of channels) {
        const members = entry.channel?.members || [];
        for (const m of members) {
            const id = m.user_id || m.user?.id;
            if (id && id !== recipientStreamId) {
                return m.user?.name || fallback;
            }
        }
    }
    return fallback;
}

/**
 * Handle Stream `user.unread_message_reminder` — email buyer/seller via Mailu SMTP.
 */
export async function handleUnreadMessageReminder(event: UnreadReminderEvent): Promise<{ emailed: boolean }> {
    const recipientStreamId = event.user?.id;
    const party = parseStreamUserId(recipientStreamId);
    if (!party || !recipientStreamId) {
        console.warn('[StreamUnread] reminder for unknown user id:', recipientStreamId);
        return { emailed: false };
    }

    const channelEntries = Object.values(event.channels || {});
    if (channelEntries.length === 0) {
        return { emailed: false };
    }

    const { preview, fromName: msgFrom, fromStreamId } = pickPreview(channelEntries);
    const fromName =
        fromStreamId && fromStreamId !== recipientStreamId
            ? msgFrom
            : counterpartyName(recipientStreamId, channelEntries, msgFrom);

    if (party.role === 'client') {
        const [row] = await db
            .select({
                id: clients.id,
                email: clients.email,
                name: clients.name,
                notificationPrefs: clients.notificationPrefs,
            })
            .from(clients)
            .where(eq(clients.id, party.id))
            .limit(1);
        if (!row?.email) return { emailed: false };

        const prefs = parseClientNotificationPrefs(row.notificationPrefs);
        if (!prefs.emailUnreadDm) {
            return { emailed: false };
        }

        const inboxUrl = `${env.USER_PORTAL_URL.replace(/\/$/, '')}/dashboard/messages`;
        notificationService.sendUnreadMessageEmail({
            email: row.email,
            name: row.name || 'there',
            fromName,
            preview,
            inboxUrl,
            role: 'buyer',
        });
        return { emailed: true };
    }

    const [row] = await db
        .select({ id: developers.id, email: developers.email, name: developers.name })
        .from(developers)
        .where(eq(developers.id, party.id))
        .limit(1);
    if (!row?.email) return { emailed: false };

    const inboxUrl = `${env.DEVELOPER_PORTAL_URL.replace(/\/$/, '')}/dashboard/inbox`;
    notificationService.sendUnreadMessageEmail({
        email: row.email,
        name: row.name || 'there',
        fromName,
        preview,
        inboxUrl,
        role: 'seller',
    });
    return { emailed: true };
}
