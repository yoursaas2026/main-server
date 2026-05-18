import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contractPayments, contracts, developers } from '../db/schema.js';
import { env } from '../config/env.js';
import { paymentService } from './payment.service.js';
import { razorpayXPayoutService } from './razorpay-x-payout.service.js';
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
        if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
            meta.errors.push('Razorpay keys missing — cannot refund client.');
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
            if (!pay.paymentId)
                continue;
            const alreadyRefunded = pay.refundAmountPaise ?? 0;
            const refundable = pay.amountPaise - alreadyRefunded;
            if (refundable <= 0)
                continue;
            const chunk = Math.min(remaining, refundable);
            try {
                const refund = (await paymentService.refundPayment(pay.paymentId, chunk, {
                    contractId: String(contractId),
                    purpose: 'contract_settlement',
                }));
                await db
                    .update(contractPayments)
                    .set({
                    refundId: refund.id ?? pay.refundId,
                    refundAmountPaise: alreadyRefunded + chunk,
                })
                    .where(eq(contractPayments.id, pay.id));
                meta.refunds.push({
                    paymentId: pay.paymentId,
                    refundId: refund.id ?? 'unknown',
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
        if (!razorpayXPayoutService.isConfigured()) {
            meta.errors.push('RazorpayX payout not configured.');
            return;
        }
        const [dev] = await db.select().from(developers).where(eq(developers.id, developerId)).limit(1);
        if (!dev?.payoutRazorpayFundAccountId) {
            meta.errors.push('Developer has no Razorpay fund account — complete payout bank verification first.');
            return;
        }
        if (dev.payoutBankValidationStatus !== 'completed' || dev.payoutBankValidationAccountStatus !== 'valid') {
            meta.errors.push('Developer bank account is not validated for payouts.');
            return;
        }
        try {
            const payout = await razorpayXPayoutService.createPayout({
                fundAccountId: dev.payoutRazorpayFundAccountId,
                amountPaise,
                referenceId: `ys_ctr_${contractId}`,
                narration: `YS contract ${publicId.slice(0, 8)}`,
                notes: { contractId: String(contractId), developerId: String(developerId) },
            });
            meta.payout = { id: payout.id, status: payout.status, amountPaise };
        }
        catch (e) {
            meta.errors.push(e instanceof Error ? e.message : 'Payout failed');
        }
    },
    getSettlementMeta(contract) {
        return parseMeta(contract.settlementMetaJson);
    },
};
