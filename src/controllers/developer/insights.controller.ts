import type { Context } from 'hono';
import { z } from 'zod';
import { developerInsightsService } from '../../services/developer-insights.service.js';

function assertDeveloper(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'developer') return null;
    return jwtUser;
}

const releaseBodySchema = z.object({
    version: z.string().trim().min(1).max(40),
    title: z.string().trim().max(160).optional().nullable(),
    changelog: z.string().trim().max(8000).optional().nullable(),
    releaseNotesUrl: z.string().trim().max(500).optional().nullable(),
    makeCurrent: z.boolean().optional(),
});

const releaseUpdateSchema = z.object({
    version: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().max(160).optional().nullable(),
    changelog: z.string().trim().max(8000).optional().nullable(),
    releaseNotesUrl: z.string().trim().max(500).optional().nullable(),
});

export class DeveloperInsightsController {
    async accountInsights(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        try {
            const data = await developerInsightsService.getAccountInsights(user.id);
            return c.json({ success: true, data });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async accountCustomers(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const search = c.req.query('search') || undefined;
        try {
            const customers = await developerInsightsService.listCustomers(user.id, { search });
            return c.json({ success: true, data: { customers } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async productAnalytics(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        if (!Number.isInteger(productId)) return c.json({ success: false, error: 'Invalid product' }, 400);
        try {
            const data = await developerInsightsService.getProductAnalytics(user.id, productId);
            return c.json({ success: true, data });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async productCustomers(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        if (!Number.isInteger(productId)) return c.json({ success: false, error: 'Invalid product' }, 400);
        const search = c.req.query('search') || undefined;
        try {
            const customers = await developerInsightsService.listCustomers(user.id, { productId, search });
            return c.json({ success: true, data: { customers } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async listReleases(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        if (!Number.isInteger(productId)) return c.json({ success: false, error: 'Invalid product' }, 400);
        try {
            const releases = await developerInsightsService.listReleases(user.id, productId);
            return c.json({ success: true, data: { releases } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async createRelease(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        if (!Number.isInteger(productId)) return c.json({ success: false, error: 'Invalid product' }, 400);
        const body = await c.req.json().catch(() => null);
        const parsed = releaseBodySchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }, 400);
        }
        try {
            const release = await developerInsightsService.createRelease(user.id, productId, parsed.data);
            return c.json({ success: true, data: { release } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async updateRelease(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        const releaseId = parseInt(c.req.param('releaseId') || '', 10);
        if (!Number.isInteger(productId) || !Number.isInteger(releaseId)) {
            return c.json({ success: false, error: 'Invalid id' }, 400);
        }
        const body = await c.req.json().catch(() => null);
        const parsed = releaseUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' }, 400);
        }
        try {
            const release = await developerInsightsService.updateRelease(
                user.id,
                productId,
                releaseId,
                parsed.data
            );
            return c.json({ success: true, data: { release } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async makeReleaseCurrent(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        const releaseId = parseInt(c.req.param('releaseId') || '', 10);
        if (!Number.isInteger(productId) || !Number.isInteger(releaseId)) {
            return c.json({ success: false, error: 'Invalid id' }, 400);
        }
        try {
            const release = await developerInsightsService.makeReleaseCurrent(user.id, productId, releaseId);
            return c.json({ success: true, data: { release } });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }

    async deleteRelease(c: Context) {
        const user = assertDeveloper(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const productId = parseInt(c.req.param('id') || '', 10);
        const releaseId = parseInt(c.req.param('releaseId') || '', 10);
        if (!Number.isInteger(productId) || !Number.isInteger(releaseId)) {
            return c.json({ success: false, error: 'Invalid id' }, 400);
        }
        try {
            const result = await developerInsightsService.deleteRelease(user.id, productId, releaseId);
            return c.json({ success: true, data: result });
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 400);
        }
    }
}

export const developerInsightsController = new DeveloperInsightsController();
