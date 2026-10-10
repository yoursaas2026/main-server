import { and, count, desc, eq, ilike, ne, or, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    admins,
    clients,
    contracts,
    developerProducts,
    developers,
    glassBreakerEvents,
    marketingUsers,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { contractSettlementService } from './contract-settlement.service.js';
import { notificationService } from './notification.service.js';

export type GlassBreakerTargetHit = {
    id: number;
    label: string;
    subtitle: string;
    meta: string | null;
};

export const GLASS_BREAKER_CONFIRM_PHRASE = 'BREAK GLASS';

export type GlassBreakerTargetType =
    | 'developer'
    | 'client'
    | 'product'
    | 'contract'
    | 'marketing_user'
    | 'admin';

export type GlassBreakerActionCatalogItem = {
    targetType: GlassBreakerTargetType;
    action: string;
    label: string;
    description: string;
    payloadFields?: { key: string; type: 'string' | 'boolean' | 'number'; required?: boolean; options?: string[] }[];
};

export const GLASS_BREAKER_ACTIONS: GlassBreakerActionCatalogItem[] = [
    {
        targetType: 'developer',
        action: 'set_status',
        label: 'Set developer status',
        description: 'Set account status to active, inactive, or blocked.',
        payloadFields: [
            { key: 'status', type: 'string', required: true, options: ['active', 'inactive', 'blocked'] },
            { key: 'blockReason', type: 'string', required: false },
        ],
    },
    {
        targetType: 'developer',
        action: 'force_kyc_verified',
        label: 'Force KYC verified',
        description: 'Mark developer KYC as verified (onboarding unlock).',
    },
    {
        targetType: 'developer',
        action: 'force_kyc_rejected',
        label: 'Force KYC rejected',
        description: 'Mark developer KYC as rejected.',
        payloadFields: [{ key: 'reason', type: 'string', required: false }],
    },
    {
        targetType: 'developer',
        action: 'force_bank_verified',
        label: 'Force bank verified',
        description: 'Mark payout bank validation as completed/valid.',
    },
    {
        targetType: 'developer',
        action: 'force_email_verified',
        label: 'Force email verified',
        description: 'Mark developer email as verified and clear pending tokens.',
    },
    {
        targetType: 'developer',
        action: 'force_plan',
        label: 'Force plan',
        description: 'Set developer subscription plan (and optional end date ISO string).',
        payloadFields: [
            { key: 'plan', type: 'string', required: true, options: ['base', 'pro', 'ultimate'] },
            { key: 'billingCycle', type: 'string', required: false, options: ['monthly', 'yearly'] },
            { key: 'planEndDate', type: 'string', required: false },
        ],
    },
    {
        targetType: 'client',
        action: 'set_status',
        label: 'Set buyer status',
        description: 'Set buyer account status to active, inactive, or suspended.',
        payloadFields: [
            { key: 'status', type: 'string', required: true, options: ['active', 'inactive', 'suspended'] },
        ],
    },
    {
        targetType: 'client',
        action: 'force_email_verified',
        label: 'Force buyer email verified',
        description: 'Mark buyer email as verified and clear pending tokens.',
    },
    {
        targetType: 'product',
        action: 'set_listing_status',
        label: 'Set listing status',
        description: 'Force listing to draft or live.',
        payloadFields: [
            { key: 'listingStatus', type: 'string', required: true, options: ['draft', 'live'] },
        ],
    },
    {
        targetType: 'product',
        action: 'set_trust',
        label: 'Set trust badges',
        description: 'Set platform trust / certified flags on a listing.',
        payloadFields: [
            { key: 'verifiedByPlatform', type: 'boolean', required: false },
            { key: 'verifiedListing', type: 'boolean', required: false },
            { key: 'yoursaasCertified', type: 'boolean', required: false },
        ],
    },
    {
        targetType: 'product',
        action: 'force_unpublish',
        label: 'Force unpublish',
        description: 'Set listing to draft immediately.',
    },
    {
        targetType: 'contract',
        action: 'unfreeze_escrow',
        label: 'Unfreeze escrow',
        description: 'Clear escrowFrozen on a contract.',
    },
    {
        targetType: 'contract',
        action: 'set_settlement_status',
        label: 'Set settlement status',
        description: 'Manually mark settlement metadata status (does not move money).',
        payloadFields: [
            {
                key: 'settlementStatus',
                type: 'string',
                required: true,
                options: ['pending', 'executed', 'partial', 'failed', 'skipped'],
            },
            { key: 'notes', type: 'string', required: false },
        ],
    },
    {
        targetType: 'contract',
        action: 'retry_settlement',
        label: 'Retry Cashfree settlement',
        description: 'Retry automatic refunds/payouts for a completed contract.',
    },
    {
        targetType: 'marketing_user',
        action: 'set_status',
        label: 'Set marketing user status',
        description: 'Set marketing portal user to active or inactive.',
        payloadFields: [
            { key: 'status', type: 'string', required: true, options: ['active', 'inactive'] },
        ],
    },
    {
        targetType: 'admin',
        action: 'set_status',
        label: 'Set admin status',
        description: 'Activate or deactivate an admin (cannot deactivate self or last active admin).',
        payloadFields: [
            { key: 'status', type: 'string', required: true, options: ['active', 'inactive'] },
        ],
    },
];

function catalogKey(targetType: string, action: string) {
    return `${targetType}:${action}`;
}

const ACTION_SET = new Set(GLASS_BREAKER_ACTIONS.map((a) => catalogKey(a.targetType, a.action)));

export type GlassBreakerExecuteInput = {
    adminId: number;
    targetType: GlassBreakerTargetType;
    targetId: number;
    action: string;
    reason: string;
    confirmPhrase: string;
    payload?: Record<string, unknown>;
};

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return 'null';
    }
}

function pickDevSnapshot(row: typeof developers.$inferSelect) {
    return {
        id: row.id,
        email: row.email,
        status: row.status,
        kycStatus: row.kycStatus,
        isEmailVerified: row.isEmailVerified,
        plan: row.plan,
        planBillingCycle: row.planBillingCycle,
        planEndDate: row.planEndDate,
        payoutBankValidationStatus: row.payoutBankValidationStatus,
        payoutBankValidationAccountStatus: row.payoutBankValidationAccountStatus,
        blockReason: row.blockReason,
    };
}

function pickClientSnapshot(row: typeof clients.$inferSelect) {
    return {
        id: row.id,
        email: row.email,
        status: row.status,
        isEmailVerified: row.isEmailVerified,
    };
}

function pickProductSnapshot(row: typeof developerProducts.$inferSelect) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        listingStatus: row.listingStatus,
        trustVerifiedListing: row.trustVerifiedListing,
        trustVerifiedByPlatform: row.trustVerifiedByPlatform,
        trustYourSaaSCertified: row.trustYourSaaSCertified,
    };
}

function pickContractSnapshot(row: typeof contracts.$inferSelect) {
    return {
        id: row.id,
        publicId: row.publicId,
        status: row.status,
        escrowFrozen: row.escrowFrozen,
        settlementStatus: row.settlementStatus,
    };
}

class GlassBreakerService {
    listActions() {
        return GLASS_BREAKER_ACTIONS;
    }

    async listEvents(opts: { limit?: number; offset?: number; targetType?: string; targetId?: number }) {
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
        const offset = Math.max(opts.offset ?? 0, 0);

        const conditions = [];
        if (opts.targetType) conditions.push(eq(glassBreakerEvents.targetType, opts.targetType));
        if (typeof opts.targetId === 'number' && Number.isFinite(opts.targetId)) {
            conditions.push(eq(glassBreakerEvents.targetId, opts.targetId));
        }

        const where = conditions.length ? and(...conditions) : undefined;

        const [totalRow] = await db
            .select({ value: count() })
            .from(glassBreakerEvents)
            .where(where);

        const rows = await db
            .select({
                id: glassBreakerEvents.id,
                adminId: glassBreakerEvents.adminId,
                adminName: admins.name,
                adminEmail: admins.email,
                action: glassBreakerEvents.action,
                targetType: glassBreakerEvents.targetType,
                targetId: glassBreakerEvents.targetId,
                reason: glassBreakerEvents.reason,
                beforeJson: glassBreakerEvents.beforeJson,
                afterJson: glassBreakerEvents.afterJson,
                metaJson: glassBreakerEvents.metaJson,
                createdAt: glassBreakerEvents.createdAt,
            })
            .from(glassBreakerEvents)
            .leftJoin(admins, eq(glassBreakerEvents.adminId, admins.id))
            .where(where)
            .orderBy(desc(glassBreakerEvents.createdAt))
            .limit(limit)
            .offset(offset);

        return {
            events: rows,
            total: Number(totalRow?.value ?? 0),
            limit,
            offset,
        };
    }

    /**
     * Autocomplete search for glass-breaker targets by name / email / slug / publicId / etc.
     * Also matches numeric id when the query is digits-only.
     */
    async searchTargets(
        targetType: GlassBreakerTargetType,
        qRaw: string,
        limitRaw = 12,
    ): Promise<GlassBreakerTargetHit[]> {
        const q = qRaw.trim();
        if (q.length < 1) return [];

        const limit = Math.min(Math.max(limitRaw, 1), 25);
        const pattern = `%${q.replace(/[%_]/g, '')}%`;
        const idExact = /^\d+$/.test(q) ? Number.parseInt(q, 10) : null;

        switch (targetType) {
            case 'developer': {
                const filters: SQL[] = [
                    ilike(developers.name, pattern),
                    ilike(developers.email, pattern),
                    ilike(developers.company, pattern),
                    ilike(developers.phone, pattern),
                    ilike(developers.fullLegalName, pattern),
                    ilike(developers.headline, pattern),
                ];
                if (idExact != null) filters.push(eq(developers.id, idExact));
                const rows = await db
                    .select({
                        id: developers.id,
                        name: developers.name,
                        email: developers.email,
                        status: developers.status,
                        kycStatus: developers.kycStatus,
                        company: developers.company,
                        phone: developers.phone,
                    })
                    .from(developers)
                    .where(or(...filters))
                    .orderBy(desc(developers.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.name || r.email,
                    subtitle: [r.email, r.company].filter(Boolean).join(' · '),
                    meta: `status=${r.status || '—'} · kyc=${r.kycStatus || '—'}`,
                }));
            }
            case 'client': {
                const filters: SQL[] = [
                    ilike(clients.name, pattern),
                    ilike(clients.email, pattern),
                    ilike(clients.companyName, pattern),
                    ilike(clients.phone, pattern),
                ];
                if (idExact != null) filters.push(eq(clients.id, idExact));
                const rows = await db
                    .select({
                        id: clients.id,
                        name: clients.name,
                        email: clients.email,
                        status: clients.status,
                        companyName: clients.companyName,
                        phone: clients.phone,
                    })
                    .from(clients)
                    .where(or(...filters))
                    .orderBy(desc(clients.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.name || r.email,
                    subtitle: [r.email, r.companyName].filter(Boolean).join(' · '),
                    meta: `status=${r.status || '—'}`,
                }));
            }
            case 'product': {
                const filters: SQL[] = [
                    ilike(developerProducts.name, pattern),
                    ilike(developerProducts.slug, pattern),
                    ilike(developerProducts.projectId, pattern),
                    ilike(developers.name, pattern),
                    ilike(developers.email, pattern),
                ];
                if (idExact != null) filters.push(eq(developerProducts.id, idExact));
                const rows = await db
                    .select({
                        id: developerProducts.id,
                        name: developerProducts.name,
                        slug: developerProducts.slug,
                        projectId: developerProducts.projectId,
                        listingStatus: developerProducts.listingStatus,
                        developerName: developers.name,
                        developerEmail: developers.email,
                    })
                    .from(developerProducts)
                    .innerJoin(developers, eq(developerProducts.developerId, developers.id))
                    .where(or(...filters))
                    .orderBy(desc(developerProducts.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.name,
                    subtitle: `${r.slug} · seller ${r.developerName || r.developerEmail}`,
                    meta: `listing=${r.listingStatus || '—'}`,
                }));
            }
            case 'contract': {
                const filters: SQL[] = [
                    ilike(contracts.publicId, pattern),
                    ilike(contracts.status, pattern),
                    ilike(clients.name, pattern),
                    ilike(clients.email, pattern),
                    ilike(developers.name, pattern),
                    ilike(developers.email, pattern),
                    ilike(developerProducts.name, pattern),
                    ilike(developerProducts.slug, pattern),
                ];
                if (idExact != null) filters.push(eq(contracts.id, idExact));
                const rows = await db
                    .select({
                        id: contracts.id,
                        publicId: contracts.publicId,
                        status: contracts.status,
                        settlementStatus: contracts.settlementStatus,
                        clientName: clients.name,
                        clientEmail: clients.email,
                        developerName: developers.name,
                        developerEmail: developers.email,
                        productName: developerProducts.name,
                    })
                    .from(contracts)
                    .innerJoin(clients, eq(contracts.clientId, clients.id))
                    .innerJoin(developers, eq(contracts.developerId, developers.id))
                    .innerJoin(developerProducts, eq(contracts.productId, developerProducts.id))
                    .where(or(...filters))
                    .orderBy(desc(contracts.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.publicId,
                    subtitle: `${r.productName} · ${r.clientName || r.clientEmail} ↔ ${r.developerName || r.developerEmail}`,
                    meta: `status=${r.status}${r.settlementStatus ? ` · settlement=${r.settlementStatus}` : ''}`,
                }));
            }
            case 'marketing_user': {
                const filters: SQL[] = [
                    ilike(marketingUsers.name, pattern),
                    ilike(marketingUsers.email, pattern),
                    ilike(marketingUsers.mailboxEmail, pattern),
                ];
                if (idExact != null) filters.push(eq(marketingUsers.id, idExact));
                const rows = await db
                    .select({
                        id: marketingUsers.id,
                        name: marketingUsers.name,
                        email: marketingUsers.email,
                        mailboxEmail: marketingUsers.mailboxEmail,
                        status: marketingUsers.status,
                    })
                    .from(marketingUsers)
                    .where(or(...filters))
                    .orderBy(desc(marketingUsers.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.name || r.email,
                    subtitle: [r.email, r.mailboxEmail].filter(Boolean).join(' · '),
                    meta: `status=${r.status || '—'}`,
                }));
            }
            case 'admin': {
                const filters: SQL[] = [ilike(admins.name, pattern), ilike(admins.email, pattern)];
                if (idExact != null) filters.push(eq(admins.id, idExact));
                const rows = await db
                    .select({
                        id: admins.id,
                        name: admins.name,
                        email: admins.email,
                        status: admins.status,
                    })
                    .from(admins)
                    .where(or(...filters))
                    .orderBy(desc(admins.id))
                    .limit(limit);
                return rows.map((r) => ({
                    id: r.id,
                    label: r.name || r.email,
                    subtitle: r.email,
                    meta: `status=${r.status || '—'}`,
                }));
            }
            default:
                return [];
        }
    }

    async execute(input: GlassBreakerExecuteInput) {
        if (input.confirmPhrase !== GLASS_BREAKER_CONFIRM_PHRASE) {
            throw new Error(`Confirmation phrase must be exactly "${GLASS_BREAKER_CONFIRM_PHRASE}"`);
        }
        const reason = input.reason.trim();
        if (reason.length < 10) {
            throw new Error('Reason must be at least 10 characters');
        }
        if (!Number.isInteger(input.targetId) || input.targetId < 1) {
            throw new Error('Invalid targetId');
        }
        if (!ACTION_SET.has(catalogKey(input.targetType, input.action))) {
            throw new Error(`Unknown action ${input.targetType}:${input.action}`);
        }

        const payload = input.payload ?? {};
        let before: unknown = null;
        let after: unknown = null;
        let meta: Record<string, unknown> = { payload };

        switch (input.targetType) {
            case 'developer': {
                const result = await this.executeDeveloper(input.targetId, input.action, payload);
                before = result.before;
                after = result.after;
                meta = { ...meta, ...result.meta };
                break;
            }
            case 'client': {
                const result = await this.executeClient(input.targetId, input.action, payload);
                before = result.before;
                after = result.after;
                break;
            }
            case 'product': {
                const result = await this.executeProduct(input.targetId, input.action, payload);
                before = result.before;
                after = result.after;
                break;
            }
            case 'contract': {
                const result = await this.executeContract(input.targetId, input.action, payload, reason);
                before = result.before;
                after = result.after;
                meta = { ...meta, ...result.meta };
                break;
            }
            case 'marketing_user': {
                const result = await this.executeMarketingUser(input.targetId, input.action, payload);
                before = result.before;
                after = result.after;
                break;
            }
            case 'admin': {
                const result = await this.executeAdmin(input.adminId, input.targetId, input.action, payload);
                before = result.before;
                after = result.after;
                break;
            }
            default:
                throw new Error('Unsupported targetType');
        }

        const [event] = await db
            .insert(glassBreakerEvents)
            .values({
                adminId: input.adminId,
                action: input.action,
                targetType: input.targetType,
                targetId: input.targetId,
                reason,
                beforeJson: safeJson(before),
                afterJson: safeJson(after),
                metaJson: safeJson(meta),
            })
            .returning();

        console.warn(
            `[GlassBreaker] admin=${input.adminId} ${input.targetType}:${input.targetId} action=${input.action}`
        );

        return { event, before, after };
    }

    private async executeDeveloper(targetId: number, action: string, payload: Record<string, unknown>) {
        const [row] = await db.select().from(developers).where(eq(developers.id, targetId)).limit(1);
        if (!row) throw new Error('Developer not found');
        const before = pickDevSnapshot(row);
        const patch: Partial<typeof developers.$inferInsert> = { updatedAt: new Date() };

        if (action === 'set_status') {
            const status = String(payload.status || '').toLowerCase();
            if (!['active', 'inactive', 'blocked'].includes(status)) {
                throw new Error('status must be active, inactive, or blocked');
            }
            patch.status = status;
            if (status === 'blocked') {
                const blockReason = typeof payload.blockReason === 'string' ? payload.blockReason.trim() : '';
                if (!blockReason) throw new Error('blockReason is required when blocking');
                patch.blockReason = blockReason;
            } else {
                patch.blockReason = null;
            }
        } else if (action === 'force_kyc_verified') {
            patch.kycStatus = 'verified';
            patch.kycVerifiedAt = new Date();
            patch.kycRejectedAt = null;
            patch.kycRejectionReason = null;
        } else if (action === 'force_kyc_rejected') {
            patch.kycStatus = 'rejected';
            patch.kycRejectedAt = new Date();
            patch.kycRejectionReason =
                typeof payload.reason === 'string' && payload.reason.trim()
                    ? payload.reason.trim()
                    : 'KYC rejected via glass breaker';
        } else if (action === 'force_bank_verified') {
            patch.payoutBankValidationStatus = 'completed';
            patch.payoutBankValidationAccountStatus = 'valid';
            patch.payoutBankValidationDetails = 'Marked verified via glass breaker';
            patch.payoutBankValidationAt = new Date();
        } else if (action === 'force_email_verified') {
            patch.isEmailVerified = true;
            patch.emailVerificationToken = null;
            patch.emailVerificationExpiry = null;
        } else if (action === 'force_plan') {
            const plan = String(payload.plan || '').toLowerCase();
            if (!['base', 'pro', 'ultimate'].includes(plan)) {
                throw new Error('plan must be base, pro, or ultimate');
            }
            patch.plan = plan;
            if (typeof payload.billingCycle === 'string') {
                const cycle = payload.billingCycle.toLowerCase();
                if (!['monthly', 'yearly'].includes(cycle)) {
                    throw new Error('billingCycle must be monthly or yearly');
                }
                patch.planBillingCycle = cycle;
            }
            if (plan === 'base') {
                patch.planEndDate = null;
            } else if (typeof payload.planEndDate === 'string' && payload.planEndDate.trim()) {
                const end = new Date(payload.planEndDate);
                if (Number.isNaN(end.getTime())) throw new Error('Invalid planEndDate');
                patch.planEndDate = end;
                if (!patch.planStartDate) patch.planStartDate = new Date();
            } else if (!row.planEndDate) {
                const end = new Date();
                end.setMonth(end.getMonth() + 1);
                patch.planEndDate = end;
                patch.planStartDate = new Date();
            }
        } else {
            throw new Error('Unsupported developer action');
        }

        const [updated] = await db
            .update(developers)
            .set(patch)
            .where(eq(developers.id, targetId))
            .returning();

        if (action === 'force_kyc_verified' || action === 'force_kyc_rejected') {
            notificationService.sendKycDecisionEmail(
                updated.email,
                updated.name || 'Seller',
                action === 'force_kyc_verified' ? 'verified' : 'rejected',
                updated.kycRejectionReason,
                env.DEVELOPER_PORTAL_URL,
            );
        }

        return { before, after: pickDevSnapshot(updated), meta: {} };
    }

    private async executeClient(targetId: number, action: string, payload: Record<string, unknown>) {
        const [row] = await db.select().from(clients).where(eq(clients.id, targetId)).limit(1);
        if (!row) throw new Error('Client not found');
        const before = pickClientSnapshot(row);
        const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };

        if (action === 'set_status') {
            const status = String(payload.status || '').toLowerCase();
            if (!['active', 'inactive', 'suspended'].includes(status)) {
                throw new Error('status must be active, inactive, or suspended');
            }
            patch.status = status;
        } else if (action === 'force_email_verified') {
            patch.isEmailVerified = true;
            patch.emailVerificationToken = null;
            patch.emailVerificationExpiry = null;
        } else {
            throw new Error('Unsupported client action');
        }

        const [updated] = await db.update(clients).set(patch).where(eq(clients.id, targetId)).returning();
        return { before, after: pickClientSnapshot(updated) };
    }

    private async executeProduct(targetId: number, action: string, payload: Record<string, unknown>) {
        const [row] = await db
            .select()
            .from(developerProducts)
            .where(eq(developerProducts.id, targetId))
            .limit(1);
        if (!row) throw new Error('Product not found');
        const before = pickProductSnapshot(row);
        const patch: Partial<typeof developerProducts.$inferInsert> = { updatedAt: new Date() };

        if (action === 'set_listing_status') {
            const listingStatus = String(payload.listingStatus || '').toLowerCase();
            if (!['draft', 'live'].includes(listingStatus)) {
                throw new Error('listingStatus must be draft or live');
            }
            patch.listingStatus = listingStatus;
        } else if (action === 'force_unpublish') {
            patch.listingStatus = 'draft';
        } else if (action === 'set_trust') {
            if (typeof payload.verifiedByPlatform === 'boolean') {
                patch.trustVerifiedByPlatform = payload.verifiedByPlatform;
            }
            if (typeof payload.verifiedListing === 'boolean') {
                patch.trustVerifiedListing = payload.verifiedListing;
            }
            if (typeof payload.yoursaasCertified === 'boolean') {
                patch.trustYourSaaSCertified = payload.yoursaasCertified;
            }
            if (
                typeof payload.verifiedByPlatform !== 'boolean' &&
                typeof payload.verifiedListing !== 'boolean' &&
                typeof payload.yoursaasCertified !== 'boolean'
            ) {
                throw new Error('Provide at least one trust flag boolean');
            }
        } else {
            throw new Error('Unsupported product action');
        }

        const [updated] = await db
            .update(developerProducts)
            .set(patch)
            .where(eq(developerProducts.id, targetId))
            .returning();
        return { before, after: pickProductSnapshot(updated) };
    }

    private async executeContract(
        targetId: number,
        action: string,
        payload: Record<string, unknown>,
        reason: string
    ) {
        const [row] = await db.select().from(contracts).where(eq(contracts.id, targetId)).limit(1);
        if (!row) throw new Error('Contract not found');
        const before = pickContractSnapshot(row);

        if (action === 'unfreeze_escrow') {
            const [updated] = await db
                .update(contracts)
                .set({ escrowFrozen: false, updatedAt: new Date() })
                .where(eq(contracts.id, targetId))
                .returning();
            return { before, after: pickContractSnapshot(updated), meta: {} };
        }

        if (action === 'set_settlement_status') {
            const settlementStatus = String(payload.settlementStatus || '').toLowerCase();
            if (!['pending', 'executed', 'partial', 'failed', 'skipped'].includes(settlementStatus)) {
                throw new Error('Invalid settlementStatus');
            }
            let metaObj: Record<string, unknown> = {};
            if (row.settlementMetaJson) {
                try {
                    metaObj = JSON.parse(row.settlementMetaJson) as Record<string, unknown>;
                } catch {
                    metaObj = {};
                }
            }
            metaObj.glassBreakerNotes =
                typeof payload.notes === 'string' && payload.notes.trim()
                    ? payload.notes.trim()
                    : reason;
            metaObj.glassBreakerAt = new Date().toISOString();

            const [updated] = await db
                .update(contracts)
                .set({
                    settlementStatus,
                    settlementMetaJson: JSON.stringify(metaObj),
                    updatedAt: new Date(),
                })
                .where(eq(contracts.id, targetId))
                .returning();
            return { before, after: pickContractSnapshot(updated), meta: { settlementMeta: metaObj } };
        }

        if (action === 'retry_settlement') {
            const result = await contractSettlementService.retrySettlement(targetId);
            const [updated] = await db.select().from(contracts).where(eq(contracts.id, targetId)).limit(1);
            return {
                before,
                after: updated ? pickContractSnapshot(updated) : before,
                meta: { retry: result },
            };
        }

        throw new Error('Unsupported contract action');
    }

    private async executeMarketingUser(targetId: number, action: string, payload: Record<string, unknown>) {
        const [row] = await db.select().from(marketingUsers).where(eq(marketingUsers.id, targetId)).limit(1);
        if (!row) throw new Error('Marketing user not found');
        const before = { id: row.id, email: row.email, status: row.status };

        if (action !== 'set_status') throw new Error('Unsupported marketing_user action');
        const status = String(payload.status || '').toLowerCase();
        if (!['active', 'inactive'].includes(status)) {
            throw new Error('status must be active or inactive');
        }

        const [updated] = await db
            .update(marketingUsers)
            .set({ status, updatedAt: new Date() })
            .where(eq(marketingUsers.id, targetId))
            .returning();

        return { before, after: { id: updated.id, email: updated.email, status: updated.status } };
    }

    private async executeAdmin(
        actorAdminId: number,
        targetId: number,
        action: string,
        payload: Record<string, unknown>
    ) {
        const [row] = await db.select().from(admins).where(eq(admins.id, targetId)).limit(1);
        if (!row) throw new Error('Admin not found');
        const before = { id: row.id, email: row.email, status: row.status };

        if (action !== 'set_status') throw new Error('Unsupported admin action');
        const status = String(payload.status || '').toLowerCase();
        if (!['active', 'inactive'].includes(status)) {
            throw new Error('status must be active or inactive');
        }
        if (status === 'inactive' && targetId === actorAdminId) {
            throw new Error('Cannot deactivate your own admin account');
        }
        if (status === 'inactive') {
            const [activeCount] = await db
                .select({ value: count() })
                .from(admins)
                .where(and(eq(admins.status, 'active'), ne(admins.id, targetId)));
            if (Number(activeCount?.value ?? 0) < 1) {
                throw new Error('Cannot deactivate the last active admin');
            }
        }

        const [updated] = await db
            .update(admins)
            .set({ status, updatedAt: new Date() })
            .where(eq(admins.id, targetId))
            .returning();

        return { before, after: { id: updated.id, email: updated.email, status: updated.status } };
    }
}

export const glassBreakerService = new GlassBreakerService();
