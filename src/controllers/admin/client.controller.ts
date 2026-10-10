import type { Context } from 'hono';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients } from '../../db/schema.js';

function assertAdmin(c: Context) {
    const jwtUser = c.get('user') as { role?: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'admin') return null;
    return jwtUser;
}

export class AdminClientController {
    async listClients(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const q = (c.req.query('q') || '').trim();
        const status = (c.req.query('status') || '').trim().toLowerCase();
        const limitRaw = Number.parseInt(c.req.query('limit') || '25', 10);
        const offsetRaw = Number.parseInt(c.req.query('offset') || '0', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        try {
            const filters = [];
            if (q) {
                const pattern = `%${q.replace(/[%_]/g, '')}%`;
                const idExact = /^\d+$/.test(q) ? Number.parseInt(q, 10) : null;
                filters.push(
                    or(
                        ...(idExact != null ? [eq(clients.id, idExact)] : []),
                        ilike(clients.name, pattern),
                        ilike(clients.email, pattern),
                        ilike(clients.companyName, pattern),
                        ilike(clients.phone, pattern),
                    ),
                );
            }
            if (status && ['active', 'inactive', 'suspended'].includes(status)) {
                filters.push(eq(clients.status, status));
            }

            const whereClause = filters.length ? and(...filters) : undefined;

            const [totalRow] = await db
                .select({ value: count() })
                .from(clients)
                .where(whereClause);

            const rows = await db
                .select({
                    id: clients.id,
                    name: clients.name,
                    email: clients.email,
                    companyName: clients.companyName,
                    status: clients.status,
                    isEmailVerified: clients.isEmailVerified,
                    authProvider: clients.authProvider,
                    createdAt: clients.createdAt,
                    lastLoginAt: clients.lastLoginAt,
                })
                .from(clients)
                .where(whereClause)
                .orderBy(desc(clients.createdAt))
                .limit(limit)
                .offset(offset);

            return c.json({
                success: true,
                data: {
                    clients: rows,
                    pagination: {
                        limit,
                        offset,
                        total: Number(totalRow?.value ?? 0),
                    },
                },
            });
        } catch (error) {
            console.error('[AdminClient] listClients error:', error);
            return c.json({ success: false, error: 'Failed to fetch buyers' }, 500);
        }
    }

    async getClient(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const id = Number.parseInt(c.req.param('id'), 10);
        if (!Number.isInteger(id) || id <= 0) {
            return c.json({ success: false, error: 'Invalid client ID' }, 400);
        }

        try {
            const [row] = await db
                .select({
                    id: clients.id,
                    name: clients.name,
                    email: clients.email,
                    phone: clients.phone,
                    companyName: clients.companyName,
                    companyWebsite: clients.companyWebsite,
                    industry: clients.industry,
                    city: clients.city,
                    country: clients.country,
                    accountType: clients.accountType,
                    status: clients.status,
                    isEmailVerified: clients.isEmailVerified,
                    authProvider: clients.authProvider,
                    onboardingCompletedAt: clients.onboardingCompletedAt,
                    createdAt: clients.createdAt,
                    updatedAt: clients.updatedAt,
                    lastLoginAt: clients.lastLoginAt,
                })
                .from(clients)
                .where(eq(clients.id, id))
                .limit(1);

            if (!row) {
                return c.json({ success: false, error: 'Buyer not found' }, 404);
            }

            return c.json({ success: true, data: { client: row } });
        } catch (error) {
            console.error('[AdminClient] getClient error:', error);
            return c.json({ success: false, error: 'Failed to fetch buyer' }, 500);
        }
    }
}

export const adminClientController = new AdminClientController();
