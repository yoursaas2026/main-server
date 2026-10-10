import type { Context } from 'hono';
import { z } from 'zod';
import {
    glassBreakerService,
    type GlassBreakerTargetType,
} from '../../services/glass-breaker.service.js';

function assertAdmin(c: Context) {
    const jwtUser = c.get('user') as { id: number; role: string } | undefined;
    if (!jwtUser || jwtUser.role !== 'admin') return null;
    return jwtUser;
}

const targetTypes = [
    'developer',
    'client',
    'product',
    'contract',
    'marketing_user',
    'marketing_campaign',
    'admin',
] as const;

const executeSchema = z.object({
    targetType: z.enum(targetTypes),
    targetId: z.number().int().positive(),
    action: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(10).max(5000),
    confirmPhrase: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
});

export class AdminGlassBreakerController {
    async listActions(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);
        return c.json({ success: true, data: { actions: glassBreakerService.listActions() } });
    }

    async listEvents(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const limit = parseInt(c.req.query('limit') || '50', 10);
        const offset = parseInt(c.req.query('offset') || '0', 10);
        const targetType = c.req.query('targetType') || undefined;
        const targetIdRaw = c.req.query('targetId');
        const targetId = targetIdRaw ? parseInt(targetIdRaw, 10) : undefined;

        try {
            const data = await glassBreakerService.listEvents({
                limit: Number.isFinite(limit) ? limit : 50,
                offset: Number.isFinite(offset) ? offset : 0,
                targetType,
                targetId: Number.isFinite(targetId as number) ? targetId : undefined,
            });
            return c.json({ success: true, data });
        } catch (error) {
            console.error('[GlassBreaker] listEvents error:', error);
            return c.json({ success: false, error: 'Failed to load events' }, 500);
        }
    }

    async searchTargets(c: Context) {
        if (!assertAdmin(c)) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const targetType = (c.req.query('targetType') || '').trim();
        const q = (c.req.query('q') || '').trim();
        const limit = parseInt(c.req.query('limit') || '12', 10);

        if (!(targetTypes as readonly string[]).includes(targetType)) {
            return c.json({ success: false, error: 'Invalid targetType' }, 400);
        }
        if (q.length < 1) {
            return c.json({ success: true, data: { results: [] } });
        }

        try {
            const results = await glassBreakerService.searchTargets(
                targetType as GlassBreakerTargetType,
                q,
                Number.isFinite(limit) ? limit : 12,
            );
            return c.json({ success: true, data: { results } });
        } catch (error) {
            console.error('[GlassBreaker] searchTargets error:', error);
            return c.json({ success: false, error: 'Failed to search targets' }, 500);
        }
    }

    async execute(c: Context) {
        const admin = assertAdmin(c);
        if (!admin) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const body = await c.req.json().catch(() => null);
        const parsed = executeSchema.safeParse(body);
        if (!parsed.success) {
            return c.json(
                { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
                400
            );
        }

        try {
            const result = await glassBreakerService.execute({
                adminId: admin.id,
                targetType: parsed.data.targetType as GlassBreakerTargetType,
                targetId: parsed.data.targetId,
                action: parsed.data.action,
                reason: parsed.data.reason,
                confirmPhrase: parsed.data.confirmPhrase,
                payload: parsed.data.payload,
            });
            return c.json({
                success: true,
                message: 'Glass breaker action executed',
                data: result,
            });
        } catch (error) {
            console.error('[GlassBreaker] execute error:', error);
            return c.json(
                { success: false, error: error instanceof Error ? error.message : 'Execute failed' },
                400
            );
        }
    }
}

export const adminGlassBreakerController = new AdminGlassBreakerController();
