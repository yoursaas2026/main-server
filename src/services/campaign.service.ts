import { eq, isNull, sql, desc, and, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    marketingCampaigns,
    marketingCampaignSends,
    marketingLists,
    marketingSubscribers,
    marketingTemplates,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { emailService } from './email.service.js';

const SEND_BATCH_DELAY_MS = 120;

/** In-process cancel flags for campaigns currently sending on this API instance. */
const cancelRequested = new Set<number>();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CampaignService {
    requestCancel(campaignId: number): void {
        cancelRequested.add(campaignId);
    }

    clearCancel(campaignId: number): void {
        cancelRequested.delete(campaignId);
    }

    async cancelCampaign(campaignId: number): Promise<{ ok: boolean; error?: string }> {
        const [campaign] = await db
            .select({ id: marketingCampaigns.id, status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, campaignId))
            .limit(1);

        if (!campaign) return { ok: false, error: 'Campaign not found' };
        if (campaign.status !== 'sending') {
            return { ok: false, error: 'Only campaigns that are currently sending can be cancelled' };
        }

        this.requestCancel(campaignId);
        await db
            .update(marketingCampaigns)
            .set({
                status: 'cancelled',
                completedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(marketingCampaigns.id, campaignId));

        return { ok: true };
    }

    async sendCampaign(campaignId: number): Promise<{ ok: boolean; error?: string }> {
        this.clearCancel(campaignId);

        const [campaign] = await db
            .select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, campaignId))
            .limit(1);

        if (!campaign) return { ok: false, error: 'Campaign not found' };
        if (campaign.status === 'sending') return { ok: false, error: 'Campaign is already sending' };
        if (campaign.status === 'sent') return { ok: false, error: 'Campaign was already sent' };
        if (campaign.status === 'cancelled') {
            return { ok: false, error: 'Cancelled campaigns cannot be resent — duplicate the draft' };
        }
        if (campaign.status !== 'draft' && campaign.status !== 'scheduled' && campaign.status !== 'failed') {
            return { ok: false, error: `Cannot send campaign in status "${campaign.status}"` };
        }

        const subscribers = await db
            .select()
            .from(marketingSubscribers)
            .where(
                and(
                    eq(marketingSubscribers.listId, campaign.listId),
                    isNull(marketingSubscribers.unsubscribedAt),
                ),
            );

        if (subscribers.length === 0) {
            return { ok: false, error: 'No active subscribers on the selected list' };
        }

        const [claimed] = await db
            .update(marketingCampaigns)
            .set({
                status: 'sending',
                startedAt: new Date(),
                completedAt: null,
                totalRecipients: subscribers.length,
                sentCount: 0,
                failedCount: 0,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(marketingCampaigns.id, campaignId),
                    or(
                        eq(marketingCampaigns.status, 'draft'),
                        eq(marketingCampaigns.status, 'scheduled'),
                        eq(marketingCampaigns.status, 'failed'),
                    ),
                ),
            )
            .returning({ id: marketingCampaigns.id });

        if (!claimed) {
            return { ok: false, error: 'Campaign is already sending or no longer sendable' };
        }

        let sentCount = 0;
        let failedCount = 0;
        let cancelled = false;

        for (const sub of subscribers) {
            if (cancelRequested.has(campaignId)) {
                cancelled = true;
                break;
            }

            // Re-check DB in case cancel was set from another request path
            const [live] = await db
                .select({ status: marketingCampaigns.status })
                .from(marketingCampaigns)
                .where(eq(marketingCampaigns.id, campaignId))
                .limit(1);
            if (live?.status === 'cancelled') {
                cancelled = true;
                break;
            }

            const unsubscribeUrl = `${env.MARKETING_PORTAL_URL.replace(/\/$/, '')}/unsubscribe?token=${sub.unsubscribeToken}`;
            const html = campaign.htmlContent
                .replace(/\{\{firstName\}\}/g, sub.firstName)
                .replace(/\{\{lastName\}\}/g, sub.lastName)
                .replace(/\{\{email\}\}/g, sub.email);

            const ok = await emailService.sendCampaignEmail({
                to: sub.email,
                subject: campaign.subject,
                htmlContent: html,
                textContent: campaign.textContent,
                fromEmail: campaign.fromEmail,
                fromName: campaign.fromName,
                unsubscribeUrl,
            });

            await db.insert(marketingCampaignSends).values({
                campaignId,
                subscriberId: sub.id,
                email: sub.email,
                status: ok ? 'sent' : 'failed',
                errorMessage: ok ? null : 'SMTP send failed',
                sentAt: ok ? new Date() : null,
            });

            if (ok) sentCount++;
            else failedCount++;

            await db
                .update(marketingCampaigns)
                .set({ sentCount, failedCount, updatedAt: new Date() })
                .where(eq(marketingCampaigns.id, campaignId));

            await sleep(SEND_BATCH_DELAY_MS);
        }

        const cancelPending = cancelled || cancelRequested.has(campaignId);
        this.clearCancel(campaignId);

        if (cancelPending) {
            await db
                .update(marketingCampaigns)
                .set({
                    status: 'cancelled',
                    completedAt: new Date(),
                    sentCount,
                    failedCount,
                    updatedAt: new Date(),
                })
                .where(eq(marketingCampaigns.id, campaignId));
            return { ok: true };
        }

        const [liveEnd] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, campaignId))
            .limit(1);

        if (liveEnd?.status === 'cancelled') {
            await db
                .update(marketingCampaigns)
                .set({
                    completedAt: new Date(),
                    sentCount,
                    failedCount,
                    updatedAt: new Date(),
                })
                .where(eq(marketingCampaigns.id, campaignId));
            return { ok: true };
        }

        await db
            .update(marketingCampaigns)
            .set({
                status: failedCount === subscribers.length ? 'failed' : 'sent',
                completedAt: new Date(),
                sentCount,
                failedCount,
                updatedAt: new Date(),
            })
            .where(eq(marketingCampaigns.id, campaignId));

        return { ok: true };
    }

    sendCampaignAsync(campaignId: number): void {
        this.sendCampaign(campaignId).catch((err) => {
            console.error('[CampaignService] send failed for campaign %s:', campaignId, err);
            this.clearCancel(campaignId);
            db.update(marketingCampaigns)
                .set({ status: 'failed', updatedAt: new Date(), completedAt: new Date() })
                .where(eq(marketingCampaigns.id, campaignId))
                .catch(() => undefined);
        });
    }
}

export const campaignService = new CampaignService();

export async function getMarketingDashboardStats() {
    const [listsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketingLists);

    const [activeSubs] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketingSubscribers)
        .where(isNull(marketingSubscribers.unsubscribedAt));

    const [templatesCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketingTemplates);

    const [campaignsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketingCampaigns);

    const recentCampaigns = await db
        .select({
            id: marketingCampaigns.id,
            name: marketingCampaigns.name,
            status: marketingCampaigns.status,
            sentCount: marketingCampaigns.sentCount,
            failedCount: marketingCampaigns.failedCount,
            totalRecipients: marketingCampaigns.totalRecipients,
            completedAt: marketingCampaigns.completedAt,
            createdAt: marketingCampaigns.createdAt,
        })
        .from(marketingCampaigns)
        .orderBy(desc(marketingCampaigns.createdAt))
        .limit(5);

    return {
        listsCount: listsCount?.count ?? 0,
        activeSubscribers: activeSubs?.count ?? 0,
        templatesCount: templatesCount?.count ?? 0,
        campaignsCount: campaignsCount?.count ?? 0,
        recentCampaigns,
    };
}
