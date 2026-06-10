import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const LIMITS = {
    icons: { maxBytes: 3 * 1024 * 1024, width: 512, height: 512, quality: 85 },
    screenshots: { maxBytes: 6 * 1024 * 1024, width: 1280, height: 1280, quality: 80 },
};
function validateImage(file, maxBytes) {
    if (!(file instanceof File) || file.size <= 0)
        return 'Invalid image file';
    if (!ALLOWED_MIME.has(file.type))
        return 'Image must be JPEG, PNG, WebP, or GIF';
    if (file.size > maxBytes) {
        return `Image is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)`;
    }
    return null;
}
async function toJpegBuffer(file, kind) {
    const { width, height, quality } = LIMITS[kind];
    const input = Buffer.from(await file.arrayBuffer());
    try {
        return Buffer.from(await sharp(input)
            .rotate()
            .resize(width, height, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer());
    }
    catch {
        return input;
    }
}
export async function saveProductImageFile(file, kind, developerId) {
    const validationError = validateImage(file, LIMITS[kind].maxBytes);
    if (validationError)
        return { error: validationError };
    const uploadDir = path.join(process.cwd(), 'uploads', 'products', kind);
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
    const prefix = kind === 'icons' ? 'icon' : 'screenshot';
    const filename = `${prefix}_${developerId}_${Date.now()}_${Math.round(Math.random() * 1e9)}.jpg`;
    const filePath = path.join(uploadDir, filename);
    const buffer = await toJpegBuffer(file, kind);
    fs.writeFileSync(filePath, buffer);
    return { url: `/uploads/products/${kind}/${filename}` };
}
