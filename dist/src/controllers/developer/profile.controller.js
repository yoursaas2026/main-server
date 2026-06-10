import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { parseExperienceYears, parseServicesOffered, serializeServicesOffered, } from '../../utils/developer-profile-parse.js';
import { deleteDeveloperProfileMedia, saveDeveloperProfileImage, } from '../../utils/developer-profile-media.js';
const RESUME_MAX_BYTES = 10 * 1024 * 1024;
function field(body, key) {
    const v = body[key];
    return typeof v === 'string' ? v : undefined;
}
function fileField(body, key) {
    const v = body[key];
    return v instanceof File && v.size > 0 ? v : undefined;
}
export class DeveloperProfileController {
    async getProfile(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        try {
            const [developer] = await db
                .select({
                id: developers.id,
                name: developers.name,
                email: developers.email,
                phone: developers.phone,
                profilePicture: developers.profilePicture,
                coverPicture: developers.coverPicture,
                bio: developers.bio,
                skills: developers.skills,
                experience: developers.experience,
                portfolioUrl: developers.portfolioUrl,
                githubUrl: developers.githubUrl,
                linkedinUrl: developers.linkedinUrl,
                resumeUrl: developers.resumeUrl,
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
                status: developers.status,
                kycStatus: developers.kycStatus,
            })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            if (!developer)
                return c.json({ success: false, error: 'Developer not found' }, 404);
            return c.json({ success: true, data: { developer } });
        }
        catch (error) {
            console.error('[DeveloperProfile] getProfile error:', error);
            return c.json({ success: false, error: 'Failed to fetch profile' }, 500);
        }
    }
    async updateProfile(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        try {
            const contentType = c.req.header('content-type') || '';
            if (!contentType.includes('multipart/form-data')) {
                return c.json({ success: false, error: 'Profile update requires multipart/form-data' }, 400);
            }
            const body = (await c.req.parseBody({ all: true }));
            const [existing] = await db
                .select({
                profilePicture: developers.profilePicture,
                coverPicture: developers.coverPicture,
                resumeUrl: developers.resumeUrl,
            })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            if (!existing)
                return c.json({ success: false, error: 'Developer not found' }, 404);
            const updateData = {};
            if (body.name !== undefined)
                updateData.name = field(body, 'name') ?? '';
            if (body.phone !== undefined)
                updateData.phone = field(body, 'phone') ?? '';
            if (body.bio !== undefined)
                updateData.bio = field(body, 'bio') ?? '';
            if (body.skills !== undefined)
                updateData.skills = field(body, 'skills') ?? '[]';
            if (body.experience !== undefined) {
                const years = parseExperienceYears(field(body, 'experience') ?? '');
                if (years !== null)
                    updateData.experience = years;
            }
            if (body.portfolioUrl !== undefined)
                updateData.portfolioUrl = field(body, 'portfolioUrl') ?? '';
            if (body.githubUrl !== undefined)
                updateData.githubUrl = field(body, 'githubUrl') ?? '';
            if (body.linkedinUrl !== undefined)
                updateData.linkedinUrl = field(body, 'linkedinUrl') ?? '';
            if (body.twitterUrl !== undefined)
                updateData.twitterUrl = field(body, 'twitterUrl') ?? '';
            if (body.headline !== undefined)
                updateData.headline = field(body, 'headline') ?? '';
            if (body.location !== undefined)
                updateData.location = field(body, 'location') ?? '';
            if (body.company !== undefined)
                updateData.company = field(body, 'company') ?? '';
            if (body.hourlyRate !== undefined) {
                const raw = field(body, 'hourlyRate');
                if (raw !== undefined && raw !== '') {
                    const n = Number.parseInt(raw, 10);
                    if (!Number.isNaN(n) && n >= 0)
                        updateData.hourlyRate = n;
                }
            }
            if (body.servicesOffered !== undefined) {
                const raw = field(body, 'servicesOffered') ?? '';
                updateData.servicesOffered = serializeServicesOffered(parseServicesOffered(raw));
            }
            if (body.pastExperiences !== undefined)
                updateData.pastExperiences = field(body, 'pastExperiences') ?? '[]';
            if (body.portfolioProjects !== undefined)
                updateData.portfolioProjects = field(body, 'portfolioProjects') ?? '[]';
            if (body.openToOpenSource !== undefined) {
                updateData.openToOpenSource = field(body, 'openToOpenSource') === 'true';
            }
            if (body.availableForHire !== undefined) {
                updateData.availableForHire = field(body, 'availableForHire') !== 'false';
            }
            const profilePicture = fileField(body, 'profilePicture');
            if (profilePicture) {
                const saved = await saveDeveloperProfileImage(profilePicture, 'profile', user.id);
                if ('error' in saved)
                    return c.json({ success: false, error: saved.error }, 400);
                updateData.profilePicture = saved.url;
                deleteDeveloperProfileMedia(existing.profilePicture);
            }
            const coverPicture = fileField(body, 'coverPicture');
            if (coverPicture) {
                const saved = await saveDeveloperProfileImage(coverPicture, 'cover', user.id);
                if ('error' in saved)
                    return c.json({ success: false, error: saved.error }, 400);
                updateData.coverPicture = saved.url;
                deleteDeveloperProfileMedia(existing.coverPicture);
            }
            const resume = fileField(body, 'resume');
            if (resume) {
                if (resume.size > RESUME_MAX_BYTES) {
                    return c.json({ success: false, error: 'Resume is too large (max 10MB)' }, 400);
                }
                const uploadDir = path.join(process.cwd(), 'uploads', 'developer_profiles');
                if (!fs.existsSync(uploadDir))
                    fs.mkdirSync(uploadDir, { recursive: true });
                const ext = path.extname(resume.name) || '.pdf';
                const filename = `resume_${user.id}_${Date.now()}${ext}`;
                const filepath = path.join(uploadDir, filename);
                fs.writeFileSync(filepath, Buffer.from(await resume.arrayBuffer()));
                updateData.resumeUrl = `/uploads/developer_profiles/${filename}`;
                deleteDeveloperProfileMedia(existing.resumeUrl);
            }
            if (Object.keys(updateData).length === 0) {
                return c.json({ success: false, error: 'No data provided to update' }, 400);
            }
            updateData.updatedAt = new Date();
            const [updated] = await db
                .update(developers)
                .set(updateData)
                .where(eq(developers.id, user.id))
                .returning();
            const { password: _password, ...safeDeveloper } = updated;
            return c.json({
                success: true,
                message: 'Profile updated successfully',
                data: { developer: safeDeveloper },
            });
        }
        catch (error) {
            console.error('[DeveloperProfile] updateProfile error:', error);
            return c.json({ success: false, error: 'Failed to update profile' }, 500);
        }
    }
}
export const developerProfileController = new DeveloperProfileController();
