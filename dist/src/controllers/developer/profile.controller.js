import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
export class DeveloperProfileController {
    // Get profile
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
                kycStatus: developers.kycStatus
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
    // Update Profile
    async updateProfile(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        try {
            const formData = await c.req.formData();
            const updateData = {};
            if (formData.has('name'))
                updateData.name = formData.get('name');
            if (formData.has('phone'))
                updateData.phone = formData.get('phone');
            if (formData.has('bio'))
                updateData.bio = formData.get('bio');
            if (formData.has('skills'))
                updateData.skills = formData.get('skills'); // Expecting stringified JSON array
            if (formData.has('experience'))
                updateData.experience = parseInt(formData.get('experience'), 10);
            if (formData.has('portfolioUrl'))
                updateData.portfolioUrl = formData.get('portfolioUrl');
            if (formData.has('githubUrl'))
                updateData.githubUrl = formData.get('githubUrl');
            if (formData.has('linkedinUrl'))
                updateData.linkedinUrl = formData.get('linkedinUrl');
            if (formData.has('twitterUrl'))
                updateData.twitterUrl = formData.get('twitterUrl');
            if (formData.has('headline'))
                updateData.headline = formData.get('headline');
            if (formData.has('location'))
                updateData.location = formData.get('location');
            if (formData.has('company'))
                updateData.company = formData.get('company');
            if (formData.has('hourlyRate'))
                updateData.hourlyRate = parseInt(formData.get('hourlyRate'), 10);
            if (formData.has('servicesOffered'))
                updateData.servicesOffered = formData.get('servicesOffered');
            if (formData.has('pastExperiences'))
                updateData.pastExperiences = formData.get('pastExperiences');
            if (formData.has('portfolioProjects'))
                updateData.portfolioProjects = formData.get('portfolioProjects');
            if (formData.has('openToOpenSource'))
                updateData.openToOpenSource = formData.get('openToOpenSource') === 'true';
            if (formData.has('availableForHire'))
                updateData.availableForHire = formData.get('availableForHire') === 'true';
            // Handle file uploads
            const uploadDir = path.join(process.cwd(), 'uploads', 'developer_profiles');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const profilePicture = formData.get('profilePicture');
            if (profilePicture instanceof File && profilePicture.size > 0) {
                const ext = path.extname(profilePicture.name);
                const filename = `profile_${user.id}_${Date.now()}${ext}`;
                const filepath = path.join(uploadDir, filename);
                const buffer = await profilePicture.arrayBuffer();
                fs.writeFileSync(filepath, Buffer.from(buffer));
                updateData.profilePicture = `/uploads/developer_profiles/${filename}`;
            }
            const coverPicture = formData.get('coverPicture');
            if (coverPicture instanceof File && coverPicture.size > 0) {
                const ext = path.extname(coverPicture.name);
                const filename = `cover_${user.id}_${Date.now()}${ext}`;
                const filepath = path.join(uploadDir, filename);
                const buffer = await coverPicture.arrayBuffer();
                fs.writeFileSync(filepath, Buffer.from(buffer));
                updateData.coverPicture = `/uploads/developer_profiles/${filename}`;
            }
            const resume = formData.get('resume');
            if (resume instanceof File && resume.size > 0) {
                const ext = path.extname(resume.name);
                const filename = `resume_${user.id}_${Date.now()}${ext}`;
                const filepath = path.join(uploadDir, filename);
                const buffer = await resume.arrayBuffer();
                fs.writeFileSync(filepath, Buffer.from(buffer));
                updateData.resumeUrl = `/uploads/developer_profiles/${filename}`;
            }
            if (Object.keys(updateData).length === 0) {
                return c.json({ success: false, error: 'No data provided to update' }, 400);
            }
            const [updated] = await db
                .update(developers)
                .set(updateData)
                .where(eq(developers.id, user.id))
                .returning();
            const { password, ...safeDeveloper } = updated;
            return c.json({ success: true, message: 'Profile updated successfully', data: { developer: safeDeveloper } });
        }
        catch (error) {
            console.error('[DeveloperProfile] updateProfile error:', error);
            return c.json({ success: false, error: 'Failed to update profile' }, 500);
        }
    }
}
export const developerProfileController = new DeveloperProfileController();
