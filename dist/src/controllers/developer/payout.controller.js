import { z } from 'zod';
import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { cashfreePayoutService } from '../../services/cashfree-payout.service.js';
import { CashfreePayout } from '../../config/cashfree.js';
import { env } from '../../config/env.js';
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
function normalizeIndiaPhone(raw) {
    if (!raw)
        return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10)
        return digits;
    if (digits.length === 12 && digits.startsWith('91'))
        return digits.slice(2);
    if (digits.length === 13 && digits.startsWith('091'))
        return digits.slice(3);
    return null;
}
const putBankSchema = z.object({
    country: z.string().trim().min(1).max(100),
    accountHolderName: z.string().trim().min(1).max(200),
    bankName: z.string().trim().min(1).max(200),
    routingCode: z.string().trim().min(4).max(34),
    accountType: z.enum(['savings', 'current']),
    accountNumber: z.string().trim().max(40).optional(),
    confirmAccountNumber: z.string().trim().max(40).optional(),
});
export class DeveloperPayoutController {
    async getBank(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        try {
            const [row] = await db
                .select({
                payoutBankCountry: developers.payoutBankCountry,
                payoutAccountHolderName: developers.payoutAccountHolderName,
                payoutBankName: developers.payoutBankName,
                payoutRoutingCode: developers.payoutRoutingCode,
                payoutAccountNumber: developers.payoutAccountNumber,
                payoutAccountType: developers.payoutAccountType,
                payoutBankDetailsUpdatedAt: developers.payoutBankDetailsUpdatedAt,
                payoutBankValidationStatus: developers.payoutBankValidationStatus,
                payoutBankValidationAccountStatus: developers.payoutBankValidationAccountStatus,
                payoutBankValidationDetails: developers.payoutBankValidationDetails,
                payoutBankValidationAt: developers.payoutBankValidationAt,
            })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            if (!row)
                return c.json({ success: false, error: 'Developer not found' }, 404);
            const num = row.payoutAccountNumber?.trim() ?? '';
            const accountNumberLastFour = num.length >= 4 ? num.slice(-4) : num.length > 0 ? num : null;
            const vStatus = row.payoutBankValidationStatus ?? null;
            const vAccount = row.payoutBankValidationAccountStatus ?? null;
            const bankVerified = vStatus === 'completed' && vAccount === 'valid';
            return c.json({
                success: true,
                data: {
                    country: row.payoutBankCountry ?? null,
                    accountHolderName: row.payoutAccountHolderName ?? null,
                    bankName: row.payoutBankName ?? null,
                    routingCode: row.payoutRoutingCode ?? null,
                    accountNumberLastFour,
                    hasAccountNumber: Boolean(num),
                    accountType: row.payoutAccountType ?? null,
                    updatedAt: row.payoutBankDetailsUpdatedAt ?? null,
                    bankValidationStatus: vStatus,
                    bankValidationAccountStatus: vAccount,
                    bankValidationDetails: row.payoutBankValidationDetails ?? null,
                    bankValidationAt: row.payoutBankValidationAt ?? null,
                    bankVerified,
                    cashfreePayoutConfigured: cashfreePayoutService.isConfigured(),
                },
            });
        }
        catch (err) {
            console.error('[DeveloperPayout] getBank error:', err);
            return c.json({ success: false, error: 'Failed to load payout bank details' }, 500);
        }
    }
    async putBank(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        const body = await c.req.json().catch(() => null);
        const parsed = putBankSchema.safeParse(body);
        if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
            return c.json({ success: false, error: msg }, 400);
        }
        const { country, accountHolderName, bankName, routingCode, accountType, accountNumber, confirmAccountNumber } = parsed.data;
        try {
            const [existing] = await db
                .select({ num: developers.payoutAccountNumber })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            const existingNum = existing?.num?.trim() ?? '';
            const newAcc = accountNumber?.trim() ?? '';
            const confirmAcc = confirmAccountNumber?.trim() ?? '';
            const replacing = newAcc.length > 0;
            if (replacing && newAcc !== confirmAcc) {
                return c.json({ success: false, error: 'Account number and confirmation do not match' }, 400);
            }
            let nextAccountNumber = existingNum;
            if (replacing) {
                nextAccountNumber = newAcc;
            }
            if (!nextAccountNumber) {
                return c.json({ success: false, error: 'Account number is required' }, 400);
            }
            await db
                .update(developers)
                .set({
                payoutBankCountry: country,
                payoutAccountHolderName: accountHolderName,
                payoutBankName: bankName,
                payoutRoutingCode: routingCode.trim().toUpperCase(),
                payoutAccountNumber: nextAccountNumber,
                payoutAccountType: accountType,
                payoutBankDetailsUpdatedAt: new Date(),
                payoutCashfreeBeneficiaryId: null,
                payoutBankValidationId: null,
                payoutBankValidationStatus: null,
                payoutBankValidationAccountStatus: null,
                payoutBankValidationDetails: null,
                payoutBankValidationAt: null,
                updatedAt: new Date(),
            })
                .where(eq(developers.id, user.id));
            return c.json({ success: true, message: 'Payout bank details saved' });
        }
        catch (err) {
            console.error('[DeveloperPayout] putBank error:', err);
            return c.json({ success: false, error: 'Failed to save payout bank details' }, 500);
        }
    }
    /** Cashfree Payouts beneficiary verification — India (IFSC) only for now. */
    async verifyBank(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        if (!cashfreePayoutService.isConfigured()) {
            return c.json({
                success: false,
                error: 'Bank verification is not configured. Set CASHFREE_PAYOUT_CLIENT_ID and CASHFREE_PAYOUT_CLIENT_SECRET on the server.',
            }, 503);
        }
        try {
            const [row] = await db
                .select({
                payoutBankCountry: developers.payoutBankCountry,
                payoutAccountHolderName: developers.payoutAccountHolderName,
                payoutRoutingCode: developers.payoutRoutingCode,
                payoutAccountNumber: developers.payoutAccountNumber,
                email: developers.email,
                phone: developers.phone,
            })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            if (!row)
                return c.json({ success: false, error: 'Developer not found' }, 404);
            if ((row.payoutBankCountry ?? '').toUpperCase() !== 'IN') {
                return c.json({
                    success: false,
                    error: 'Automated bank verification is only available for Indian (IFSC) accounts right now.',
                }, 400);
            }
            const ifsc = (row.payoutRoutingCode ?? '').trim().toUpperCase();
            if (!IFSC_RE.test(ifsc)) {
                return c.json({ success: false, error: 'Enter a valid 11-character IFSC before verifying.' }, 400);
            }
            const acc = row.payoutAccountNumber?.trim() ?? '';
            if (!acc) {
                return c.json({ success: false, error: 'Save your account number before requesting verification.' }, 400);
            }
            const holder = row.payoutAccountHolderName?.trim() ?? '';
            if (!holder) {
                return c.json({ success: false, error: 'Save the account holder name before verifying.' }, 400);
            }
            const phoneDigits = normalizeIndiaPhone(row.phone);
            if (!phoneDigits) {
                return c.json({
                    success: false,
                    error: 'Add a valid Indian mobile number on your developer profile before verifying (used for Cashfree beneficiary contact).',
                }, 400);
            }
            const result = await cashfreePayoutService.createOrVerifyBeneficiary({
                developerId: user.id,
                accountHolderName: holder,
                ifsc,
                accountNumber: acc,
                email: row.email,
                phoneDigits,
            });
            await db
                .update(developers)
                .set({
                payoutBankValidationId: result.beneficiaryId,
                payoutBankValidationStatus: result.status,
                payoutBankValidationAccountStatus: result.accountStatus,
                payoutBankValidationDetails: result.details,
                payoutBankValidationAt: new Date(),
                payoutCashfreeBeneficiaryId: result.beneficiaryId,
                updatedAt: new Date(),
            })
                .where(eq(developers.id, user.id));
            return c.json({
                success: true,
                data: {
                    validationId: result.beneficiaryId,
                    status: result.status,
                    bankVerified: result.status === 'completed' && result.accountStatus === 'valid',
                    accountStatus: result.accountStatus,
                    details: result.details,
                },
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Verification request failed';
            console.error('[DeveloperPayout] verifyBank error:', err);
            return c.json({ success: false, error: msg }, 400);
        }
    }
    /** Poll Cashfree for the latest beneficiary verification status. */
    async syncBankValidation(c) {
        const user = c.get('user');
        if (!user || user.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }
        if (!cashfreePayoutService.isConfigured()) {
            return c.json({ success: false, error: 'Bank verification is not configured on the server.' }, 503);
        }
        try {
            const [row] = await db
                .select({ payoutCashfreeBeneficiaryId: developers.payoutCashfreeBeneficiaryId })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);
            if (!row?.payoutCashfreeBeneficiaryId) {
                return c.json({ success: false, error: 'No verification request on file. Start verification first.' }, 400);
            }
            const result = await cashfreePayoutService.fetchBeneficiary(row.payoutCashfreeBeneficiaryId);
            const mapped = {
                payoutBankValidationStatus: result.status,
                payoutBankValidationAccountStatus: result.accountStatus,
                payoutBankValidationDetails: result.details,
                payoutBankValidationAt: new Date(),
                payoutCashfreeBeneficiaryId: result.beneficiaryId,
                updatedAt: new Date(),
            };
            await db
                .update(developers)
                .set(mapped)
                .where(and(eq(developers.id, user.id), eq(developers.payoutCashfreeBeneficiaryId, row.payoutCashfreeBeneficiaryId)));
            const bankVerified = mapped.payoutBankValidationStatus === 'completed' &&
                mapped.payoutBankValidationAccountStatus === 'valid';
            return c.json({
                success: true,
                data: {
                    validationId: row.payoutCashfreeBeneficiaryId,
                    status: mapped.payoutBankValidationStatus,
                    bankVerified,
                    accountStatus: mapped.payoutBankValidationAccountStatus,
                    details: mapped.payoutBankValidationDetails,
                },
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Sync failed';
            console.error('[DeveloperPayout] syncBankValidation error:', err);
            return c.json({ success: false, error: msg }, 400);
        }
    }
    /** Public Cashfree Payouts webhook (V2) — must not sit behind auth middleware. */
    async cashfreeWebhook(c) {
        let bodyString = '';
        try {
            bodyString = await c.req.text();
        }
        catch {
            return c.json({ error: 'Failed to read request body' }, 400);
        }
        if (!env.CASHFREE_PAYOUT_CLIENT_SECRET) {
            return c.json({ error: 'Cashfree Payouts not configured on server (CASHFREE_PAYOUT_CLIENT_SECRET)' }, 503);
        }
        const signature = c.req.header('x-webhook-signature');
        const timestamp = c.req.header('x-webhook-timestamp');
        if (!signature || !timestamp) {
            console.warn('[DeveloperPayout] webhook missing signature headers');
            return c.json({ error: 'Missing x-webhook-signature or x-webhook-timestamp' }, 401);
        }
        try {
            CashfreePayout.PayoutVerifyWebhookSignature(signature, bodyString, timestamp);
        }
        catch (err) {
            console.warn('[DeveloperPayout] webhook signature mismatch:', err instanceof Error ? err.message : err);
            return c.json({
                error: 'Invalid payout webhook signature — use CASHFREE_PAYOUT_CLIENT_SECRET from the same Cashfree Payouts app (sandbox vs production must match)',
            }, 401);
        }
        // Acknowledge now; transfer status updates can be processed here later.
        return c.json({ status: 'ok' });
    }
}
export const developerPayoutController = new DeveloperPayoutController();
