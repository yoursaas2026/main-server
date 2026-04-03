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

// ─── Inferred Types from Schemas ───────────────────────────────────────────────

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// ─── Standardized API Response Shapes ─────────────────────────────────────────

export interface ApiSuccessResponse<T = undefined> {
    success: true;
    message: string;
    data?: T;
}

export interface ApiErrorResponse {
    success: false;
    error: string;
}

export type ApiResponse<T = undefined> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── Auth Response Payloads ────────────────────────────────────────────────────

export interface DeveloperPublicProfile {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    profilePicture: string | null;
    bio: string | null;
    skills: string | null;
    experience: number | null;
    portfolioUrl: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
    kycStatus: string | null;
    isEmailVerified: boolean | null;
    isPhoneVerified: boolean | null;
    authProvider: string | null;
}

export interface DeveloperAuthProfile {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    profilePicture: string | null;
    isEmailVerified: boolean | null;
    kycStatus: string | null;
}

export interface ClientPublicProfile {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    profilePicture: string | null;
    companyName: string | null;
    isEmailVerified: boolean | null;
    authProvider: string | null;
}

export interface ClientAuthProfile {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    profilePicture: string | null;
    isEmailVerified: boolean | null;
}

export interface AuthResponseData<TUser> {
    token: string;
    user: TUser;
}
