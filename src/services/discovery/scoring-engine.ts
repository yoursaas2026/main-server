import { effectiveWeights, type InterestProfile } from './interest-profile.js';
import { SCORE_MAX_WITHOUT_SEMANTIC, SCORING_WEIGHTS } from './weights.js';

export type ListingScoreFeatures = {
    id: number;
    categoryId: number | null;
    categoryName: string | null;
    audienceTags: string[];
    useCases: string[];
    bestFor: string;
    tagline: string;
    shortDescription: string;
    technicalStack: string;
    technicalIntegrations: string;
    minPriceInr: number | null;
    trustVerifiedByPlatform: boolean;
    avgRating: number | null;
    reviewCount: number;
    updatedAt: Date | null;
    hasIcon: boolean;
    screenshotCount: number;
    hasSupportEmail: boolean;
    hasTiers: boolean;
};

export type BuyerScoreContext = {
    industry: string | null;
    companySize: string | null;
    budgetBand: string | null;
    primaryGoals: string[];
    interestedCategoryIds: number[];
    painPoints: string[];
    preferredIntegrations: string[];
    preferredStacks: string[];
    problemStatement: string | null;
    interestProfile: InterestProfile;
    viewedProductIds: Set<number>;
    savedProductIds: Set<number>;
};

export type ScoreResult = {
    total: number;
    matchPercent: number;
    reasons: string[];
    breakdown: Record<string, number>;
};

const BUDGET_MAX_INR: Record<string, number> = {
    lt_50k: 50_000,
    '50k_2l': 200_000,
    '2l_10l': 1_000_000,
    gt_10l: Number.POSITIVE_INFINITY,
};

function budgetFits(band: string | null, minPrice: number | null): boolean {
    if (!band || minPrice === null) return true;
    const max = BUDGET_MAX_INR[band];
    if (max === undefined) return true;
    return minPrice <= max;
}

function haystackOf(listing: ListingScoreFeatures): string {
    return [
        listing.bestFor,
        listing.tagline,
        listing.shortDescription,
        listing.categoryName || '',
        ...listing.audienceTags,
        ...listing.useCases,
        listing.technicalStack,
        listing.technicalIntegrations,
    ]
        .join(' ')
        .toLowerCase();
}

function overlapCount(needles: string[], haystack: string): number {
    return needles.filter((n) => {
        const t = n.trim().toLowerCase();
        return t.length >= 2 && haystack.includes(t);
    }).length;
}

function tagValue(tag: string): string {
    const i = tag.indexOf(':');
    return i >= 0 ? tag.slice(i + 1).replace(/_/g, ' ') : tag;
}

/**
 * Rule-based scorer (v1). Optional semanticSimilarity 0..1 adds up to semanticMax.
 */
export function scoreListingCandidate(
    listing: ListingScoreFeatures,
    buyer: BuyerScoreContext,
    opts?: { semanticSimilarity?: number }
): ScoreResult {
    const breakdown: Record<string, number> = {};
    const reasons: string[] = [];
    let total = 0;

    const hay = haystackOf(listing);
    const effective = effectiveWeights(buyer.interestProfile);

    // Category / goals
    if (listing.categoryId && buyer.interestedCategoryIds.includes(listing.categoryId)) {
        breakdown.categoryGoal = SCORING_WEIGHTS.categoryGoal;
        total += SCORING_WEIGHTS.categoryGoal;
        reasons.push('Matches your categories');
    } else if (listing.categoryName) {
        const catTag = `category:${listing.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        if ((effective[catTag] || 0) >= 20) {
            breakdown.categoryGoal = SCORING_WEIGHTS.categoryGoal;
            total += SCORING_WEIGHTS.categoryGoal;
            reasons.push(`Fits ${listing.categoryName}`);
        }
    }

    // Industry / size via audience
    const audienceHits = overlapCount(
        [buyer.industry || '', buyer.companySize || ''].filter(Boolean),
        listing.audienceTags.join(' ').toLowerCase() + ' ' + hay
    );
    if (audienceHits > 0) {
        const pts = Math.min(SCORING_WEIGHTS.industryAudience, audienceHits * 10);
        breakdown.industryAudience = pts;
        total += pts;
        reasons.push('Fits your industry or company size');
    }

    // Pain points
    const painHits = overlapCount(buyer.painPoints, hay);
    if (painHits > 0) {
        breakdown.painOverlap = SCORING_WEIGHTS.painOverlap;
        total += SCORING_WEIGHTS.painOverlap;
        reasons.push('Addresses your pain points');
    } else if (buyer.problemStatement && buyer.problemStatement.trim().length >= 8) {
        const words = buyer.problemStatement
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 4);
        if (words.filter((w) => hay.includes(w)).length >= 2) {
            breakdown.painOverlap = Math.round(SCORING_WEIGHTS.painOverlap * 0.7);
            total += breakdown.painOverlap;
            reasons.push('Similar to your stated problem');
        }
    }

    // Integrations
    const integHay = (listing.technicalIntegrations || '').toLowerCase() + ' ' + hay;
    const integHits = overlapCount(buyer.preferredIntegrations, integHay);
    if (integHits > 0) {
        breakdown.integrationOverlap = Math.min(SCORING_WEIGHTS.integrationOverlap, integHits * 8);
        total += breakdown.integrationOverlap;
        reasons.push('Supports your preferred integrations');
    }

    // Budget
    if (budgetFits(buyer.budgetBand, listing.minPriceInr)) {
        breakdown.budgetFit = SCORING_WEIGHTS.budgetFit;
        total += SCORING_WEIGHTS.budgetFit;
        reasons.push('Within your budget');
    } else if (buyer.budgetBand && listing.minPriceInr != null) {
        breakdown.budgetFit = SCORING_WEIGHTS.budgetMiss;
        total += SCORING_WEIGHTS.budgetMiss;
    }

    // Company size via bestFor / goals text
    if (buyer.companySize && hay.includes(buyer.companySize.toLowerCase().replace(/_/g, ' '))) {
        breakdown.companySize = SCORING_WEIGHTS.companySize;
        total += SCORING_WEIGHTS.companySize;
    } else if (buyer.primaryGoals.length) {
        const goalHits = buyer.primaryGoals.filter(
            (g) => hay.includes(g.replace(/_/g, ' ')) || hay.includes(g)
        ).length;
        if (goalHits > 0) {
            breakdown.goals = 15;
            total += 15;
            reasons.push('Aligned with your goals');
        }
    }

    // Stacks
    const stackHits = overlapCount(buyer.preferredStacks, listing.technicalStack.toLowerCase());
    if (stackHits > 0) {
        breakdown.stackOverlap = SCORING_WEIGHTS.stackOverlap;
        total += SCORING_WEIGHTS.stackOverlap;
        reasons.push('Uses your preferred stack');
    }

    // Learned interest overlap
    let learnedPts = 0;
    for (const [tag, w] of Object.entries(effective)) {
        if (w < 10) continue;
        if (!tag.startsWith('topic:') && !tag.startsWith('audience:') && !tag.startsWith('usecase:') && !tag.startsWith('category:')) {
            continue;
        }
        const needle = tagValue(tag);
        if (needle.length >= 2 && hay.includes(needle)) {
            learnedPts += Math.min(5, Math.round(w / 10));
        }
    }
    if (learnedPts > 0) {
        breakdown.learnedOverlap = Math.min(SCORING_WEIGHTS.learnedOverlap, learnedPts);
        total += breakdown.learnedOverlap;
        reasons.push('Matches what you’ve been exploring');
    }

    if (listing.trustVerifiedByPlatform) {
        breakdown.verified = SCORING_WEIGHTS.verified;
        total += SCORING_WEIGHTS.verified;
        reasons.push('Platform verified');
    }

    if (listing.avgRating && listing.avgRating >= 4 && listing.reviewCount > 0) {
        breakdown.highRating = SCORING_WEIGHTS.highRating;
        total += SCORING_WEIGHTS.highRating;
        reasons.push('Highly rated');
    }

    if (buyer.savedProductIds.has(listing.id)) {
        breakdown.saved = SCORING_WEIGHTS.saved;
        total += SCORING_WEIGHTS.saved;
        reasons.push('Saved by you');
    }

    if (buyer.viewedProductIds.has(listing.id)) {
        breakdown.previouslyViewed = SCORING_WEIGHTS.previouslyViewed;
        total += SCORING_WEIGHTS.previouslyViewed;
    }

    // Freshness (14 days)
    if (listing.updatedAt) {
        const ageMs = Date.now() - listing.updatedAt.getTime();
        if (ageMs < 14 * 24 * 60 * 60 * 1000) {
            breakdown.freshness = SCORING_WEIGHTS.freshness;
            total += SCORING_WEIGHTS.freshness;
        }
    }

    // Quality floor
    let quality = 0;
    if (listing.hasIcon) quality += 2;
    if (listing.screenshotCount > 0) quality += 2;
    if (listing.hasSupportEmail) quality += 2;
    if (listing.hasTiers) quality += 2;
    if (quality > 0) {
        breakdown.quality = Math.min(SCORING_WEIGHTS.quality, quality);
        total += breakdown.quality;
    }

    const semantic = opts?.semanticSimilarity;
    if (typeof semantic === 'number' && semantic > 0) {
        const pts = Math.round(SCORING_WEIGHTS.semanticMax * Math.min(1, Math.max(0, semantic)));
        breakdown.semantic = pts;
        total += pts;
        if (pts >= 15) reasons.push('Matches your search');
    }

    const maxPossible =
        SCORE_MAX_WITHOUT_SEMANTIC + (breakdown.semantic ? SCORING_WEIGHTS.semanticMax : 0) + 15; // goals bonus
    const matchPercent = Math.max(0, Math.min(99, Math.round((Math.max(0, total) / maxPossible) * 100)));

    return {
        total,
        matchPercent: total > 0 ? Math.max(matchPercent, 1) : 0,
        reasons: [...new Set(reasons)].slice(0, 4),
        breakdown,
    };
}
