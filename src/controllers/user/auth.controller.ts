import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { clients } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword, generateResetToken } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { emailService } from '../../services/email.service.js';
import { oauthService, type OAuthUserData } from '../../services/oauth.service.js';
import { env } from '../../config/env.js';

export class UserAuthController {
    // User Registration (Email/Password)
    async register(c: Context) {
        try {
            const { name, email, password, phone } = await c.req.json();

            // Validation
            if (!name || !email || !password) {
                return c.json({ error: 'Name, email, and password are required' }, 400);
            }

            if (password.length < 8) {
                return c.json({ error: 'Password must be at least 8 characters long' }, 400);
            }

            // Check if user already exists
            const existingUser = await db
                .select()
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            if (existingUser.length > 0) {
                return c.json({ error: 'Email already registered' }, 409);
            }

            // Hash password
            const hashedPassword = await hashPassword(password);

            // Create user
            const [newUser] = await db
                .insert(clients)
                .values({
                    name,
                    email,
                    password: hashedPassword,
                    phone: phone || null,
                    authProvider: 'email',
                    isEmailVerified: false,
                })
                .returning();

            // Generate JWT token
            const token = generateToken({
                id: newUser.id,
                email: newUser.email,
                role: 'client',
            });

            // Send welcome email
            await emailService.sendWelcomeEmail(newUser.email, newUser.name);

            return c.json({
                message: 'Registration successful',
                token,
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    phone: newUser.phone,
                    isEmailVerified: newUser.isEmailVerified,
                },
            }, 201);
        } catch (error) {
            console.error('Registration error:', error);
            return c.json({ error: 'Registration failed' }, 500);
        }
    }

    // User Login (Email/Password)
    async login(c: Context) {
        try {
            const { email, password } = await c.req.json();

            if (!email || !password) {
                return c.json({ error: 'Email and password are required' }, 400);
            }

            // Find user
            const [user] = await db
                .select()
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            if (!user) {
                return c.json({ error: 'Invalid credentials' }, 401);
            }

            // Check if user registered with OAuth
            if (!user.password) {
                return c.json({
                    error: `This account was registered with ${user.authProvider}. Please use ${user.authProvider} to login.`
                }, 401);
            }

            // Verify password
            const isPasswordValid = await comparePassword(password, user.password);

            if (!isPasswordValid) {
                return c.json({ error: 'Invalid credentials' }, 401);
            }

            // Check account status
            if (user.status !== 'active') {
                return c.json({ error: 'Account is inactive or suspended' }, 403);
            }

            // Update last login
            await db
                .update(clients)
                .set({ lastLoginAt: new Date() })
                .where(eq(clients.id, user.id));

            // Generate JWT token
            const token = generateToken({
                id: user.id,
                email: user.email,
                role: 'client',
            });

            return c.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    profilePicture: user.profilePicture,
                    isEmailVerified: user.isEmailVerified,
                },
            });
        } catch (error) {
            console.error('Login error:', error);
            return c.json({ error: 'Login failed' }, 500);
        }
    }

    // OAuth Login/Register Handler
    async handleOAuthCallback(c: Context, userData: OAuthUserData) {
        try {
            // Check if user exists with this OAuth provider
            let user;

            if (userData.provider === 'google') {
                [user] = await db
                    .select()
                    .from(clients)
                    .where(eq(clients.googleId, userData.providerId))
                    .limit(1);
            } else if (userData.provider === 'microsoft') {
                [user] = await db
                    .select()
                    .from(clients)
                    .where(eq(clients.microsoftId, userData.providerId))
                    .limit(1);
            } else if (userData.provider === 'apple') {
                [user] = await db
                    .select()
                    .from(clients)
                    .where(eq(clients.appleId, userData.providerId))
                    .limit(1);
            }

            // If user doesn't exist with provider ID, check by email
            if (!user) {
                [user] = await db
                    .select()
                    .from(clients)
                    .where(eq(clients.email, userData.email))
                    .limit(1);

                if (user) {
                    // Link OAuth account to existing user
                    const updateData: any = {};

                    if (userData.provider === 'google') {
                        updateData.googleId = userData.providerId;
                    } else if (userData.provider === 'microsoft') {
                        updateData.microsoftId = userData.providerId;
                    } else if (userData.provider === 'apple') {
                        updateData.appleId = userData.providerId;
                    }

                    if (userData.emailVerified) {
                        updateData.isEmailVerified = true;
                    }

                    [user] = await db
                        .update(clients)
                        .set(updateData)
                        .where(eq(clients.id, user.id))
                        .returning();
                }
            }

            // If still no user, create new account
            if (!user) {
                const newUserData: any = {
                    name: userData.name,
                    email: userData.email,
                    authProvider: userData.provider,
                    isEmailVerified: userData.emailVerified,
                    profilePicture: userData.picture,
                };

                if (userData.provider === 'google') {
                    newUserData.googleId = userData.providerId;
                } else if (userData.provider === 'microsoft') {
                    newUserData.microsoftId = userData.providerId;
                } else if (userData.provider === 'apple') {
                    newUserData.appleId = userData.providerId;
                }

                [user] = await db
                    .insert(clients)
                    .values(newUserData)
                    .returning();

                // Send welcome email
                await emailService.sendWelcomeEmail(user.email, user.name);
            } else {
                // Update last login
                await db
                    .update(clients)
                    .set({ lastLoginAt: new Date() })
                    .where(eq(clients.id, user.id));
            }

            // Generate JWT token
            const token = generateToken({
                id: user.id,
                email: user.email,
                role: 'client',
            });

            return {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    profilePicture: user.profilePicture,
                    isEmailVerified: user.isEmailVerified,
                },
            };
        } catch (error) {
            console.error('OAuth callback error:', error);
            throw error;
        }
    }

    // Google OAuth
    async googleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getGoogleAuthUrl(
                env.USER_GOOGLE_CALLBACK_URL
            );
            return c.redirect(authUrl);
        } catch (error) {
            console.error('Google auth error:', error);
            return c.json({ error: 'Failed to initiate Google authentication' }, 500);
        }
    }

    async googleCallback(c: Context) {
        try {
            const code = c.req.query('code');

            if (!code) {
                return c.json({ error: 'No authorization code provided' }, 400);
            }

            const userData = await oauthService.getGoogleUserInfo(
                code,
                env.USER_GOOGLE_CALLBACK_URL
            );
            const result = await this.handleOAuthCallback(c, userData);

            // Redirect to frontend with token
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002'; // Default to 3002 for user portal
            return c.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('Google callback error:', error);
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            return c.redirect(`${frontendUrl}/login?error=google_auth_failed`);
        }
    }

    // Microsoft OAuth
    async microsoftAuth(c: Context) {
        try {
            const authUrl = await oauthService.getMicrosoftAuthUrl(
                env.USER_MICROSOFT_CALLBACK_URL
            );
            return c.redirect(authUrl);
        } catch (error) {
            console.error('Microsoft auth error:', error);
            return c.json({ error: 'Failed to initiate Microsoft authentication' }, 500);
        }
    }

    async microsoftCallback(c: Context) {
        try {
            const code = c.req.query('code');

            if (!code) {
                return c.json({ error: 'No authorization code provided' }, 400);
            }

            const userData = await oauthService.getMicrosoftUserInfo(
                code,
                env.USER_MICROSOFT_CALLBACK_URL
            );
            const result = await this.handleOAuthCallback(c, userData);

            // Redirect to frontend with token
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            return c.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('Microsoft callback error:', error);
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            return c.redirect(`${frontendUrl}/login?error=microsoft_auth_failed`);
        }
    }

    // Apple OAuth
    async appleAuth(c: Context) {
        try {
            const authUrl = await oauthService.getAppleAuthUrl(
                `${env.APPLE_CALLBACK_URL.replace('/developer/', '/user/')}`
            );
            return c.redirect(authUrl);
        } catch (error) {
            console.error('Apple auth error:', error);
            return c.json({ error: 'Failed to initiate Apple authentication' }, 500);
        }
    }

    async appleCallback(c: Context) {
        try {
            const code = c.req.query('code');
            const idToken = c.req.query('id_token');

            if (!code) {
                return c.json({ error: 'No authorization code provided' }, 400);
            }

            const userData = await oauthService.getAppleUserInfo(code, idToken);
            const result = await this.handleOAuthCallback(c, userData);

            // Redirect to frontend with token
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            return c.redirect(`${frontendUrl}/auth/callback?token=${result.token}`);
        } catch (error) {
            console.error('Apple callback error:', error);
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            return c.redirect(`${frontendUrl}/login?error=apple_auth_failed`);
        }
    }

    // Forgot Password
    async forgotPassword(c: Context) {
        try {
            const { email } = await c.req.json();

            if (!email) {
                return c.json({ error: 'Email is required' }, 400);
            }

            const [user] = await db
                .select()
                .from(clients)
                .where(eq(clients.email, email))
                .limit(1);

            // Don't reveal if email exists for security
            if (!user) {
                return c.json({ message: 'If the email exists, a reset link has been sent' });
            }

            // Generate reset token
            const resetToken = generateResetToken();
            const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

            // Save reset token
            await db
                .update(clients)
                .set({
                    resetPasswordToken: resetToken,
                    resetPasswordExpiry: resetExpiry,
                })
                .where(eq(clients.id, user.id));

            // Send reset email
            // Note: We might need a separate method for user reset emails if the URL differs
            const frontendUrl = env.USER_PORTAL_URL || 'http://localhost:3002';
            await emailService.sendPasswordResetEmail(user.email, user.name, resetToken, frontendUrl);

            return c.json({ message: 'If the email exists, a reset link has been sent' });
        } catch (error) {
            console.error('Forgot password error:', error);
            return c.json({ error: 'Failed to process password reset' }, 500);
        }
    }

    // Reset Password
    async resetPassword(c: Context) {
        try {
            const { token, newPassword } = await c.req.json();

            if (!token || !newPassword) {
                return c.json({ error: 'Token and new password are required' }, 400);
            }

            if (newPassword.length < 8) {
                return c.json({ error: 'Password must be at least 8 characters long' }, 400);
            }

            // Find user with valid token
            const [user] = await db
                .select()
                .from(clients)
                .where(eq(clients.resetPasswordToken, token))
                .limit(1);

            if (!user || !user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
                return c.json({ error: 'Invalid or expired reset token' }, 400);
            }

            // Hash new password
            const hashedPassword = await hashPassword(newPassword);

            // Update password and clear reset token
            await db
                .update(clients)
                .set({
                    password: hashedPassword,
                    resetPasswordToken: null,
                    resetPasswordExpiry: null,
                })
                .where(eq(clients.id, user.id));

            return c.json({ message: 'Password reset successful' });
        } catch (error) {
            console.error('Reset password error:', error);
            return c.json({ error: 'Failed to reset password' }, 500);
        }
    }

    // Get Current User
    async getCurrentUser(c: Context) {
        try {
            const user = c.get('user');

            if (!user) {
                return c.json({ error: 'Unauthorized' }, 401);
            }

            if (user.role !== 'client') {
                return c.json({ error: 'Unauthorized: Access denied' }, 403);
            }

            const [client] = await db
                .select()
                .from(clients)
                .where(eq(clients.id, user.id))
                .limit(1);

            if (!client) {
                return c.json({ error: 'User not found' }, 404);
            }

            return c.json({
                user: {
                    id: client.id,
                    name: client.name,
                    email: client.email,
                    phone: client.phone,
                    profilePicture: client.profilePicture,
                    companyName: client.companyName,
                    role: 'client',
                    authProvider: client.authProvider,
                },
            });
        } catch (error) {
            console.error('Get current user error:', error);
            return c.json({ error: 'Failed to get user data' }, 500);
        }
    }
}

export const userAuthController = new UserAuthController();
