import { env } from '../config/env.js';
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
function basicAuthHeader() {
    const id = env.RAZORPAY_KEY_ID;
    const secret = env.RAZORPAY_KEY_SECRET;
    return `Basic ${Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')}`;
}
function parseRazorpayError(json) {
    if (!json || typeof json !== 'object')
        return null;
    const err = json.error;
    if (!err)
        return null;
    return err.description || err.reason || null;
}
export const razorpayXPayoutService = {
    isConfigured() {
        return Boolean(env.RAZORPAY_KEY_ID &&
            env.RAZORPAY_KEY_SECRET &&
            env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER.trim().length > 0);
    },
    async createPayout(input) {
        if (!this.isConfigured()) {
            throw new Error('RazorpayX payouts are not configured (keys or source account missing).');
        }
        if (input.amountPaise < 100) {
            throw new Error('Payout amount must be at least ₹1 (100 paise).');
        }
        const body = {
            account_number: env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER.trim(),
            fund_account_id: input.fundAccountId,
            amount: input.amountPaise,
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: input.referenceId.slice(0, 40),
            narration: input.narration.slice(0, 30),
            notes: input.notes ?? {},
        };
        const res = await fetch(`${RAZORPAY_API_BASE}/payouts`, {
            method: 'POST',
            headers: {
                Authorization: basicAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null));
        if (!res.ok) {
            throw new Error(parseRazorpayError(json) || `Razorpay payout failed (${res.status})`);
        }
        return json;
    },
};
