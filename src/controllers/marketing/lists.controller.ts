import type { Context } from 'hono';
import { randomBytes } from 'crypto';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketingLists, marketingSubscribers } from '../../db/schema.js';
import { assertMarketing } from '../../utils/marketing-guard.js';

function unsubscribeToken() {
    return randomBytes(32).toString('hex');
}

function parsePaging(c: Context, defaultLimit = 25) {
    const limitRaw = parseInt(c.req.query('limit') || String(defaultLimit), 10);
    const offsetRaw = parseInt(c.req.query('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : defaultLimit;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    return { limit, offset };
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

    async getOne(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        const [list] = await db
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
            .where(eq(marketingLists.id, id))
            .limit(1);

        if (!list) return c.json({ success: false, error: 'List not found' }, 404);
        return c.json({ success: true, data: { list } });
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
        const { limit, offset } = parsePaging(c);
        const q = (c.req.query('q') || '').trim();
        const status = (c.req.query('status') || 'all').toLowerCase();

        const filters = [eq(marketingSubscribers.listId, listId)];
        if (q) {
            const pattern = `%${q}%`;
            filters.push(
                or(
                    ilike(marketingSubscribers.email, pattern),
                    ilike(marketingSubscribers.firstName, pattern),
                    ilike(marketingSubscribers.lastName, pattern),
                )!,
            );
        }
        if (status === 'active') {
            filters.push(isNull(marketingSubscribers.unsubscribedAt));
        } else if (status === 'unsubscribed') {
            filters.push(sql`${marketingSubscribers.unsubscribedAt} IS NOT NULL`);
        }

        const where = and(...filters);

        const [totalRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(marketingSubscribers)
            .where(where);
        const total = totalRow?.count ?? 0;

        const [activeRow] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(marketingSubscribers)
            .where(and(eq(marketingSubscribers.listId, listId), isNull(marketingSubscribers.unsubscribedAt)));

        const subscribers = await db
            .select()
            .from(marketingSubscribers)
            .where(where)
            .orderBy(desc(marketingSubscribers.subscribedAt))
            .limit(limit)
            .offset(offset);

        return c.json({
            success: true,
            data: {
                subscribers,
                activeCount: activeRow?.count ?? 0,
                pagination: { limit, offset, total },
            },
        });
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
            return c.json({ success: true, data: { subscriber: updated, upserted: true } });
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

        return c.json({ success: true, data: { subscriber, upserted: false } }, 201);
    }

    async removeSubscriber(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const subId = parseInt(c.req.param('subId'), 10);
        const hard = (c.req.query('hard') || '').toLowerCase() === 'true';

        if (hard) {
            const [deleted] = await db
                .delete(marketingSubscribers)
                .where(and(eq(marketingSubscribers.id, subId), eq(marketingSubscribers.listId, listId)))
                .returning({ id: marketingSubscribers.id });

            if (!deleted) return c.json({ success: false, error: 'Subscriber not found' }, 404);
            return c.json({ success: true, message: 'Subscriber permanently deleted' });
        }

        const [updated] = await db
            .update(marketingSubscribers)
            .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
            .where(
                and(
                    eq(marketingSubscribers.id, subId),
                    eq(marketingSubscribers.listId, listId),
                    isNull(marketingSubscribers.unsubscribedAt),
                ),
            )
            .returning({ id: marketingSubscribers.id });

        if (!updated) {
            const [exists] = await db
                .select({ id: marketingSubscribers.id, unsubscribedAt: marketingSubscribers.unsubscribedAt })
                .from(marketingSubscribers)
                .where(and(eq(marketingSubscribers.id, subId), eq(marketingSubscribers.listId, listId)))
                .limit(1);
            if (!exists) return c.json({ success: false, error: 'Subscriber not found' }, 404);
            return c.json({ success: true, message: 'Subscriber already unsubscribed' });
        }

        return c.json({ success: true, message: 'Subscriber unsubscribed (soft-removed)' });
    }

    async importSubscribers(c: Context) {
        if (!assertMarketing(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const listId = parseInt(c.req.param('id'), 10);
        const body = await c.req.json().catch(() => null);
        const rows = Array.isArray(body?.subscribers) ? body.subscribers : [];

        let imported = 0;
        let updated = 0;
        let skipped = 0;

        for (const row of rows) {
            if (!row?.email) {
                skipped++;
                continue;
            }
            const email = String(row.email).trim().toLowerCase();
            if (!email.includes('@')) {
                skipped++;
                continue;
            }

            const firstName = String(row.firstName ?? row.first_name ?? 'Subscriber').trim();
            const lastName = String(row.lastName ?? row.last_name ?? '').trim() || '-';

            const [existing] = await db
                .select({
                    id: marketingSubscribers.id,
                    firstName: marketingSubscribers.firstName,
                    lastName: marketingSubscribers.lastName,
                    unsubscribedAt: marketingSubscribers.unsubscribedAt,
                })
                .from(marketingSubscribers)
                .where(and(eq(marketingSubscribers.listId, listId), eq(marketingSubscribers.email, email)))
                .limit(1);

            if (existing) {
                await db
                    .update(marketingSubscribers)
                    .set({
                        firstName,
                        lastName,
                        unsubscribedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(marketingSubscribers.id, existing.id));
                updated++;
                continue;
            }

            await db.insert(marketingSubscribers).values({
                listId,
                email,
                firstName,
                lastName,
                source: 'import',
                unsubscribeToken: unsubscribeToken(),
            });
            imported++;
        }

        return c.json({
            success: true,
            data: { imported, updated, skipped, total: rows.length },
        });
    }
}

export const marketingListsController = new MarketingListsController();
