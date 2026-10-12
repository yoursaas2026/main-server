import { BASE_WEIGHTS, INTEREST_TAG_CAP } from './weights.js';

export type InterestProfile = {
    version: 1;
    base: Record<string, number>;
    learned: Record<string, number>;
    updatedAt: string;
};

export type QuestionnaireInput = {
    industry?: string | null;
    companySize?: string | null;
    budgetBand?: string | null;
    technicalComfort?: string | null;
    primaryGoals?: string[];
    painPoints?: string[];
    preferredIntegrations?: string[];
    preferredStacks?: string[];
    /** Resolved category names for interestedCategoryIds */
    categoryNames?: string[];
};

export function emptyInterestProfile(): InterestProfile {
    return {
        version: 1,
        base: {},
        learned: {},
        updatedAt: new Date().toISOString(),
    };
}

export function parseInterestProfile(raw: string | null | undefined): InterestProfile {
    if (!raw?.trim()) return emptyInterestProfile();
    try {
        const parsed = JSON.parse(raw) as Partial<InterestProfile>;
        return {
            version: 1,
            base: parsed.base && typeof parsed.base === 'object' ? parsed.base : {},
            learned: parsed.learned && typeof parsed.learned === 'object' ? parsed.learned : {},
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        };
    } catch {
        return emptyInterestProfile();
    }
}

export function serializeInterestProfile(profile: InterestProfile): string {
    return JSON.stringify({
        version: 1,
        base: profile.base,
        learned: profile.learned,
        updatedAt: profile.updatedAt || new Date().toISOString(),
    });
}

function bump(map: Record<string, number>, tag: string, amount: number) {
    if (!tag || !amount) return;
    const next = Math.min(INTEREST_TAG_CAP, Math.max(0, (map[tag] || 0) + amount));
    if (next <= 0) delete map[tag];
    else map[tag] = next;
}

function slugTag(prefix: string, value: string): string {
    const v = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    return v ? `${prefix}:${v}` : '';
}

/** Rebuild `base` from questionnaire answers; preserves `learned`. */
export function rebuildBaseInterestProfile(
    existing: InterestProfile,
    input: QuestionnaireInput
): InterestProfile {
    const base: Record<string, number> = {};

    if (input.industry?.trim()) {
        bump(base, slugTag('industry', input.industry), BASE_WEIGHTS.industry);
    }
    if (input.companySize?.trim()) {
        bump(base, slugTag('size', input.companySize), BASE_WEIGHTS.size);
    }
    if (input.budgetBand?.trim()) {
        bump(base, slugTag('budget', input.budgetBand), BASE_WEIGHTS.budget);
    }
    if (input.technicalComfort?.trim()) {
        bump(base, slugTag('experience', input.technicalComfort), BASE_WEIGHTS.experience);
    }

    for (const goal of input.primaryGoals || []) {
        bump(base, slugTag('goal', goal), BASE_WEIGHTS.goal);
    }
    for (const name of input.categoryNames || []) {
        bump(base, slugTag('category', name), BASE_WEIGHTS.category);
    }
    for (const pain of input.painPoints || []) {
        bump(base, slugTag('pain', pain), BASE_WEIGHTS.pain);
    }
    for (const integ of input.preferredIntegrations || []) {
        bump(base, slugTag('integration', integ), BASE_WEIGHTS.integration);
    }
    for (const stack of input.preferredStacks || []) {
        bump(base, slugTag('stack', stack), BASE_WEIGHTS.stack);
    }

    return {
        version: 1,
        base,
        learned: { ...existing.learned },
        updatedAt: new Date().toISOString(),
    };
}

export function effectiveWeights(profile: InterestProfile): Record<string, number> {
    const out: Record<string, number> = { ...profile.base };
    for (const [tag, w] of Object.entries(profile.learned)) {
        out[tag] = Math.min(INTEREST_TAG_CAP, (out[tag] || 0) + w);
    }
    return out;
}

export function applyLearnedDelta(
    profile: InterestProfile,
    tags: string[],
    delta: number
): InterestProfile {
    const learned = { ...profile.learned };
    for (const tag of tags) {
        if (!tag) continue;
        bump(learned, tag, delta);
    }
    return {
        ...profile,
        learned,
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Soften rabbit holes: multiply `learned` weights only (questionnaire `base` untouched).
 * Tags that fall below `dropBelow` are removed.
 */
export function decayLearnedWeights(
    profile: InterestProfile,
    factor = 0.95,
    dropBelow = 0.5,
): InterestProfile {
    const learned: Record<string, number> = {};
    for (const [tag, w] of Object.entries(profile.learned)) {
        if (typeof w !== 'number' || !Number.isFinite(w)) continue;
        const next = w * factor;
        if (next >= dropBelow) learned[tag] = Math.min(INTEREST_TAG_CAP, next);
    }
    return {
        ...profile,
        learned,
        updatedAt: new Date().toISOString(),
    };
}

export function topTags(profile: InterestProfile, limit = 8): string[] {
    return Object.entries(effectiveWeights(profile))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag]) => tag);
}

/** Top tags from `learned` only (exploration signal). */
export function topLearnedTags(
    profile: InterestProfile,
    limit = 5,
    minWeight = 8
): Array<{ tag: string; weight: number }> {
    return Object.entries(profile.learned)
        .filter(([, w]) => typeof w === 'number' && w >= minWeight)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag, weight]) => ({ tag, weight }));
}

/** `category:ai_automation` → `AI Automation` */
export function humanizeInterestTag(tag: string): string {
    const raw = (tag.includes(':') ? tag.split(':').slice(1).join(':') : tag).replace(/_/g, ' ').trim();
    if (!raw) return 'topics you explored';
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

