import { randomBytes } from 'crypto';
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { newsletterSubscribers } from '../db/schema.js';
import { env } from '../config/env.js';
import { emailService } from './email.service.js';
function generateUnsubscribeToken() {
    return randomBytes(32).toString('hex');
}
export class NewsletterService {
    async subscribe(input) {
        const normalizedEmail = input.email.trim().toLowerCase();
        const source = input.source ?? 'footer';
        try {
            const existing = await db.query.newsletterSubscribers.findFirst({
                where: eq(newsletterSubscribers.email, normalizedEmail),
            });
            if (existing && !existing.unsubscribedAt) {
                return { ok: true, alreadySubscribed: true };
            }
            const unsubscribeToken = existing?.unsubscribeToken ?? generateUnsubscribeToken();
            const now = new Date();
            if (existing) {
                await db
                    .update(newsletterSubscribers)
                    .set({
                    firstName: input.firstName,
                    lastName: input.lastName,
                    source,
                    unsubscribedAt: null,
                    subscribedAt: now,
                    updatedAt: now,
                })
                    .where(eq(newsletterSubscribers.id, existing.id));
            }
            else {
                await db.insert(newsletterSubscribers).values({
                    email: normalizedEmail,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    source,
                    unsubscribeToken,
                    subscribedAt: now,
                    updatedAt: now,
                });
            }
            const unsubscribeUrl = `${env.USER_PORTAL_URL}/newsletter/unsubscribe?token=${unsubscribeToken}`;
            emailService
                .sendNewsletterWelcomeEmail(normalizedEmail, input.firstName, unsubscribeUrl)
                .catch((err) => {
                console.error('[Newsletter] welcome email failed for %s:', normalizedEmail, err);
            });
            return { ok: true, alreadySubscribed: false };
        }
        catch (error) {
            console.error('[Newsletter] subscribe error:', error);
            return { ok: false };
        }
    }
    async unsubscribe(token) {
        const trimmed = token.trim();
        if (!trimmed)
            return false;
        try {
            const row = await db.query.newsletterSubscribers.findFirst({
                where: and(eq(newsletterSubscribers.unsubscribeToken, trimmed), isNull(newsletterSubscribers.unsubscribedAt)),
            });
            if (!row)
                return false;
            await db
                .update(newsletterSubscribers)
                .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
                .where(eq(newsletterSubscribers.id, row.id));
            return true;
        }
        catch (error) {
            console.error('[Newsletter] unsubscribe error:', error);
            return false;
        }
    }
}
export const newsletterService = new NewsletterService();
