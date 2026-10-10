import type { Context } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    marketingCampaigns,
    marketingCampaignSends,
    marketingLists,
    marketingTemplates,
} from '../../db/schema.js';
import { assertMarketing } from '../../utils/marketing-guard.js';
import { campaignService, getMarketingDashboardStats } from '../../services/campaign.service.js';
import { env } from '../../config/env.js';

function parsePaging(c: Context, defaultLimit = 25) {
    const limitRaw = parseInt(c.req.query('limit') || String(defaultLimit), 10);
    const offsetRaw = parseInt(c.req.query('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : defaultLimit;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    return { limit, offset };
}

export class MarketingCampaignsController {
    async dashboard(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const stats = await getMarketingDashboardStats();
        return c.json({ success: true, data: stats });
    }

    async list(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const { limit, offset } = parsePaging(c);
        const [totalRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(marketingCampaigns);
        const total = totalRow?.count ?? 0;

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
            .orderBy(desc(marketingCampaigns.createdAt))
            .limit(limit)
            .offset(offset);

        return c.json({
            success: true,
            data: { campaigns, pagination: { limit, offset, total } },
        });
    }

    async getOne(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const { limit, offset } = parsePaging(c, 50);

        const [campaign] = await db
            .select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

        const [totalRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(marketingCampaignSends)
            .where(eq(marketingCampaignSends.campaignId, id));
        const total = totalRow?.count ?? 0;

        const sends = await db
            .select()
            .from(marketingCampaignSends)
            .where(eq(marketingCampaignSends.campaignId, id))
            .orderBy(desc(marketingCampaignSends.createdAt))
            .limit(limit)
            .offset(offset);

        return c.json({
            success: true,
            data: { campaign, sends, pagination: { limit, offset, total } },
        });
    }

    async create(c: Context) {
        const user = assertMarketing(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

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

    async update(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [existing] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!existing) return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (existing.status !== 'draft') {
            return c.json({ success: false, error: 'Only draft campaigns can be edited' }, 400);
        }

        const body = await c.req.json().catch(() => null);
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (body?.name) patch.name = String(body.name).trim();
        if (body?.subject) patch.subject = String(body.subject).trim();
        if (body?.htmlContent) patch.htmlContent = String(body.htmlContent);
        if (body?.textContent !== undefined) {
            patch.textContent = body.textContent ? String(body.textContent) : null;
        }
        if (body?.listId) patch.listId = Number(body.listId);
        if (body?.fromEmail) patch.fromEmail = String(body.fromEmail);
        if (body?.fromName) patch.fromName = String(body.fromName);

        const [campaign] = await db
            .update(marketingCampaigns)
            .set(patch)
            .where(eq(marketingCampaigns.id, id))
            .returning();

        return c.json({ success: true, data: { campaign } });
    }

    async send(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [campaign] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (campaign.status !== 'draft' && campaign.status !== 'scheduled' && campaign.status !== 'failed') {
            return c.json({ success: false, error: 'Campaign has already been sent or is sending' }, 400);
        }

        campaignService.sendCampaignAsync(id);
        return c.json({ success: true, message: 'Campaign send started' });
    }

    async schedule(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        const whenRaw = body?.scheduledAt ? String(body.scheduledAt) : '';
        const when = whenRaw ? new Date(whenRaw) : null;

        if (!when || Number.isNaN(when.getTime())) {
            return c.json({ success: false, error: 'scheduledAt must be a valid ISO datetime' }, 400);
        }
        if (when.getTime() <= Date.now() + 30_000) {
            return c.json({ success: false, error: 'scheduledAt must be at least 30 seconds in the future' }, 400);
        }

        const [existing] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!existing) return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (existing.status !== 'draft' && existing.status !== 'scheduled') {
            return c.json({ success: false, error: 'Only draft or scheduled campaigns can be scheduled' }, 400);
        }

        const [campaign] = await db
            .update(marketingCampaigns)
            .set({
                status: 'scheduled',
                scheduledAt: when,
                updatedAt: new Date(),
            })
            .where(eq(marketingCampaigns.id, id))
            .returning();

        return c.json({ success: true, data: { campaign }, message: 'Campaign scheduled' });
    }

    async unschedule(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [existing] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!existing) return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (existing.status !== 'scheduled') {
            return c.json({ success: false, error: 'Only scheduled campaigns can be unscheduled' }, 400);
        }

        const [campaign] = await db
            .update(marketingCampaigns)
            .set({
                status: 'draft',
                scheduledAt: null,
                updatedAt: new Date(),
            })
            .where(eq(marketingCampaigns.id, id))
            .returning();

        return c.json({ success: true, data: { campaign }, message: 'Schedule cleared' });
    }

    async cancel(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        if (!Number.isFinite(id)) {
            return c.json({ success: false, error: 'Invalid campaign id' }, 400);
        }

        const result = await campaignService.cancelCampaign(id);
        if (!result.ok) {
            return c.json({ success: false, error: result.error || 'Cancel failed' }, 400);
        }
        return c.json({ success: true, message: 'Campaign cancel requested' });
    }

    async remove(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [campaign] = await db
            .select({ status: marketingCampaigns.status })
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id))
            .limit(1);

        if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
        if (campaign.status === 'sending') {
            return c.json({ success: false, error: 'Cannot delete a campaign while sending' }, 400);
        }

        await db.delete(marketingCampaignSends).where(eq(marketingCampaignSends.campaignId, id));
        await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));

        return c.json({ success: true, message: 'Campaign deleted' });
    }
}

export const marketingCampaignsController = new MarketingCampaignsController();
