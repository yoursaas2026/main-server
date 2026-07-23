import type { DeveloperProductUpsertInput } from '../types/developer-product.types.js';

function isHttpUrl(s: string): boolean {
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/** Full URL or server-stored path (same as profile/cover under `/uploads/`). */
function isProductImageRef(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    if (isHttpUrl(t)) return true;
    if (t.startsWith('/uploads/')) return true;
    if (t.startsWith('/public/uploads/')) return true;
    return false;
}

function isEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Core items required before `listingStatus` may be set to `live`.
 * Keep in sync with `developer.yoursaas/lib/listingPublishReadiness.ts`.
 */
export function getMissingForLiveListing(input: DeveloperProductUpsertInput): string[] {
    const missing: string[] = [];

    const name = input.name?.trim() ?? '';
    if (name.length < 2) missing.push('Product name (at least 2 characters)');

    const slug = input.slug?.trim().toLowerCase() ?? '';
    if (slug.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        missing.push(
            'Listing slug (2+ characters; lowercase letters, numbers, hyphens only; must be unique on the marketplace)'
        );
    }

    const tagline = input.tagline?.trim() ?? '';
    if (tagline.length < 8) missing.push('Tagline (at least 8 characters)');

    if (input.productCategoryId == null) missing.push('Product category');

    const shortDesc = input.shortDescription?.trim() ?? '';
    if (shortDesc.length < 40) missing.push('Short description / overview (at least 40 characters)');

    const problem = input.problem?.trim() ?? '';
    if (problem.length < 20) missing.push('Problem statement (at least 20 characters)');

    const solution = input.solution?.trim() ?? '';
    if (solution.length < 20) missing.push('Solution (at least 20 characters)');

    const goodBenefits = (input.benefits || []).filter(
        (b) => b.title?.trim() && b.desc?.trim() && b.title.trim().length >= 2 && b.desc.trim().length >= 8
    );
    if (goodBenefits.length < 1) missing.push('At least 1 key benefit with title and description');

    const goodFeatures = (input.features || []).filter(
        (f) =>
            f.title?.trim().length >= 2 &&
            f.short?.trim().length >= 8 &&
            f.detail?.trim().length >= 20
    );
    if (goodFeatures.length < 1) missing.push('At least 1 feature with title, short line, and full detail');

    const cases = (input.useCases || []).map((u) => u.trim()).filter(Boolean);
    if (cases.length < 1) missing.push('At least 1 use case');

    const tags = (input.audienceTags || []).map((t) => t.trim()).filter(Boolean);
    if (tags.length < 1) missing.push('At least 1 audience tag');

    if (!input.deploymentTime?.trim()) missing.push('Go-live / deployment time (Pricing & packages)');
    if (!input.bestFor?.trim()) missing.push('“Best for” segment line (Pricing & packages)');

    const tiers = input.customizationTiers || [];
    const byId = new Map(tiers.map((t) => [t.id, t]));
    const base = byId.get('base');
    if (!base) {
        missing.push('Customization tier: base (Base / Plus / Pro)');
    } else {
        if (!base.name?.trim() || !base.tagline?.trim() || !base.delivery?.trim()) {
            missing.push('Tier “base”: name, tagline, and delivery timeline');
        }
        if (!base.description?.trim() || base.description.trim().length < 10) {
            missing.push('Tier “base”: description (at least 10 characters)');
        }
        if (base.fixedPriceInr == null || base.fixedPriceInr <= 0) {
            missing.push('Tier “base”: fixed price in INR (or use Pro for custom quote)');
        }
    }

    if (input.freeTrial && (input.trialDays == null || input.trialDays < 1)) {
        missing.push('Trial length in days (when free trial is enabled)');
    }

    if (!isEmail(input.supportEmail?.trim() ?? '')) missing.push('Support email');

    const icon = input.iconUrl?.trim() ?? '';
    if (!icon || !isProductImageRef(icon)) missing.push('App icon (upload or paste a hosted image URL)');

    const shots = (input.screenshotUrls || []).filter((u) => u.trim() && isProductImageRef(u.trim()));
    if (shots.length < 2) missing.push('At least 2 screenshot images (upload or URLs)');

    return missing;
}

export function canPublishLiveListing(input: DeveloperProductUpsertInput): boolean {
    return getMissingForLiveListing(input).length === 0;
}
