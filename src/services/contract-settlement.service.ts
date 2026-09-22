import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contractPayments, contracts, developers } from '../db/schema.js';
import { env } from '../config/env.js';
import { paymentService } from './payment.service.js';
import { cashfreePayoutService } from './cashfree-payout.service.js';

export type ContractSettlementSplit = {
    refundClientPaise: number;
    releaseDeveloperPaise: number;
    reason: string;
};

export type SettlementMeta = {
    reason: string;
    attempt: number;
    refunds: { orderId: string; refundId: string; amountPaise: number }[];
    payout: {
        id: string;
        transferId: string;
        status: string;
        amountPaise: number;
        updatedAt?: string;
    } | null;
    errors: string[];
    lastRunAt: string;
};

function parseMeta(raw: string | null | undefined): SettlementMeta | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as SettlementMeta;
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            reason: parsed.reason || '',
            attempt: typeof parsed.attempt === 'number' ? parsed.attempt : 0,
            refunds: Array.isArray(parsed.refunds) ? parsed.refunds : [],
            payout: parsed.payout ?? null,
            errors: Array.isArray(parsed.errors) ? parsed.errors : [],
            lastRunAt: parsed.lastRunAt || new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

function parseNotes(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function refundedTotal(meta: SettlementMeta | null): number {
    if (!meta?.refunds?.length) return 0;
    return meta.refunds.reduce((sum, r) => sum + (r.amountPaise || 0), 0);
}

function payoutLooksDone(meta: SettlementMeta | null): boolean {
    if (!meta?.payout) return false;
    const s = (meta.payout.status || '').toUpperCase();
    return s === 'SUCCESS' || s === 'COMPLETED' || s === 'PENDING' || s === 'RECEIVED' || s === 'APPROVED';
}

function payoutLooksFailed(meta: SettlementMeta | null): boolean {
    if (!meta?.payout) return false;
    const s = (meta.payout.status || '').toUpperCase();
    return s === 'FAILED' || s === 'REJECTED' || s === 'REVERSED' || s === 'CANCELLED';
}

function computeStatus(
    split: ContractSettlementSplit,
    meta: SettlementMeta
): 'executed' | 'pending' | 'partial' | 'failed' | 'skipped' {
    const needRefund = split.refundClientPaise > 0;
    const needPayout = split.releaseDeveloperPaise > 0;
    if (!needRefund && !needPayout) return 'executed';

    const refundOk = !needRefund || refundedTotal(meta) >= split.refundClientPaise;
    const payoutOk = !needPayout || payoutLooksDone(meta);
    const payoutPending =
        needPayout &&
        meta.payout != null &&
        !payoutLooksFailed(meta) &&
        (meta.payout.status || '').toUpperCase() === 'PENDING';

    if (refundOk && payoutOk && meta.errors.length === 0) {
        return payoutPending ? 'pending' : 'executed';
    }
    if ((refundOk && needRefund) || (payoutOk && needPayout) || meta.refunds.length > 0 || meta.payout) {
        return 'partial';
    }
    return 'failed';
}

export function splitFromCompletedContract(c: {
    developerReleasedPaise: number | null;
    payoutNotes: string | null;
}): ContractSettlementSplit {
    const notes = parseNotes(c.payoutNotes);
    if (notes?.disputeResolution) {
        return {
            refundClientPaise: Number(notes.refundClientPaise) || 0,
            releaseDeveloperPaise: Number(notes.releaseDeveloperPaise) || 0,
            reason: 'dispute_resolution',
        };
    }
    return {
        refundClientPaise: 0,
        releaseDeveloperPaise: c.developerReleasedPaise ?? 0,
        reason: typeof notes?.reason === 'string' ? notes.reason : 'completion',
    };
}

export const contractSettlementService = {
    isEnabled(): boolean {
        return env.CONTRACT_AUTO_SETTLEMENT_ENABLED;
    },

    async executeAfterLedgerUpdate(contractId: number, split: ContractSettlementSplit): Promise<void> {
        await this.runSettlement(contractId, split, { force: false });
    },

    /**
     * Re-run Cashfree refunds/payouts for a completed contract (failed / partial / skipped / pending).
     * Idempotent for already-refunded chunks and accepted payouts.
     */
    async retrySettlement(contractId: number): Promise<{ status: string; meta: SettlementMeta }> {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c) throw new Error('Contract not found');
        if (c.status !== 'completed') throw new Error('Settlement only applies to completed contracts');
        if (c.settlementStatus === 'executed') {
            const meta = parseMeta(c.settlementMetaJson) ?? {
                reason: 'already_executed',
                attempt: 0,
                refunds: [],
                payout: null,
                errors: [],
                lastRunAt: new Date().toISOString(),
            };
            return { status: 'executed', meta };
        }

        const split = splitFromCompletedContract(c);
        await this.runSettlement(contractId, split, { force: true });

        const [fresh] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        const meta = parseMeta(fresh?.settlementMetaJson) ?? {
            reason: split.reason,
            attempt: 0,
            refunds: [],
            payout: null,
            errors: ['No settlement meta written'],
            lastRunAt: new Date().toISOString(),
        };
        return { status: fresh?.settlementStatus || 'failed', meta };
    },

    async runSettlement(
        contractId: number,
        split: ContractSettlementSplit,
        options: { force: boolean }
    ): Promise<void> {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c) return;

        if (c.settlementStatus === 'executed' && !options.force) return;

        if (!env.CONTRACT_AUTO_SETTLEMENT_ENABLED) {
            await db
                .update(contracts)
                .set({
                    settlementStatus: 'skipped',
                    settlementMetaJson: JSON.stringify({
                        reason: split.reason,
                        attempt: 0,
                        refunds: [],
                        payout: null,
                        errors: [
                            'Auto settlement disabled (CONTRACT_AUTO_SETTLEMENT_ENABLED=false). Set true when Cashfree PG + Payouts keys are live.',
                        ],
                        lastRunAt: new Date().toISOString(),
                    } satisfies SettlementMeta),
                    updatedAt: new Date(),
                })
                .where(eq(contracts.id, contractId));
            return;
        }

        const prev = parseMeta(c.settlementMetaJson);
        const meta: SettlementMeta = {
            reason: split.reason,
            attempt: (prev?.attempt ?? 0) + 1,
            refunds: prev?.refunds ? [...prev.refunds] : [],
            payout: prev?.payout && !payoutLooksFailed(prev) ? prev.payout : null,
            errors: [],
            lastRunAt: new Date().toISOString(),
        };

        const alreadyRefunded = refundedTotal(meta);
        const refundNeeded = Math.max(0, split.refundClientPaise - alreadyRefunded);
        if (refundNeeded > 0) {
            await this.refundClient(contractId, refundNeeded, meta);
        }

        if (split.releaseDeveloperPaise > 0 && !payoutLooksDone(meta)) {
            await this.payoutDeveloper(
                c.developerId,
                contractId,
                c.publicId,
                split.releaseDeveloperPaise,
                meta
            );
        }

        const status = computeStatus(split, meta);

        await db
            .update(contracts)
            .set({
                settlementStatus: status,
                settlementMetaJson: JSON.stringify(meta),
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, contractId));

        if (status === 'failed' || status === 'partial') {
            console.warn(
                `[Settlement] contract=${contractId} status=${status} errors=${meta.errors.join('; ') || 'none'}`
            );
        } else {
            console.log(`[Settlement] contract=${contractId} status=${status} attempt=${meta.attempt}`);
        }
    },

    async refundClient(contractId: number, amountPaise: number, meta: SettlementMeta): Promise<void> {
        if (!env.CASHFREE_PG_CLIENT_ID || !env.CASHFREE_PG_CLIENT_SECRET) {
            meta.errors.push('Cashfree PG keys missing — cannot refund client.');
            return;
        }

        const payments = await db
            .select()
            .from(contractPayments)
            .where(and(eq(contractPayments.contractId, contractId), eq(contractPayments.status, 'completed')))
            .orderBy(desc(contractPayments.completedAt));

        let remaining = amountPaise;
        for (const pay of payments) {
            if (remaining <= 0) break;
            if (!pay.orderId) continue;
            const alreadyRefunded = pay.refundAmountPaise ?? 0;
            const refundable = pay.amountPaise - alreadyRefunded;
            if (refundable <= 0) continue;

            const chunk = Math.min(remaining, refundable);
            try {
                const refund = (await paymentService.refundPayment(pay.orderId, chunk, 'contract_settlement')) as {
                    cf_refund_id?: string;
                    refund_id?: string;
                };

                const refundId = refund.cf_refund_id ?? refund.refund_id ?? 'unknown';

                await db
                    .update(contractPayments)
                    .set({
                        refundId: refundId,
                        refundAmountPaise: alreadyRefunded + chunk,
                    })
                    .where(eq(contractPayments.id, pay.id));

                meta.refunds.push({
                    orderId: pay.orderId,
                    refundId,
                    amountPaise: chunk,
                });
                remaining -= chunk;
            } catch (e) {
                meta.errors.push(e instanceof Error ? e.message : 'Refund failed');
                break;
            }
        }

        if (remaining > 0) {
            meta.errors.push(`Refund shortfall: ${remaining} paise could not be refunded.`);
        }
    },

    async payoutDeveloper(
        developerId: number,
        contractId: number,
        publicId: string,
        amountPaise: number,
        meta: SettlementMeta
    ): Promise<void> {
        if (!cashfreePayoutService.isConfigured()) {
            meta.errors.push('Cashfree Payouts not configured (CASHFREE_PAYOUT_CLIENT_ID / SECRET).');
            return;
        }

        const [dev] = await db.select().from(developers).where(eq(developers.id, developerId)).limit(1);
        if (!dev?.payoutCashfreeBeneficiaryId) {
            meta.errors.push('Developer has no Cashfree beneficiary — complete payout bank verification first.');
            return;
        }
        if (dev.payoutBankValidationStatus !== 'completed' || dev.payoutBankValidationAccountStatus !== 'valid') {
            meta.errors.push('Developer bank account is not validated for payouts.');
            return;
        }

        const transferId = `ys_c${contractId}_a${meta.attempt}`.slice(0, 40);

        try {
            const payout = await cashfreePayoutService.createTransfer({
                beneficiaryId: dev.payoutCashfreeBeneficiaryId,
                amountPaise,
                transferId,
                remarks: `YS contract ${publicId.slice(0, 8)}`,
            });
            meta.payout = {
                id: payout.cf_transfer_id ?? payout.transfer_id ?? transferId,
                transferId,
                status: payout.status ?? 'PENDING',
                amountPaise,
                updatedAt: new Date().toISOString(),
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Payout failed';
            // Duplicate transfer id from a prior accepted attempt — treat as already submitted
            if (/already|duplicate|exist/i.test(msg) && meta.payout) {
                meta.errors.push(`Payout may already exist: ${msg}`);
                return;
            }
            if (/already|duplicate|exist/i.test(msg)) {
                meta.payout = {
                    id: transferId,
                    transferId,
                    status: 'PENDING',
                    amountPaise,
                    updatedAt: new Date().toISOString(),
                };
                return;
            }
            meta.errors.push(msg);
        }
    },

    /** Background: retry completed contracts stuck in failed/partial/skipped/pending. */
    async retryPendingSettlements(limit = 20): Promise<number> {
        if (!env.CONTRACT_AUTO_SETTLEMENT_ENABLED) return 0;

        const rows = await db
            .select()
            .from(contracts)
            .where(
                and(
                    eq(contracts.status, 'completed'),
                    inArray(contracts.settlementStatus, ['failed', 'partial', 'skipped', 'pending'])
                )
            )
            .orderBy(desc(contracts.completedAt))
            .limit(limit);

        let n = 0;
        for (const row of rows) {
            try {
                // Don't hammer forever — cap attempts in meta
                const prev = parseMeta(row.settlementMetaJson);
                if ((prev?.attempt ?? 0) >= 12) continue;
                await this.retrySettlement(row.id);
                n += 1;
            } catch (e) {
                console.error(`[Settlement] retry failed for contract ${row.id}:`, e);
            }
        }
        return n;
    },

    /**
     * Apply Cashfree Payouts transfer webhook to matching contract settlement meta.
     * Looks up by transfer_id (`ys_c{id}_a{n}`) or cf transfer id stored in meta.
     */
    async applyPayoutWebhook(payload: unknown): Promise<{ matched: boolean; contractId?: number }> {
        const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
        const data =
            root.data && typeof root.data === 'object'
                ? (root.data as Record<string, unknown>)
                : root.transfer_details && typeof root.transfer_details === 'object'
                  ? (root.transfer_details as Record<string, unknown>)
                  : root;

        const transferId = String(
            data.transfer_id || data.transferId || root.transfer_id || root.transferId || ''
        ).trim();
        const cfTransferId = String(
            data.cf_transfer_id || data.cfTransferId || root.cf_transfer_id || ''
        ).trim();
        const statusRaw = String(
            data.status || data.transfer_status || root.status || root.event || root.type || ''
        ).toUpperCase();

        let mappedStatus = 'PENDING';
        if (/SUCCESS|COMPLETED|RECEIVED|APPROVED/.test(statusRaw)) mappedStatus = 'SUCCESS';
        else if (/FAIL|REJECT|REVERS|CANCEL/.test(statusRaw)) mappedStatus = 'FAILED';
        else if (/PENDING|RECEIVED|INITIATED|QUEUED/.test(statusRaw)) mappedStatus = 'PENDING';

        let contractId: number | null = null;
        const m = /^ys_c(\d+)_a\d+$/i.exec(transferId);
        if (m) contractId = parseInt(m[1]!, 10);

        let row =
            contractId != null
                ? (await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1))[0]
                : undefined;

        if (!row && (transferId || cfTransferId)) {
            // Fallback scan recent completed with payout meta (bounded)
            const recent = await db
                .select()
                .from(contracts)
                .where(eq(contracts.status, 'completed'))
                .orderBy(desc(contracts.completedAt))
                .limit(100);
            row = recent.find((c) => {
                const meta = parseMeta(c.settlementMetaJson);
                if (!meta?.payout) return false;
                return (
                    meta.payout.transferId === transferId ||
                    meta.payout.id === transferId ||
                    meta.payout.id === cfTransferId ||
                    meta.payout.transferId === cfTransferId
                );
            });
            if (row) contractId = row.id;
        }

        if (!row || contractId == null) {
            return { matched: false };
        }

        const meta = parseMeta(row.settlementMetaJson) ?? {
            reason: 'payout_webhook',
            attempt: 1,
            refunds: [],
            payout: null,
            errors: [],
            lastRunAt: new Date().toISOString(),
        };

        const amountPaise = meta.payout?.amountPaise ?? row.developerReleasedPaise ?? 0;
        meta.payout = {
            id: cfTransferId || meta.payout?.id || transferId,
            transferId: transferId || meta.payout?.transferId || '',
            status: mappedStatus,
            amountPaise,
            updatedAt: new Date().toISOString(),
        };

        if (mappedStatus === 'FAILED') {
            meta.errors = [...(meta.errors || []).filter((e) => !/payout webhook/i.test(e)), 'Payout webhook: FAILED'];
        } else {
            meta.errors = (meta.errors || []).filter((e) => !/payout webhook/i.test(e));
        }

        const split = splitFromCompletedContract(row);
        const status = computeStatus(split, meta);

        await db
            .update(contracts)
            .set({
                settlementStatus: status,
                settlementMetaJson: JSON.stringify(meta),
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, contractId));

        console.log(`[Settlement] payout webhook contract=${contractId} transfer=${transferId} → ${mappedStatus} (${status})`);
        return { matched: true, contractId };
    },

    getSettlementMeta(contract: { settlementMetaJson: string | null }): SettlementMeta | null {
        return parseMeta(contract.settlementMetaJson);
    },
};
