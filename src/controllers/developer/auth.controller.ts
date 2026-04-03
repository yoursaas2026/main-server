import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
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
    type DeveloperAuthProfile,
    type DeveloperPublicProfile,
    type AuthResponseData,
} from '../../types/auth.types.js';

// ─── Helper: pick only safe fields to send back to clients ────────────────────

function pickDeveloperAuthProfile(dev: typeof developers.$inferSelect): DeveloperAuthProfile {
    return {
        id: dev.id,
        name: dev.name,
        email: dev.email,
        phone: dev.phone,
        profilePicture: dev.profilePicture,
        isEmailVerified: dev.isEmailVerified,
        kycStatus: dev.kycStatus,
    };
}

function pickDeveloperPublicProfile(dev: typeof developers.$inferSelect): DeveloperPublicProfile {
    return {
        id: dev.id,
        name: dev.name,
        email: dev.email,
        phone: dev.phone,
        profilePicture: dev.profilePicture,
        bio: dev.bio,
        skills: dev.skills,
        experience: dev.experience,
        portfolioUrl: dev.portfolioUrl,
        githubUrl: dev.githubUrl,
        linkedinUrl: dev.linkedinUrl,
        kycStatus: dev.kycStatus,
        isEmailVerified: dev.isEmailVerified,
        isPhoneVerified: dev.isPhoneVerified,
        authProvider: dev.authProvider,
    };
}

// ─── Helper: build the OAuth provider ID column map ───────────────────────────

type OAuthProvider = OAuthUserData['provider'];

const PROVIDER_ID_FIELD = {
    google: 'googleId',
    microsoft: 'microsoftId',
    apple: 'appleId',
} as const satisfies Record<OAuthProvider, keyof typeof developers.$inferSelect>;

// ─── Controller ───────────────────────────────────────────────────────────────

export class DeveloperAuthController {
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
                .select({ id: developers.id })
                .from(developers)
                .where(eq(developers.email, email))
                .limit(1);

            if (existing) {
                return c.json({ success: false, error: 'Email already registered' }, 409);
            }

            const hashedPassword = await hashPassword(password);

            const [newDev] = await db
                .insert(developers)
                .values({
                    name,
                    email,
                    password: hashedPassword,
                    phone: phone ?? null,
                    authProvider: 'email',
                    isEmailVerified: false,
                })
                .returning();

            const token = generateToken({ id: newDev.id, email: newDev.email, role: 'developer' });

            // Fire-and-forget — never block registration on email delivery
            notificationService.sendWelcomeEmail(newDev.email, newDev.name);

            const data: AuthResponseData<DeveloperAuthProfile> = {
                token,
                user: pickDeveloperAuthProfile(newDev),
            };

            return c.json({ success: true, message: 'Registration successful', data }, 201);
        } catch (error) {
            console.error('[DeveloperAuth] register error:', error);
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
                .from(developers)
                .where(eq(developers.email, email))
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
            db.update(developers)
                .set({ lastLoginAt: new Date() })
                .where(eq(developers.id, user.id))
                .catch((err) =>
                    console.error('[DeveloperAuth] Failed to update lastLoginAt:', err),
                );

            const token = generateToken({ id: user.id, email: user.email, role: 'developer' });

            const data: AuthResponseData<DeveloperAuthProfile> = {
                token,
                user: pickDeveloperAuthProfile(user),
            };

            return c.json({ success: true, message: 'Login successful', data });
        } catch (error) {
            console.error('[DeveloperAuth] login error:', error);
            return c.json({ success: false, error: 'Login failed' }, 500);
        }
    }

    // ── OAuth Callback (shared logic) ─────────────────────────────────────────

    async handleOAuthCallback(
        _c: Context,
        userData: OAuthUserData,
    ): Promise<AuthResponseData<DeveloperAuthProfile>> {
        const providerField = PROVIDER_ID_FIELD[userData.provider];

        // Single query: look up by provider ID OR by email (avoids two separate reads)
        const [existingByProvider] = await db
            .select()
            .from(developers)
            .where(eq(developers[providerField], userData.providerId))
            .limit(1);

        let user = existingByProvider;

        if (!user) {
            // Fallback: look up by email to link the provider
            const [existingByEmail] = await db
                .select()
                .from(developers)
                .where(eq(developers.email, userData.email))
                .limit(1);

            if (existingByEmail) {
                // Link OAuth provider to existing account
                const updatePayload: Partial<typeof developers.$inferInsert> = {
                    [providerField]: userData.providerId,
                    ...(userData.emailVerified ? { isEmailVerified: true } : {}),
                    lastLoginAt: new Date(),
                };

                [user] = await db
                    .update(developers)
                    .set(updatePayload)
                    .where(eq(developers.id, existingByEmail.id))
                    .returning();
            }
        }

        if (!user) {
            // New user — create account
            const insertPayload: typeof developers.$inferInsert = {
                name: userData.name,
                email: userData.email,
                authProvider: userData.provider,
                isEmailVerified: userData.emailVerified,
                profilePicture: userData.picture ?? null,
                [providerField]: userData.providerId,
            };

            [user] = await db.insert(developers).values(insertPayload).returning();

            // Fire-and-forget welcome email
            notificationService.sendWelcomeEmail(user.email, user.name);
        } else if (existingByProvider) {
            // Existing provider match — just bump last login (non-blocking)
            db.update(developers)
                .set({ lastLoginAt: new Date() })
                .where(eq(developers.id, user.id))
                .catch((err) =>
                    console.error('[DeveloperAuth] Failed to update lastLoginAt:', err),
                );
        }

        const token = generateToken({ id: user.id, email: user.email, role: 'developer' });

        return { token, user: pickDeveloperAuthProfile(user) };
    }

    // ── Google OAuth ──────────────────────────────────────────────────────────

    async googleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getGoogleAuthUrl();
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[DeveloperAuth] googleAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Google authentication' }, 500);
        }
    }

    async googleCallback(c: Context) {
        const code = c.req.query('code');

        if (!code) {
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getGoogleUserInfo(code);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[DeveloperAuth] googleCallback error:', error);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=google_auth_failed`);
        }
    }

    // ── Microsoft OAuth ───────────────────────────────────────────────────────

    async microsoftAuth(c: Context) {
        try {
            const authUrl = await oauthService.getMicrosoftAuthUrl();
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[DeveloperAuth] microsoftAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Microsoft authentication' }, 500);
        }
    }

    async microsoftCallback(c: Context) {
        const code = c.req.query('code');

        if (!code) {
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getMicrosoftUserInfo(code);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[DeveloperAuth] microsoftCallback error:', error);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=microsoft_auth_failed`);
        }
    }

    // ── Apple OAuth ───────────────────────────────────────────────────────────

    async appleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getAppleAuthUrl();
            return c.redirect(authUrl);
        } catch (error) {
            console.error('[DeveloperAuth] appleAuth error:', error);
            return c.json({ success: false, error: 'Failed to initiate Apple authentication' }, 500);
        }
    }

    async appleCallback(c: Context) {
        const code = c.req.query('code');
        const idToken = c.req.query('id_token') ?? undefined;

        if (!code) {
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=missing_code`);
        }

        try {
            const userData = await oauthService.getAppleUserInfo(code, idToken);
            const result = await this.handleOAuthCallback(c, userData);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('[DeveloperAuth] appleCallback error:', error);
            return c.redirect(`${env.DEVELOPER_PORTAL_URL}/login?error=apple_auth_failed`);
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
                .select({ id: developers.id, email: developers.email, name: developers.name, password: developers.password })
                .from(developers)
                .where(eq(developers.email, email))
                .limit(1);

            if (!user) return c.json(safeResponse);

            // Block password reset for OAuth-only accounts
            if (!user.password) return c.json(safeResponse);

            const resetToken = generateResetToken();
            const resetExpiry = new Date(Date.now() + 3_600_000); // 1 hour

            await db
                .update(developers)
                .set({ resetPasswordToken: resetToken, resetPasswordExpiry: resetExpiry })
                .where(eq(developers.id, user.id));

            // Fire-and-forget
            notificationService.sendPasswordResetEmail(user.email, user.name, resetToken);

            return c.json(safeResponse);
        } catch (error) {
            console.error('[DeveloperAuth] forgotPassword error:', error);
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
                    id: developers.id,
                    resetPasswordToken: developers.resetPasswordToken,
                    resetPasswordExpiry: developers.resetPasswordExpiry,
                })
                .from(developers)
                .where(eq(developers.resetPasswordToken, token))
                .limit(1);

            if (!user || !user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
                return c.json({ success: false, error: 'Invalid or expired reset token' }, 400);
            }

            const hashedPassword = await hashPassword(newPassword);

            await db
                .update(developers)
                .set({
                    password: hashedPassword,
                    resetPasswordToken: null,
                    resetPasswordExpiry: null,
                })
                .where(eq(developers.id, user.id));

            return c.json({ success: true, message: 'Password reset successful' });
        } catch (error) {
            console.error('[DeveloperAuth] resetPassword error:', error);
            return c.json({ success: false, error: 'Failed to reset password' }, 500);
        }
    }

    // ── Get Current User ──────────────────────────────────────────────────────

    async getCurrentUser(c: Context) {
        const jwtUser = c.get('user');

        if (!jwtUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        if (jwtUser.role !== 'developer') {
            return c.json({ success: false, error: 'Access denied' }, 403);
        }

        try {
            const [developer] = await db
                .select()
                .from(developers)
                .where(eq(developers.id, jwtUser.id))
                .limit(1);

            if (!developer) {
                return c.json({ success: false, error: 'User not found' }, 404);
            }

            return c.json({
                success: true,
                message: 'User fetched successfully',
                data: { user: pickDeveloperPublicProfile(developer) },
            });
        } catch (error) {
            console.error('[DeveloperAuth] getCurrentUser error:', error);
            return c.json({ success: false, error: 'Failed to get user data' }, 500);
        }
    }
}

export const developerAuthController = new DeveloperAuthController();
