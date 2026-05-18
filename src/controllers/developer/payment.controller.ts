import type { Context } from 'hono';
import { db } from '../../db/index.js';
import { developers, developerPayments } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { paymentService } from '../../services/payment.service.js';
import { env } from '../../config/env.js';
import { developerPayoutController } from './payout.controller.js';
import type { FundAccountValidationEntity } from '../../services/razorpay-x-validation.service.js';
import { contractService } from '../../services/contract.service.js';

export class PaymentController {
    // ── Get Pricing Information ────────────────────────────────────────────────
    getPricing(c: Context) {
        return c.json({
            success: true,
            data: {
                pro: {
                    monthly: env.PRO_MONTHLY_PRICE,
                    yearly: env.PRO_YEARLY_PRICE
                },
                ultimate: {
                    monthly: env.ULTIMATE_MONTHLY_PRICE,
                    yearly: env.ULTIMATE_YEARLY_PRICE
                }
            }
        });
    }

    // ── Create Razorpay Order ──────────────────────────────────────────────────
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
            const order = await paymentService.createOrder(amount, {
                developerId: String(jwtUser.id),
                plan: String(plan),
                billingCycle: String(billingCycle),
            });

            await db.insert(developerPayments).values({
                developerId: jwtUser.id,
                orderId: order.id,
                plan: String(plan),
                billingCycle: String(billingCycle),
                amount: amount,
            });

            return c.json({
                success: true,
                data: {
                    orderId: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    key: env.RAZORPAY_KEY_ID // send key for frontend to initiate payment
                }
            });
        } catch (error) {
            console.error('[Payment] createOrder error:', error);
            return c.json({ success: false, error: 'Failed to create payment order' }, 500);
        }
    }

    // ── Pre-Webhook Quick Verification (Optional/Fallback) ────────────────────
    async verifyPaymentClientSide(c: Context) {
        // Sometimes webhooks are delayed, we can optionally have the client call this
        // to immediately mark payment successful if signature matches.
        const body = await c.req.json().catch(() => null);
        if (!body || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
            return c.json({ success: false, error: 'Missing payment details' }, 400);
        }

        // Validate client signature using key secret
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, billingCycle } = body;
        
        try {
            const expectedSignature = crypto
                .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                return c.json({ success: false, error: 'Invalid payment signature' }, 400);
            }

            const jwtUser = c.get('user');
            if (!jwtUser) return c.json({ success: false, error: 'Unauthorized' }, 401);

            const { startDate, endDate } = (() => {
                const s = new Date();
                const e = new Date();
                billingCycle === 'yearly' ? e.setFullYear(e.getFullYear() + 1) : e.setMonth(e.getMonth() + 1);
                return { startDate: s, endDate: e };
            })();

            // Update plan immediately for responsive UI
            await db.update(developers)
                .set({
                    plan: plan,
                    planBillingCycle: billingCycle,
                    planStartDate: startDate,
                    planEndDate: endDate,
                    updatedAt: new Date()
                })
                .where(eq(developers.id, jwtUser.id));

            await db.update(developerPayments)
                .set({ status: 'completed', paymentId: razorpay_payment_id, completedAt: new Date() })
                .where(eq(developerPayments.orderId, razorpay_order_id));

            return c.json({ success: true, message: 'Payment verified and plan updated!' });
        } catch(err) {
             console.error('[Payment] client verification error:', err);
             return c.json({ success: false, error: 'Payment verification failed' }, 500);
        }
    }

    // ── Razorpay Webhook Endpoint ─────────────────────────────────────────────
    async razorpayWebhook(c: Context) {
        // We get raw body for signature verification
        let bodyString = '';
        try {
            bodyString = await c.req.text();
        } catch (e) {
            return c.json({ error: 'Failed to read request body' }, 400);
        }

        const signature = c.req.header('x-razorpay-signature');
        if (!signature || !paymentService.verifyWebhookSignature(bodyString, signature)) {
            return c.json({ error: 'Invalid webhook signature' }, 401);
        }

        try {
            const event = JSON.parse(bodyString);
            
            // Handle Payment Captured
            if (event.event === 'payment.captured') {
                const payment = event.payload.payment.entity;
                const { notes } = payment;

                if (notes && notes.entityType === 'marketplace_contract' && notes.contractId) {
                    await contractService.onEscrowPaymentCaptured({
                        orderId: payment.order_id,
                        paymentId: payment.id,
                        amount: typeof payment.amount === 'number' ? payment.amount : parseInt(String(payment.amount), 10),
                    });
                } else if (notes && notes.developerId && notes.plan && notes.billingCycle) {
                    const devId = parseInt(notes.developerId, 10);
                    const { startDate, endDate } = (() => {
                        const s = new Date();
                        const e = new Date();
                        notes.billingCycle === 'yearly' ? e.setFullYear(e.getFullYear() + 1) : e.setMonth(e.getMonth() + 1);
                        return { startDate: s, endDate: e };
                    })();

                    await db.update(developers)
                        .set({
                            plan: notes.plan,
                            planBillingCycle: notes.billingCycle,
                            planStartDate: startDate,
                            planEndDate: endDate,
                            updatedAt: new Date()
                        })
                        .where(eq(developers.id, devId));

                    await db.update(developerPayments)
                        .set({ status: 'completed', paymentId: payment.id, completedAt: new Date() })
                        .where(eq(developerPayments.orderId, payment.order_id));
                }
            }

            const validationEvents = new Set(['fund_account.validation.completed', 'fund_account.validation.failed']);
            if (validationEvents.has(event.event)) {
                const payload = event.payload as Record<string, { entity?: FundAccountValidationEntity }> | undefined;
                const wrap = payload?.['fund_account.validation'];
                const validationEntity = wrap?.entity;
                if (validationEntity) {
                    await developerPayoutController.applyValidationFromWebhookEntity(validationEntity);
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
