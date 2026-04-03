import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { clients } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword, generateResetToken } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { notificationService } from '../../services/notification.service.js';
import { oauthService, type OAuthUserData } from '../../services/oauth.service.js';
import { env } from '../../config/env.js';
import {
    RegisterSchema,
    LoginSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    type ClientAuthProfile,
    type ClientPublicProfile,
    type AuthResponseData,
} from '../../types/auth.types.js';

// ─── Helper: pick only safe fields to send back to clients ────────────────────

function pickClientAuthProfile(client: typeof clients.$inferSelect): ClientAuthProfile {
    return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        profilePicture: client.profilePicture,
        isEmailVerified: client.isEmailVerified,
    };
}

function pickClientPublicProfile(client: typeof clients.$inferSelect): ClientPublicProfile {
    return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        profilePicture: client.profilePicture,
        companyName: client.companyName,
        isEmailVerified: client.isEmailVerified,
        authProvider: client.authProvider,
    };
}

// ─── Helper: build the OAuth provider ID column map ───────────────────────────

type OAuthProvider = OAuthUserData['provider'];

const PROVIDER_ID_FIELD = {
    google: 'googleId',
    microsoft: 'microsoftId',
    apple: 'appleId',
} as const satisfies Record<OAuthProvider, keyof typeof clients.$inferSelect>;

// ─── Controller ───────────────────────────────────────────────────────────────

export class UserAuthController {
    // ── Register ──────────────────────────────────────────────────────────────

    async register(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = RegisterSchema.safeParse(body);

        if (!parsed.success) {
            return c.json(
                { success: false, error: parsed.error.issues[0].message },
                400,
            );
        }

        const { name, email, password, phone } = parsed.data;

        try {
            // Single DB read: check existence
            const [existing] = await db
                .select({ id: clients.id })
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            if (existing) {
                return c.json({ success: false, error: 'Email already registered' }, 409);
            }

            const hashedPassword = await hashPassword(password);

            const [newClient] = await db
                .insert(clients)
                .values({
                    name,
                    email,
                    password: hashedPassword,
                    phone: phone ?? null,
                    authProvider: 'email',
                    isEmailVerified: false,
                })
                .returning();

            const token = generateToken({ id: newClient.id, email: newClient.email, role: 'client' });

            // Fire-and-forget — never block registration on email delivery
            notificationService.sendWelcomeEmail(newClient.email, newClient.name);

            const data: AuthResponseData<ClientAuthProfile> = {
                token,
                user: pickClientAuthProfile(newClient),
            };

            return c.json({ success: true, message: 'Registration successful', data }, 201);
        } catch (error) {
            console.error('[UserAuth] register error:', error);
            return c.json({ success: false, error: 'Registration failed' }, 500);
        }
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    async login(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = LoginSchema.safeParse(body);

        if (!parsed.success) {
            return c.json(
                { success: false, error: parsed.error.issues[0].message },
                400,
            );
        }

        const { email, password } = parsed.data;

        try {
            const [user] = await db
                .select()
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            if (!user) {
                return c.json({ success: false, error: 'Invalid credentials' }, 401);
            }

            // OAuth-only accounts have no password
            if (!user.password) {
                return c.json(
                    {
                        success: false,
                        error: `This account uses ${user.authProvider} sign-in. Please use ${user.authProvider} to log in.`,
                    },
                    401,
                );
            }

            const isValid = await comparePassword(password, user.password);
            if (!isValid) {
                return c.json({ success: false, error: 'Invalid credentials' }, 401);
            }

            if (user.status !== 'active') {
                return c.json({ success: false, error: 'Account is inactive or suspended' }, 403);
            }

            // Update last login (non-blocking, failure is acceptable)
            db.update(clients)
                .set({ lastLoginAt: new Date() })
                .where(eq(clients.id, user.id))
                .catch((err) =>
                    console.error('[UserAuth] Failed to update lastLoginAt:', err),
                );

            const token = generateToken({ id: user.id, email: user.email, role: 'client' });

            const data: AuthResponseData<ClientAuthProfile> = {
                token,
                user: pickClientAuthProfile(user),
            };

            return c.json({ success: true, message: 'Login successful', data });
        } catch (error) {
            console.error('[UserAuth] login error:', error);
            return c.json({ success: false, error: 'Login failed' }, 500);
        }
    }

    // ── OAuth Callback (shared logic) ─────────────────────────────────────────

    async handleOAuthCallback(
        _c: Context,
        userData: OAuthUserData,
    ): Promise<AuthResponseData<ClientAuthProfile>> {
        const providerField = PROVIDER_ID_FIELD[userData.provider];

        // Look up by provider ID first
        const [existingByProvider] = await db
            .select()
            .from(clients)
            .where(eq(clients[providerField], userData.providerId))
            .limit(1);

        let user = existingByProvider;

        if (!user) {
            // Fallback: look up by email to link provider
            const [existingByEmail] = await db
                .select()
                .from(clients)
                .where(eq(clients.email, userData.email))
                .limit(1);

            if (existingByEmail) {
                // Link OAuth provider to existing account
                const updatePayload: Partial<typeof clients.$inferInsert> = {
                    [providerField]: userData.providerId,
                    ...(userData.emailVerified ? { isEmailVerified: true } : {}),
                    lastLoginAt: new Date(),
                };

                [user] = await db
                    .update(clients)
                    .set(updatePayload)
                    .where(eq(clients.id, existingByEmail.id))
                    .returning();
            }
        }

        if (!user) {
            // New user — create account
            const insertPayload: typeof clients.$inferInsert = {
                name: userData.name,
                email: userData.email,
                authProvider: userData.provider,
                isEmailVerified: userData.emailVerified,
                profilePicture: userData.picture ?? null,
                [providerField]: userData.providerId,
            };

            [user] = await db.insert(clients).values(insertPayload).returning();

            // Fire-and-forget welcome email
            notificationService.sendWelcomeEmail(user.email, user.name);
        } else if (existingByProvider) {
            // Existing provider match — bump last login (non-blocking)
            db.update(clients)
                .set({ lastLoginAt: new Date() })
                .where(eq(clients.id, user.id))
                .catch((err) =>
                    console.error('[UserAuth] Failed to update lastLoginAt:', err),
                );
        }

        const token = generateToken({ id: user.id, email: user.email, role: 'client' });

        return { token, user: pickClientAuthProfile(user) };
    }

    // ── Google OAuth ──────────────────────────────────────────────────────────

    async googleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getGoogleAuthUrl(env.USER_GOOGLE_CALLBACK_URL);
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[UserAuth] googleAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Google authentication' }, 500);
        }
    }

    async googleCallback(c: Context) {
        const code = c.req.query('code');

        if (!code) {
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getGoogleUserInfo(code, env.USER_GOOGLE_CALLBACK_URL);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.USER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[UserAuth] googleCallback error:', error);
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=google_auth_failed`);
        }
    }

    // ── Microsoft OAuth ───────────────────────────────────────────────────────

    async microsoftAuth(c: Context) {
        try {
            const authUrl = await oauthService.getMicrosoftAuthUrl(env.USER_MICROSOFT_CALLBACK_URL);
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[UserAuth] microsoftAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Microsoft authentication' }, 500);
        }
    }

    async microsoftCallback(c: Context) {
        const code = c.req.query('code');

        if (!code) {
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getMicrosoftUserInfo(code, env.USER_MICROSOFT_CALLBACK_URL);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.USER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[UserAuth] microsoftCallback error:', error);
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=microsoft_auth_failed`);
        }
    }

    // ── Apple OAuth ───────────────────────────────────────────────────────────

    async appleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getAppleAuthUrl();
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[UserAuth] appleAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Apple authentication' }, 500);
        }
    }

    async appleCallback(c: Context) {
        const code = c.req.query('code');
        const idToken = c.req.query('id_token') ?? undefined;

        if (!code) {
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getAppleUserInfo(code, idToken);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.USER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[UserAuth] appleCallback error:', error);
            return c.redirect(`${env.USER_PORTAL_URL}/login?error=apple_auth_failed`);
        }
    }

    // ── Forgot Password ───────────────────────────────────────────────────────

    async forgotPassword(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = ForgotPasswordSchema.safeParse(body);

        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
        }

        const { email } = parsed.data;
        // Always return the same message to prevent email enumeration
        const safeResponse = {
            success: true,
            message: 'If that email is registered, a reset link has been sent',
        } as const;

        try {
            const [user] = await db
                .select({ id: clients.id, email: clients.email, name: clients.name, password: clients.password })
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            if (!user) return c.json(safeResponse);

            // Block password reset for OAuth-only accounts
            if (!user.password) return c.json(safeResponse);

            const resetToken = generateResetToken();
            const resetExpiry = new Date(Date.now() + 3_600_000); // 1 hour

            await db
                .update(clients)
                .set({ resetPasswordToken: resetToken, resetPasswordExpiry: resetExpiry })
                .where(eq(clients.id, user.id));

            // Fire-and-forget
            notificationService.sendPasswordResetEmail(user.email, user.name, resetToken, env.USER_PORTAL_URL);

            return c.json(safeResponse);
        } catch (error) {
            console.error('[UserAuth] forgotPassword error:', error);
            return c.json({ success: false, error: 'Failed to process password reset' }, 500);
        }
    }

    // ── Reset Password ────────────────────────────────────────────────────────

    async resetPassword(c: Context) {
        const body = await c.req.json().catch(() => null);
        const parsed = ResetPasswordSchema.safeParse(body);

        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0].message }, 400);
        }

        const { token, newPassword } = parsed.data;

        try {
            const [user] = await db
                .select({
                    id: clients.id,
                    resetPasswordToken: clients.resetPasswordToken,
                    resetPasswordExpiry: clients.resetPasswordExpiry,
                })
                .from(clients)
                .where(eq(clients.resetPasswordToken, token))
                .limit(1);

            if (!user || !user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
                return c.json({ success: false, error: 'Invalid or expired reset token' }, 400);
            }

            const hashedPassword = await hashPassword(newPassword);

            await db
                .update(clients)
                .set({
                    password: hashedPassword,
                    resetPasswordToken: null,
                    resetPasswordExpiry: null,
                })
                .where(eq(clients.id, user.id));

            return c.json({ success: true, message: 'Password reset successful' });
        } catch (error) {
            console.error('[UserAuth] resetPassword error:', error);
            return c.json({ success: false, error: 'Failed to reset password' }, 500);
        }
    }

    // ── Get Current User ──────────────────────────────────────────────────────

    async getCurrentUser(c: Context) {
        const jwtUser = c.get('user');

        if (!jwtUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        if (jwtUser.role !== 'client') {
            return c.json({ success: false, error: 'Access denied' }, 403);
        }

        try {
            const [client] = await db
                .select()
                .from(clients)
                .where(eq(clients.id, jwtUser.id))
                .limit(1);

            if (!client) {
                return c.json({ success: false, error: 'User not found' }, 404);
            }

            return c.json({
                success: true,
                message: 'User fetched successfully',
                data: { user: pickClientPublicProfile(client) },
            });
        } catch (error) {
            console.error('[UserAuth] getCurrentUser error:', error);
            return c.json({ success: false, error: 'Failed to get user data' }, 500);
        }
    }
}

export const userAuthController = new UserAuthController();
