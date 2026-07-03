import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { marketingUsers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateToken } from '../../utils/jwt.js';
import { hashPassword, comparePassword, generateResetToken } from '../../utils/password.js';
import { ForgotPasswordSchema, ResetPasswordSchema } from '../../types/auth.types.js';
import { notificationService } from '../../services/notification.service.js';
import { emailService } from '../../services/email.service.js';
import { env } from '../../config/env.js';
import { assertMarketing } from '../../utils/marketing-guard.js';

export class MarketingAuthController {
    async login(c: Context) {
        try {
            const body = await c.req.json().catch(() => null);
            if (!body?.email || !body?.password) {
                return c.json({ success: false, error: 'Email and password are required' }, 400);
            }

            const [user] = await db
                .select()
                .from(marketingUsers)
                .where(eq(marketingUsers.email, body.email))
                .limit(1);

            if (!user || user.status !== 'active') {
                return c.json({ success: false, error: 'Invalid credentials' }, 401);
            }

            const valid = await comparePassword(body.password, user.password);
            if (!valid) return c.json({ success: false, error: 'Invalid credentials' }, 401);

            await db
                .update(marketingUsers)
                .set({ lastLoginAt: new Date() })
                .where(eq(marketingUsers.id, user.id));

            const token = generateToken({ id: user.id, email: user.email, role: 'marketing' });

            return c.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        mailboxEmail: user.mailboxEmail,
                        profilePicture: user.profilePicture,
                    },
                },
            });
        } catch (error) {
            console.error('[MarketingAuth] login error:', error);
            return c.json({ success: false, error: 'Login failed' }, 500);
        }
    }

    async forgotPassword(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = ForgotPasswordSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
        }

        const safeResponse = {
            success: true,
            message: 'If that email is registered, a reset link has been sent',
        } as const;

        try {
            const [user] = await db
                .select({ id: marketingUsers.id, email: marketingUsers.email, name: marketingUsers.name, status: marketingUsers.status })
                .from(marketingUsers)
                .where(eq(marketingUsers.email, parsed.data.email))
                .limit(1);

            if (!user || user.status !== 'active') return c.json(safeResponse);

            const resetToken = generateResetToken();
            await db
                .update(marketingUsers)
                .set({
                    resetPasswordToken: resetToken,
                    resetPasswordExpiry: new Date(Date.now() + 3_600_000),
                })
                .where(eq(marketingUsers.id, user.id));

            notificationService.sendPasswordResetEmail(
                user.email,
                user.name,
                resetToken,
                env.MARKETING_PORTAL_URL,
            );

            return c.json(safeResponse);
        } catch (error) {
            console.error('[MarketingAuth] forgotPassword error:', error);
            return c.json({ success: false, error: 'Failed to process password reset' }, 500);
        }
    }

    async resetPassword(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = ResetPasswordSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
        }

        try {
            const [user] = await db
                .select({
                    id: marketingUsers.id,
                    resetPasswordToken: marketingUsers.resetPasswordToken,
                    resetPasswordExpiry: marketingUsers.resetPasswordExpiry,
                })
                .from(marketingUsers)
                .where(eq(marketingUsers.resetPasswordToken, parsed.data.token))
                .limit(1);

            if (!user?.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
                return c.json({ success: false, error: 'Invalid or expired reset token' }, 400);
            }

            await db
                .update(marketingUsers)
                .set({
                    password: await hashPassword(parsed.data.newPassword),
                    resetPasswordToken: null,
                    resetPasswordExpiry: null,
                    updatedAt: new Date(),
                })
                .where(eq(marketingUsers.id, user.id));

            return c.json({ success: true, message: 'Password reset successful' });
        } catch (error) {
            console.error('[MarketingAuth] resetPassword error:', error);
            return c.json({ success: false, error: 'Failed to reset password' }, 500);
        }
    }

    async getCurrentUser(c: Context) {
        const jwtUser = assertMarketing(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const [user] = await db
            .select({
                id: marketingUsers.id,
                name: marketingUsers.name,
                email: marketingUsers.email,
                mailboxEmail: marketingUsers.mailboxEmail,
                profilePicture: marketingUsers.profilePicture,
                status: marketingUsers.status,
            })
            .from(marketingUsers)
            .where(eq(marketingUsers.id, jwtUser.id))
            .limit(1);

        if (!user) return c.json({ success: false, error: 'User not found' }, 404);

        return c.json({
            success: true,
            data: {
                user,
                webmailUrl: env.MAIL_WEBMAIL_URL,
            },
        });
    }
}

export const marketingAuthController = new MarketingAuthController();
