import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const UPLOAD_PREFIX = '/uploads/developer_profiles/';

export const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const COVER_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isDeveloperProfileMediaUrl(ref: string | null | undefined): boolean {
    if (!ref?.trim()) return false;
    const u = ref.trim();
    return u.startsWith(UPLOAD_PREFIX) || u.startsWith(`public${UPLOAD_PREFIX}`);
}

export function developerProfileMediaToAbsolutePath(ref: string): string | null {
    const u = ref.trim();
    if (!isDeveloperProfileMediaUrl(u)) return null;
    const rel = u.replace(/^\/+/, '').replace(/^public\//, '');
    const abs = path.resolve(process.cwd(), rel);
    const uploadRoot = path.resolve(process.cwd(), 'uploads', 'developer_profiles');
    const norm = path.normalize(abs);
    if (norm !== uploadRoot && !norm.startsWith(uploadRoot + path.sep)) return null;
    return norm;
}

export function deleteDeveloperProfileMedia(ref: string | null | undefined): void {
    if (!ref || !isDeveloperProfileMediaUrl(ref)) return;
    const abs = developerProfileMediaToAbsolutePath(ref);
    if (!abs) return;
    try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (e) {
        console.error('[DeveloperProfileMedia] unlink failed:', abs, e);
    }
}

function validateImageFile(file: File, maxBytes: number): string | null {
    if (!(file instanceof File) || file.size <= 0) return 'Invalid image file';
    if (!ALLOWED_MIME.has(file.type)) {
        return 'Image must be JPEG, PNG, WebP, or GIF';
    }
    if (file.size > maxBytes) {
        return `Image is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)`;
    }
    return null;
}

async function compressImageBuffer(buffer: Buffer, kind: 'profile' | 'cover'): Promise<Buffer> {
    try {
        const pipeline = sharp(buffer).rotate();
        if (kind === 'profile') {
            return Buffer.from(
                await pipeline.resize(512, 512, { fit: 'cover', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
            );
        }
        return Buffer.from(
            await pipeline
                .resize(1920, 480, { fit: 'cover', withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer(),
        );
    } catch {
        return buffer;
    }
}

export async function saveDeveloperProfileImage(
    file: File,
    kind: 'profile' | 'cover',
    developerId: number,
): Promise<{ url: string } | { error: string }> {
    const maxBytes = kind === 'profile' ? PROFILE_IMAGE_MAX_BYTES : COVER_IMAGE_MAX_BYTES;
    const validationError = validateImageFile(file, maxBytes);
    if (validationError) return { error: validationError };

    const uploadDir = path.join(process.cwd(), 'uploads', 'developer_profiles');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const prefix = kind === 'profile' ? 'profile' : 'cover';
    const filename = `${prefix}_${developerId}_${Date.now()}.jpg`;
    const filepath = path.join(uploadDir, filename);

    const buffer = await compressImageBuffer(Buffer.from(await file.arrayBuffer()), kind);
    fs.writeFileSync(filepath, buffer);

    return { url: `${UPLOAD_PREFIX}${filename}` };
}
