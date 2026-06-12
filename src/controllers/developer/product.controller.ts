import type { Context } from 'hono';
import { and, avg, count, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients, developerProducts, productCategories, productReviews } from '../../db/schema.js';
import { saveProductImageFile } from '../../utils/product-media-save.js';
import {
    DeveloperProductUpsertSchema,
    ProductIdParamSchema,
    type DeveloperProductUpsertInput,
} from '../../types/developer-product.types.js';
import { getMissingForLiveListing } from '../../utils/listing-publish-readiness.js';
import {
    countDeveloperLiveListings,
    getDeveloperPlan,
    liveListingLimitErrorMessage,
    maxLiveListingsForPlan,
} from '../../utils/developer-live-listing-limits.js';
import {
    cleanupAllProductMediaForRow,
    cleanupAllProductMediaFromInput,
    cleanupReplacedProductMedia,
} from '../../utils/product-media-cleanup.js';
import { assertDeveloperMarketplaceReady } from '../../utils/developer-onboarding.js';

function assertDeveloper(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'developer') return null;
    return jwtUser;
}

function serializeJson(value: unknown): string {
    return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function normalizeListingStatus(raw: string | null | undefined): 'draft' | 'live' {
    const s = (raw || '').toLowerCase();
    if (s === 'live') return 'live';
    return 'draft';
}

/** Best image for product list cards: app icon, else first gallery screenshot. */
function listRowCoverImage(iconUrl: string | null, screenshotUrlsJson: string | null): string | null {
    const icon = iconUrl?.trim();
    if (icon) return icon;
    const shots = parseJson(screenshotUrlsJson, [] as unknown[]);
    for (const s of shots) {
        if (typeof s === 'string' && s.trim()) return s.trim();
    }
    return null;
}

async function parseProductInput(c: Context): Promise<{ input: DeveloperProductUpsertInput; bodyMap?: Record<string, unknown> }> {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody({ all: true }) as Record<string, unknown>;
        const payloadRaw = typeof body.payload === 'string' ? body.payload : null;
        if (!payloadRaw) throw new Error('Missing payload for multipart request');
        const parsedJson = JSON.parse(payloadRaw);
        const parsed = DeveloperProductUpsertSchema.safeParse(parsedJson);
        if (!parsed.success) {
            throw new Error(parsed.error.issues[0]?.message ?? 'Invalid payload');
        }
        return { input: parsed.data, bodyMap: body };
    }

    const body = await c.req.json().catch(() => null);
    const parsed = DeveloperProductUpsertSchema.safeParse(body);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid payload');
    }
    return { input: parsed.data };
}

async function applyMediaFromMultipart(
    input: DeveloperProductUpsertInput,
    bodyMap: Record<string, unknown> | undefined,
    developerId: number
): Promise<DeveloperProductUpsertInput> {
    if (!bodyMap) return input;

    let iconUrl = input.iconUrl || '';
    let screenshotUrls = Array.isArray(input.screenshotUrls)
        ? [...input.screenshotUrls].filter((u) => typeof u === 'string' && u.trim())
        : [];

    const iconCandidate = bodyMap.icon;
    if (iconCandidate instanceof File && iconCandidate.size > 0) {
        const saved = await saveProductImageFile(iconCandidate, 'icons', developerId);
        if ('error' in saved) throw new Error(saved.error);
        iconUrl = saved.url;
    }

    const shotsCandidate = bodyMap.screenshots;
    const shotFiles: File[] = [];
    if (Array.isArray(shotsCandidate)) {
        for (const item of shotsCandidate) {
            if (item instanceof File && item.size > 0) shotFiles.push(item);
        }
    } else if (shotsCandidate instanceof File && shotsCandidate.size > 0) {
        shotFiles.push(shotsCandidate);
    }
    if (shotFiles.length > 0) {
        const newUrls: string[] = [];
        for (const f of shotFiles.slice(0, 20)) {
            const saved = await saveProductImageFile(f, 'screenshots', developerId);
            if ('error' in saved) throw new Error(saved.error);
            newUrls.push(saved.url);
        }
        screenshotUrls = [...screenshotUrls, ...newUrls].slice(0, 20);
    }

    return {
        ...input,
        iconUrl,
        screenshotUrls,
    };
}

async function assertValidCategoryOrThrow(categoryId: number | null) {
    if (categoryId == null) return;
    const [row] = await db
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(eq(productCategories.id, categoryId))
        .limit(1);
    if (!row) {
        throw new Error('Invalid product category. Please choose one from admin-managed categories.');
    }
}

function toDbRecord(
    input: DeveloperProductUpsertInput,
    developerId: number,
    options?: {
        /** Update only: keep trust columns from DB. Create omits this so all trust flags stay false until admin sets them. */
        preserveTrustFrom?: Pick<
            typeof developerProducts.$inferSelect,
            'trustVerifiedListing' | 'trustVerifiedByPlatform' | 'trustYourSaaSCertified'
        >;
    }
) {
    const t = options?.preserveTrustFrom;
    const trustVerifiedListing = t ? (t.trustVerifiedListing ?? false) : false;
    const trustVerifiedByPlatform = t ? (t.trustVerifiedByPlatform ?? false) : false;
    const trustYourSaaSCertified = t ? (t.trustYourSaaSCertified ?? false) : false;

    return {
        developerId,
        projectId: input.projectId,
        slug: input.slug,
        name: input.name,
        productCategoryId: input.productCategoryId,
        tagline: input.tagline,
        shortDescription: input.shortDescription,
        problem: input.problem,
        solution: input.solution,
        featuresTagline: input.featuresTagline,
        featuresAboutBody: input.featuresAboutBody,
        benefits: serializeJson(input.benefits),
        features: serializeJson(input.features),
        useCases: serializeJson(input.useCases),
        audienceTags: serializeJson(input.audienceTags),
        trialDays: input.trialDays,
        freeTrial: input.freeTrial,
        deploymentTime: input.deploymentTime,
        bestFor: input.bestFor,
        customizationTiers: serializeJson(input.customizationTiers),
        iconUrl: input.iconUrl,
        screenshotUrls: serializeJson(input.screenshotUrls),
        technicalStack: input.technical.stack,
        technicalDeployment: input.technical.deployment,
        technicalIntegrations: input.technical.integrations,
        technicalPlatforms: input.technical.platforms,
        technicalApi: input.technical.api,
        technicalSecurity: input.technical.security,
        technicalCompliance: input.technical.compliance,
        demoUrl: input.demoUrl,
        demoUser: input.demoUser,
        demoPassword: input.demoPassword,
        demoVideoId: input.demoVideoId,
        supportDocs: input.supportDocs,
        supportEmail: input.supportEmail,
        supportChat: input.supportChat,
        supportResponse: input.supportResponse,
        legalPrivacy: input.legalPrivacy,
        legalTerms: input.legalTerms,
        legalRefund: input.legalRefund,
        marketplaceCustomization: input.marketplace.customization,
        marketplaceWhiteLabel: input.marketplace.whiteLabel,
        marketplaceDeploymentSupport: input.marketplace.deploymentSupport,
        marketplaceOnboardingSupport: input.marketplace.onboardingSupport,
        metaVersion: input.meta.version,
        metaReleaseNotesUrl: input.meta.releaseNotesUrl,
        metaSetupTime: input.meta.setupTime,
        metaDifficulty: input.meta.difficulty,
        metaRequirements: input.meta.requirements,
        trustVerifiedListing,
        trustVerifiedByPlatform,
        trustYourSaaSCertified,
        listingStatus: input.listingStatus,
        updatedAt: new Date(),
    };
}

function toApiProduct(row: typeof developerProducts.$inferSelect) {
    return {
        id: row.id,
        developerId: row.developerId,
        projectId: row.projectId,
        slug: row.slug,
        name: row.name,
        productCategoryId: row.productCategoryId ?? null,
        tagline: row.tagline,
        shortDescription: row.shortDescription,
        problem: row.problem,
        solution: row.solution,
        featuresTagline: row.featuresTagline,
        featuresAboutBody: row.featuresAboutBody,
        benefits: parseJson(row.benefits, [] as unknown[]),
        features: parseJson(row.features, [] as unknown[]),
        useCases: parseJson(row.useCases, [] as string[]),
        audienceTags: parseJson(row.audienceTags, [] as string[]),
        trialDays: row.trialDays ?? 0,
        freeTrial: row.freeTrial ?? false,
        deploymentTime: row.deploymentTime,
        bestFor: row.bestFor,
        customizationTiers: parseJson(row.customizationTiers, [] as unknown[]),
        iconUrl: row.iconUrl || '',
        screenshotUrls: parseJson(row.screenshotUrls, [] as string[]),
        technical: {
            stack: row.technicalStack,
            deployment: row.technicalDeployment,
            integrations: row.technicalIntegrations,
            platforms: row.technicalPlatforms,
            api: row.technicalApi,
            security: row.technicalSecurity,
            compliance: row.technicalCompliance,
        },
        demoUrl: row.demoUrl,
        demoUser: row.demoUser,
        demoPassword: row.demoPassword,
        demoVideoId: row.demoVideoId,
        supportDocs: row.supportDocs,
        supportEmail: row.supportEmail,
        supportChat: row.supportChat,
        supportResponse: row.supportResponse,
        legalPrivacy: row.legalPrivacy,
        legalTerms: row.legalTerms,
        legalRefund: row.legalRefund,
        marketplace: {
            customization: row.marketplaceCustomization ?? true,
            whiteLabel: row.marketplaceWhiteLabel ?? false,
            deploymentSupport: row.marketplaceDeploymentSupport ?? false,
            onboardingSupport: row.marketplaceOnboardingSupport ?? false,
        },
        meta: {
            version: row.metaVersion,
            releaseNotesUrl: row.metaReleaseNotesUrl,
            setupTime: row.metaSetupTime,
            difficulty: row.metaDifficulty,
            requirements: row.metaRequirements,
        },
        trust: {
            verifiedListing: row.trustVerifiedListing ?? false,
            verifiedByPlatform: row.trustVerifiedByPlatform ?? false,
            yoursaasCertified: row.trustYourSaaSCertified ?? false,
        },
        listingStatus: normalizeListingStatus(row.listingStatus),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function withPublishReadiness(row: typeof developerProducts.$inferSelect) {
    const product = toApiProduct(row);
    const missing = getMissingForLiveListing(product as unknown as DeveloperProductUpsertInput);
    return {
        ...product,
        publishReadiness: {
            canPublishLive: missing.length === 0,
            missingForLive: missing,
        },
    };
}

async function assertDeveloperMayPublishLive(developerId: number, existingListingStatus: string | null | undefined) {
    if (normalizeListingStatus(existingListingStatus) === 'live') {
        return { ok: true as const };
    }
    const plan = await getDeveloperPlan(developerId);
    const maxLive = maxLiveListingsForPlan(plan);
    if (maxLive === null) return { ok: true as const };
    const liveCount = await countDeveloperLiveListings(developerId);
    if (liveCount >= maxLive) {
        return {
            ok: false as const,
            plan,
            maxLive,
            liveCount,
            error: liveListingLimitErrorMessage(plan, maxLive, liveCount),
        };
    }
    return { ok: true as const };
}

export class DeveloperProductController {
    async create(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const onboardingBlock = await assertDeveloperMarketplaceReady(c, jwtUser.id);
        if (onboardingBlock) return onboardingBlock;

        let input: DeveloperProductUpsertInput;
        let bodyMap: Record<string, unknown> | undefined;
        try {
            const parsed = await parseProductInput(c);
            input = parsed.input;
            bodyMap = parsed.bodyMap;
            input = await applyMediaFromMultipart(input, bodyMap, jwtUser.id);
            await assertValidCategoryOrThrow(input.productCategoryId);
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Invalid payload' }, 400);
        }

        try {
            if (input.listingStatus === 'live') {
                const missing = getMissingForLiveListing(input);
                if (missing.length > 0) {
                    return c.json(
                        {
                            success: false,
                            error: 'Listing is incomplete and cannot go live yet',
                            details: missing,
                        },
                        400
                    );
                }
                const slot = await assertDeveloperMayPublishLive(jwtUser.id, null);
                if (!slot.ok) {
                    cleanupAllProductMediaFromInput(input);
                    return c.json(
                        {
                            success: false,
                            error: slot.error,
                            code: 'LIVE_LISTING_LIMIT',
                            plan: slot.plan,
                            maxLive: slot.maxLive,
                            liveCount: slot.liveCount,
                        },
                        403
                    );
                }
            }

            const [existingSlug] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(eq(developerProducts.slug, input.slug))
                .limit(1);

            if (existingSlug) {
                cleanupAllProductMediaFromInput(input);
                return c.json({ success: false, error: 'Slug already in use' }, 409);
            }

            const [created] = await db
                .insert(developerProducts)
                .values(toDbRecord(input, jwtUser.id))
                .returning();

            return c.json(
                {
                    success: true,
                    message: 'Product created',
                    data: { product: withPublishReadiness(created) },
                },
                201
            );
        } catch (error) {
            console.error('[DeveloperProduct] create error:', error);
            cleanupAllProductMediaFromInput(input);
            return c.json({ success: false, error: 'Failed to create product' }, 500);
        }
    }

    /** Query: slug (required), excludeProductId (optional, must be caller's product). */
    async checkSlugAvailability(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const raw = (c.req.query('slug') || '').trim().toLowerCase();
        const excludeRaw = c.req.query('excludeProductId');
        const parsedExclude = excludeRaw ? parseInt(excludeRaw, 10) : NaN;
        const excludeProductId = Number.isFinite(parsedExclude) && parsedExclude > 0 ? parsedExclude : undefined;

        const slugOk =
            raw.length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) && raw.length <= 160;
        if (!slugOk) {
            return c.json({
                success: true,
                data: { available: false, validFormat: false },
            });
        }

        if (excludeProductId) {
            const [owned] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(
                    and(
                        eq(developerProducts.id, excludeProductId),
                        eq(developerProducts.developerId, jwtUser.id)
                    )
                )
                .limit(1);
            if (!owned) {
                return c.json({ success: false, error: 'Invalid exclude product' }, 400);
            }
        }

        try {
            const [found] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(eq(developerProducts.slug, raw))
                .limit(1);

            if (!found) {
                return c.json({
                    success: true,
                    data: { available: true, validFormat: true },
                });
            }
            if (excludeProductId && found.id === excludeProductId) {
                return c.json({
                    success: true,
                    data: { available: true, validFormat: true },
                });
            }
            return c.json({
                success: true,
                data: { available: false, validFormat: true },
            });
        } catch (error) {
            console.error('[DeveloperProduct] checkSlugAvailability error:', error);
            return c.json({ success: false, error: 'Slug check failed' }, 500);
        }
    }

    async listMine(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20', 10), 1), 100);
        const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);
        const projectId = c.req.query('projectId');

        try {
            const rows = await db
                .select({
                    id: developerProducts.id,
                    projectId: developerProducts.projectId,
                    slug: developerProducts.slug,
                    name: developerProducts.name,
                    productCategoryId: developerProducts.productCategoryId,
                    tagline: developerProducts.tagline,
                    listingStatus: developerProducts.listingStatus,
                    trialDays: developerProducts.trialDays,
                    freeTrial: developerProducts.freeTrial,
                    updatedAt: developerProducts.updatedAt,
                    createdAt: developerProducts.createdAt,
                    iconUrl: developerProducts.iconUrl,
                    screenshotUrls: developerProducts.screenshotUrls,
                    trustVerifiedByPlatform: developerProducts.trustVerifiedByPlatform,
                })
                .from(developerProducts)
                .where(
                    projectId
                        ? and(
                            eq(developerProducts.developerId, jwtUser.id),
                            eq(developerProducts.projectId, projectId)
                        )
                        : eq(developerProducts.developerId, jwtUser.id)
                )
                .orderBy(desc(developerProducts.updatedAt), desc(developerProducts.createdAt))
                .limit(limit)
                .offset(offset);

            const products = rows.map((r) => ({
                id: r.id,
                projectId: r.projectId,
                slug: r.slug,
                name: r.name,
                productCategoryId: r.productCategoryId ?? null,
                tagline: r.tagline,
                listingStatus: normalizeListingStatus(r.listingStatus),
                trialDays: r.trialDays,
                freeTrial: r.freeTrial,
                updatedAt: r.updatedAt,
                createdAt: r.createdAt,
                coverImageUrl: listRowCoverImage(r.iconUrl, r.screenshotUrls),
                trustVerifiedByPlatform: r.trustVerifiedByPlatform ?? false,
            }));

            return c.json({
                success: true,
                data: { products, pagination: { limit, offset, count: products.length } },
            });
        } catch (error) {
            console.error('[DeveloperProduct] listMine error:', error);
            return c.json({ success: false, error: 'Failed to fetch products' }, 500);
        }
    }

    async getOne(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        try {
            const [row] = await db
                .select()
                .from(developerProducts)
                .where(and(
                    eq(developerProducts.id, parsedId.data.id),
                    eq(developerProducts.developerId, jwtUser.id)
                ))
                .limit(1);

            if (!row) return c.json({ success: false, error: 'Product not found' }, 404);

            return c.json({
                success: true,
                data: { product: withPublishReadiness(row) },
            });
        } catch (error) {
            console.error('[DeveloperProduct] getOne error:', error);
            return c.json({ success: false, error: 'Failed to fetch product' }, 500);
        }
    }

    async update(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const onboardingBlock = await assertDeveloperMarketplaceReady(c, jwtUser.id);
        if (onboardingBlock) return onboardingBlock;

        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        let input: DeveloperProductUpsertInput;
        let bodyMap: Record<string, unknown> | undefined;
        try {
            const parsed = await parseProductInput(c);
            input = parsed.input;
            bodyMap = parsed.bodyMap;
            input = await applyMediaFromMultipart(input, bodyMap, jwtUser.id);
            await assertValidCategoryOrThrow(input.productCategoryId);
        } catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Invalid payload' }, 400);
        }

        try {
            const [existing] = await db
                .select()
                .from(developerProducts)
                .where(and(
                    eq(developerProducts.id, parsedId.data.id),
                    eq(developerProducts.developerId, jwtUser.id)
                ))
                .limit(1);

            if (!existing) return c.json({ success: false, error: 'Product not found' }, 404);

            const [slugConflict] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(and(
                    eq(developerProducts.slug, input.slug),
                    ne(developerProducts.id, parsedId.data.id)
                ))
                .limit(1);

            if (slugConflict) {
                return c.json({ success: false, error: 'Slug already in use' }, 409);
            }

            if (input.listingStatus === 'live') {
                const missing = getMissingForLiveListing(input);
                if (missing.length > 0) {
                    return c.json(
                        {
                            success: false,
                            error: 'Listing is incomplete and cannot go live yet',
                            details: missing,
                        },
                        400
                    );
                }
                const slot = await assertDeveloperMayPublishLive(jwtUser.id, existing.listingStatus);
                if (!slot.ok) {
                    return c.json(
                        {
                            success: false,
                            error: slot.error,
                            code: 'LIVE_LISTING_LIMIT',
                            plan: slot.plan,
                            maxLive: slot.maxLive,
                            liveCount: slot.liveCount,
                        },
                        403
                    );
                }
            }

            const [updated] = await db
                .update(developerProducts)
                .set(toDbRecord(input, jwtUser.id, { preserveTrustFrom: existing }))
                .where(and(
                    eq(developerProducts.id, parsedId.data.id),
                    eq(developerProducts.developerId, jwtUser.id)
                ))
                .returning();

            cleanupReplacedProductMedia(
                { iconUrl: existing.iconUrl, screenshotUrls: existing.screenshotUrls },
                { iconUrl: input.iconUrl, screenshotUrls: input.screenshotUrls }
            );

            return c.json({
                success: true,
                message: 'Product updated',
                data: { product: withPublishReadiness(updated) },
            });
        } catch (error) {
            console.error('[DeveloperProduct] update error:', error);
            return c.json({ success: false, error: 'Failed to update product' }, 500);
        }
    }

    async remove(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        try {
            const [existing] = await db
                .select()
                .from(developerProducts)
                .where(and(
                    eq(developerProducts.id, parsedId.data.id),
                    eq(developerProducts.developerId, jwtUser.id)
                ))
                .limit(1);

            if (!existing) return c.json({ success: false, error: 'Product not found' }, 404);

            await db
                .delete(developerProducts)
                .where(and(
                    eq(developerProducts.id, parsedId.data.id),
                    eq(developerProducts.developerId, jwtUser.id)
                ));

            cleanupAllProductMediaForRow(existing);

            return c.json({ success: true, message: 'Product deleted' });
        } catch (error) {
            console.error('[DeveloperProduct] remove error:', error);
            return c.json({ success: false, error: 'Failed to delete product' }, 500);
        }
    }

    /** Same `product_reviews` rows buyers see on the marketplace — scoped to this developer’s product. */
    async listProductReviews(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        const productId = parsedId.data.id;

        try {
            const [owned] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(and(eq(developerProducts.id, productId), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);

            if (!owned) return c.json({ success: false, error: 'Product not found' }, 404);

            const rows = await db
                .select({
                    id: productReviews.id,
                    rating: productReviews.rating,
                    comment: productReviews.comment,
                    developerReply: productReviews.developerReply,
                    developerRepliedAt: productReviews.developerRepliedAt,
                    createdAt: productReviews.createdAt,
                    userName: clients.name,
                    companyName: clients.companyName,
                })
                .from(productReviews)
                .innerJoin(clients, eq(productReviews.clientId, clients.id))
                .where(eq(productReviews.productId, productId))
                .orderBy(desc(productReviews.createdAt));

            const [{ avgRating, totalReviews }] = await db
                .select({
                    avgRating: avg(productReviews.rating),
                    totalReviews: count(productReviews.id),
                })
                .from(productReviews)
                .where(eq(productReviews.productId, productId));

            const reviews = rows.map((r) => ({
                id: r.id,
                user: r.userName,
                role: r.companyName || 'Verified user',
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt,
                developerReply: r.developerReply,
                developerRepliedAt: r.developerRepliedAt,
            }));

            return c.json({
                success: true,
                data: {
                    rating: avgRating ? Number(avgRating) : 0,
                    reviewCount: Number(totalReviews ?? 0),
                    reviews,
                },
            });
        } catch (error) {
            console.error('[DeveloperProduct] listProductReviews error:', error);
            return c.json({ success: false, error: 'Failed to fetch reviews' }, 500);
        }
    }

    async upsertReviewReply(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const productId = Number(c.req.param('id'));
        const reviewId = Number(c.req.param('reviewId'));
        if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(reviewId) || reviewId < 1) {
            return c.json({ success: false, error: 'Invalid IDs' }, 400);
        }

        const body = await c.req.json().catch(() => null);
        const reply = typeof body?.reply === 'string' ? body.reply.trim() : '';
        if (reply.length > 1000) {
            return c.json({ success: false, error: 'Reply is too long (max 1000 chars)' }, 400);
        }

        try {
            const [owned] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(and(eq(developerProducts.id, productId), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);

            if (!owned) return c.json({ success: false, error: 'Product not found' }, 404);

            const [review] = await db
                .select({ id: productReviews.id, productId: productReviews.productId })
                .from(productReviews)
                .where(eq(productReviews.id, reviewId))
                .limit(1);

            if (!review || review.productId !== productId) {
                return c.json({ success: false, error: 'Review not found' }, 404);
            }

            await db
                .update(productReviews)
                .set({
                    developerReply: reply.length ? reply : null,
                    developerRepliedAt: reply.length ? new Date() : null,
                    updatedAt: new Date(),
                })
                .where(eq(productReviews.id, reviewId));

            return c.json({ success: true, message: reply.length ? 'Reply saved' : 'Reply removed' });
        } catch (error) {
            console.error('[DeveloperProduct] upsertReviewReply error:', error);
            return c.json({ success: false, error: 'Failed to save reply' }, 500);
        }
    }

    async listCategories(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);
        try {
            const rows = await db
                .select({ id: productCategories.id, name: productCategories.name })
                .from(productCategories)
                .orderBy(productCategories.name);
            return c.json({ success: true, data: { categories: rows } });
        } catch (error) {
            console.error('[DeveloperProduct] listCategories error:', error);
            return c.json({ success: false, error: 'Failed to fetch categories' }, 500);
        }
    }

    /** Plan + how many live listings the account already has (for publish UI). */
    async getLiveLimits(c: Context) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);
        try {
            const plan = await getDeveloperPlan(jwtUser.id);
            const maxLive = maxLiveListingsForPlan(plan);
            const liveCount = await countDeveloperLiveListings(jwtUser.id);
            return c.json({
                success: true,
                data: { plan, maxLive, liveCount },
            });
        } catch (error) {
            console.error('[DeveloperProduct] getLiveLimits error:', error);
            return c.json({ success: false, error: 'Failed to fetch live listing limits' }, 500);
        }
    }
}

export const developerProductController = new DeveloperProductController();
