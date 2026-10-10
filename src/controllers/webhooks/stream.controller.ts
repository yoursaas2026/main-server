import type { Context } from 'hono';
import { getStreamServerClient, isStreamChatConfigured } from '../../services/stream-chat.service.js';
import { handleUnreadMessageReminder } from '../../services/stream-unread-email.service.js';

export class StreamWebhookController {
    /**
     * GetStream Chat webhook — verifies HMAC signature, emails on unread reminders.
     * Configure in Stream dashboard or via ensureStreamUnreadReminders() on boot.
     */
    async handle(c: Context) {
        if (!isStreamChatConfigured()) {
            return c.json({ error: 'Stream not configured' }, 503);
        }

        const rawBody = await c.req.text();
        const signature =
            c.req.header('x-signature') || c.req.header('X-Signature') || '';

        const server = getStreamServerClient();
        if (!signature || !server.verifyWebhook(rawBody, signature)) {
            console.warn('[StreamWebhook] invalid or missing signature');
            return c.json({ error: 'Invalid signature' }, 401);
        }

        let event: { type?: string; [key: string]: unknown };
        try {
            event = JSON.parse(rawBody) as { type?: string };
        } catch {
            return c.json({ error: 'Invalid JSON' }, 400);
        }

        try {
            if (event.type === 'user.unread_message_reminder') {
                const result = await handleUnreadMessageReminder(event as Parameters<
                    typeof handleUnreadMessageReminder
                >[0]);
                return c.json({ success: true, handled: event.type, ...result });
            }

            // Acknowledge other events quickly so Stream does not retry.
            return c.json({ success: true, handled: false, type: event.type || null });
        } catch (err) {
            console.error('[StreamWebhook] handler error:', err);
            return c.json({ error: 'Failed to process webhook' }, 500);
        }
    }
}

export const streamWebhookController = new StreamWebhookController();
