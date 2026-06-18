import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { developers, developerPayments } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { paymentService } from '../../services/payment.service.js';
import { env } from '../../config/env.js';
import { cashfreeCheckoutMode } from '../../config/cashfree.js';
import { contractService } from '../../services/contract.service.js';

function planDates(billingCycle: string) {
    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }
    return { startDate, endDate };
}

async function applyDeveloperSubscription(input: {
    developerId: number;
    orderId: string;
    paymentId: string;
    plan: string;
    billingCycle: string;
}) {
    const [existing] = await db
        .select({ status: developerPayments.status })
        .from(developerPayments)
        .where(eq(developerPayments.orderId, input.orderId))
        .limit(1);

    if (existing?.status === 'completed') return;

    const { startDate, endDate } = planDates(input.billingCycle);

    await db
        .update(developers)
        .set({
            plan: input.plan,
            planBillingCycle: input.billingCycle,
            planStartDate: startDate,
            planEndDate: endDate,
            updatedAt: new Date(),
        })
        .where(eq(developers.id, input.developerId));

    await db
        .update(developerPayments)
        .set({ status: 'completed', paymentId: input.paymentId, completedAt: new Date() })
        .where(eq(developerPayments.orderId, input.orderId));
}

export class PaymentController {
    getPricing(c: Context) {
        return c.json({
            success: true,
            data: {
                pro: {
                    monthly: env.PRO_MONTHLY_PRICE,
                    yearly: env.PRO_YEARLY_PRICE,
                },
                ultimate: {
                    monthly: env.ULTIMATE_MONTHLY_PRICE,
                    yearly: env.ULTIMATE_YEARLY_PRICE,
                },
            },
        });
    }

    async createSubscriptionOrder(c: Context) {
        const jwtUser = c.get('user');
        if (!jwtUser || jwtUser.role !== 'developer') {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json().catch(() => null);
        if (!body || !body.plan || !body.billingCycle) {
            return c.json({ success: false, error: 'Plan and billing cycle required' }, 400);
        }

        const { plan, billingCycle } = body;
        let amount = 0;

        if (plan === 'pro') {
            amount = billingCycle === 'yearly' ? env.PRO_YEARLY_PRICE : env.PRO_MONTHLY_PRICE;
        } else if (plan === 'ultimate') {
            amount = billingCycle === 'yearly' ? env.ULTIMATE_YEARLY_PRICE : env.ULTIMATE_MONTHLY_PRICE;
        } else {
            return c.json({ success: false, error: 'Invalid plan selected' }, 400);
        }

        try {
            const [dev] = await db
                .select({ email: developers.email, phone: developers.phone, name: developers.name })
                .from(developers)
                .where(eq(developers.id, jwtUser.id))
                .limit(1);

            if (!dev) return c.json({ success: false, error: 'Developer not found' }, 404);

            const order = await paymentService.createSubscriptionOrder(
                amount,
                {
                    developerId: String(jwtUser.id),
                    plan: String(plan),
                    billingCycle: String(billingCycle),
                },
                {
                    id: `dev_${jwtUser.id}`,
                    phone: dev.phone ?? '9999999999',
                    email: dev.email,
                    name: dev.name ?? undefined,
                }
            );

            await db.insert(developerPayments).values({
                developerId: jwtUser.id,
                orderId: order.orderId,
                plan: String(plan),
                billingCycle: String(billingCycle),
                amount,
            });

            return c.json({
                success: true,
                data: {
                    orderId: order.orderId,
                    paymentSessionId: order.paymentSessionId,
                    amount: order.amount,
                    currency: order.currency,
                    cashfreeMode: cashfreeCheckoutMode(),
                },
            });
        } catch (error) {
            console.error('[Payment] createOrder error:', error);
            return c.json({ success: false, error: 'Failed to create payment order' }, 500);
        }
    }

    async verifyPaymentClientSide(c: Context) {
        const body = await c.req.json().catch(() => null);
        if (!body || !body.order_id) {
            return c.json({ success: false, error: 'Missing order id' }, 400);
        }

        const { order_id: orderId, plan, billingCycle } = body;

        try {
            const order = await paymentService.fetchOrder(orderId);
            if (order.order_status !== 'PAID') {
                return c.json({ success: false, error: 'Payment is not completed yet' }, 400);
            }

            const jwtUser = c.get('user');
            if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

            const paymentId = order.cf_order_id ? String(order.cf_order_id) : orderId;
            await applyDeveloperSubscription({
                developerId: jwtUser.id,
                orderId,
                paymentId,
                plan,
                billingCycle,
            });

            return c.json({ success: true, message: 'Payment verified and plan updated!' });
        } catch (err) {
            console.error('[Payment] client verification error:', err);
            return c.json({ success: false, error: 'Payment verification failed' }, 500);
        }
    }

    async cashfreeWebhook(c: Context) {
        let bodyString = '';
        try {
            bodyString = await c.req.text();
        } catch {
            return c.json({ error: 'Failed to read request body' }, 400);
        }

        if (!env.CASHFREE_PG_CLIENT_SECRET) {
            return c.json({ error: 'Cashfree PG not configured on server (CASHFREE_PG_CLIENT_SECRET)' }, 503);
        }

        const signature = c.req.header('x-webhook-signature');
        const timestamp = c.req.header('x-webhook-timestamp');
        if (!signature || !timestamp) {
            console.warn('[Payment] webhook missing signature headers');
            return c.json({ error: 'Missing x-webhook-signature or x-webhook-timestamp' }, 401);
        }

        let webhookEvent;
        try {
            webhookEvent = paymentService.verifyWebhookSignature(signature, bodyString, timestamp);
        } catch (err) {
            console.warn('[Payment] webhook signature mismatch:', err instanceof Error ? err.message : err);
            return c.json(
                {
                    error:
                        'Invalid PG webhook signature — use CASHFREE_PG_CLIENT_SECRET from the same Cashfree PG app (sandbox vs production must match)',
                },
                401
            );
        }

        try {
            const event = webhookEvent.object as {
                type?: string;
                data?: {
                    order?: { order_id?: string; order_tags?: Record<string, string> };
                    payment?: { cf_payment_id?: string | number; payment_amount?: number };
                };
            };

            const eventType = webhookEvent.type || event.type || '';
            if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'PAYMENT_SUCCESS') {
                const order = event.data?.order;
                const payment = event.data?.payment;
                if (!order?.order_id || !payment?.cf_payment_id) {
                    return c.json({ status: 'ok' });
                }

                const tags = order.order_tags ?? {};
                const paymentId = String(payment.cf_payment_id);
                const amountPaise = Math.round((payment.payment_amount ?? 0) * 100);

                if (tags.entityType === 'marketplace_contract' && tags.contractId) {
                    await contractService.onEscrowPaymentCaptured({
                        orderId: order.order_id,
                        paymentId,
                        amount: amountPaise,
                    });
                } else if (tags.entityType === 'developer_subscription' && tags.developerId && tags.plan && tags.billingCycle) {
                    await applyDeveloperSubscription({
                        developerId: parseInt(tags.developerId, 10),
                        orderId: order.order_id,
                        paymentId,
                        plan: tags.plan,
                        billingCycle: tags.billingCycle,
                    });
                }
            }

            return c.json({ status: 'ok' });
        } catch (error) {
            console.error('[Payment] webhook processing error:', error);
            return c.json({ error: 'Failed to process webhook' }, 500);
        }
    }
}

export const paymentController = new PaymentController();
