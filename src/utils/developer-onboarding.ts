import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { developers } from '../db/schema.js';

export const PROFILE_COMPLETION_THRESHOLD = 100;

export type DeveloperOnboardingStatus = {
    profileComplete: boolean;
    profileCompletionPercent: number;
    missingProfileFields: string[];
    bankVerified: boolean;
    bankDetailsSaved: boolean;
    canAccessMarketplace: boolean;
};

function parseJsonArray(raw: string | null | undefined): unknown[] {
    if (!raw?.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function servicesOfferedFilled(raw: string | null | undefined): boolean {
    if (!raw?.trim()) return false;
    const fromJson = parseJsonArray(raw);
    if (fromJson.length > 0) {
        return fromJson.some((s) => String(s).trim().length > 0);
    }
    return raw.split(',').some((s) => s.trim().length > 0);
}

function textFilled(value: string | null | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

/** Mirrors `developer.yoursaas/app/dashboard/profile/page.tsx` completion (18 fields, 100% required). */
export function evaluateDeveloperProfileCompletion(
    dev: typeof developers.$inferSelect
): { percent: number; missing: string[] } {
    const checks: { label: string; ok: boolean }[] = [
        { label: 'Display name', ok: textFilled(dev.name) },
        { label: 'Email', ok: textFilled(dev.email) },
        { label: 'Phone', ok: textFilled(dev.phone) },
        { label: 'Location', ok: textFilled(dev.location) },
        { label: 'Professional headline', ok: textFilled(dev.headline) },
        { label: 'Bio', ok: textFilled(dev.bio) },
        {
            label: 'Years of experience',
            ok: dev.experience !== null && dev.experience !== undefined,
        },
        { label: 'Website / portfolio', ok: textFilled(dev.portfolioUrl) },
        { label: 'GitHub', ok: textFilled(dev.githubUrl) },
        { label: 'LinkedIn', ok: textFilled(dev.linkedinUrl) },
        {
            label: 'Hourly rate',
            ok: dev.hourlyRate !== null && dev.hourlyRate !== undefined,
        },
        { label: 'Services offered', ok: servicesOfferedFilled(dev.servicesOffered) },
        { label: 'Profile photo', ok: textFilled(dev.profilePicture) },
        { label: 'Cover photo', ok: textFilled(dev.coverPicture) },
        { label: 'Resume', ok: textFilled(dev.resumeUrl) },
        { label: 'Tech stack (at least one skill)', ok: parseJsonArray(dev.skills).length > 0 },
        {
            label: 'Work experience (at least one entry)',
            ok: parseJsonArray(dev.pastExperiences).length > 0,
        },
        {
            label: 'Portfolio project (at least one entry)',
            ok: parseJsonArray(dev.portfolioProjects).length > 0,
        },
    ];

    const filled = checks.filter((c) => c.ok).length;
    const total = checks.length;
    const percent = Math.min(100, Math.round((filled / total) * 100));
    const missing = checks.filter((c) => !c.ok).map((c) => c.label);

    return { percent, missing };
}

export function isDeveloperBankVerified(dev: typeof developers.$inferSelect): boolean {
    return (
        dev.payoutBankValidationStatus === 'completed' &&
        dev.payoutBankValidationAccountStatus === 'valid'
    );
}

export function isDeveloperBankDetailsSaved(dev: typeof developers.$inferSelect): boolean {
    return Boolean(
        dev.payoutAccountHolderName?.trim() &&
            dev.payoutBankName?.trim() &&
            dev.payoutRoutingCode?.trim() &&
            dev.payoutAccountNumber?.trim()
    );
}

export function buildDeveloperOnboardingStatus(
    dev: typeof developers.$inferSelect
): DeveloperOnboardingStatus {
    const { percent, missing } = evaluateDeveloperProfileCompletion(dev);
    const profileComplete = percent >= PROFILE_COMPLETION_THRESHOLD;
    const bankVerified = isDeveloperBankVerified(dev);
    const bankDetailsSaved = isDeveloperBankDetailsSaved(dev);

    return {
        profileComplete,
        profileCompletionPercent: percent,
        missingProfileFields: profileComplete ? [] : missing,
        bankVerified,
        bankDetailsSaved,
        canAccessMarketplace: profileComplete && bankVerified,
    };
}

export async function fetchDeveloperOnboardingStatus(
    developerId: number
): Promise<DeveloperOnboardingStatus | null> {
    const [dev] = await db
        .select()
        .from(developers)
        .where(eq(developers.id, developerId))
        .limit(1);

    if (!dev) return null;
    return buildDeveloperOnboardingStatus(dev);
}

export function marketplaceOnboardingErrorMessage(status: DeveloperOnboardingStatus): string {
    if (status.canAccessMarketplace) return '';

    const parts: string[] = [];
    if (!status.profileComplete) {
        parts.push('complete your developer profile (100%)');
    }
    if (!status.bankVerified) {
        parts.push('add and verify your payout bank details');
    }
    return `Before creating or editing SaaS listings, ${parts.join(' and ')}.`;
}

/** Returns a JSON response when marketplace access is blocked, or null when allowed. */
export async function assertDeveloperMarketplaceReady(
    c: Context,
    developerId: number
): Promise<Response | null> {
    const status = await fetchDeveloperOnboardingStatus(developerId);
    if (!status) {
        return c.json({ success: false, error: 'Developer not found' }, 404);
    }
    if (status.canAccessMarketplace) return null;

    return c.json(
        {
            success: false,
            error: marketplaceOnboardingErrorMessage(status),
            code: 'ONBOARDING_INCOMPLETE',
            onboarding: status,
        },
        403
    );
}
