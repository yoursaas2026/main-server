import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';

const BenefitSchema = z.object({
    title: z.string(),
    desc: z.string(),
});

const FeatureSchema = z.object({
    title: z.string(),
    short: z.string(),
    detail: z.string(),
});

const TierSchema = z.object({
    id: z.enum(['base', 'plus', 'pro']),
    description: z.string(),
    delivery: z.string(),
    fixedPriceInr: z.number().int().nonnegative().nullable(),
});

export const AstraListingAutofillSchema = z.object({
    name: z.string().min(1).max(120),
    slug: z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    categoryName: z.string().min(1).max(80),
    tagline: z.string().min(1).max(200),
    shortDescription: z.string().min(1).max(800),
    problem: z.string().min(1).max(1000),
    solution: z.string().min(1).max(1000),
    featuresTagline: z.string().min(1).max(200),
    featuresAboutBody: z.string().min(1).max(1500),
    benefits: z.array(BenefitSchema).min(1).max(5),
    features: z.array(FeatureSchema).min(1).max(6),
    useCases: z.array(z.string().min(1).max(160)).min(1).max(10),
    audienceTags: z.array(z.string().min(1).max(60)).min(1).max(12),
    deploymentTime: z.string().min(1).max(120),
    bestFor: z.string().min(1).max(200),
    trialDays: z.number().int().min(0).max(90),
    freeTrial: z.boolean(),
    customizationTiers: z.array(TierSchema).length(3),
    technical: z.object({
        stack: z.string().max(200),
        deployment: z.string().max(200),
        integrations: z.string().max(200),
        platforms: z.string().max(200),
        api: z.string().max(200),
        security: z.string().max(200),
        compliance: z.string().max(200),
    }),
    supportResponse: z.string().max(120),
    supportChat: z.string().max(80),
    meta: z.object({
        version: z.string().max(40),
        setupTime: z.string().max(80),
        difficulty: z.string().max(80),
        requirements: z.string().max(200),
    }),
    marketplace: z.object({
        customization: z.boolean(),
        whiteLabel: z.boolean(),
        deploymentSupport: z.boolean(),
        onboardingSupport: z.boolean(),
    }),
});

export type AstraListingAutofill = z.infer<typeof AstraListingAutofillSchema>;

function asString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
}

function asStringArray(value: unknown, maxItems: number): string[] {
    if (Array.isArray(value)) {
        return value
            .map((v) => asString(v))
            .filter(Boolean)
            .slice(0, maxItems);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(/[,;\n|]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, maxItems);
    }
    return [];
}

function asBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', 'yes', '1'].includes(v)) return true;
        if (['false', 'no', '0'].includes(v)) return false;
    }
    return fallback;
}

function asInt(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
}

function slugify(raw: string): string {
    const s = raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return s.length >= 2 ? s : 'product';
}

function padBenefits(items: { title: string; desc: string }[]): { title: string; desc: string }[] {
    const out = [...items];
    while (out.length < 3) {
        out.push({
            title: `Benefit ${out.length + 1}`,
            desc: 'Helps teams get more value from the product.',
        });
    }
    return out.slice(0, 5);
}

function padFeatures(
    items: { title: string; short: string; detail: string }[]
): { title: string; short: string; detail: string }[] {
    const out = [...items];
    while (out.length < 3) {
        out.push({
            title: `Feature ${out.length + 1}`,
            short: 'Core capability',
            detail: 'A key capability that supports the product’s main workflow.',
        });
    }
    return out.slice(0, 6);
}

function normalizeTiers(raw: unknown): AstraListingAutofill['customizationTiers'] {
    const list = Array.isArray(raw) ? raw : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const id = asString(row.id).toLowerCase();
        if (id === 'base' || id === 'plus' || id === 'pro') byId.set(id, row);
    }

    const defaults: Record<'base' | 'plus' | 'pro', AstraListingAutofill['customizationTiers'][number]> = {
        base: {
            id: 'base',
            description: 'Logo, colors, and product naming. No structural changes.',
            delivery: 'Typically 3–5 business days',
            fixedPriceInr: 15000,
        },
        plus: {
            id: 'plus',
            description: 'Everything in Base plus UI adjustments and light workflow tweaks.',
            delivery: 'Typically 1–2 weeks',
            fixedPriceInr: 45000,
        },
        pro: {
            id: 'pro',
            description: 'Scoped feature work, integrations, and custom workflows.',
            delivery: 'Quoted per contract',
            fixedPriceInr: 99000,
        },
    };

    return (['base', 'plus', 'pro'] as const).map((id) => {
        const row = byId.get(id);
        if (!row) return defaults[id];
        const priceRaw = row.fixedPriceInr ?? row.priceInr ?? row.price;
        let fixedPriceInr: number | null = defaults[id].fixedPriceInr;
        if (priceRaw === null || priceRaw === 'null') fixedPriceInr = null;
        else if (priceRaw !== undefined) fixedPriceInr = Math.max(0, asInt(priceRaw, defaults[id].fixedPriceInr ?? 0));

        return {
            id,
            description: asString(row.description, defaults[id].description),
            delivery: asString(row.delivery, defaults[id].delivery),
            fixedPriceInr,
        };
    });
}

/** Coerce messy LLM JSON into a complete autofill payload before zod validation. */
export function normalizeAstraPayload(
    raw: unknown,
    categoryNames: string[],
    productNameHint?: string
): Record<string, unknown> {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const nested =
        obj.listing && typeof obj.listing === 'object'
            ? (obj.listing as Record<string, unknown>)
            : obj.data && typeof obj.data === 'object'
              ? (obj.data as Record<string, unknown>)
              : obj;

    const name = asString(nested.name || nested.productName || productNameHint, 'Untitled product');
    const defaultCategory = categoryNames[0] || 'Productivity';
    const categoryName =
        asString(nested.categoryName || nested.category || nested.productCategory, defaultCategory) || defaultCategory;

    const benefitsRaw = Array.isArray(nested.benefits) ? nested.benefits : [];
    const benefits = padBenefits(
        benefitsRaw
            .map((b) => {
                if (!b || typeof b !== 'object') return null;
                const row = b as Record<string, unknown>;
                return {
                    title: asString(row.title || row.name, 'Benefit'),
                    desc: asString(row.desc || row.description || row.detail, 'Value for buyers.'),
                };
            })
            .filter((b): b is { title: string; desc: string } => Boolean(b))
    );

    const featuresRaw = Array.isArray(nested.features) ? nested.features : [];
    const features = padFeatures(
        featuresRaw
            .map((f) => {
                if (!f || typeof f !== 'object') return null;
                const row = f as Record<string, unknown>;
                return {
                    title: asString(row.title || row.name, 'Feature'),
                    short: asString(row.short || row.summary || row.tagline, 'Key capability'),
                    detail: asString(row.detail || row.description || row.desc, 'Supports the main product workflow.'),
                };
            })
            .filter((f): f is { title: string; short: string; detail: string } => Boolean(f))
    );

    const techRaw =
        nested.technical && typeof nested.technical === 'object'
            ? (nested.technical as Record<string, unknown>)
            : {};
    const metaRaw = nested.meta && typeof nested.meta === 'object' ? (nested.meta as Record<string, unknown>) : {};
    const marketRaw =
        nested.marketplace && typeof nested.marketplace === 'object'
            ? (nested.marketplace as Record<string, unknown>)
            : {};

    const useCases = asStringArray(nested.useCases ?? nested.use_cases, 10);
    const audienceTags = asStringArray(nested.audienceTags ?? nested.audience_tags ?? nested.audience, 12);

    const freeTrial = asBool(nested.freeTrial ?? nested.free_trial, true);
    const trialDays = asInt(nested.trialDays ?? nested.trial_days, freeTrial ? 14 : 0);

    return {
        name: name.slice(0, 120),
        slug: slugify(asString(nested.slug, name)),
        categoryName: categoryName.slice(0, 80),
        tagline: asString(nested.tagline, `${name} for modern teams`).slice(0, 200) || `${name} for modern teams`,
        shortDescription: asString(
            nested.shortDescription || nested.short_description || nested.description,
            `${name} helps teams work faster with a focused SaaS workflow.`
        ).slice(0, 800),
        problem: asString(
            nested.problem,
            'Teams waste time on fragmented tools and manual processes.'
        ).slice(0, 1000),
        solution: asString(
            nested.solution,
            `${name} centralizes the workflow so teams can execute with less overhead.`
        ).slice(0, 1000),
        featuresTagline: asString(nested.featuresTagline || nested.features_tagline, `Why teams choose ${name}`).slice(
            0,
            200
        ),
        featuresAboutBody: asString(
            nested.featuresAboutBody || nested.features_about_body || nested.about,
            `${name} is built for practical day-to-day use: clear workflows, sensible defaults, and room to customize when you need it.`
        ).slice(0, 1500),
        benefits,
        features,
        useCases: (useCases.length ? useCases : ['Daily operations', 'Team collaboration', 'Reporting']).slice(0, 10),
        audienceTags: (audienceTags.length ? audienceTags : ['Startups', 'SMB', 'Operations teams']).slice(0, 12),
        deploymentTime: asString(nested.deploymentTime || nested.deployment_time, '2–4 weeks').slice(0, 120),
        bestFor: asString(nested.bestFor || nested.best_for, 'Growing teams that need a focused SaaS workflow').slice(
            0,
            200
        ),
        trialDays: Math.min(90, Math.max(0, trialDays)),
        freeTrial,
        customizationTiers: normalizeTiers(nested.customizationTiers || nested.tiers || nested.packages),
        technical: {
            stack: asString(techRaw.stack).slice(0, 200),
            deployment: asString(techRaw.deployment).slice(0, 200),
            integrations: asString(techRaw.integrations).slice(0, 200),
            platforms: asString(techRaw.platforms, 'Web').slice(0, 200),
            api: asString(techRaw.api).slice(0, 200),
            security: asString(techRaw.security).slice(0, 200),
            compliance: asString(techRaw.compliance).slice(0, 200),
        },
        supportResponse: asString(nested.supportResponse || nested.support_response, 'Within 1 business day').slice(
            0,
            120
        ),
        supportChat: asString(nested.supportChat || nested.support_chat, 'In-app').slice(0, 80),
        meta: {
            version: asString(metaRaw.version, '1.0.0').slice(0, 40),
            setupTime: asString(metaRaw.setupTime || metaRaw.setup_time, '1–3 days').slice(0, 80),
            difficulty: asString(metaRaw.difficulty, 'Easy — guided setup').slice(0, 80),
            requirements: asString(metaRaw.requirements, 'Modern browser; admin access for setup').slice(0, 200),
        },
        marketplace: {
            customization: asBool(marketRaw.customization, true),
            whiteLabel: asBool(marketRaw.whiteLabel ?? marketRaw.white_label, false),
            deploymentSupport: asBool(marketRaw.deploymentSupport ?? marketRaw.deployment_support, true),
            onboardingSupport: asBool(marketRaw.onboardingSupport ?? marketRaw.onboarding_support, true),
        },
    };
}

function buildSystemPrompt(categoryNames: string[]): string {
    const cats =
        categoryNames.length > 0
            ? categoryNames.map((n) => `- ${n}`).join('\n')
            : '- Productivity\n- Developer Tools\n- Marketing';

    return `You are Astra, the YourSaaS marketplace listing assistant.
Return ONLY one JSON object (no markdown) with ALL of these keys:

{
  "name": "string",
  "slug": "kebab-case-slug",
  "categoryName": "exact category from list",
  "tagline": "string",
  "shortDescription": "string",
  "problem": "string",
  "solution": "string",
  "featuresTagline": "string",
  "featuresAboutBody": "string",
  "benefits": [{"title":"string","desc":"string"}],
  "features": [{"title":"string","short":"string","detail":"string"}],
  "useCases": ["string","string","string"],
  "audienceTags": ["string","string","string"],
  "deploymentTime": "string",
  "bestFor": "string",
  "trialDays": 14,
  "freeTrial": true,
  "customizationTiers": [
    {"id":"base","description":"string","delivery":"string","fixedPriceInr":15000},
    {"id":"plus","description":"string","delivery":"string","fixedPriceInr":45000},
    {"id":"pro","description":"string","delivery":"string","fixedPriceInr":99000}
  ],
  "technical": {"stack":"","deployment":"","integrations":"","platforms":"Web","api":"","security":"","compliance":""},
  "supportResponse": "Within 1 business day",
  "supportChat": "In-app",
  "meta": {"version":"1.0.0","setupTime":"1–3 days","difficulty":"Easy","requirements":"Modern browser"},
  "marketplace": {"customization":true,"whiteLabel":false,"deploymentSupport":true,"onboardingSupport":true}
}

Rules:
- Every key above is required. useCases and audienceTags MUST be JSON arrays of strings (never a single string).
- Write clear professional B2B SaaS English.
- slug: lowercase kebab-case only.
- categoryName: pick ONE exact name from:
${cats}
- benefits: exactly 3 objects. features: 3–5 objects.
- customizationTiers: exactly base, plus, pro in that order with INR integers.
- Do not invent emails, URLs, passwords, or legal links.`;
}

export async function generateListingAutofill(input: {
    description: string;
    productNameHint?: string;
    categoryNames: string[];
}): Promise<AstraListingAutofill> {
    if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_NOT_CONFIGURED');
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const userParts = [
        `Product description:\n${input.description.trim()}`,
        input.productNameHint?.trim() ? `Current product name hint: ${input.productNameHint.trim()}` : null,
        'Return the full JSON object with every required key filled.',
    ].filter(Boolean);

    let completion;
    try {
        completion = await client.chat.completions.create({
            model: env.OPENAI_MODEL,
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: buildSystemPrompt(input.categoryNames) },
                { role: 'user', content: userParts.join('\n\n') },
            ],
        });
    } catch (err) {
        console.error('[Astra] OpenAI request failed:', err);
        throw new Error('ASTRA_PROVIDER_ERROR');
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
        throw new Error('ASTRA_EMPTY_RESPONSE');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('ASTRA_INVALID_JSON');
    }

    const normalized = normalizeAstraPayload(parsed, input.categoryNames, input.productNameHint);
    const result = AstraListingAutofillSchema.safeParse(normalized);
    if (!result.success) {
        console.error('[Astra] schema validation failed after normalize:', result.error.flatten());
        console.error('[Astra] normalized keys:', Object.keys(normalized));
        throw new Error('ASTRA_SCHEMA_MISMATCH');
    }

    return result.data;
}
