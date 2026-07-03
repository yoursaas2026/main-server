import { eq, isNull, sql, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketingCampaigns, marketingCampaignSends, marketingLists, marketingSubscribers, marketingTemplates, } from '../db/schema.js';
import { env } from '../config/env.js';
import { emailService } from './email.service.js';
const SEND_BATCH_DELAY_MS = 120;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class CampaignService {
    async sendCampaign(campaignId) {
        const [campaign] = await db
            .select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, campaignId))
            .limit(1);
        if (!campaign)
            return { ok: false, error: 'Campaign not found' };
        if (campaign.status === 'sending')
            return { ok: false, error: 'Campaign is already sending' };
        if (campaign.status === 'sent')
            return { ok: false, error: 'Campaign was already sent' };
        const subscribers = await db
            .select()
            .from(marketingSubscribers)
            .where(and(eq(marketingSubscribers.listId, campaign.listId), isNull(marketingSubscribers.unsubscribedAt)));
        if (subscribers.length === 0) {
            return { ok: false, error: 'No active subscribers on the selected list' };
        }
        await db
            .update(marketingCampaigns)
            .set({
            status: 'sending',
            startedAt: new Date(),
            totalRecipients: subscribers.length,
            sentCount: 0,
            failedCount: 0,
            updatedAt: new Date(),
        })
            .where(eq(marketingCampaigns.id, campaignId));
        let sentCount = 0;
        let failedCount = 0;
        for (const sub of subscribers) {
            const unsubscribeUrl = `${env.MARKETING_PORTAL_URL}/unsubscribe?token=${sub.unsubscribeToken}`;
            const html = campaign.htmlContent
                .replace(/\{\{firstName\}\}/g, sub.firstName)
                .replace(/\{\{lastName\}\}/g, sub.lastName)
                .replace(/\{\{email\}\}/g, sub.email);
            const ok = await emailService.sendCampaignEmail({
                to: sub.email,
                subject: campaign.subject,
                htmlContent: html,
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
            if (ok)
                sentCount++;
            else
                failedCount++;
            await db
                .update(marketingCampaigns)
                .set({ sentCount, failedCount, updatedAt: new Date() })
                .where(eq(marketingCampaigns.id, campaignId));
            await sleep(SEND_BATCH_DELAY_MS);
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
    sendCampaignAsync(campaignId) {
        this.sendCampaign(campaignId).catch((err) => {
            console.error('[CampaignService] send failed for campaign %s:', campaignId, err);
            db.update(marketingCampaigns)
                .set({ status: 'failed', updatedAt: new Date() })
                .where(eq(marketingCampaigns.id, campaignId))
                .catch(() => undefined);
        });
    }
}
export const campaignService = new CampaignService();
export async function getMarketingDashboardStats() {
    const [listsCount] = await db
        .select({ count: sql `count(*)::int` })
        .from(marketingLists);
    const [activeSubs] = await db
        .select({ count: sql `count(*)::int` })
        .from(marketingSubscribers)
        .where(isNull(marketingSubscribers.unsubscribedAt));
    const [templatesCount] = await db
        .select({ count: sql `count(*)::int` })
        .from(marketingTemplates);
    const [campaignsCount] = await db
        .select({ count: sql `count(*)::int` })
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
