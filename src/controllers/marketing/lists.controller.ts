import type { Context } from 'hono';
import { randomBytes } from 'crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketingLists, marketingSubscribers } from '../../db/schema.js';
import { assertMarketing } from '../../utils/marketing-guard.js';

function unsubscribeToken() {
    return randomBytes(32).toString('hex');
}

export class MarketingListsController {
    async list(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const lists = await db
            .select({
                id: marketingLists.id,
                name: marketingLists.name,
                description: marketingLists.description,
                isDefault: marketingLists.isDefault,
                createdAt: marketingLists.createdAt,
                subscriberCount: sql<number>`(
                    SELECT count(*)::int FROM marketing_subscribers ms
                    WHERE ms.list_id = ${marketingLists.id} AND ms.unsubscribed_at IS NULL
                )`,
            })
            .from(marketingLists)
            .orderBy(desc(marketingLists.createdAt));

        return c.json({ success: true, data: { lists } });
    }

    async create(c: Context) {
        const user = assertMarketing(c);
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const body = await c.req.json().catch(() => null);
        if (!body?.name) return c.json({ success: false, error: 'List name is required' }, 400);

        const [list] = await db
            .insert(marketingLists)
            .values({
                name: String(body.name).trim(),
                description: body.description ? String(body.description).trim() : null,
                createdByMarketingUserId: user.id,
            })
            .returning();

        return c.json({ success: true, data: { list } }, 201);
    }

    async update(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        const updateData: { name?: string; description?: string | null; updatedAt: Date } = {
            updatedAt: new Date(),
        };
        if (body?.name) updateData.name = String(body.name).trim();
        if (body?.description !== undefined) updateData.description = String(body.description).trim() || null;

        const [list] = await db
            .update(marketingLists)
            .set(updateData)
            .where(eq(marketingLists.id, id))
            .returning();

        if (!list) return c.json({ success: false, error: 'List not found' }, 404);
        return c.json({ success: true, data: { list } });
    }

    async remove(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [list] = await db.select().from(marketingLists).where(eq(marketingLists.id, id)).limit(1);
        if (!list) return c.json({ success: false, error: 'List not found' }, 404);
        if (list.isDefault) return c.json({ success: false, error: 'Cannot delete the default footer list' }, 400);

        await db.delete(marketingSubscribers).where(eq(marketingSubscribers.listId, id));
        await db.delete(marketingLists).where(eq(marketingLists.id, id));

        return c.json({ success: true, message: 'List deleted' });
    }

    async listSubscribers(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const subscribers = await db
            .select()
            .from(marketingSubscribers)
            .where(eq(marketingSubscribers.listId, listId))
            .orderBy(desc(marketingSubscribers.subscribedAt));

        return c.json({ success: true, data: { subscribers } });
    }

    async addSubscriber(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        if (!body?.email || !body?.firstName || !body?.lastName) {
            return c.json({ success: false, error: 'Email, first name, and last name are required' }, 400);
        }

        const email = String(body.email).trim().toLowerCase();
        const [existing] = await db
            .select()
            .from(marketingSubscribers)
            .where(and(eq(marketingSubscribers.listId, listId), eq(marketingSubscribers.email, email)))
            .limit(1);

        if (existing) {
            const [updated] = await db
                .update(marketingSubscribers)
                .set({
                    firstName: String(body.firstName).trim(),
                    lastName: String(body.lastName).trim(),
                    unsubscribedAt: null,
                    updatedAt: new Date(),
                })
                .where(eq(marketingSubscribers.id, existing.id))
                .returning();
            return c.json({ success: true, data: { subscriber: updated } });
        }

        const [subscriber] = await db
            .insert(marketingSubscribers)
            .values({
                listId,
                email,
                firstName: String(body.firstName).trim(),
                lastName: String(body.lastName).trim(),
                source: 'manual',
                unsubscribeToken: unsubscribeToken(),
            })
            .returning();

        return c.json({ success: true, data: { subscriber } }, 201);
    }

    async removeSubscriber(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const subId = parseInt(c.req.param('subId'), 10);

        const [deleted] = await db
            .delete(marketingSubscribers)
            .where(and(eq(marketingSubscribers.id, subId), eq(marketingSubscribers.listId, listId)))
            .returning({ id: marketingSubscribers.id });

        if (!deleted) return c.json({ success: false, error: 'Subscriber not found' }, 404);
        return c.json({ success: true, message: 'Subscriber removed' });
    }

    async importSubscribers(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        const rows = Array.isArray(body?.subscribers) ? body.subscribers : [];

        let imported = 0;
        for (const row of rows) {
            if (!row?.email) continue;
            const email = String(row.email).trim().toLowerCase();
            const [existing] = await db
                .select({ id: marketingSubscribers.id })
                .from(marketingSubscribers)
                .where(and(eq(marketingSubscribers.listId, listId), eq(marketingSubscribers.email, email)))
                .limit(1);

            if (existing) continue;

            await db.insert(marketingSubscribers).values({
                listId,
                email,
                firstName: String(row.firstName ?? row.first_name ?? 'Subscriber').trim(),
                lastName: String(row.lastName ?? row.last_name ?? '').trim() || '-',
                source: 'import',
                unsubscribeToken: unsubscribeToken(),
            });
            imported++;
        }

        return c.json({ success: true, data: { imported } });
    }
}

export const marketingListsController = new MarketingListsController();
