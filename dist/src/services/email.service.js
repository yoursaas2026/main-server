import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
class MailuEmailService {
    transporter = null;
    marketingTransporter = null;
    createTransporter(user, pass) {
        return nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: { user, pass },
        });
    }
    getTransporter() {
        if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
            return null;
        }
        if (!this.transporter) {
            this.transporter = this.createTransporter(env.SMTP_USER, env.SMTP_PASS);
        }
        return this.transporter;
    }
    getMarketingTransporter() {
        if (!env.SMTP_HOST || !env.SMTP_MARKETING_USER || !env.SMTP_MARKETING_PASS) {
            return this.getTransporter();
        }
        if (!this.marketingTransporter) {
            this.marketingTransporter = this.createTransporter(env.SMTP_MARKETING_USER, env.SMTP_MARKETING_PASS);
        }
        return this.marketingTransporter;
    }
    async sendEmail({ to, subject, htmlContent, textContent, fromEmail, fromName, marketing = false, }) {
        const transporter = marketing ? this.getMarketingTransporter() : this.getTransporter();
        if (!transporter) {
            console.error('[Mail] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS');
            return false;
        }
        try {
            await transporter.sendMail({
                from: {
                    name: fromName ?? env.SMTP_FROM_NAME,
                    address: fromEmail ?? env.SMTP_FROM_EMAIL,
                },
                to,
                subject,
                html: htmlContent,
                text: textContent ?? subject,
            });
            return true;
        }
        catch (error) {
            console.error('[Mail] send error:', error);
            return false;
        }
    }
    async sendWelcomeEmail(email, name, appUrl = env.DEVELOPER_PORTAL_URL) {
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
                        <p>We're thrilled to have you join the YourSaaS community!</p>
                        <p>Your account is ready — explore the platform and get started.</p>
                        <a href="${appUrl}/dashboard" class="button">Go to Dashboard</a>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'Welcome to YourSaaS! 🎉',
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
    async sendEmailVerification(email, name, verificationToken, appUrl = env.DEVELOPER_PORTAL_URL) {
        const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;
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
    async sendNewsletterWelcomeEmail(email, firstName, unsubscribeUrl) {
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                    .footer { font-size: 12px; color: #666; margin-top: 24px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>You're subscribed!</h1>
                    </div>
                    <div class="content">
                        <h2>Hi ${firstName},</h2>
                        <p>Thanks for subscribing to the YourSaaS newsletter. We'll keep you updated on new products, developer stories, and platform news.</p>
                        <p class="footer">
                            <a href="${unsubscribeUrl}">Unsubscribe</a> from future marketing emails.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmail({
            to: email,
            subject: 'Welcome to the YourSaaS Newsletter',
            htmlContent,
            fromEmail: env.SMTP_MARKETING_USER
                ? env.SMTP_MARKETING_FROM_EMAIL
                : env.SMTP_FROM_EMAIL,
            fromName: env.SMTP_MARKETING_USER
                ? env.SMTP_MARKETING_FROM_NAME
                : env.SMTP_FROM_NAME,
            marketing: true,
        });
    }
}
export const emailService = new MailuEmailService();
