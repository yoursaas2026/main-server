import { Cashfree, CFEnvironment } from 'cashfree-pg';
import { Cashfree as CashfreePayout, CFEnvironment as PayoutCFEnvironment } from 'cashfree-payout';
import { env } from './env.js';

export const CASHFREE_PG_API_VERSION = '2023-08-01';
export const CASHFREE_PAYOUT_API_VERSION = '2024-01-01';

function pgEnvironment(): CFEnvironment {
    return env.CASHFREE_PG_ENV === 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
}

function payoutEnvironment(): PayoutCFEnvironment {
    return env.CASHFREE_PAYOUT_ENV === 'production' ? PayoutCFEnvironment.PRODUCTION : PayoutCFEnvironment.SANDBOX;
}

export const cashfreePg = new Cashfree(pgEnvironment(), env.CASHFREE_PG_CLIENT_ID, env.CASHFREE_PG_CLIENT_SECRET);

CashfreePayout.XClientId = env.CASHFREE_PAYOUT_CLIENT_ID;
CashfreePayout.XClientSecret = env.CASHFREE_PAYOUT_CLIENT_SECRET;
CashfreePayout.XEnvironment = payoutEnvironment();

export { CashfreePayout };

export function cashfreeCheckoutMode(): 'sandbox' | 'production' {
    return env.CASHFREE_PG_ENV === 'production' ? 'production' : 'sandbox';
}

export function paiseToInr(paise: number): number {
    return Math.round(paise) / 100;
}

export function inrToPaise(inr: number): number {
    return Math.round(inr * 100);
}
