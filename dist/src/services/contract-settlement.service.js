import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contractPayments, contracts, developers } from '../db/schema.js';
import { env } from '../config/env.js';
import { paymentService } from './payment.service.js';
import { cashfreePayoutService } from './cashfree-payout.service.js';
function parseMeta(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export const contractSettlementService = {
    async executeAfterLedgerUpdate(contractId, split) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c)
            return;
        if (c.settlementStatus === 'executed')
            return;
        if (!env.CONTRACT_AUTO_SETTLEMENT_ENABLED) {
            await db
                .update(contracts)
                .set({
                settlementStatus: 'skipped',
                settlementMetaJson: JSON.stringify({
                    reason: split.reason,
                    refunds: [],
                    payout: null,
                    errors: ['Auto settlement disabled (CONTRACT_AUTO_SETTLEMENT_ENABLED=false).'],
                }),
                updatedAt: new Date(),
            })
                .where(eq(contracts.id, contractId));
            return;
        }
        const meta = { reason: split.reason, refunds: [], payout: null, errors: [] };
        if (split.refundClientPaise > 0) {
            await this.refundClient(contractId, split.refundClientPaise, meta);
        }
        if (split.releaseDeveloperPaise > 0) {
            await this.payoutDeveloper(c.developerId, contractId, c.publicId, split.releaseDeveloperPaise, meta);
        }
        const hasErrors = meta.errors.length > 0;
        const didWork = meta.refunds.length > 0 || meta.payout !== null;
        const status = hasErrors ? (didWork ? 'partial' : 'failed') : didWork || (split.refundClientPaise === 0 && split.releaseDeveloperPaise === 0) ? 'executed' : 'skipped';
        if (!didWork && split.refundClientPaise === 0 && split.releaseDeveloperPaise === 0) {
            meta.errors.push('No money movement requested.');
        }
        await db
            .update(contracts)
            .set({
            settlementStatus: status,
            settlementMetaJson: JSON.stringify(meta),
            updatedAt: new Date(),
        })
            .where(eq(contracts.id, contractId));
    },
    async refundClient(contractId, amountPaise, meta) {
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
            if (remaining <= 0)
                break;
            if (!pay.orderId)
                continue;
            const alreadyRefunded = pay.refundAmountPaise ?? 0;
            const refundable = pay.amountPaise - alreadyRefunded;
            if (refundable <= 0)
                continue;
            const chunk = Math.min(remaining, refundable);
            try {
                const refund = (await paymentService.refundPayment(pay.orderId, chunk, 'contract_settlement'));
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
            }
            catch (e) {
                meta.errors.push(e instanceof Error ? e.message : 'Refund failed');
                break;
            }
        }
        if (remaining > 0) {
            meta.errors.push(`Refund shortfall: ${remaining} paise could not be refunded.`);
        }
    },
    async payoutDeveloper(developerId, contractId, publicId, amountPaise, meta) {
        if (!cashfreePayoutService.isConfigured()) {
            meta.errors.push('Cashfree Payouts not configured.');
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
        try {
            const payout = await cashfreePayoutService.createTransfer({
                beneficiaryId: dev.payoutCashfreeBeneficiaryId,
                amountPaise,
                transferId: `ys_ctr_${contractId}`,
                remarks: `YS contract ${publicId.slice(0, 8)}`,
            });
            meta.payout = {
                id: payout.cf_transfer_id ?? payout.transfer_id ?? 'unknown',
                status: payout.status ?? 'PENDING',
                amountPaise,
            };
        }
        catch (e) {
            meta.errors.push(e instanceof Error ? e.message : 'Payout failed');
        }
    },
    getSettlementMeta(contract) {
        return parseMeta(contract.settlementMetaJson);
    },
};
