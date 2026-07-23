import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { productCategories } from '../../db/schema.js';
import { getDeveloperPlan } from '../../utils/developer-live-listing-limits.js';
import { generateListingAutofill } from '../../services/astra.service.js';
import { env } from '../../config/env.js';

const AutofillBodySchema = z.object({
    description: z.string().trim().min(20, 'Describe your product in at least 20 characters').max(2000),
    productNameHint: z.string().trim().max(120).optional(),
});

function assertDeveloper(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'developer') return null;
    return jwtUser;
}

function matchCategoryId(
    categoryName: string,
    categories: { id: number; name: string }[]
): number | null {
    const needle = categoryName.trim().toLowerCase();
    const exact = categories.find((c) => c.name.trim().toLowerCase() === needle);
    if (exact) return exact.id;
    const partial = categories.find(
        (c) =>
            c.name.trim().toLowerCase().includes(needle) ||
            needle.includes(c.name.trim().toLowerCase())
    );
    return partial?.id ?? null;
}

export class AstraController {
    /** POST /api/developer/astra/listing-autofill — Ultimate only */
    async listingAutofill(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        if (!env.OPENAI_API_KEY) {
            console.error('[Astra] OPENAI_API_KEY is not configured');
            return c.json(
                {
                    success: false,
                    error: 'Astra is temporarily unavailable. Please try again later.',
                    code: 'ASTRA_UNAVAILABLE',
                },
                503
            );
        }

        const plan = await getDeveloperPlan(jwtUser.id);
        if (plan !== 'ultimate') {
            return c.json(
                {
                    success: false,
                    error: 'Astra autofill is available on the Ultimate plan only.',
                    code: 'ASTRA_ULTIMATE_REQUIRED',
                    plan,
                },
                403
            );
        }

        const body = await c.req.json().catch(() => null);
        const parsed = AutofillBodySchema.safeParse(body);
        if (!parsed.success) {
            return c.json(
                { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' },
                400
            );
        }

        try {
            const categories = await db
                .select({ id: productCategories.id, name: productCategories.name })
                .from(productCategories);

            const autofill = await generateListingAutofill({
                description: parsed.data.description,
                productNameHint: parsed.data.productNameHint,
                categoryNames: categories.map((c) => c.name),
            });

            const productCategoryId = matchCategoryId(autofill.categoryName, categories);

            return c.json({
                success: true,
                data: {
                    autofill: {
                        ...autofill,
                        productCategoryId,
                    },
                },
            });
        } catch (error) {
            // Log provider details server-side only — never expose quota/billing/API errors to developers.
            console.error('[Astra] listingAutofill error:', error);
            return c.json(
                {
                    success: false,
                    error: 'Astra could not complete autofill right now. Please try again in a few minutes.',
                    code: 'ASTRA_UNAVAILABLE',
                },
                503
            );
        }
    }
}

export const astraController = new AstraController();
