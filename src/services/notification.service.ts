/**
 * Notification Service
 *
 * Wraps the email service to send notifications asynchronously (fire-and-forget).
 * Auth flows do NOT need to wait for emails to be delivered.
 * Any email failures are logged but never bubble up to the caller.
 */
import { emailService } from './email.service.js';

class NotificationService {
    /**
     * Sends a welcome email without blocking the calling request.
     */
    sendWelcomeEmail(email: string, name: string, appUrl?: string): void {
        emailService.sendWelcomeEmail(email, name, appUrl).catch((err) => {
            console.error('[NotificationService] Failed to send welcome email to %s:', email, err);
        });
    }

    /**
     * Sends a password reset email without blocking the calling request.
     */
    sendPasswordResetEmail(
        email: string,
        name: string,
        resetToken: string,
        appUrl?: string,
    ): void {
        emailService.sendPasswordResetEmail(email, name, resetToken, appUrl).catch((err) => {
            console.error(
                '[NotificationService] Failed to send password-reset email to %s:',
                email,
                err,
            );
        });
    }

    /**
     * Sends an email verification email without blocking the calling request.
     */
    sendEmailVerification(email: string, name: string, verificationToken: string): void {
        emailService.sendEmailVerification(email, name, verificationToken).catch((err) => {
            console.error(
                '[NotificationService] Failed to send email-verification to %s:',
                email,
                err,
            );
        });
    }
}

export const notificationService = new NotificationService();
