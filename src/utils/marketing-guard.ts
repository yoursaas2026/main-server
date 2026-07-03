import type { Context } from 'hono';
import type { JWTPayload } from '../utils/jwt.js';

export function getJwtUser(c: Context): JWTPayload | null {
    return c.get('user') ?? null;
}

export function assertAdmin(c: Context): JWTPayload | null {
    const user = getJwtUser(c);
    if (!user || user.role !== 'admin') return null;
    return user;
}

export function assertMarketing(c: Context): JWTPayload | null {
    const user = getJwtUser(c);
    if (!user || user.role !== 'marketing') return null;
    return user;
}
