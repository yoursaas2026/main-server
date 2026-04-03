import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
});

export const paymentService = {
    async createOrder(amountInUSD: number, notes: Record<string, string>) {
        // Razorpay accepts amount in the smallest currency unit.
        // Assuming we are processing in INR, convert $ to ₹ roughly at 80, or just charge USD directly.
        // Let's use USD in Razorpay. Amount needs to be in cents.
        const options = {
            amount: amountInUSD * 100, // paise
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`,
            notes,
        };

        return await razorpay.orders.create(options);
    },

    verifyWebhookSignature(body: string, signature: string): boolean {
        const expectedSignature = crypto
            .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest('hex');

        return expectedSignature === signature;
    }
};
