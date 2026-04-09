import fs from 'fs';
import path from 'path';
const PREFIXES = [
    '/uploads/products/icons/',
    '/uploads/products/screenshots/',
    '/public/uploads/products/icons/',
    '/public/uploads/products/screenshots/',
];
export function isProductOwnedMediaUrl(ref) {
    const u = ref.trim();
    return PREFIXES.some((p) => u.startsWith(p));
}
function resolvedPathStaysUnderProducts(absFile) {
    const productsUploads = path.resolve(process.cwd(), 'uploads', 'products');
    const legacyProducts = path.resolve(process.cwd(), 'public', 'uploads', 'products');
    const norm = path.normalize(absFile);
    const prefixOk = norm === productsUploads ||
        norm.startsWith(productsUploads + path.sep) ||
        norm === legacyProducts ||
        norm.startsWith(legacyProducts + path.sep);
    return prefixOk;
}
/** Map stored URL to absolute file path, or null if not our file or unsafe. */
export function productMediaUrlToAbsolutePath(ref) {
    const u = ref.trim();
    if (!isProductOwnedMediaUrl(u))
        return null;
    const rel = u.replace(/^\/+/, '');
    const abs = path.resolve(process.cwd(), rel);
    if (!resolvedPathStaysUnderProducts(abs))
        return null;
    return abs;
}
export function deleteProductMediaFile(url) {
    const abs = productMediaUrlToAbsolutePath(url);
    if (!abs)
        return;
    try {
        if (fs.existsSync(abs)) {
            fs.unlinkSync(abs);
        }
    }
    catch (e) {
        console.error('[ProductMedia] unlink failed:', abs, e);
    }
}
export function parseScreenshotUrlsColumn(raw) {
    if (!raw)
        return [];
    try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p.filter((x) => typeof x === 'string') : [];
    }
    catch {
        return [];
    }
}
/** After a successful save: remove on-disk files that were dropped or replaced. */
export function cleanupReplacedProductMedia(previous, next) {
    const prevIcon = (previous.iconUrl ?? '').trim();
    const nextIcon = (next.iconUrl ?? '').trim();
    if (prevIcon && prevIcon !== nextIcon) {
        deleteProductMediaFile(prevIcon);
    }
    const prevShots = parseScreenshotUrlsColumn(previous.screenshotUrls);
    const nextSet = new Set((next.screenshotUrls ?? []).map((s) => s.trim()).filter(Boolean));
    for (const u of prevShots) {
        const t = u.trim();
        if (t && !nextSet.has(t)) {
            deleteProductMediaFile(t);
        }
    }
}
/** Delete all app-owned media for a row (e.g. product removed). */
export function cleanupAllProductMediaForRow(row) {
    const icon = (row.iconUrl ?? '').trim();
    if (icon)
        deleteProductMediaFile(icon);
    for (const u of parseScreenshotUrlsColumn(row.screenshotUrls)) {
        const t = u.trim();
        if (t)
            deleteProductMediaFile(t);
    }
}
/** Remove files referenced by input (e.g. create failed after uploads landed on disk). */
export function cleanupAllProductMediaFromInput(input) {
    const icon = (input.iconUrl ?? '').trim();
    if (icon)
        deleteProductMediaFile(icon);
    for (const u of input.screenshotUrls ?? []) {
        const t = (u ?? '').trim();
        if (t)
            deleteProductMediaFile(t);
    }
}
