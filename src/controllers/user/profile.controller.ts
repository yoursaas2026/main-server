import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { clients } from '../../db/schema.js';
import {
    buildClientOnboardingStatus,
    parseClientJsonIds,
    serializeJsonArray,
} from '../../utils/client-onboarding.js';
import { getRecommendationsForClient } from '../../services/client-recommendations.js';
import { parseInterestProfile } from '../../services/discovery/interest-profile.js';
import { refreshClientInterestProfile } from '../../services/discovery/rebuild-profile.js';
import { isDiscoveryEventType, trackDiscoveryEvent } from '../../services/discovery/events.js';

const UpdateClientProfileSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    accountType: z.enum(['business', 'individual']).optional(),
    buyerRole: z.string().trim().max(80).nullable().optional(),
    companyName: z.string().trim().max(200).nullable().optional(),
    companyWebsite: z.string().trim().max(300).nullable().optional(),
    industry: z.string().trim().max(100).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    country: z.string().trim().max(100).nullable().optional(),
    taxId: z.string().trim().max(50).nullable().optional(),
    billingAddress: z.string().trim().max(1000).nullable().optional(),
    companySize: z.enum(['startup', 'smb', 'midmarket', 'enterprise']).nullable().optional(),
    primaryGoals: z.array(z.string().trim().max(80)).max(10).optional(),
    interestedCategoryIds: z.array(z.number().int().positive()).max(20).optional(),
    budgetBand: z.enum(['lt_50k', '50k_2l', '2l_10l', 'gt_10l']).nullable().optional(),
    timeline: z.enum(['exploring', '1_3_months', 'asap']).nullable().optional(),
    technicalComfort: z.enum(['non_technical', 'some_technical', 'engineering_team']).nullable().optional(),
    problemStatement: z.string().trim().max(2000).nullable().optional(),
    preferredStacks: z.array(z.string().trim().max(80)).max(30).optional(),
    painPoints: z.array(z.string().trim().max(80)).max(3).optional(),
    preferredIntegrations: z.array(z.string().trim().max(80)).max(20).optional(),
    currentTools: z.array(z.string().trim().max(80)).max(30).optional(),
    completeOnboarding: z.boolean().optional(),
});

const TrackSchema = z.object({
    productId: z.number().int().positive(),
    eventType: z.string(),
    surface: z.string().trim().max(40).optional(),
    queryId: z.string().trim().max(64).optional(),
    sessionId: z.string().trim().max(64).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
});

function pickClientProfile(client: typeof clients.$inferSelect) {
    const interest = parseInterestProfile(client.interestProfile);
    return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        profilePicture: client.profilePicture,
        companyName: client.companyName,
        companyWebsite: client.companyWebsite,
        industry: client.industry,
        address: client.address,
        city: client.city,
        country: client.country,
        taxId: client.taxId,
        billingAddress: client.billingAddress,
        accountType: client.accountType,
        buyerRole: client.buyerRole,
        companySize: client.companySize,
        primaryGoals: JSON.parse(client.primaryGoals || '[]') as string[],
        interestedCategoryIds: parseClientJsonIds(client.interestedCategoryIds),
        budgetBand: client.budgetBand,
        timeline: client.timeline,
        technicalComfort: client.technicalComfort,
        problemStatement: client.problemStatement,
        preferredStacks: JSON.parse(client.preferredStacks || '[]') as string[],
        painPoints: JSON.parse(client.painPoints || '[]') as string[],
        preferredIntegrations: JSON.parse(client.preferredIntegrations || '[]') as string[],
        currentTools: JSON.parse(client.currentTools || '[]') as string[],
        savedProductIds: parseClientJsonIds(client.savedProductIds),
        interestProfile: {
            version: interest.version,
            tagCount: Object.keys(interest.base).length + Object.keys(interest.learned).length,
            updatedAt: interest.updatedAt,
        },
        isEmailVerified: client.isEmailVerified,
        authProvider: client.authProvider,
        onboardingCompletedAt: client.onboardingCompletedAt?.toISOString() ?? null,
    };
}

const DISCOVERY_FIELDS = new Set([
    'industry',
    'companySize',
    'budgetBand',
    'technicalComfort',
    'primaryGoals',
    'interestedCategoryIds',
    'painPoints',
    'preferredIntegrations',
    'preferredStacks',
]);

export class UserProfileController {
    async getProfile(c: Context) {
        const user = c.get('user') as { id: number; role: string } | undefined;
        if (!user || user.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        try {
            const [client] = await db
                .select()
                .from(clients)
                .where(eq(clients.id, user.id))
                .limit(1);

            if (!client) return c.json({ success: false, error: 'Client not found' }, 404);

            return c.json({
                success: true,
                data: {
                    profile: pickClientProfile(client),
                    onboarding: buildClientOnboardingStatus(client),
                },
            });
        } catch (error) {
            console.error('[UserProfile] getProfile error:', error);
            return c.json({ success: false, error: 'Failed to fetch profile' }, 500);
        }
    }

    async updateProfile(c: Context) {
        const user = c.get('user') as { id: number; role: string } | undefined;
        if (!user || user.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json().catch(() => null);
        const parsed = UpdateClientProfileSchema.safeParse(body);
        if (!parsed.success) {
            return c.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, 400);
        }

        const data = parsed.data;
        const update: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
        let touchDiscovery = false;

        if (data.name !== undefined) update.name = data.name;
        if (data.phone !== undefined) update.phone = data.phone;
        if (data.accountType !== undefined) update.accountType = data.accountType;
        if (data.buyerRole !== undefined) update.buyerRole = data.buyerRole;
        if (data.companyName !== undefined) update.companyName = data.companyName;
        if (data.companyWebsite !== undefined) update.companyWebsite = data.companyWebsite;
        if (data.industry !== undefined) {
            update.industry = data.industry;
            touchDiscovery = true;
        }
        if (data.address !== undefined) update.address = data.address;
        if (data.city !== undefined) update.city = data.city;
        if (data.country !== undefined) update.country = data.country;
        if (data.taxId !== undefined) update.taxId = data.taxId;
        if (data.billingAddress !== undefined) update.billingAddress = data.billingAddress;
        if (data.companySize !== undefined) {
            update.companySize = data.companySize;
            touchDiscovery = true;
        }
        if (data.primaryGoals !== undefined) {
            update.primaryGoals = serializeJsonArray(data.primaryGoals);
            touchDiscovery = true;
        }
        if (data.interestedCategoryIds !== undefined) {
            update.interestedCategoryIds = serializeJsonArray(data.interestedCategoryIds);
            touchDiscovery = true;
        }
        if (data.budgetBand !== undefined) {
            update.budgetBand = data.budgetBand;
            touchDiscovery = true;
        }
        if (data.timeline !== undefined) update.timeline = data.timeline;
        if (data.technicalComfort !== undefined) {
            update.technicalComfort = data.technicalComfort;
            touchDiscovery = true;
        }
        if (data.problemStatement !== undefined) update.problemStatement = data.problemStatement;
        if (data.preferredStacks !== undefined) {
            update.preferredStacks = serializeJsonArray(data.preferredStacks);
            touchDiscovery = true;
        }
        if (data.painPoints !== undefined) {
            update.painPoints = serializeJsonArray(data.painPoints);
            touchDiscovery = true;
        }
        if (data.preferredIntegrations !== undefined) {
            update.preferredIntegrations = serializeJsonArray(data.preferredIntegrations);
            touchDiscovery = true;
        }
        if (data.currentTools !== undefined) {
            update.currentTools = serializeJsonArray(data.currentTools);
        }

        // Mark discovery if any discovery-related key was in the body
        for (const key of Object.keys(data)) {
            if (DISCOVERY_FIELDS.has(key)) touchDiscovery = true;
        }

        try {
            const [updated] = await db
                .update(clients)
                .set(update)
                .where(eq(clients.id, user.id))
                .returning();

            if (!updated) return c.json({ success: false, error: 'Client not found' }, 404);

            if (touchDiscovery) {
                await refreshClientInterestProfile(user.id);
            }

            let finalClient = updated;
            if (data.completeOnboarding) {
                const onboarding = buildClientOnboardingStatus(updated);
                if (onboarding.intentComplete) {
                    const [withOnboarding] = await db
                        .update(clients)
                        .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
                        .where(eq(clients.id, user.id))
                        .returning();
                    if (withOnboarding) finalClient = withOnboarding;
                }
            }

            // Re-read after interest profile refresh
            if (touchDiscovery) {
                const [fresh] = await db.select().from(clients).where(eq(clients.id, user.id)).limit(1);
                if (fresh) finalClient = fresh;
            }

            return c.json({
                success: true,
                data: {
                    profile: pickClientProfile(finalClient),
                    onboarding: buildClientOnboardingStatus(finalClient),
                },
            });
        } catch (error) {
            console.error('[UserProfile] updateProfile error:', error);
            return c.json({ success: false, error: 'Failed to update profile' }, 500);
        }
    }

    async getRecommendations(c: Context) {
        const user = c.get('user') as { id: number; role: string } | undefined;
        if (!user || user.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '12', 10), 1), 48);
        const surface = (c.req.query('surface') || 'dashboard').slice(0, 40);

        try {
            const products = await getRecommendationsForClient(user.id, limit);
            return c.json({
                success: true,
                data: {
                    surface,
                    products: products.map((p) => ({
                        ...p,
                        matchPercent: p.matchPercent ?? (p.matchScore && p.matchScore > 0 ? Math.min(99, p.matchScore) : 0),
                    })),
                },
            });
        } catch (error) {
            console.error('[UserProfile] getRecommendations error:', error);
            return c.json({ success: false, error: 'Failed to fetch recommendations' }, 500);
        }
    }

    async toggleSavedProduct(c: Context) {
        const user = c.get('user') as { id: number; role: string } | undefined;
        if (!user || user.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json().catch(() => null);
        const productId = Number(body?.productId);
        const saved = body?.saved === true;
        if (!Number.isInteger(productId) || productId < 1) {
            return c.json({ success: false, error: 'Invalid productId' }, 400);
        }

        try {
            const [client] = await db
                .select({ savedProductIds: clients.savedProductIds })
                .from(clients)
                .where(eq(clients.id, user.id))
                .limit(1);
            if (!client) return c.json({ success: false, error: 'Client not found' }, 404);

            const current = new Set(parseClientJsonIds(client.savedProductIds));
            if (saved) current.add(productId);
            else current.delete(productId);

            await db
                .update(clients)
                .set({
                    savedProductIds: serializeJsonArray([...current]),
                    updatedAt: new Date(),
                })
                .where(eq(clients.id, user.id));

            // Learning signal
            await trackDiscoveryEvent({
                clientId: user.id,
                productId,
                eventType: saved ? 'save' : 'unsave',
                surface: 'save',
            });

            return c.json({
                success: true,
                data: { savedProductIds: [...current], saved },
            });
        } catch (error) {
            console.error('[UserProfile] toggleSavedProduct error:', error);
            return c.json({ success: false, error: 'Failed to update saved products' }, 500);
        }
    }

    async trackListingEvent(c: Context) {
        const user = c.get('user') as { id: number; role: string } | undefined;
        if (!user || user.role !== 'client') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json().catch(() => null);
        const parsed = TrackSchema.safeParse(body);
        if (!parsed.success || !isDiscoveryEventType(parsed.data.eventType)) {
            return c.json({ success: false, error: 'Invalid payload' }, 400);
        }

        try {
            const result = await trackDiscoveryEvent({
                clientId: user.id,
                productId: parsed.data.productId,
                eventType: parsed.data.eventType,
                surface: parsed.data.surface,
                queryId: parsed.data.queryId,
                sessionId: parsed.data.sessionId,
                meta: parsed.data.meta,
            });
            return c.json({ success: true, data: result });
        } catch (error) {
            console.error('[UserProfile] trackListingEvent error:', error);
            return c.json({ success: false, error: 'Failed to track event' }, 500);
        }
    }
}

export const userProfileController = new UserProfileController();
