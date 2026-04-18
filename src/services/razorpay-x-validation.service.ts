import { env } from '../config/env.js';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

export type FundAccountValidationEntity = {
    id: string;
    entity: string;
    status: string;
    validation_results?: {
        account_status?: string | null;
        registered_name?: string | null;
        details?: string | null;
        name_match_score?: number | null;
    } | null;
    status_details?: { description?: string; reason?: string; source?: string } | null;
    notes?: Record<string, string> | null;
    fund_account?: {
        id?: string;
        contact?: { id?: string };
    } | null;
};

function basicAuthHeader(): string {
    const id = env.RAZORPAY_KEY_ID;
    const secret = env.RAZORPAY_KEY_SECRET;
    return `Basic ${Buffer.from(`${id}:${secret}`, 'utf8').toString('base64')}`;
}

function parseRazorpayError(json: unknown): string | null {
    if (!json || typeof json !== 'object') return null;
    const err = (json as { error?: { description?: string; reason?: string } }).error;
    if (!err) return null;
    return err.description || err.reason || null;
}

export const razorpayXValidationService = {
    isConfigured(): boolean {
        return Boolean(
            env.RAZORPAY_KEY_ID &&
                env.RAZORPAY_KEY_SECRET &&
                env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER.trim().length > 0
        );
    },

    async createBankAccountValidation(input: {
        developerId: number;
        accountHolderName: string;
        ifsc: string;
        accountNumber: string;
        email: string;
        phoneDigits: string;
    }): Promise<FundAccountValidationEntity> {
        const ref = `ys_dev_${input.developerId}`.slice(0, 40);
        const contactRef = `ys_ct_${input.developerId}`.slice(0, 40);

        const body = {
            source_account_number: env.RAZORPAYX_SOURCE_ACCOUNT_NUMBER.trim(),
            validation_type: 'optimized',
            reference_id: ref,
            notes: {
                developerId: String(input.developerId),
            },
            fund_account: {
                account_type: 'bank_account',
                bank_account: {
                    name: input.accountHolderName,
                    ifsc: input.ifsc,
                    account_number: input.accountNumber,
                },
                contact: {
                    name: input.accountHolderName,
                    email: input.email,
                    contact: input.phoneDigits,
                    type: 'vendor',
                    reference_id: contactRef,
                },
            },
        };

        const res = await fetch(`${RAZORPAY_API_BASE}/fund_accounts/validations`, {
            method: 'POST',
            headers: {
                Authorization: basicAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => null)) as FundAccountValidationEntity | { error?: unknown };

        if (!res.ok) {
            const msg = parseRazorpayError(json) || `Razorpay validation request failed (${res.status})`;
            throw new Error(msg);
        }

        return json as FundAccountValidationEntity;
    },

    async fetchValidation(validationId: string): Promise<FundAccountValidationEntity> {
        const res = await fetch(`${RAZORPAY_API_BASE}/fund_accounts/validations/${encodeURIComponent(validationId)}`, {
            method: 'GET',
            headers: {
                Authorization: basicAuthHeader(),
            },
        });

        const json = (await res.json().catch(() => null)) as FundAccountValidationEntity | { error?: unknown };

        if (!res.ok) {
            const msg = parseRazorpayError(json) || `Could not load validation (${res.status})`;
            throw new Error(msg);
        }

        return json as FundAccountValidationEntity;
    },
};

export function mapValidationEntityToPayoutColumns(entity: FundAccountValidationEntity) {
    const vr = entity.validation_results;
    const accountStatus =
        entity.status === 'completed' && vr?.account_status != null ? String(vr.account_status) : null;

    let details: string | null = null;
    if (entity.status === 'failed') {
        details = entity.status_details?.description || entity.status_details?.reason || 'Validation failed';
    } else if (entity.status === 'completed') {
        details = vr?.details || entity.status_details?.description || null;
    }

    return {
        payoutBankValidationStatus: entity.status,
        payoutBankValidationAccountStatus: accountStatus,
        payoutBankValidationDetails: details,
        payoutBankValidationAt: new Date(),
        payoutRazorpayFundAccountId: entity.fund_account?.id ?? null,
        payoutRazorpayContactId: entity.fund_account?.contact?.id ?? null,
        updatedAt: new Date(),
    };
}
