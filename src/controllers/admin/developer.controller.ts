import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { effectiveDeveloperPlan } from '../../utils/developer-plan.js';

export class AdminDeveloperController {
    // ── Get All Developers ───────────────────────────────────────────────────
    async getAllDevelopers(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        try {
            const allDevelopers = await db
                .select({
                    id: developers.id,
                    name: developers.name,
                    email: developers.email,
                    profilePicture: developers.profilePicture,
                    status: developers.status,
                    kycStatus: developers.kycStatus,
                    kycSubmittedAt: developers.kycSubmittedAt,
                    createdAt: developers.createdAt,
                    plan: developers.plan,
                    planEndDate: developers.planEndDate,
                })
                .from(developers)
                .orderBy(desc(developers.createdAt));

            return c.json({
                success: true,
                data: {
                    developers: allDevelopers.map(({ planEndDate, ...d }) => ({
                        ...d,
                        plan: effectiveDeveloperPlan(d.plan, planEndDate),
                    })),
                },
            });
        } catch (error) {
            console.error('[AdminDeveloper] getAllDevelopers error:', error);
            return c.json({ success: false, error: 'Failed to fetch developers' }, 500);
        }
    }

    // ── Get Developer Details ─────────────────────────────────────────────────
    async getDeveloperDetails(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const devId = parseInt(idParam, 10);

        if (isNaN(devId)) {
            return c.json({ success: false, error: 'Invalid developer ID' }, 400);
        }

        try {
            const [developer] = await db
                .select()
                .from(developers)
                .where(eq(developers.id, devId))
                .limit(1);

            if (!developer) {
                return c.json({ success: false, error: 'Developer not found' }, 404);
            }

            // Exclude password from the returned object; surface effective plan after expiry.
            const { password, ...safeDeveloper } = developer;

            return c.json({
                success: true,
                data: {
                    developer: {
                        ...safeDeveloper,
                        plan: effectiveDeveloperPlan(safeDeveloper.plan, safeDeveloper.planEndDate),
                    },
                },
            });
        } catch (error) {
            console.error('[AdminDeveloper] getDeveloperDetails error:', error);
            return c.json({ success: false, error: 'Failed to fetch developer details' }, 500);
        }
    }

    // ── Update KYC Status ─────────────────────────────────────────────────────
    async updateKycStatus(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'admin') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const idParam = c.req.param('id');
        const devId = parseInt(idParam, 10);

        if (isNaN(devId)) {
            return c.json({ success: false, error: 'Invalid developer ID' }, 400);
        }

        const body = await c.req.json().catch(() => null);
        if (!body || !body.status || !['verified', 'rejected'].includes(body.status)) {
            return c.json({ success: false, error: 'Invalid status. Must be "verified" or "rejected".' }, 400);
        }

        try {
            const updateData: any = {
                kycStatus: body.status,
            };

            if (body.status === 'verified') {
                updateData.kycVerifiedAt = new Date();
                updateData.kycRejectedAt = null;
                updateData.kycRejectionReason = null;
            } else if (body.status === 'rejected') {
                updateData.kycRejectedAt = new Date();
                updateData.kycRejectionReason = body.reason || 'KYC Documents rejected by administrator.';
            }

            const [updated] = await db
                .update(developers)
                .set(updateData)
                .where(eq(developers.id, devId))
                .returning({ 
                    id: developers.id, 
                    kycStatus: developers.kycStatus,
                    kycVerifiedAt: developers.kycVerifiedAt,
                    kycRejectedAt: developers.kycRejectedAt,
                    kycRejectionReason: developers.kycRejectionReason
                });

            if (!updated) {
                return c.json({ success: false, error: 'Developer not found' }, 404);
            }

            // Note: You could trigger an email notification here alerting the developer about their KYC status.

            return c.json({ success: true, message: `KYC status updated to ${body.status}`, data: { kyc: updated } });
        } catch (error) {
            console.error('[AdminDeveloper] updateKycStatus error:', error);
            return c.json({ success: false, error: 'Failed to update KYC status' }, 500);
        }
    }

    async blockDeveloper(c: Context) {
        try {
            const devId = parseInt(c.req.param('id'), 10);
            if (isNaN(devId)) return c.json({ success: false, error: 'Invalid developer ID' }, 400);

            const body = await c.req.json();
            const { action, reason } = body;

            if (action === 'block' && (!reason || reason.trim().length === 0)) {
                return c.json({ success: false, error: 'A valid reason is required to block a developer.' }, 400);
            }

            const isBlocked = action === 'block';

            const [updated] = await db.update(developers)
                .set({
                    status: isBlocked ? 'blocked' : 'active',
                    blockReason: isBlocked ? reason : null
                })
                .where(eq(developers.id, devId))
                .returning({
                    id: developers.id,
                    status: developers.status,
                    blockReason: developers.blockReason
                });

            if (!updated) {
                return c.json({ success: false, error: 'Developer not found' }, 404);
            }

            // Note: you can optionally send an email hook out to the blocked developer here.
            
            return c.json({ 
                success: true, 
                message: isBlocked ? `Developer blocked successfully.` : `Developer unblocked successfully.`, 
                data: updated 
            });
        } catch (error) {
            console.error('[AdminDeveloper] blockDeveloper error:', error);
            return c.json({ success: false, error: 'Failed to update block status' }, 500);
        }
    }
}

export const adminDeveloperController = new AdminDeveloperController();
