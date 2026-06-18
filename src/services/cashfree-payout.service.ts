import type { Beneficiary, CreateBeneficiaryRequest, CreateTransferResponse } from 'cashfree-payout';
import { CashfreePayout, CASHFREE_PAYOUT_API_VERSION, paiseToInr } from '../config/cashfree.js';
import { env } from '../config/env.js';

export type CashfreeBeneficiaryResult = {
    beneficiaryId: string;
    status: string;
    accountStatus: string | null;
    details: string | null;
};

function parseCashfreeError(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
        const data = (err as { response?: { data?: { message?: string } } }).response?.data;
        if (data?.message) return data.message;
    }
    return err instanceof Error ? err.message : 'Cashfree payout request failed';
}

function mapBeneficiaryStatus(beneficiary: Beneficiary): CashfreeBeneficiaryResult {
    const status = beneficiary.beneficiary_status ?? 'INITIATED';
    const accountStatus = status === 'VERIFIED' ? 'valid' : status === 'INVALID' || status === 'FAILED' ? 'invalid' : null;
    let details: string | null = null;
    if (status === 'VERIFIED') {
        details = 'Bank account verified with Cashfree Payouts.';
    } else if (status === 'INVALID' || status === 'FAILED') {
        details = `Beneficiary status: ${status}`;
    } else if (status === 'INITIATED') {
        details = 'Verification in progress.';
    }

    return {
        beneficiaryId: beneficiary.beneficiary_id ?? '',
        status: status === 'VERIFIED' ? 'completed' : status === 'INITIATED' ? 'created' : 'failed',
        accountStatus,
        details,
    };
}

export function mapBeneficiaryToPayoutColumns(beneficiary: Beneficiary) {
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
    isConfigured(): boolean {
        return Boolean(env.CASHFREE_PAYOUT_CLIENT_ID && env.CASHFREE_PAYOUT_CLIENT_SECRET);
    },

    beneficiaryIdForDeveloper(developerId: number): string {
        return `ys_dev_${developerId}`.slice(0, 50);
    },

    async createOrVerifyBeneficiary(input: {
        developerId: number;
        accountHolderName: string;
        ifsc: string;
        accountNumber: string;
        email: string;
        phoneDigits: string;
    }): Promise<CashfreeBeneficiaryResult> {
        if (!this.isConfigured()) {
            throw new Error('Cashfree Payouts are not configured (client id / secret missing).');
        }

        const beneficiaryId = this.beneficiaryIdForDeveloper(input.developerId);
        const body: CreateBeneficiaryRequest = {
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
        } catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },

    async fetchBeneficiary(beneficiaryId: string): Promise<CashfreeBeneficiaryResult> {
        if (!this.isConfigured()) {
            throw new Error('Cashfree Payouts are not configured on the server.');
        }
        try {
            const response = await CashfreePayout.PayoutFetchBeneficiary(
                CASHFREE_PAYOUT_API_VERSION,
                undefined,
                beneficiaryId
            );
            return mapBeneficiaryStatus(response.data);
        } catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },

    async createTransfer(input: {
        beneficiaryId: string;
        amountPaise: number;
        transferId: string;
        remarks: string;
    }): Promise<CreateTransferResponse> {
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
        } catch (err) {
            throw new Error(parseCashfreeError(err));
        }
    },
};
