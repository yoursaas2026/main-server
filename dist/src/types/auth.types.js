import { z } from 'zod';
// ─── Zod Schemas ───────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().trim().email('Invalid email address').toLowerCase(),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters')
        .refine((pw) => pw.trim().length >= 8, {
        message: 'Password must not be only whitespace',
    }),
    phone: z.string().trim().max(20).optional(),
});
export const LoginSchema = z.object({
    email: z.string().trim().email('Invalid email address').toLowerCase(),
    password: z
        .string()
        .min(1, 'Password is required')
        .max(128)
        .refine((pw) => pw.trim().length > 0, {
        message: 'Password must not be only whitespace',
    }),
});
export const ForgotPasswordSchema = z.object({
    email: z.string().trim().email('Invalid email address').toLowerCase(),
});
export const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128)
        .refine((pw) => pw.trim().length >= 8, {
        message: 'Password must not be only whitespace',
    }),
});
