import { randomBytes } from 'crypto';
import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketingLists, marketingSubscribers } from '../db/schema.js';
import { env } from '../config/env.js';
import { emailService } from './email.service.js';
const DEFAULT_LIST_NAME = 'Website Footer';
function generateUnsubscribeToken() {
    return randomBytes(32).toString('hex');
}
export async function getOrCreateDefaultListId() {
    const existing = await db.query.marketingLists.findFirst({
        where: eq(marketingLists.isDefault, true),
    });
    if (existing)
        return existing.id;
    const [created] = await db
        .insert(marketingLists)
        .values({
        name: DEFAULT_LIST_NAME,
        description: 'Subscribers from the marketplace footer form',
        isDefault: true,
    })
        .returning({ id: marketingLists.id });
    return created.id;
}
export class NewsletterService {
    async subscribe(input) {
        const normalizedEmail = input.email.trim().toLowerCase();
        const source = input.source ?? 'footer';
        try {
            const listId = await getOrCreateDefaultListId();
            const existing = await db.query.marketingSubscribers.findFirst({
                where: and(eq(marketingSubscribers.listId, listId), eq(marketingSubscribers.email, normalizedEmail)),
            });
            if (existing && !existing.unsubscribedAt) {
                return { ok: true, alreadySubscribed: true };
            }
            const unsubscribeToken = existing?.unsubscribeToken ?? generateUnsubscribeToken();
            const now = new Date();
            if (existing) {
                await db
                    .update(marketingSubscribers)
                    .set({
                    firstName: input.firstName,
                    lastName: input.lastName,
                    source,
                    unsubscribedAt: null,
                    subscribedAt: now,
                    updatedAt: now,
                })
                    .where(eq(marketingSubscribers.id, existing.id));
            }
            else {
                await db.insert(marketingSubscribers).values({
                    listId,
                    email: normalizedEmail,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    source,
                    unsubscribeToken,
                    subscribedAt: now,
                    updatedAt: now,
                });
            }
            const unsubscribeUrl = `${env.MARKETING_PORTAL_URL}/unsubscribe?token=${unsubscribeToken}`;
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
            const row = await db.query.marketingSubscribers.findFirst({
                where: and(eq(marketingSubscribers.unsubscribeToken, trimmed), isNull(marketingSubscribers.unsubscribedAt)),
            });
            if (!row)
                return false;
            await db
                .update(marketingSubscribers)
                .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
                .where(eq(marketingSubscribers.id, row.id));
            return true;
        }
        catch (error) {
            console.error('[Newsletter] unsubscribe error:', error);
            return false;
        }
    }
}
export const newsletterService = new NewsletterService();
