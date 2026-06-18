import crypto from 'crypto';
import type { CreateOrderRequest, CustomerDetails, OrderEntity } from 'cashfree-pg';
import { cashfreePg, paiseToInr } from '../config/cashfree.js';
import { env } from '../config/env.js';

export type PaymentCustomer = {
    id: string;
    phone: string;
    email?: string;
    name?: string;
};

export type PaymentOrderResult = {
    orderId: string;
    paymentSessionId: string;
    amount: number;
    currency: string;
};

function makeOrderId(prefix: string): string {
    const suffix = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${Date.now()}_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 45);
}

function customerDetails(customer: PaymentCustomer): CustomerDetails {
    const phone = customer.phone.replace(/\D/g, '').slice(-10) || '9999999999';
    return {
        customer_id: customer.id.slice(0, 50),
        customer_phone: phone,
        customer_email: customer.email,
        customer_name: customer.name,
    };
}

function mapOrderEntity(entity: OrderEntity, amountPaise: number): PaymentOrderResult {
    const orderId = entity.order_id;
    const paymentSessionId = entity.payment_session_id;
    if (!orderId || !paymentSessionId) {
        throw new Error('Cashfree order response missing order_id or payment_session_id');
    }
    return {
        orderId,
        paymentSessionId,
        amount: amountPaise,
        currency: entity.order_currency || 'INR',
    };
}

async function createPgOrder(input: {
    amountPaise: number;
    orderTags: Record<string, string>;
    customer: PaymentCustomer;
    orderNote?: string;
    returnUrl?: string;
}): Promise<PaymentOrderResult> {
    if (!env.CASHFREE_PG_CLIENT_ID || !env.CASHFREE_PG_CLIENT_SECRET) {
        throw new Error('Cashfree Payment Gateway is not configured on the server.');
    }

    const orderId = makeOrderId(input.orderTags.entityType === 'marketplace_contract' ? 'ys_ctr' : 'ys_sub');
    const request: CreateOrderRequest = {
        order_id: orderId,
        order_amount: paiseToInr(input.amountPaise),
        order_currency: 'INR',
        customer_details: customerDetails(input.customer),
        order_tags: input.orderTags,
        order_note: input.orderNote,
        order_meta: input.returnUrl
            ? {
                  notify_url: `${env.API_PUBLIC_ORIGIN}/api/developer/payment/webhook/cashfree`,
                  return_url: input.returnUrl,
              }
            : {
                  notify_url: `${env.API_PUBLIC_ORIGIN}/api/developer/payment/webhook/cashfree`,
              },
    };

    const response = await cashfreePg.PGCreateOrder(request);
    return mapOrderEntity(response.data, input.amountPaise);
}

export const paymentService = {
    async createSubscriptionOrder(amountInr: number, tags: Record<string, string>, customer: PaymentCustomer) {
        const amountPaise = Math.round(amountInr * 100);
        return createPgOrder({
            amountPaise,
            orderTags: { ...tags, entityType: 'developer_subscription' },
            customer,
            orderNote: 'YourSaaS developer plan',
            returnUrl: `${env.DEVELOPER_PORTAL_URL}/dashboard/upgrade`,
        });
    },

    /** Marketplace contract escrow — amount in paise (INR). */
    async createContractOrder(amountPaise: number, tags: Record<string, string>, customer: PaymentCustomer) {
        return createPgOrder({
            amountPaise,
            orderTags: { ...tags, entityType: 'marketplace_contract' },
            customer,
            orderNote: 'YourSaaS marketplace escrow',
            returnUrl: `${env.USER_PORTAL_URL}/dashboard/contracts/${tags.contractPublicId ?? ''}`,
        });
    },

    async fetchOrder(orderId: string): Promise<OrderEntity> {
        const response = await cashfreePg.PGFetchOrder(orderId);
        return response.data;
    },

    async getCheckoutSessionForOrder(orderId: string, fallbackAmountPaise: number): Promise<PaymentOrderResult> {
        const entity = await this.fetchOrder(orderId);
        if (!entity.payment_session_id) {
            throw new Error('Cashfree order has no active payment session. Create a new order.');
        }
        const amountPaise =
            entity.order_amount != null ? Math.round(entity.order_amount * 100) : fallbackAmountPaise;
        return mapOrderEntity(entity, amountPaise);
    },

    verifyWebhookSignature(signature: string, rawBody: string, timestamp: string) {
        return cashfreePg.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    },

    /** Partial or full refund on a captured payment (amount in paise). */
    async refundPayment(orderId: string, amountPaise: number, note?: string) {
        if (!orderId) throw new Error('Order id required for refund');
        if (amountPaise <= 0) throw new Error('Refund amount must be positive');

        const refundId = `rfnd_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`.slice(0, 40);
        const response = await cashfreePg.PGOrderCreateRefund(orderId, {
            refund_amount: paiseToInr(amountPaise),
            refund_id: refundId,
            refund_note: note ?? 'contract_settlement',
        });
        return response.data;
    },
};
