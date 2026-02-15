import type { Context, Next } from 'hono';
import { verifyToken } from '../utils/jwt.js';

export const authMiddleware = async (c: Context, next: Next) => {
    try {
        const authHeader = c.req.header('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return c.json({ error: 'No token provided' }, 401);
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        try {
            const decoded = verifyToken(token);
            c.set('user', decoded);
            await next();
        } catch (error) {
            return c.json({ error: 'Invalid or expired token' }, 401);
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return c.json({ error: 'Authentication failed' }, 500);
    }
};

export const optionalAuthMiddleware = async (c: Context, next: Next) => {
    try {
        const authHeader = c.req.header('Authorization');

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);

            try {
                const decoded = verifyToken(token);
                c.set('user', decoded);
            } catch (error) {
                // Token is invalid but we don't fail the request
                console.log('Invalid token in optional auth');
            }
        }

        await next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        await next();
    }
};
