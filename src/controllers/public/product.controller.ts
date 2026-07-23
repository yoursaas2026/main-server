import type { Context } from 'hono';
import { and, avg, count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { clients, developerProducts, developers, productCategories, productReviews } from '../../db/schema.js';
import { absoluteMediaUrl } from '../../services/stream-chat.service.js';
import { env } from '../../config/env.js';
import {
    CLIENT_NON_REFUNDABLE_FEE_BPS,
    contractCheckoutBreakdown,
} from '../../services/contract.service.js';
import { listLiveMarketplaceProducts } from '../../services/client-recommendations.js';
import { effectiveDeveloperPlan } from '../../utils/developer-plan.js';

function parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function normalizeListingStatus(raw: string | null | undefined): 'draft' | 'live' {
    return (raw || '').toLowerCase() === 'live' ? 'live' : 'draft';
}

export class PublicProductController {
    async listCategories(c: Context) {
        try {
            const rows = await db
                .select({ id: productCategories.id, name: productCategories.name })
                .from(productCategories)
                .orderBy(productCategories.name);
            return c.json({ success: true, data: { categories: rows } });
        } catch (error) {
            console.error('[PublicProduct] listCategories error:', error);
            return c.json({ success: false, error: 'Failed to fetch categories' }, 500);
        }
    }

    async listLive(c: Context) {
        const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '24', 10), 1), 100);
        const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);
        const search = c.req.query('search') || '';
        const categoryIdRaw = c.req.query('categoryId');
        const categoryId = categoryIdRaw ? parseInt(categoryIdRaw, 10) : undefined;
        const sortRaw = (c.req.query('sort') || 'recommended').toLowerCase();
        const sort =
            sortRaw === 'newest' || sortRaw === 'name' || sortRaw === 'recommended'
                ? sortRaw
                : 'recommended';

        const clientId = this.getCurrentClientId(c);

        try {
            const { products, total } = await listLiveMarketplaceProducts({
                limit,
                offset,
                search,
                categoryId: Number.isInteger(categoryId) && categoryId! > 0 ? categoryId : undefined,
                clientId,
                sort: clientId ? sort : sort === 'recommended' ? 'newest' : sort,
            });

            const mapped = products.map((p) => ({
                ...p,
                coverImageUrl: absoluteMediaUrl(p.coverImageUrl) ?? null,
            }));

            return c.json({
                success: true,
                data: {
                    products: mapped,
                    pagination: { limit, offset, total, count: mapped.length },
                },
            });
        } catch (error) {
            console.error('[PublicProduct] listLive error:', error);
            return c.json({ success: false, error: 'Failed to fetch products' }, 500);
        }
    }

    /** Minimal live listing for chat tag cards (`<YourSaaS>{id}</YourSaaS>`). */
    async getCardById(c: Context) {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ success: false, error: 'Invalid product id' }, 400);
        }
        try {
            const [row] = await db
                .select({
                    id: developerProducts.id,
                    slug: developerProducts.slug,
                    name: developerProducts.name,
                    tagline: developerProducts.tagline,
                    iconUrl: developerProducts.iconUrl,
                    projectId: developerProducts.projectId,
                    developerId: developerProducts.developerId,
                    listingStatus: developerProducts.listingStatus,
                })
                .from(developerProducts)
                .where(eq(developerProducts.id, id))
                .limit(1);

            if (!row || normalizeListingStatus(row.listingStatus) !== 'live') {
                return c.json({ success: false, error: 'Product not found' }, 404);
            }

            return c.json({
                success: true,
                data: {
                    id: row.id,
                    slug: row.slug,
                    name: row.name,
                    tagline: row.tagline ?? '',
                    iconUrl: absoluteMediaUrl(row.iconUrl) ?? null,
                    projectId: row.projectId,
                    developerId: row.developerId,
                },
            });
        } catch (error) {
            console.error('[PublicProduct] getCardById error:', error);
            return c.json({ success: false, error: 'Failed to fetch product' }, 500);
        }
    }

    private async resolveLiveProduct(slug: string) {
        const [row] = await db
            .select({ id: developerProducts.id, slug: developerProducts.slug })
            .from(developerProducts)
            .where(and(eq(developerProducts.slug, slug), eq(developerProducts.listingStatus, 'live')))
            .limit(1);
        return row ?? null;
    }

    private getCurrentClientId(c: Context): number | null {
        const jwtUser = c.get('user') as { id?: number; role?: string } | undefined;
        if (!jwtUser || jwtUser.role !== 'client' || typeof jwtUser.id !== 'number') return null;
        return jwtUser.id;
    }

    async listReviews(c: Context) {
        const slug = (c.req.param('slug') || '').trim().toLowerCase();
        if (!slug) return c.json({ success: false, error: 'Invalid slug' }, 400);
        try {
            const product = await this.resolveLiveProduct(slug);
            if (!product) return c.json({ success: false, error: 'Product not found' }, 404);

            const currentClientId = this.getCurrentClientId(c);
            const rows = await db
                .select({
                    id: productReviews.id,
                    rating: productReviews.rating,
                    comment: productReviews.comment,
                    developerReply: productReviews.developerReply,
                    developerRepliedAt: productReviews.developerRepliedAt,
                    createdAt: productReviews.createdAt,
                    clientId: clients.id,
                    userName: clients.name,
                    companyName: clients.companyName,
                })
                .from(productReviews)
                .innerJoin(clients, eq(productReviews.clientId, clients.id))
                .where(eq(productReviews.productId, product.id))
                .orderBy(desc(productReviews.createdAt));

            const [{ avgRating, totalReviews }] = await db
                .select({
                    avgRating: avg(productReviews.rating),
                    totalReviews: count(productReviews.id),
                })
                .from(productReviews)
                .where(eq(productReviews.productId, product.id));

            const reviews = rows.map((r) => ({
                id: r.id,
                user: r.userName,
                role: r.companyName || 'Verified user',
                rating: r.rating,
                text: r.comment,
                createdAt: r.createdAt,
                isOwn: currentClientId != null && r.clientId === currentClientId,
                developerReply: r.developerReply,
                developerRepliedAt: r.developerRepliedAt,
            }));

            return c.json({
                success: true,
                data: {
                    rating: avgRating ? Number(avgRating) : 0,
                    reviewCount: totalReviews ?? 0,
                    reviews,
                },
            });
        } catch (error) {
            console.error('[PublicProduct] listReviews error:', error);
            return c.json({ success: false, error: 'Failed to fetch reviews' }, 500);
        }
    }

    async createReview(c: Context) {
        const jwtUser = c.get('user') as { id?: number; role?: string } | undefined;
        if (!jwtUser || jwtUser.role !== 'client' || typeof jwtUser.id !== 'number') {
            return c.json({ success: false, error: 'Login required' }, 401);
        }
        const slug = (c.req.param('slug') || '').trim().toLowerCase();
        if (!slug) return c.json({ success: false, error: 'Invalid slug' }, 400);
        const body = await c.req.json().catch(() => null);
        const rating = Number(body?.rating);
        const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return c.json({ success: false, error: 'Rating must be an integer between 1 and 5' }, 400);
        }
        if (comment.length < 5) {
            return c.json({ success: false, error: 'Review must be at least 5 characters' }, 400);
        }
        try {
            const product = await this.resolveLiveProduct(slug);
            if (!product) return c.json({ success: false, error: 'Product not found' }, 404);

            const [existing] = await db
                .select({ id: productReviews.id })
                .from(productReviews)
                .where(and(eq(productReviews.productId, product.id), eq(productReviews.clientId, jwtUser.id)))
                .limit(1);

            let reviewId: number;
            if (existing) {
                const [updated] = await db
                    .update(productReviews)
                    .set({ rating, comment, updatedAt: new Date() })
                    .where(eq(productReviews.id, existing.id))
                    .returning({ id: productReviews.id });
                reviewId = updated.id;
            } else {
                const [created] = await db
                    .insert(productReviews)
                    .values({
                        productId: product.id,
                        clientId: jwtUser.id,
                        rating,
                        comment,
                        updatedAt: new Date(),
                    })
                    .returning({ id: productReviews.id });
                reviewId = created.id;
            }

            return c.json({
                success: true,
                message: 'Review saved',
                data: { reviewId },
            });
        } catch (error) {
            console.error('[PublicProduct] createReview error:', error);
            return c.json({ success: false, error: 'Failed to save review' }, 500);
        }
    }

    async deleteReview(c: Context) {
        const jwtUser = c.get('user') as { id?: number; role?: string } | undefined;
        if (!jwtUser || jwtUser.role !== 'client' || typeof jwtUser.id !== 'number') {
            return c.json({ success: false, error: 'Login required' }, 401);
        }
        const slug = (c.req.param('slug') || '').trim().toLowerCase();
        const reviewId = Number(c.req.param('reviewId'));
        if (!slug || !Number.isInteger(reviewId) || reviewId < 1) {
            return c.json({ success: false, error: 'Invalid request' }, 400);
        }
        try {
            const product = await this.resolveLiveProduct(slug);
            if (!product) return c.json({ success: false, error: 'Product not found' }, 404);

            const [review] = await db
                .select({ id: productReviews.id, clientId: productReviews.clientId, productId: productReviews.productId })
                .from(productReviews)
                .where(eq(productReviews.id, reviewId))
                .limit(1);

            if (!review || review.productId !== product.id) {
                return c.json({ success: false, error: 'Review not found' }, 404);
            }
            if (review.clientId !== jwtUser.id) {
                return c.json({ success: false, error: 'You can only delete your own review' }, 403);
            }

            await db.delete(productReviews).where(eq(productReviews.id, reviewId));
            return c.json({ success: true, message: 'Review deleted' });
        } catch (error) {
            console.error('[PublicProduct] deleteReview error:', error);
            return c.json({ success: false, error: 'Failed to delete review' }, 500);
        }
    }

    async getBySlug(c: Context) {
        const slug = (c.req.param('slug') || '').trim().toLowerCase();
        if (!slug) return c.json({ success: false, error: 'Invalid slug' }, 400);

        try {
            const [row] = await db
                .select({
                    product: developerProducts,
                    developer: {
                        id: developers.id,
                        name: developers.name,
                        company: developers.company,
                        profilePicture: developers.profilePicture,
                        headline: developers.headline,
                        location: developers.location,
                        createdAt: developers.createdAt,
                        plan: developers.plan,
                        planEndDate: developers.planEndDate,
                        kycStatus: developers.kycStatus,
                    },
                    categoryName: productCategories.name,
                })
                .from(developerProducts)
                .innerJoin(developers, eq(developerProducts.developerId, developers.id))
                .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
                .where(
                    and(
                        eq(developerProducts.slug, slug),
                        eq(developerProducts.listingStatus, 'live')
                    )
                )
                .limit(1);

            if (!row) return c.json({ success: false, error: 'Product not found' }, 404);

            const p = row.product;
            const currentClientId = this.getCurrentClientId(c);
            const reviewRows = await db
                .select({
                    id: productReviews.id,
                    rating: productReviews.rating,
                    comment: productReviews.comment,
                    developerReply: productReviews.developerReply,
                    developerRepliedAt: productReviews.developerRepliedAt,
                    createdAt: productReviews.createdAt,
                    clientId: clients.id,
                    userName: clients.name,
                    companyName: clients.companyName,
                })
                .from(productReviews)
                .innerJoin(clients, eq(productReviews.clientId, clients.id))
                .where(eq(productReviews.productId, p.id))
                .orderBy(desc(productReviews.createdAt))
                .limit(25);

            const [{ avgRating, totalReviews }] = await db
                .select({
                    avgRating: avg(productReviews.rating),
                    totalReviews: count(productReviews.id),
                })
                .from(productReviews)
                .where(eq(productReviews.productId, p.id));
            const product = {
                id: p.id,
                projectId: p.projectId,
                slug: p.slug,
                name: p.name,
                productCategoryId: p.productCategoryId ?? null,
                productCategoryName: row.categoryName ?? '',
                tagline: p.tagline ?? '',
                shortDescription: p.shortDescription ?? '',
                problem: p.problem ?? '',
                solution: p.solution ?? '',
                featuresTagline: p.featuresTagline ?? '',
                featuresAboutBody: p.featuresAboutBody ?? '',
                benefits: parseJson(p.benefits, [] as unknown[]),
                features: parseJson(p.features, [] as unknown[]),
                useCases: parseJson(p.useCases, [] as string[]),
                audienceTags: parseJson(p.audienceTags, [] as string[]),
                customizationTiers: parseJson(p.customizationTiers, [] as unknown[]),
                trialDays: p.trialDays ?? 0,
                freeTrial: p.freeTrial ?? false,
                deploymentTime: p.deploymentTime ?? '',
                bestFor: p.bestFor ?? '',
                iconUrl: p.iconUrl || '',
                screenshotUrls: parseJson(p.screenshotUrls, [] as string[]),
                technical: {
                    stack: p.technicalStack ?? '',
                    deployment: p.technicalDeployment ?? '',
                    integrations: p.technicalIntegrations ?? '',
                    platforms: p.technicalPlatforms ?? '',
                    api: p.technicalApi ?? '',
                    security: p.technicalSecurity ?? '',
                    compliance: p.technicalCompliance ?? '',
                },
                demoUrl: p.demoUrl ?? '',
                demoUser: p.demoUser ?? '',
                demoPassword: p.demoPassword ?? '',
                demoVideoId: p.demoVideoId ?? '',
                supportDocs: p.supportDocs ?? '',
                supportEmail: p.supportEmail ?? '',
                supportChat: p.supportChat ?? '',
                supportResponse: p.supportResponse ?? '',
                legalPrivacy: p.legalPrivacy ?? '',
                legalTerms: p.legalTerms ?? '',
                legalRefund: p.legalRefund ?? '',
                marketplace: {
                    customization: p.marketplaceCustomization ?? true,
                    whiteLabel: p.marketplaceWhiteLabel ?? false,
                    deploymentSupport: p.marketplaceDeploymentSupport ?? false,
                    onboardingSupport: p.marketplaceOnboardingSupport ?? false,
                },
                meta: {
                    version: p.metaVersion ?? '',
                    releaseNotesUrl: p.metaReleaseNotesUrl ?? '',
                    setupTime: p.metaSetupTime ?? '',
                    difficulty: p.metaDifficulty ?? '',
                    requirements: p.metaRequirements ?? '',
                },
                trust: {
                    verifiedByPlatform: p.trustVerifiedByPlatform ?? false,
                },
                rating: avgRating ? Number(avgRating) : 0,
                reviewCount: totalReviews ?? 0,
                reviews: reviewRows.map((r) => ({
                    id: r.id,
                    user: r.userName,
                    role: r.companyName || 'Verified user',
                    rating: r.rating,
                    text: r.comment,
                    createdAt: r.createdAt,
                    isOwn: currentClientId != null && r.clientId === currentClientId,
                    developerReply: r.developerReply,
                    developerRepliedAt: r.developerRepliedAt,
                })),
                listingStatus: normalizeListingStatus(p.listingStatus),
                developer: (() => {
                    const { planEndDate, plan, ...rest } = row.developer;
                    return {
                        ...rest,
                        plan: effectiveDeveloperPlan(plan, planEndDate),
                    };
                })(),
            };

            return c.json({ success: true, data: { product } });
        } catch (error) {
            console.error('[PublicProduct] getBySlug error:', error);
            return c.json({ success: false, error: 'Failed to fetch product' }, 500);
        }
    }

    /** Package tiers + INR prices from the listing (for contract checkout UI). Live products only. */
    async getContractPricingById(c: Context) {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ success: false, error: 'Invalid product id' }, 400);
        }
        try {
            const [row] = await db
                .select({
                    id: developerProducts.id,
                    name: developerProducts.name,
                    slug: developerProducts.slug,
                    tagline: developerProducts.tagline,
                    iconUrl: developerProducts.iconUrl,
                    screenshotUrls: developerProducts.screenshotUrls,
                    customizationTiers: developerProducts.customizationTiers,
                    listingStatus: developerProducts.listingStatus,
                    trustVerifiedByPlatform: developerProducts.trustVerifiedByPlatform,
                    sellerName: developers.name,
                    sellerCompany: developers.company,
                    sellerAvatar: developers.profilePicture,
                })
                .from(developerProducts)
                .innerJoin(developers, eq(developerProducts.developerId, developers.id))
                .where(eq(developerProducts.id, id))
                .limit(1);

            if (!row || normalizeListingStatus(row.listingStatus) !== 'live') {
                return c.json({ success: false, error: 'Product not found' }, 404);
            }

            const rawShots = parseJson<unknown>(row.screenshotUrls, []);
            const shotList = Array.isArray(rawShots)
                ? rawShots.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
                : [];
            const firstShot = shotList[0];
            const coverImageUrl = firstShot ? absoluteMediaUrl(firstShot) : undefined;

            const tiers = parseJson(row.customizationTiers, [] as { id?: string; fixedPriceInr?: number | null }[]);
            const platformPct = env.CONTRACT_PLATFORM_COMMISSION_PERCENT;
            const tierBreakdowns: Record<string, ReturnType<typeof contractCheckoutBreakdown>> = {};
            for (const t of tiers) {
                const tid = String(t.id || '').toLowerCase();
                if (!tid) continue;
                if (t.fixedPriceInr != null && t.fixedPriceInr > 0) {
                    tierBreakdowns[tid] = contractCheckoutBreakdown(Math.round(t.fixedPriceInr * 100), platformPct);
                }
            }

            return c.json({
                success: true,
                data: {
                    productId: row.id,
                    name: row.name,
                    slug: row.slug,
                    listingSummary: {
                        name: row.name,
                        slug: row.slug,
                        tagline: row.tagline?.trim() || null,
                        iconUrl: absoluteMediaUrl(row.iconUrl) ?? null,
                        coverImageUrl: coverImageUrl ?? null,
                        trustVerifiedByPlatform: Boolean(row.trustVerifiedByPlatform),
                        seller: {
                            displayName: row.sellerName,
                            company: row.sellerCompany?.trim() || null,
                            avatarUrl: absoluteMediaUrl(row.sellerAvatar) ?? null,
                        },
                    },
                    customizationTiers: tiers,
                    feePolicy: {
                        nonRefundableFeeBps: CLIENT_NON_REFUNDABLE_FEE_BPS,
                        nonRefundableFeePercent: CLIENT_NON_REFUNDABLE_FEE_BPS / 100,
                    },
                    platformCommissionPercent: platformPct,
                    developerEscrowSplitPercent: 100 - platformPct,
                    tierBreakdowns,
                },
            });
        } catch (error) {
            console.error('[PublicProduct] getContractPricingById error:', error);
            return c.json({ success: false, error: 'Failed to fetch pricing' }, 500);
        }
    }
}

export const publicProductController = new PublicProductController();
