import { z } from 'zod';
import { newsletterService } from '../../services/newsletter.service.js';
const subscribeSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().min(1, 'Last name is required').max(80),
    email: z.string().trim().email('Valid email is required').max(255),
});
export class NewsletterController {
    async subscribe(c) {
        const body = await c.req.json().catch(() => null);
        const parsed = subscribeSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
        }
        const { firstName, lastName, email } = parsed.data;
        const result = await newsletterService.subscribe({ firstName, lastName, email, source: 'footer' });
        if (!result.ok) {
            return c.json({ success: false, error: 'Newsletter signup is temporarily unavailable' }, 503);
        }
        return c.json({
            success: true,
            message: result.alreadySubscribed ? 'You are already subscribed' : 'Subscribed successfully',
        });
    }
    async unsubscribe(c) {
        const token = c.req.query('token')?.trim();
        if (!token) {
            return c.json({ success: false, error: 'Missing unsubscribe token' }, 400);
        }
        const ok = await newsletterService.unsubscribe(token);
        if (!ok) {
            return c.json({ success: false, error: 'Invalid or expired unsubscribe link' }, 404);
        }
        return c.json({ success: true, message: 'You have been unsubscribed' });
    }
}
export const newsletterController = new NewsletterController();
