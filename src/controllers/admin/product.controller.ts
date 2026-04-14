import type { Context } from 'hono';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts, developers, productCategories } from '../../db/schema.js';
import { z } from 'zod';

function assertAdmin(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'admin') return null;
    return jwtUser;
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

function mapProductRow(row: typeof developerProducts.$inferSelect, categoryName = '') {
    return {
        id: row.id,
        developerId: row.developerId,
        projectId: row.projectId,
        slug: row.slug,
        name: row.name,
        productCategoryId: row.productCategoryId ?? null,
        productCategoryName: categoryName,
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

function escapeIlikePattern(q: string): string {
    return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const PatchTrustBodySchema = z.object({
    verifiedByPlatform: z.boolean(),
});

const ProductCategoryBodySchema = z.object({
    name: z.string().trim().min(2).max(80),
});

export class AdminProductController {
    async list(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10), 1), 100);
        const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);
        const searchRaw = (c.req.query('search') || '').trim();
        const pattern = searchRaw ? `%${escapeIlikePattern(searchRaw)}%` : null;

        try {
            const whereExpr =
                pattern &&
                or(
                    ilike(developerProducts.name, pattern),
                    ilike(developerProducts.slug, pattern),
                    ilike(developers.name, pattern),
                    ilike(developers.email, pattern),
                    ilike(developers.company, pattern)
                );

            const baseQuery = db
                .select({
                    id: developerProducts.id,
                    slug: developerProducts.slug,
                    name: developerProducts.name,
                    productCategoryId: developerProducts.productCategoryId,
                    productCategoryName: productCategories.name,
                    tagline: developerProducts.tagline,
                    listingStatus: developerProducts.listingStatus,
                    iconUrl: developerProducts.iconUrl,
                    updatedAt: developerProducts.updatedAt,
                    trustVerifiedByPlatform: developerProducts.trustVerifiedByPlatform,
                    trustVerifiedListing: developerProducts.trustVerifiedListing,
                    trustYourSaaSCertified: developerProducts.trustYourSaaSCertified,
                    developerId: developers.id,
                    developerName: developers.name,
                    developerEmail: developers.email,
                    developerCompany: developers.company,
                })
                .from(developerProducts)
                .innerJoin(developers, eq(developerProducts.developerId, developers.id))
                .leftJoin(productCategories, eq(developerProducts.productCategoryId, productCategories.id))
                .$dynamic();

            const rows = await baseQuery
                .where(whereExpr ? and(whereExpr) : undefined)
                .orderBy(desc(developerProducts.updatedAt))
                .limit(limit)
                .offset(offset);

            const countBase = db
                .select({ count: sql<number>`count(*)::int` })
                .from(developerProducts)
                .innerJoin(developers, eq(developerProducts.developerId, developers.id))
                .$dynamic();

            const [{ count: total }] = await (whereExpr
                ? countBase.where(and(whereExpr))
                : countBase);

            const products = rows.map((r) => ({
                id: r.id,
                slug: r.slug,
                name: r.name,
                productCategoryId: r.productCategoryId ?? null,
                productCategoryName: r.productCategoryName ?? '',
                tagline: r.tagline,
                listingStatus: normalizeListingStatus(r.listingStatus),
                iconUrl: r.iconUrl || '',
                updatedAt: r.updatedAt,
                trust: {
                    verifiedListing: r.trustVerifiedListing ?? false,
                    verifiedByPlatform: r.trustVerifiedByPlatform ?? false,
                    yoursaasCertified: r.trustYourSaaSCertified ?? false,
                },
                developer: {
                    id: r.developerId,
                    name: r.developerName,
                    email: r.developerEmail,
                    company: r.developerCompany,
                },
            }));

            return c.json({
                success: true,
                data: { products, pagination: { limit, offset, total } },
            });
        } catch (error) {
            console.error('[AdminProduct] list error:', error);
            return c.json({ success: false, error: 'Failed to fetch products' }, 500);
        }
    }

    async getOne(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const id = parseInt(idParam, 10);
        if (Number.isNaN(id) || id < 1) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        try {
            const [row] = await db
                .select()
                .from(developerProducts)
                .where(eq(developerProducts.id, id))
                .limit(1);

            if (!row) {
                return c.json({ success: false, error: 'Product not found' }, 404);
            }

            const [dev] = await db
                .select({
                    id: developers.id,
                    name: developers.name,
                    email: developers.email,
                    profilePicture: developers.profilePicture,
                    company: developers.company,
                    headline: developers.headline,
                    location: developers.location,
                    status: developers.status,
                    kycStatus: developers.kycStatus,
                    plan: developers.plan,
                    createdAt: developers.createdAt,
                })
                .from(developers)
                .where(eq(developers.id, row.developerId))
                .limit(1);

            let productCategoryName = '';
            if (row.productCategoryId != null) {
                const [cat] = await db
                    .select({ name: productCategories.name })
                    .from(productCategories)
                    .where(eq(productCategories.id, row.productCategoryId))
                    .limit(1);
                productCategoryName = cat?.name ?? '';
            }
            const product = mapProductRow(row, productCategoryName);

            return c.json({
                success: true,
                data: {
                    product: {
                        ...product,
                        demoPassword: product.demoPassword ? '••••••••' : '',
                    },
                    developer: dev ?? null,
                },
            });
        } catch (error) {
            console.error('[AdminProduct] getOne error:', error);
            return c.json({ success: false, error: 'Failed to fetch product' }, 500);
        }
    }

    async patchTrust(c: Context) {
        if (!assertAdmin(c)) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const id = parseInt(idParam, 10);
        if (Number.isNaN(id) || id < 1) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }

        const body = await c.req.json().catch(() => null);
        const parsed = PatchTrustBodySchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: 'Body must include verifiedByPlatform (boolean)' }, 400);
        }

        try {
            const [existing] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(eq(developerProducts.id, id))
                .limit(1);

            if (!existing) {
                return c.json({ success: false, error: 'Product not found' }, 404);
            }

            const [updated] = await db
                .update(developerProducts)
                .set({
                    trustVerifiedByPlatform: parsed.data.verifiedByPlatform,
                    updatedAt: new Date(),
                })
                .where(eq(developerProducts.id, id))
                .returning();

            if (!updated) {
                return c.json({ success: false, error: 'Update failed' }, 500);
            }

            return c.json({
                success: true,
                message: 'Trust settings updated',
                data: {
                    trust: {
                        verifiedListing: updated.trustVerifiedListing ?? false,
                        verifiedByPlatform: updated.trustVerifiedByPlatform ?? false,
                        yoursaasCertified: updated.trustYourSaaSCertified ?? false,
                    },
                },
            });
        } catch (error) {
            console.error('[AdminProduct] patchTrust error:', error);
            return c.json({ success: false, error: 'Failed to update trust' }, 500);
        }
    }

    async listCategories(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
        try {
            const rows = await db
                .select({
                    id: productCategories.id,
                    name: productCategories.name,
                    productCount: sql<number>`count(${developerProducts.id})::int`,
                })
                .from(productCategories)
                .leftJoin(developerProducts, eq(developerProducts.productCategoryId, productCategories.id))
                .groupBy(productCategories.id, productCategories.name)
                .orderBy(asc(productCategories.name));
            const [noneRow] = await db
                .select({ productCount: sql<number>`count(*)::int` })
                .from(developerProducts)
                .where(sql`${developerProducts.productCategoryId} IS NULL`);
            return c.json({
                success: true,
                data: {
                    categories: rows,
                    none: { id: null, name: 'None', productCount: noneRow?.productCount ?? 0 },
                },
            });
        } catch (error) {
            console.error('[AdminProduct] listCategories error:', error);
            return c.json({ success: false, error: 'Failed to fetch categories' }, 500);
        }
    }

    async createCategory(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const body = await c.req.json().catch(() => null);
        const parsed = ProductCategoryBodySchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: 'Category name must be 2-80 characters' }, 400);
        }
        const name = parsed.data.name;
        try {
            const [exists] = await db
                .select({ id: productCategories.id })
                .from(productCategories)
                .where(eq(productCategories.name, name))
                .limit(1);
            if (exists) return c.json({ success: false, error: 'Category already exists' }, 409);
            const [created] = await db
                .insert(productCategories)
                .values({ name, updatedAt: new Date() })
                .returning({ id: productCategories.id, name: productCategories.name });
            return c.json({ success: true, data: { category: created } }, 201);
        } catch (error) {
            console.error('[AdminProduct] createCategory error:', error);
            return c.json({ success: false, error: 'Failed to create category' }, 500);
        }
    }

    async deleteCategory(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
        const id = parseInt(c.req.param('categoryId'), 10);
        if (Number.isNaN(id) || id < 1) return c.json({ success: false, error: 'Invalid category ID' }, 400);
        try {
            const [category] = await db
                .select({ id: productCategories.id, name: productCategories.name })
                .from(productCategories)
                .where(eq(productCategories.id, id))
                .limit(1);
            if (!category) return c.json({ success: false, error: 'Category not found' }, 404);

            const [inUse] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(eq(developerProducts.productCategoryId, category.id))
                .limit(1);
            if (inUse) {
                return c.json(
                    { success: false, error: 'Category is currently used by one or more products' },
                    409
                );
            }

            await db.delete(productCategories).where(eq(productCategories.id, id));
            return c.json({ success: true, message: 'Category deleted' });
        } catch (error) {
            console.error('[AdminProduct] deleteCategory error:', error);
            return c.json({ success: false, error: 'Failed to delete category' }, 500);
        }
    }
}

export const adminProductController = new AdminProductController();
