import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Helper to save uploaded files (multer equivalent using Hono parseBody)
async function saveUploadedFile(file: File | string, destFolder: string): Promise<string | null> {
    if (!file || typeof file === 'string') return null; // Ignore if not a File
    try {
        const ext = file.name.includes('.') ? path.extname(file.name) : '.bin';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const dirPath = path.join(process.cwd(), 'public', destFolder);
        
        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const filePath = path.join(dirPath, filename);
        const arrayBuffer = await file.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
        
        return `/public/${destFolder}/${filename}`;
    } catch (err) {
        console.error("Error saving file:", err);
        return null;
    }
}

export class DeveloperKycController {
    async submit(c: Context) {
        try {
            const user = c.get('user');
            if (!user || user.role !== 'developer') {
                return c.json({ success: false, error: 'Unauthorized' }, 401);
            }

            const body = await c.req.parseBody().catch(() => null);
            if (!body) {
                return c.json({ success: false, error: 'Invalid payload' }, 400);
            }

            const {
                country,
                documentType,
                documentNumber,
                frontImage,
                backImage,
                livenessVideo
            } = body;

            if (!country || !documentType || !documentNumber || !frontImage || !livenessVideo) {
                return c.json({ success: false, error: 'Missing required KYC fields' }, 400);
            }

            // Save files to disk instead of Blob string
            const frontFileUrl = await saveUploadedFile(frontImage as File, 'uploads/kyc');
            const backFileUrl = backImage ? await saveUploadedFile(backImage as File, 'uploads/kyc') : null;
            const livenessVideoUrl = await saveUploadedFile(livenessVideo as File, 'uploads/kyc');

            if (!frontFileUrl || !livenessVideoUrl) {
                return c.json({ success: false, error: 'Failed to process file uploads' }, 500);
            }

            // Update user KYC details
            await db
                .update(developers)
                .set({
                    kycCountry: country as string,
                    governmentIdType: documentType as string,
                    governmentIdNumber: documentNumber as string,
                    governmentIdFrontImage: frontFileUrl,
                    governmentIdBackImage: backFileUrl,
                    livenessVideo: livenessVideoUrl,
                    kycStatus: 'submitted',  // status will be pending admin approval
                    kycSubmittedAt: new Date(),
                })
                .where(eq(developers.id, user.id));

            return c.json({ success: true, message: 'KYC submitted successfully (files stored via form-data)' }, 200);
        } catch (error) {
            console.error('[DeveloperKycController] submit error:', error);
            return c.json({ success: false, error: 'Failed to submit KYC' }, 500);
        }
    }
}

export const developerKycController = new DeveloperKycController();
