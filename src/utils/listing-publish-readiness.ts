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
 * All items that must be satisfied before `listingStatus` may be set to `live`.
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

    const shortDesc = input.shortDescription?.trim() ?? '';
    if (shortDesc.length < 40) missing.push('Short description / overview (at least 40 characters)');

    const problem = input.problem?.trim() ?? '';
    if (problem.length < 20) missing.push('Problem statement (at least 20 characters)');

    const solution = input.solution?.trim() ?? '';
    if (solution.length < 20) missing.push('Solution (at least 20 characters)');

    const ft = input.featuresTagline?.trim() ?? '';
    if (ft.length < 8) missing.push('Features section tagline');

    const fab = input.featuresAboutBody?.trim() ?? '';
    if (fab.length < 40) missing.push('About this product body (at least 40 characters)');

    const goodBenefits = (input.benefits || []).filter(
        (b) => b.title?.trim() && b.desc?.trim() && b.title.trim().length >= 2 && b.desc.trim().length >= 8
    );
    if (goodBenefits.length < 3) missing.push('At least 3 key benefits with title and description');

    const goodFeatures = (input.features || []).filter(
        (f) =>
            f.title?.trim().length >= 2 &&
            f.short?.trim().length >= 8 &&
            f.detail?.trim().length >= 20
    );
    if (goodFeatures.length < 2) missing.push('At least 2 features with title, short line, and full detail');

    const cases = (input.useCases || []).map((u) => u.trim()).filter(Boolean);
    if (cases.length < 2) missing.push('At least 2 use cases');

    const tags = (input.audienceTags || []).map((t) => t.trim()).filter(Boolean);
    if (tags.length < 2) missing.push('At least 2 audience tags');

    if (!input.deploymentTime?.trim()) missing.push('Go-live / deployment time (Pricing & packages)');
    if (!input.bestFor?.trim()) missing.push('“Best for” segment line (Pricing & packages)');

    const tiers = input.customizationTiers || [];
    const byId = new Map(tiers.map((t) => [t.id, t]));
    for (const id of ['base', 'plus', 'pro'] as const) {
        const t = byId.get(id);
        if (!t) {
            missing.push(`Customization tier: ${id} (Base / Plus / Pro)`);
            continue;
        }
        if (!t.name?.trim() || !t.tagline?.trim() || !t.delivery?.trim()) {
            missing.push(`Tier “${id}”: name, tagline, and delivery timeline`);
        }
        if (!t.description?.trim() || t.description.trim().length < 10) {
            missing.push(`Tier “${id}”: description (at least 10 characters)`);
        }
        if (id === 'pro') {
            /* custom quote allowed */
        } else if (t.fixedPriceInr == null || t.fixedPriceInr <= 0) {
            missing.push(`Tier “${id}”: fixed price in INR (or use Pro for custom quote)`);
        }
    }

    const tech = input.technical;
    const techLabels: [keyof typeof tech, string][] = [
        ['stack', 'Tech stack'],
        ['deployment', 'Deployment'],
        ['integrations', 'Integrations'],
        ['platforms', 'Platforms'],
        ['api', 'API'],
        ['security', 'Security'],
        ['compliance', 'Compliance'],
    ];
    for (const [key, label] of techLabels) {
        if (!tech[key]?.trim()) missing.push(`Technical: ${label}`);
    }

    const demo = input.demoUrl?.trim() ?? '';
    if (!isHttpUrl(demo)) missing.push('Live demo URL (valid http/https)');

    if (input.freeTrial && (input.trialDays == null || input.trialDays < 1)) {
        missing.push('Trial length in days (when free trial is enabled)');
    }

    if (!input.demoUser?.trim()) missing.push('Demo username');
    if (!input.demoPassword?.trim()) missing.push('Demo password');

    const video = input.demoVideoId?.trim() ?? '';
    if (video.length < 6) missing.push('Demo video (YouTube ID or embed URL)');

    if (!isHttpUrl(input.supportDocs?.trim() ?? '')) missing.push('Support documentation URL');
    if (!isEmail(input.supportEmail?.trim() ?? '')) missing.push('Support email');
    if (!input.supportChat?.trim()) missing.push('Live chat availability text');
    if (!input.supportResponse?.trim()) missing.push('Typical support response time');

    if (!isHttpUrl(input.legalPrivacy?.trim() ?? '')) missing.push('Legal: Privacy policy URL');
    if (!isHttpUrl(input.legalTerms?.trim() ?? '')) missing.push('Legal: Terms of service URL');
    if (!isHttpUrl(input.legalRefund?.trim() ?? '')) missing.push('Legal: Refund policy URL');

    if (!input.meta.version?.trim()) missing.push('Version label (Buyer page details)');
    if (!input.meta.setupTime?.trim()) missing.push('Typical setup time');
    if (!input.meta.difficulty?.trim()) missing.push('Difficulty');
    if (!input.meta.requirements?.trim()) missing.push('Minimum requirements');

    const icon = input.iconUrl?.trim() ?? '';
    if (!icon || !isProductImageRef(icon)) missing.push('App icon (upload or paste a hosted image URL)');

    const shots = (input.screenshotUrls || []).filter((u) => u.trim() && isProductImageRef(u.trim()));
    if (shots.length < 2) missing.push('At least 2 screenshot images (upload or URLs)');

    return missing;
}

export function canPublishLiveListing(input: DeveloperProductUpsertInput): boolean {
    return getMissingForLiveListing(input).length === 0;
}
