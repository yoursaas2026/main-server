import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { marketingUsers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../utils/password.js';
import { emailService } from '../../services/email.service.js';
import { assertAdmin } from '../../utils/marketing-guard.js';

export class AdminMarketingUsersController {
    async list(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const users = await db
            .select({
                id: marketingUsers.id,
                name: marketingUsers.name,
                email: marketingUsers.email,
                mailboxEmail: marketingUsers.mailboxEmail,
                status: marketingUsers.status,
                lastLoginAt: marketingUsers.lastLoginAt,
                createdAt: marketingUsers.createdAt,
            })
            .from(marketingUsers)
            .orderBy(marketingUsers.id);

        return c.json({ success: true, data: { users } });
    }

    async create(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const body = await c.req.json().catch(() => null);
        if (!body?.name || !body?.email || !body?.password) {
            return c.json({ success: false, error: 'Name, email, and password are required' }, 400);
        }

        const email = String(body.email).trim().toLowerCase();
        const mailboxEmail = body.mailboxEmail ? String(body.mailboxEmail).trim().toLowerCase() : email;

        const [existing] = await db
            .select({ id: marketingUsers.id })
            .from(marketingUsers)
            .where(eq(marketingUsers.email, email))
            .limit(1);

        if (existing) return c.json({ success: false, error: 'Marketing user email already exists' }, 409);

        const plainPassword = String(body.password);
        const [created] = await db
            .insert(marketingUsers)
            .values({
                name: String(body.name).trim(),
                email,
                mailboxEmail,
                password: await hashPassword(plainPassword),
                status: 'active',
                createdByAdminId: admin.id,
            })
            .returning({
                id: marketingUsers.id,
                name: marketingUsers.name,
                email: marketingUsers.email,
                mailboxEmail: marketingUsers.mailboxEmail,
            });

        emailService
            .sendMarketingPortalWelcomeEmail(created.email, created.name, plainPassword)
            .catch((err) => console.error('[AdminMarketing] welcome email failed:', err));

        return c.json({
            success: true,
            message:
                'Marketing user created. Create the same mailbox in Mailu admin with this email and password for webmail access.',
            data: { user: created },
        }, 201);
    }

    async update(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        if (Number.isNaN(id)) return c.json({ success: false, error: 'Invalid ID' }, 400);

        const body = await c.req.json().catch(() => null);
        if (!body) return c.json({ success: false, error: 'Invalid payload' }, 400);

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (body.name) updateData.name = String(body.name).trim();
        if (body.email) updateData.email = String(body.email).trim().toLowerCase();
        if (body.mailboxEmail) updateData.mailboxEmail = String(body.mailboxEmail).trim().toLowerCase();
        if (body.status) updateData.status = body.status;
        if (body.password) updateData.password = await hashPassword(String(body.password));

        const [updated] = await db
            .update(marketingUsers)
            .set(updateData)
            .where(eq(marketingUsers.id, id))
            .returning({
                id: marketingUsers.id,
                name: marketingUsers.name,
                email: marketingUsers.email,
                mailboxEmail: marketingUsers.mailboxEmail,
                status: marketingUsers.status,
            });

        if (!updated) return c.json({ success: false, error: 'User not found' }, 404);
        return c.json({ success: true, data: { user: updated } });
    }

    async delete(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const id = parseInt(c.req.param('id'), 10);
        if (Number.isNaN(id)) return c.json({ success: false, error: 'Invalid ID' }, 400);

        const [deleted] = await db
            .delete(marketingUsers)
            .where(eq(marketingUsers.id, id))
            .returning({ id: marketingUsers.id });

        if (!deleted) return c.json({ success: false, error: 'User not found' }, 404);
        return c.json({ success: true, message: 'Marketing user removed' });
    }
}

export const adminMarketingUsersController = new AdminMarketingUsersController();
