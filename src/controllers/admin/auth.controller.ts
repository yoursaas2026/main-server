import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { admins } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateToken } from '../../utils/jwt.js';
import { hashPassword, comparePassword } from '../../utils/password.js';

export class AdminAuthController {
    // ── Email/Password Login ──────────────────────────────────────────────────
    async login(c: Context) {
        try {
            const body = await c.req.json().catch(() => null);
            if (!body || !body.email || !body.password) {
                return c.json({ success: false, error: 'Email and password are required' }, 400);
            }

            const { email, password } = body;

            const [admin] = await db
                .select()
                .from(admins)
                .where(eq(admins.email, email))
                .limit(1);

            if (!admin) {
                return c.json({ success: false, error: 'Invalid credentials' }, 401);
            }

            if (admin.status !== 'active') {
                return c.json({ success: false, error: 'Account is inactive' }, 403);
            }

            const isPasswordValid = await comparePassword(password, admin.password);
            if (!isPasswordValid) {
                return c.json({ success: false, error: 'Invalid credentials' }, 401);
            }

            // Update last login
            await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));

            const token = generateToken({ id: admin.id, email: admin.email, role: 'admin' });

            return c.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    user: { id: admin.id, name: admin.name, email: admin.email, profilePicture: admin.profilePicture }
                }
            });
        } catch (error) {
            console.error('[AdminAuth] login error:', error);
            return c.json({ success: false, error: 'Login failed' }, 500);
        }
    }

    // ── Create Admin (Protected) ──────────────────────────────────────────────
    async createAdmin(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized. Only admins can create admins.' }, 403);
        }

        const body = await c.req.json().catch(() => null);
        if (!body || !body.email || !body.name || !body.password) {
            return c.json({ success: false, error: 'Email, name, and password are required' }, 400);
        }

        const { name, email, password } = body;

        try {
            const [existing] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1);
            if (existing) {
                return c.json({ success: false, error: 'Admin email already exists' }, 409);
            }

            const hashedPassword = await hashPassword(password);

            const [newAdmin] = await db.insert(admins).values({
                name,
                email,
                password: hashedPassword,
                createdBy: jwtUser.id
            }).returning();

            return c.json({ success: true, message: 'Admin created successfully', data: { id: newAdmin.id, name: newAdmin.name, email: newAdmin.email } });
        } catch (error) {
            console.error('[AdminAuth] createAdmin error:', error);
            return c.json({ success: false, error: 'Failed to create admin' }, 500);
        }
    }

    // ── Get Current User ──────────────────────────────────────────────────────
    async getCurrentUser(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        try {
            const [admin] = await db
                .select({ id: admins.id, name: admins.name, email: admins.email, profilePicture: admins.profilePicture, status: admins.status })
                .from(admins)
                .where(eq(admins.id, jwtUser.id))
                .limit(1);

            if (!admin) {
                return c.json({ success: false, error: 'Admin not found' }, 404);
            }

            return c.json({ success: true, data: { user: admin } });
        } catch (error) {
            console.error('[AdminAuth] getCurrentUser error:', error);
            return c.json({ success: false, error: 'Failed to get user data' }, 500);
        }
    }

    // ── Get All Admins ────────────────────────────────────────────────────────
    async getAllAdmins(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        try {
            const allAdmins = await db
                .select({
                    id: admins.id,
                    name: admins.name,
                    email: admins.email,
                    profilePicture: admins.profilePicture,
                    status: admins.status,
                    lastLoginAt: admins.lastLoginAt,
                    createdAt: admins.createdAt
                })
                .from(admins)
                .orderBy(admins.id);

            return c.json({ success: true, data: { admins: allAdmins } });
        } catch (error) {
            console.error('[AdminAuth] getAllAdmins error:', error);
            return c.json({ success: false, error: 'Failed to fetch admins' }, 500);
        }
    }

    // ── Update Admin ─────────────────────────────────────────────────────────
    async updateAdmin(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const adminId = parseInt(idParam, 10);

        if (isNaN(adminId)) {
            return c.json({ success: false, error: 'Invalid admin ID' }, 400);
        }

        const body = await c.req.json().catch(() => null);
        if (!body) {
            return c.json({ success: false, error: 'Invalid payload' }, 400);
        }

        try {
            const updateData: any = {};
            if (body.name) updateData.name = body.name;
            if (body.email) updateData.email = body.email;
            if (body.password) {
                updateData.password = await hashPassword(body.password);
            }

            const [updated] = await db
                .update(admins)
                .set(updateData)
                .where(eq(admins.id, adminId))
                .returning({ id: admins.id, name: admins.name, email: admins.email });

            if (!updated) {
                return c.json({ success: false, error: 'Admin not found' }, 404);
            }

            return c.json({ success: true, message: 'Admin updated successfully', data: { admin: updated } });
        } catch (error) {
            console.error('[AdminAuth] updateAdmin error:', error);
            return c.json({ success: false, error: 'Failed to update admin' }, 500);
        }
    }

    // ── Delete / Revoke Admin ─────────────────────────────────────────────────
    async deleteAdmin(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const adminId = parseInt(idParam, 10);

        if (isNaN(adminId)) {
            return c.json({ success: false, error: 'Invalid admin ID' }, 400);
        }

        if (adminId === jwtUser.id) {
            return c.json({ success: false, error: 'Cannot revoke your own access' }, 400);
        }

        try {
            const [deleted] = await db.delete(admins).where(eq(admins.id, adminId)).returning({ id: admins.id });
            if (!deleted) {
                return c.json({ success: false, error: 'Admin not found' }, 404);
            }

            return c.json({ success: true, message: 'Admin access revoked successfully' });
        } catch (error) {
            console.error('[AdminAuth] deleteAdmin error:', error);
            return c.json({ success: false, error: 'Failed to delete admin' }, 500);
        }
    }
}

export const adminAuthController = new AdminAuthController();
