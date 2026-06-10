import axios from 'axios';
import { env } from '../config/env.js';
class BrevoEmailService {
    apiKey;
    apiUrl = 'https://api.brevo.com/v3/smtp/email';
    constructor() {
        this.apiKey = env.BREVO_API_KEY;
    }
    async sendEmail({ to, subject, htmlContent, textContent }) {
        try {
            const response = await axios.post(this.apiUrl, {
                sender: {
                    name: env.BREVO_SENDER_NAME,
                    email: env.BREVO_SENDER_EMAIL,
                },
                to: [
                    {
                        email: to,
                    },
                ],
                subject,
                htmlContent,
                textContent: textContent || subject,
            }, {
                headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
            });
            return response.status === 201;
        }
        catch (error) {
            console.error('Brevo email error:', error);
            return false;
        }
    }
    async sendWelcomeEmail(email, name) {
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to YourSaaS!</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${name}! 👋</h2>
                        <p>We're thrilled to have you join the YourSaaS developer community!</p>
                        <p>You're now part of a growing community of 5,000+ developers building amazing things together.</p>
                        <p>Here's what you can do next:</p>
                        <ul>
                            <li>Complete your profile</li>
                            <li>Explore available projects</li>
                            <li>Connect with other developers</li>
                            <li>Start earning</li>
                        </ul>
                        <a href="${env.DEVELOPER_PORTAL_URL}/dashboard" class="button">Go to Dashboard</a>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'Welcome to YourSaaS Community! 🎉',
            htmlContent,
        });
    }
    async sendPasswordResetEmail(email, name, resetToken, appUrl = env.DEVELOPER_PORTAL_URL) {
        const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                    .warning { color: #e74c3c; margin-top: 20px; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Password Reset Request</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${name},</h2>
                        <p>We received a request to reset your password for your YourSaaS account.</p>
                        <p>Click the button below to reset your password:</p>
                        <a href="${resetUrl}" class="button">Reset Password</a>
                        <p class="warning">
                            ⚠️ This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
                        </p>
                        <p>If the button doesn't work, copy and paste this link into your browser:</p>
                        <p style="word-break: break-all;">${resetUrl}</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'Password Reset Request - YourSaaS',
            htmlContent,
        });
    }
    async sendEmailVerification(email, name, verificationToken) {
        const verificationUrl = `${env.DEVELOPER_PORTAL_URL}/verify-email?token=${verificationToken}`;
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Verify Your Email</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${name},</h2>
                        <p>Thank you for signing up with YourSaaS!</p>
                        <p>Please verify your email address by clicking the button below:</p>
                        <a href="${verificationUrl}" class="button">Verify Email</a>
                        <p>If the button doesn't work, copy and paste this link into your browser:</p>
                        <p style="word-break: break-all;">${verificationUrl}</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'Verify Your Email - YourSaaS',
            htmlContent,
        });
    }
    async sendLoginNotification(email, name, ipAddress, userAgent) {
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .info-box { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>New Login Detected</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${name},</h2>
                        <p>We detected a new login to your YourSaaS account.</p>
                        <div class="info-box">
                            <p><strong>IP Address:</strong> ${ipAddress}</p>
                            <p><strong>Device:</strong> ${userAgent}</p>
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p>If this was you, you can safely ignore this email.</p>
                        <p>If you don't recognize this activity, please secure your account immediately.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'New Login to Your YourSaaS Account',
            htmlContent,
        });
    }
    async subscribeToNewsletter(input) {
        if (!this.apiKey) {
            console.error('[Brevo] Newsletter subscribe skipped — BREVO_API_KEY missing');
            return false;
        }
        try {
            const payload = {
                email: input.email,
                attributes: {
                    FIRSTNAME: input.firstName,
                    LASTNAME: input.lastName,
                },
                updateEnabled: true,
            };
            const listId = env.BREVO_NEWSLETTER_LIST_ID;
            if (listId) {
                payload.listIds = [listId];
            }
            const response = await axios.post('https://api.brevo.com/v3/contacts', payload, {
                headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
            });
            return response.status === 201 || response.status === 204;
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 400) {
                const message = String(error.response.data?.message ?? '');
                if (message.toLowerCase().includes('already exist')) {
                    return true;
                }
            }
            console.error('Brevo newsletter subscribe error:', error);
            return false;
        }
    }
}
export const emailService = new BrevoEmailService();
