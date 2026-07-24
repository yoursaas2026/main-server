/** Tunable discovery weights — keep config here so scorer/learner stay stable. */

export const INTEREST_TAG_CAP = 100;

export const BASE_WEIGHTS = {
    industry: 30,
    goal: 40,
    category: 35,
    pain: 25,
    integration: 15,
    size: 15,
    budget: 20,
    experience: 5,
    stack: 10,
} as const;

/** Points added to `learned` per event (capped by INTEREST_TAG_CAP). */
export const LEARNING_DELTAS: Record<string, number> = {
    view: 2,
    click: 5,
    engage: 8,
    compare: 15,
    save: 25,
    unsave: -10,
    demo_open: 35,
    message_seller: 40,
    contract_started: 50,
    contract_completed: 60,
};

export const DISCOVERY_EVENT_TYPES = [
    'impression',
    'search',
    'click',
    'view',
    'engage',
    'compare',
    'save',
    'unsave',
    'demo_open',
    'message_seller',
    'contract_started',
    'contract_completed',
] as const;

export type DiscoveryEventType = (typeof DISCOVERY_EVENT_TYPES)[number];

/** Feature points for the rule scorer (v1). */
export const SCORING_WEIGHTS = {
    categoryGoal: 25,
    industryAudience: 20,
    painOverlap: 15,
    integrationOverlap: 15,
    budgetFit: 20,
    budgetMiss: -10,
    companySize: 10,
    stackOverlap: 8,
    learnedOverlap: 15,
    verified: 8,
    highRating: 10,
    saved: 12,
    previouslyViewed: 5,
    freshness: 5,
    quality: 8,
    semanticMax: 40,
} as const;

/** Max theoretical score used for matchPercent (semantic excluded when 0). */
export const SCORE_MAX_WITHOUT_SEMANTIC =
    SCORING_WEIGHTS.categoryGoal +
    SCORING_WEIGHTS.industryAudience +
    SCORING_WEIGHTS.painOverlap +
    SCORING_WEIGHTS.integrationOverlap +
    SCORING_WEIGHTS.budgetFit +
    SCORING_WEIGHTS.companySize +
    SCORING_WEIGHTS.stackOverlap +
    SCORING_WEIGHTS.learnedOverlap +
    SCORING_WEIGHTS.verified +
    SCORING_WEIGHTS.highRating +
    SCORING_WEIGHTS.saved +
    SCORING_WEIGHTS.previouslyViewed +
    SCORING_WEIGHTS.freshness +
    SCORING_WEIGHTS.quality;
