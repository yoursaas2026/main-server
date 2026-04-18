import type { Context } from 'hono';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { developers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    async getBank(c: Context) {
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
                })
                .from(developers)
                .where(eq(developers.id, user.id))
                .limit(1);

            if (!row) return c.json({ success: false, error: 'Developer not found' }, 404);

            const num = row.payoutAccountNumber?.trim() ?? '';
            const accountNumberLastFour =
                num.length >= 4 ? num.slice(-4) : num.length > 0 ? num : null;

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
                },
            });
        } catch (err) {
            console.error('[DeveloperPayout] getBank error:', err);
            return c.json({ success: false, error: 'Failed to load payout bank details' }, 500);
        }
    }

    async putBank(c: Context) {
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

        const { country, accountHolderName, bankName, routingCode, accountType, accountNumber, confirmAccountNumber } =
            parsed.data;

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
                    updatedAt: new Date(),
                })
                .where(eq(developers.id, user.id));

            return c.json({ success: true, message: 'Payout bank details saved' });
        } catch (err) {
            console.error('[DeveloperPayout] putBank error:', err);
            return c.json({ success: false, error: 'Failed to save payout bank details' }, 500);
        }
    }
}

export const developerPayoutController = new DeveloperPayoutController();
