import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts } from '../../db/schema.js';
import fs from 'fs';
import path from 'path';
import { DeveloperProductUpsertSchema, ProductIdParamSchema, } from '../../types/developer-product.types.js';
import { getMissingForLiveListing } from '../../utils/listing-publish-readiness.js';
import { cleanupAllProductMediaForRow, cleanupAllProductMediaFromInput, cleanupReplacedProductMedia, } from '../../utils/product-media-cleanup.js';
function assertDeveloper(c) {
    const jwtUser = c.get('user');
    if (!jwtUser || jwtUser.role !== 'developer')
        return null;
    return jwtUser;
}
function serializeJson(value) {
    return JSON.stringify(value ?? null);
}
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function normalizeListingStatus(raw) {
    const s = (raw || '').toLowerCase();
    if (s === 'live')
        return 'live';
    return 'draft';
}
/**
 * Same pattern as developer profile images: `uploads/...` on disk, URL `/uploads/...`
 * (served by `app.use('/uploads/*', serveStatic({ root: './' }))` in index.ts).
 */
async function saveProductImageFile(file, kind, developerId) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'products', kind);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const ext = path.extname(file.name || '') || '.bin';
    const prefix = kind === 'icons' ? 'icon' : 'screenshot';
    const filename = `${prefix}_${developerId}_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return `/uploads/products/${kind}/${filename}`;
}
async function parseProductInput(c) {
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody({ all: true });
        const payloadRaw = typeof body.payload === 'string' ? body.payload : null;
        if (!payloadRaw)
            throw new Error('Missing payload for multipart request');
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
async function applyMediaFromMultipart(input, bodyMap, developerId) {
    if (!bodyMap)
        return input;
    let iconUrl = input.iconUrl || '';
    let screenshotUrls = Array.isArray(input.screenshotUrls)
        ? [...input.screenshotUrls].filter((u) => typeof u === 'string' && u.trim())
        : [];
    const iconCandidate = bodyMap.icon;
    if (iconCandidate instanceof File && iconCandidate.size > 0) {
        iconUrl = await saveProductImageFile(iconCandidate, 'icons', developerId);
    }
    const shotsCandidate = bodyMap.screenshots;
    const shotFiles = [];
    if (Array.isArray(shotsCandidate)) {
        for (const item of shotsCandidate) {
            if (item instanceof File && item.size > 0)
                shotFiles.push(item);
        }
    }
    else if (shotsCandidate instanceof File && shotsCandidate.size > 0) {
        shotFiles.push(shotsCandidate);
    }
    if (shotFiles.length > 0) {
        const newUrls = [];
        for (const f of shotFiles.slice(0, 20)) {
            newUrls.push(await saveProductImageFile(f, 'screenshots', developerId));
        }
        screenshotUrls = [...screenshotUrls, ...newUrls].slice(0, 20);
    }
    return {
        ...input,
        iconUrl,
        screenshotUrls,
    };
}
function toDbRecord(input, developerId) {
    return {
        developerId,
        projectId: input.projectId,
        slug: input.slug,
        name: input.name,
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
        trustVerifiedListing: input.trust.verifiedListing,
        trustVerifiedByPlatform: input.trust.verifiedByPlatform,
        listingStatus: input.listingStatus,
        updatedAt: new Date(),
    };
}
function toApiProduct(row) {
    return {
        id: row.id,
        developerId: row.developerId,
        projectId: row.projectId,
        slug: row.slug,
        name: row.name,
        tagline: row.tagline,
        shortDescription: row.shortDescription,
        problem: row.problem,
        solution: row.solution,
        featuresTagline: row.featuresTagline,
        featuresAboutBody: row.featuresAboutBody,
        benefits: parseJson(row.benefits, []),
        features: parseJson(row.features, []),
        useCases: parseJson(row.useCases, []),
        audienceTags: parseJson(row.audienceTags, []),
        trialDays: row.trialDays ?? 0,
        freeTrial: row.freeTrial ?? false,
        deploymentTime: row.deploymentTime,
        bestFor: row.bestFor,
        customizationTiers: parseJson(row.customizationTiers, []),
        iconUrl: row.iconUrl || '',
        screenshotUrls: parseJson(row.screenshotUrls, []),
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
        },
        listingStatus: normalizeListingStatus(row.listingStatus),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function withPublishReadiness(row) {
    const product = toApiProduct(row);
    const missing = getMissingForLiveListing(product);
    return {
        ...product,
        publishReadiness: {
            canPublishLive: missing.length === 0,
            missingForLive: missing,
        },
    };
}
export class DeveloperProductController {
    async create(c) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        let input;
        let bodyMap;
        try {
            const parsed = await parseProductInput(c);
            input = parsed.input;
            bodyMap = parsed.bodyMap;
            input = await applyMediaFromMultipart(input, bodyMap, jwtUser.id);
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Invalid payload' }, 400);
        }
        try {
            if (input.listingStatus === 'live') {
                const missing = getMissingForLiveListing(input);
                if (missing.length > 0) {
                    return c.json({
                        success: false,
                        error: 'Listing is incomplete and cannot go live yet',
                        details: missing,
                    }, 400);
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
            return c.json({
                success: true,
                message: 'Product created',
                data: { product: withPublishReadiness(created) },
            }, 201);
        }
        catch (error) {
            console.error('[DeveloperProduct] create error:', error);
            cleanupAllProductMediaFromInput(input);
            return c.json({ success: false, error: 'Failed to create product' }, 500);
        }
    }
    async listMine(c) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
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
                tagline: developerProducts.tagline,
                listingStatus: developerProducts.listingStatus,
                trialDays: developerProducts.trialDays,
                freeTrial: developerProducts.freeTrial,
                updatedAt: developerProducts.updatedAt,
                createdAt: developerProducts.createdAt,
            })
                .from(developerProducts)
                .where(projectId
                ? and(eq(developerProducts.developerId, jwtUser.id), eq(developerProducts.projectId, projectId))
                : eq(developerProducts.developerId, jwtUser.id))
                .orderBy(desc(developerProducts.updatedAt), desc(developerProducts.createdAt))
                .limit(limit)
                .offset(offset);
            const products = rows.map((r) => ({
                ...r,
                listingStatus: normalizeListingStatus(r.listingStatus),
            }));
            return c.json({
                success: true,
                data: { products, pagination: { limit, offset, count: products.length } },
            });
        }
        catch (error) {
            console.error('[DeveloperProduct] listMine error:', error);
            return c.json({ success: false, error: 'Failed to fetch products' }, 500);
        }
    }
    async getOne(c) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }
        try {
            const [row] = await db
                .select()
                .from(developerProducts)
                .where(and(eq(developerProducts.id, parsedId.data.id), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);
            if (!row)
                return c.json({ success: false, error: 'Product not found' }, 404);
            return c.json({
                success: true,
                data: { product: withPublishReadiness(row) },
            });
        }
        catch (error) {
            console.error('[DeveloperProduct] getOne error:', error);
            return c.json({ success: false, error: 'Failed to fetch product' }, 500);
        }
    }
    async update(c) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }
        let input;
        let bodyMap;
        try {
            const parsed = await parseProductInput(c);
            input = parsed.input;
            bodyMap = parsed.bodyMap;
            input = await applyMediaFromMultipart(input, bodyMap, jwtUser.id);
        }
        catch (e) {
            return c.json({ success: false, error: e instanceof Error ? e.message : 'Invalid payload' }, 400);
        }
        try {
            const [existing] = await db
                .select()
                .from(developerProducts)
                .where(and(eq(developerProducts.id, parsedId.data.id), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);
            if (!existing)
                return c.json({ success: false, error: 'Product not found' }, 404);
            const [slugConflict] = await db
                .select({ id: developerProducts.id })
                .from(developerProducts)
                .where(and(eq(developerProducts.slug, input.slug), ne(developerProducts.id, parsedId.data.id)))
                .limit(1);
            if (slugConflict) {
                return c.json({ success: false, error: 'Slug already in use' }, 409);
            }
            if (input.listingStatus === 'live') {
                const missing = getMissingForLiveListing(input);
                if (missing.length > 0) {
                    return c.json({
                        success: false,
                        error: 'Listing is incomplete and cannot go live yet',
                        details: missing,
                    }, 400);
                }
            }
            const [updated] = await db
                .update(developerProducts)
                .set(toDbRecord(input, jwtUser.id))
                .where(and(eq(developerProducts.id, parsedId.data.id), eq(developerProducts.developerId, jwtUser.id)))
                .returning();
            cleanupReplacedProductMedia({ iconUrl: existing.iconUrl, screenshotUrls: existing.screenshotUrls }, { iconUrl: input.iconUrl, screenshotUrls: input.screenshotUrls });
            return c.json({
                success: true,
                message: 'Product updated',
                data: { product: withPublishReadiness(updated) },
            });
        }
        catch (error) {
            console.error('[DeveloperProduct] update error:', error);
            return c.json({ success: false, error: 'Failed to update product' }, 500);
        }
    }
    async remove(c) {
        const jwtUser = assertDeveloper(c);
        if (!jwtUser)
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        const parsedId = ProductIdParamSchema.safeParse({ id: c.req.param('id') });
        if (!parsedId.success) {
            return c.json({ success: false, error: 'Invalid product ID' }, 400);
        }
        try {
            const [existing] = await db
                .select()
                .from(developerProducts)
                .where(and(eq(developerProducts.id, parsedId.data.id), eq(developerProducts.developerId, jwtUser.id)))
                .limit(1);
            if (!existing)
                return c.json({ success: false, error: 'Product not found' }, 404);
            await db
                .delete(developerProducts)
                .where(and(eq(developerProducts.id, parsedId.data.id), eq(developerProducts.developerId, jwtUser.id)));
            cleanupAllProductMediaForRow(existing);
            return c.json({ success: true, message: 'Product deleted' });
        }
        catch (error) {
            console.error('[DeveloperProduct] remove error:', error);
            return c.json({ success: false, error: 'Failed to delete product' }, 500);
        }
    }
}
export const developerProductController = new DeveloperProductController();
