import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { developerProducts, developers } from '../../db/schema.js';
import { absoluteMediaUrl } from '../../services/stream-chat.service.js';
import {
    parsePortfolioProjects,
    parseServicesOffered,
    parseSkills,
    parseWorkExperiences,
    toPublicExperiences,
    toPublicPortfolioProjects,
} from '../../utils/developer-profile-parse.js';

export class PublicDeveloperController {
    async getById(c: Context) {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ success: false, error: 'Invalid developer id' }, 400);
        }

        try {
            const [dev] = await db
                .select({
                    id: developers.id,
                    name: developers.name,
                    profilePicture: developers.profilePicture,
                    coverPicture: developers.coverPicture,
                    bio: developers.bio,
                    skills: developers.skills,
                    experience: developers.experience,
                    portfolioUrl: developers.portfolioUrl,
                    githubUrl: developers.githubUrl,
                    linkedinUrl: developers.linkedinUrl,
                    twitterUrl: developers.twitterUrl,
                    headline: developers.headline,
                    location: developers.location,
                    company: developers.company,
                    hourlyRate: developers.hourlyRate,
                    servicesOffered: developers.servicesOffered,
                    pastExperiences: developers.pastExperiences,
                    portfolioProjects: developers.portfolioProjects,
                    openToOpenSource: developers.openToOpenSource,
                    availableForHire: developers.availableForHire,
                    plan: developers.plan,
                    kycStatus: developers.kycStatus,
                    status: developers.status,
                })
                .from(developers)
                .where(eq(developers.id, id))
                .limit(1);

            if (!dev || dev.status !== 'active') {
                return c.json({ success: false, error: 'Developer not found' }, 404);
            }

            const listings = await db
                .select({
                    name: developerProducts.name,
                    slug: developerProducts.slug,
                    tagline: developerProducts.tagline,
                    listingStatus: developerProducts.listingStatus,
                })
                .from(developerProducts)
                .where(eq(developerProducts.developerId, id));

            return c.json({
                success: true,
                data: {
                    developer: {
                        id: dev.id,
                        name: dev.name,
                        headline: dev.headline,
                        company: dev.company,
                        location: dev.location,
                        bio: dev.bio ?? '',
                        profilePicture: absoluteMediaUrl(dev.profilePicture),
                        coverPicture: absoluteMediaUrl(dev.coverPicture),
                        plan: dev.plan ?? 'base',
                        kycStatus: dev.kycStatus ?? 'pending',
                        experienceYears: dev.experience,
                        hourlyRate: dev.hourlyRate,
                        skills: parseSkills(dev.skills),
                        servicesOffered: parseServicesOffered(dev.servicesOffered),
                        portfolioUrl: dev.portfolioUrl,
                        githubUrl: dev.githubUrl,
                        linkedinUrl: dev.linkedinUrl,
                        twitterUrl: dev.twitterUrl,
                        openToOpenSource: !!dev.openToOpenSource,
                        availableForHire: !!dev.availableForHire,
                        pastExperiences: toPublicExperiences(parseWorkExperiences(dev.pastExperiences)),
                        portfolioProjects: toPublicPortfolioProjects(parsePortfolioProjects(dev.portfolioProjects)),
                        liveListings: listings.map((row) => ({
                            name: row.name,
                            slug: row.slug,
                            tagline: row.tagline ?? '',
                            status: (row.listingStatus || 'draft').toLowerCase() === 'live' ? 'live' : 'draft',
                        })),
                    },
                },
            });
        } catch (error) {
            console.error('[PublicDeveloper] getById error:', error);
            return c.json({ success: false, error: 'Failed to fetch developer' }, 500);
        }
    }
}

export const publicDeveloperController = new PublicDeveloperController();
