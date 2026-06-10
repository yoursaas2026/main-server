import { z } from 'zod';

const NonEmpty = z.string().trim().min(1);

/** Only `draft` and `live`. Legacy `review` is accepted and coerced to `draft`. */
export const ProductListingStatusSchema = z.preprocess(
    (v) => (v === 'review' ? 'draft' : v),
    z.enum(['draft', 'live'])
);

/** Draft saves may include empty rows; publish readiness is enforced when setting `live`. */
export const ProductBenefitDraftSchema = z.object({
    title: z.string().max(120),
    desc: z.string().max(400),
});

/** Draft saves may include empty rows; publish readiness is enforced when setting `live`. */
export const ProductFeatureDraftSchema = z.object({
    title: z.string().max(120),
    short: z.string().max(280),
    detail: z.string().max(5000),
});

/** Draft tiers may be partially filled. */
export const ProductCustomizationTierDraftSchema = z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    tagline: z.string().max(180),
    description: z.string().max(4000),
    fixedPriceInr: z.number().int().nonnegative().nullable(),
    delivery: z.string().max(180),
});

export const DeveloperProductUpsertSchema = z.object({
    projectId: NonEmpty.max(120),
    slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(2, 'Slug must be at least 2 characters')
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format')
        .max(160),
    name: NonEmpty.max(200),
    productCategoryId: z.number().int().positive().nullable().optional().default(null),
    tagline: z.string().trim().max(300).optional().default(''),

    shortDescription: z.string().trim().max(5000).optional().default(''),
    problem: z.string().trim().max(5000).optional().default(''),
    solution: z.string().trim().max(5000).optional().default(''),
    featuresTagline: z.string().trim().max(300).optional().default(''),
    featuresAboutBody: z.string().trim().max(10000).optional().default(''),

    benefits: z.array(ProductBenefitDraftSchema).max(20).default([]),
    features: z.array(ProductFeatureDraftSchema).max(60).default([]),
    /** Draft rows may be empty while editing; publish readiness requires at least 2 non-empty lines. */
    useCases: z.array(z.string().max(240)).max(40).default([]),
    /** Draft may include empty segments while typing commas; publish readiness requires 2+ non-empty tags. */
    audienceTags: z.array(z.string().max(80)).max(40).default([]),

    trialDays: z.number().int().min(0).max(365).default(0),
    freeTrial: z.boolean().default(false),
    deploymentTime: z.string().trim().max(180).optional().default(''),
    bestFor: z.string().trim().max(240).optional().default(''),
    customizationTiers: z.array(ProductCustomizationTierDraftSchema).max(12).default([]),
    iconUrl: z.string().trim().max(2000).optional().default(''),
    screenshotUrls: z.array(z.string().trim().max(2000)).max(20).default([]),

    technical: z
        .object({
            stack: z.string().trim().max(2000).optional().default(''),
            deployment: z.string().trim().max(2000).optional().default(''),
            integrations: z.string().trim().max(2000).optional().default(''),
            platforms: z.string().trim().max(2000).optional().default(''),
            api: z.string().trim().max(2000).optional().default(''),
            security: z.string().trim().max(2000).optional().default(''),
            compliance: z.string().trim().max(2000).optional().default(''),
        })
        .default({
            stack: '',
            deployment: '',
            integrations: '',
            platforms: '',
            api: '',
            security: '',
            compliance: '',
        }),

    demoUrl: z.string().trim().url().or(z.literal('')).default(''),
    demoUser: z.string().trim().max(200).optional().default(''),
    demoPassword: z.string().trim().max(200).optional().default(''),
    demoVideoId: z.string().trim().max(100).optional().default(''),

    supportDocs: z.string().trim().url().or(z.literal('')).default(''),
    supportEmail: z.string().trim().email().or(z.literal('')).default(''),
    supportChat: z.string().trim().max(300).optional().default(''),
    supportResponse: z.string().trim().max(300).optional().default(''),

    legalPrivacy: z.string().trim().url().or(z.literal('')).default(''),
    legalTerms: z.string().trim().url().or(z.literal('')).default(''),
    legalRefund: z.string().trim().url().or(z.literal('')).default(''),

    marketplace: z
        .object({
            customization: z.boolean().default(true),
            whiteLabel: z.boolean().default(false),
            deploymentSupport: z.boolean().default(false),
            onboardingSupport: z.boolean().default(false),
        })
        .default({
            customization: true,
            whiteLabel: false,
            deploymentSupport: false,
            onboardingSupport: false,
        }),

    meta: z
        .object({
            version: z.string().trim().max(80).optional().default(''),
            releaseNotesUrl: z.string().trim().url().or(z.literal('')).default(''),
            setupTime: z.string().trim().max(300).optional().default(''),
            difficulty: z.string().trim().max(80).optional().default(''),
            requirements: z.string().trim().max(2000).optional().default(''),
        })
        .default({
            version: '',
            releaseNotesUrl: '',
            setupTime: '',
            difficulty: '',
            requirements: '',
        }),

    trust: z
        .object({
            verifiedListing: z.boolean().default(false),
            verifiedByPlatform: z.boolean().default(false),
        })
        .default({
            verifiedListing: false,
            verifiedByPlatform: false,
        }),

    listingStatus: ProductListingStatusSchema.default('draft'),
});

export const ProductIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export type DeveloperProductUpsertInput = z.infer<typeof DeveloperProductUpsertSchema>;
