import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketingCampaigns, marketingCampaignSends, marketingLists, marketingTemplates, } from '../../db/schema.js';
import { assertMarketing } from '../../utils/marketing-guard.js';
import { campaignService, getMarketingDashboardStats } from '../../services/campaign.service.js';
import { env } from '../../config/env.js';
export class MarketingCampaignsController {
    async dashboard(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const stats = await getMarketingDashboardStats();
        return c.json({ success: true, data: stats });
    }
    async list(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const campaigns = await db
            .select({
            id: marketingCampaigns.id,
            name: marketingCampaigns.name,
            subject: marketingCampaigns.subject,
            listId: marketingCampaigns.listId,
            listName: marketingLists.name,
            status: marketingCampaigns.status,
            fromEmail: marketingCampaigns.fromEmail,
            fromName: marketingCampaigns.fromName,
            totalRecipients: marketingCampaigns.totalRecipients,
            sentCount: marketingCampaigns.sentCount,
            failedCount: marketingCampaigns.failedCount,
            scheduledAt: marketingCampaigns.scheduledAt,
            completedAt: marketingCampaigns.completedAt,
            createdAt: marketingCampaigns.createdAt,
        })
            .from(marketingCampaigns)
            .leftJoin(marketingLists, eq(marketingCampaigns.listId, marketingLists.id))
            .orderBy(desc(marketingCampaigns.createdAt));
        return c.json({ success: true, data: { campaigns } });
    }
    async getOne(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const [campaign] = await db
            .select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);
        if (!campaign)
            return c.json({ success: false, error: 'Campaign not found' }, 404);
        const sends = await db
            .select()
            .from(marketingCampaignSends)
            .where(eq(marketingCampaignSends.campaignId, id))
            .orderBy(desc(marketingCampaignSends.createdAt))
            .limit(100);
        return c.json({ success: true, data: { campaign, sends } });
    }
    async create(c) {
        const user = assertMarketing(c);
        if (!user)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const body = await c.req.json().catch(() => null);
        if (!body?.name || !body?.subject || !body?.listId) {
            return c.json({ success: false, error: 'Name, subject, and list are required' }, 400);
        }
        let htmlContent = body.htmlContent ? String(body.htmlContent) : '';
        let subject = String(body.subject).trim();
        if (body.templateId) {
            const [template] = await db
                .select()
                .from(marketingTemplates)
                .where(eq(marketingTemplates.id, Number(body.templateId)))
                .limit(1);
            if (template) {
                htmlContent = htmlContent || template.htmlContent;
                subject = subject || template.subject;
            }
        }
        if (!htmlContent) {
            return c.json({ success: false, error: 'HTML content or template is required' }, 400);
        }
        const [campaign] = await db
            .insert(marketingCampaigns)
            .values({
            name: String(body.name).trim(),
            subject,
            htmlContent,
            textContent: body.textContent ? String(body.textContent) : null,
            listId: Number(body.listId),
            templateId: body.templateId ? Number(body.templateId) : null,
            status: 'draft',
            fromEmail: body.fromEmail ? String(body.fromEmail) : env.SMTP_MARKETING_FROM_EMAIL,
            fromName: body.fromName ? String(body.fromName) : env.SMTP_MARKETING_FROM_NAME,
            createdByMarketingUserId: user.id,
        })
            .returning();
        return c.json({ success: true, data: { campaign } }, 201);
    }
    async update(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const [existing] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);
        if (!existing)
            return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (existing.status !== 'draft') {
            return c.json({ success: false, error: 'Only draft campaigns can be edited' }, 400);
        }
        const body = await c.req.json().catch(() => null);
        const [campaign] = await db
            .update(marketingCampaigns)
            .set({
            name: body?.name ? String(body.name).trim() : undefined,
            subject: body?.subject ? String(body.subject).trim() : undefined,
            htmlContent: body?.htmlContent ? String(body.htmlContent) : undefined,
            textContent: body?.textContent !== undefined ? String(body.textContent) : undefined,
            listId: body?.listId ? Number(body.listId) : undefined,
            fromEmail: body?.fromEmail ? String(body.fromEmail) : undefined,
            fromName: body?.fromName ? String(body.fromName) : undefined,
            updatedAt: new Date(),
        })
            .where(eq(marketingCampaigns.id, id))
            .returning();
        return c.json({ success: true, data: { campaign } });
    }
    async send(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const [campaign] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);
        if (!campaign)
            return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (campaign.status !== 'draft') {
            return c.json({ success: false, error: 'Campaign has already been sent or is sending' }, 400);
        }
        campaignService.sendCampaignAsync(id);
        return c.json({ success: true, message: 'Campaign send started' });
    }
    async remove(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const [campaign] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);
        if (!campaign)
            return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (campaign.status === 'sending') {
            return c.json({ success: false, error: 'Cannot delete a campaign while sending' }, 400);
        }
        await db.delete(marketingCampaignSends).where(eq(marketingCampaignSends.campaignId, id));
        await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
        return c.json({ success: true, message: 'Campaign deleted' });
    }
}
export const marketingCampaignsController = new MarketingCampaignsController();
