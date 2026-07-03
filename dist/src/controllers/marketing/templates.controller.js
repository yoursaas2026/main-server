import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketingTemplates } from '../../db/schema.js';
import { assertMarketing } from '../../utils/marketing-guard.js';
export class MarketingTemplatesController {
    async list(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const templates = await db
            .select()
            .from(marketingTemplates)
            .orderBy(desc(marketingTemplates.updatedAt));
        return c.json({ success: true, data: { templates } });
    }
    async create(c) {
        const user = assertMarketing(c);
        if (!user)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const body = await c.req.json().catch(() => null);
        if (!body?.name || !body?.subject || !body?.htmlContent) {
            return c.json({ success: false, error: 'Name, subject, and HTML content are required' }, 400);
        }
        const [template] = await db
            .insert(marketingTemplates)
            .values({
            name: String(body.name).trim(),
            subject: String(body.subject).trim(),
            htmlContent: String(body.htmlContent),
            createdByMarketingUserId: user.id,
        })
            .returning();
        return c.json({ success: true, data: { template } }, 201);
    }
    async update(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        const [template] = await db
            .update(marketingTemplates)
            .set({
            name: body?.name ? String(body.name).trim() : undefined,
            subject: body?.subject ? String(body.subject).trim() : undefined,
            htmlContent: body?.htmlContent ? String(body.htmlContent) : undefined,
            updatedAt: new Date(),
        })
            .where(eq(marketingTemplates.id, id))
            .returning();
        if (!template)
            return c.json({ success: false, error: 'Template not found' }, 404);
        return c.json({ success: true, data: { template } });
    }
    async remove(c) {
        if (!assertMarketing(c))
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('id'), 10);
        const [deleted] = await db
            .delete(marketingTemplates)
            .where(eq(marketingTemplates.id, id))
            .returning({ id: marketingTemplates.id });
        if (!deleted)
            return c.json({ success: false, error: 'Template not found' }, 404);
        return c.json({ success: true, message: 'Template deleted' });
    }
}
export const marketingTemplatesController = new MarketingTemplatesController();
