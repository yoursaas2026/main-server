import crypto from 'crypto';
import { CashfreePayout, CASHFREE_PAYOUT_API_VERSION, paiseToInr } from '../config/cashfree.js';
import { env } from '../config/env.js';
/** Parse V1 webhook body — Cashfree sends JSON or application/x-www-form-urlencoded. */
function parseV1WebhookBody(rawBody) {
    const trimmed = rawBody.trim();
    if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed);
    }
    const params = new URLSearchParams(trimmed);
    const data = {};
    for (const [key, value] of params.entries()) {
        data[key] = value;
    }
    if (Object.keys(data).length === 0) {
        throw new Error('Empty or unrecognised V1 payout webhook body');
    }
    return data;
}
/** V1 — signature lives in POST body; sort keys, concat values, HMAC-SHA256 (Cashfree Payouts docs). */
export function verifyPayoutWebhookV1(rawBody, clientSecret) {
    let parsed;
    try {
        parsed = parseV1WebhookBody(rawBody);
    }
    catch {
        throw new Error('Invalid body for V1 payout webhook (expected JSON or form-urlencoded)');
    }
    const received = parsed.signature;
    if (typeof received !== 'string' || !received) {
        throw new Error('Missing signature field in V1 payout webhook body');
    }
    const data = { ...parsed };
    delete data.signature;
    const postData = Object.keys(data)
        .sort()
        .map((key) => {
        const v = data[key];
        if (v === null || v === undefined)
            return '';
        return String(v);
    })
        .filter((s) => s.length > 0)
        .join('');
    const computed = crypto.createHmac('sha256', clientSecret).update(postData).digest('base64');
    if (computed !== received) {
        throw new Error('V1 payout webhook signature mismatch — use oldest active Payouts client secret');
    }
    const event = typeof data.event === 'string' ? data.event : typeof data.type === 'string' ? data.type : '';
    return { version: 'v1', type: event, raw: rawBody, object: data };
}
/** V2 — x-webhook-signature + x-webhook-timestamp headers (matches cashfree-payout SDK). */
export function verifyPayoutWebhookV2(signature, rawBody, timestamp) {
    const event = CashfreePayout.PayoutVerifyWebhookSignature(signature, rawBody, timestamp);
    const obj = event.object;
    const type = event.type || obj?.type || obj?.event || '';
    return { version: 'v2', type, raw: rawBody, object: event.object };
}
function parseCashfreeError(err) {
    if (err && typeof err === 'object' && 'response' in err) {
        const data = err.response?.data;
        if (data?.message)
            return data.message;
    }
    return err instanceof Error ? err.message : 'Cashfree payout request failed';
}
function mapBeneficiaryStatus(beneficiary) {
    const status = beneficiary.beneficiary_status ?? 'INITIATED';
    const accountStatus = status === 'VERIFIED' ? 'valid' : status === 'INVALID' || status === 'FAILED' ? 'invalid' : null;
    let details = null;
    if (status === 'VERIFIED') {
        details = 'Bank account verified with Cashfree Payouts.';
    }
    else if (status === 'INVALID' || status === 'FAILED') {
        details = `Beneficiary status: ${status}`;
    }
    else if (status === 'INITIATED') {
        details = 'Verification in progress.';
    }
    return {
        beneficiaryId: beneficiary.beneficiary_id ?? '',
        status: status === 'VERIFIED' ? 'completed' : status === 'INITIATED' ? 'created' : 'failed',
        accountStatus,
        details,
    };
}
export function mapBeneficiaryToPayoutColumns(beneficiary) {
    const mapped = mapBeneficiaryStatus(beneficiary);
    return {
        payoutBankValidationStatus: mapped.status,
        payoutBankValidationAccountStatus: mapped.accountStatus,
        payoutBankValidationDetails: mapped.details,
        payoutBankValidationAt: new Date(),
        payoutCashfreeBeneficiaryId: mapped.beneficiaryId || null,
        updatedAt: new Date(),
    };
}
export const cashfreePayoutService = {
    isConfigured() {
        return Boolean(env.CASHFREE_PAYOUT_CLIENT_ID && env.CASHFREE_PAYOUT_CLIENT_SECRET);
    },
    beneficiaryIdForDeveloper(developerId) {
        return `ys_dev_${developerId}`.slice(0, 50);
    },
    async createOrVerifyBeneficiary(input) {
        if (!this.isConfigured()) {
            throw new Error('Cashfree Payouts are not configured (client id / secret missing).');
        }
        const beneficiaryId = this.beneficiaryIdForDeveloper(input.developerId);
        const body = {
            beneficiary_id: beneficiaryId,
            beneficiary_name: input.accountHolderName,
            beneficiary_instrument_details: {
                bank_account_number: input.accountNumber,
                bank_ifsc: input.ifsc,
            },
            beneficiary_contact_details: {
                beneficiary_email: input.email,
                beneficiary_phone: input.phoneDigits,
            },
        };
        try {
            const response = await CashfreePayout.PayoutCreateBeneficiary(CASHFREE_PAYOUT_API_VERSION, undefined, body);
            return mapBeneficiaryStatus(response.data);
        }
        catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },
    async fetchBeneficiary(beneficiaryId) {
        if (!this.isConfigured()) {
            throw new Error('Cashfree Payouts are not configured on the server.');
        }
        try {
            const response = await CashfreePayout.PayoutFetchBeneficiary(CASHFREE_PAYOUT_API_VERSION, undefined, beneficiaryId);
            return mapBeneficiaryStatus(response.data);
        }
        catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },
    async createTransfer(input) {
        if (!this.isConfigured()) {
            throw new Error('Cashfree Payouts are not configured (client id / secret missing).');
        }
        if (input.amountPaise < 100) {
            throw new Error('Payout amount must be at least ₹1 (100 paise).');
        }
        try {
            const response = await CashfreePayout.PayoutInitiateTransfer(CASHFREE_PAYOUT_API_VERSION, undefined, {
                transfer_id: input.transferId.slice(0, 40),
                transfer_amount: paiseToInr(input.amountPaise),
                transfer_currency: 'INR',
                transfer_mode: 'imps',
                transfer_remarks: input.remarks.slice(0, 70),
                beneficiary_details: {
                    beneficiary_id: input.beneficiaryId,
                },
            });
            return response.data;
        }
        catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },
};
