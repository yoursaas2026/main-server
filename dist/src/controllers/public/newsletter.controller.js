import { z } from 'zod';
import { emailService } from '../../services/email.service.js';
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
        try {
            const ok = await emailService.subscribeToNewsletter({ firstName, lastName, email });
            if (!ok) {
                return c.json({ success: false, error: 'Newsletter signup is temporarily unavailable' }, 503);
            }
            return c.json({ success: true, message: 'Subscribed successfully' });
        }
        catch (error) {
            console.error('[Newsletter] subscribe error:', error);
            return c.json({ success: false, error: 'Failed to subscribe' }, 500);
        }
    }
}
export const newsletterController = new NewsletterController();
