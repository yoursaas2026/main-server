import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    contractAmendments,
    contractDisputes,
    contractEvents,
    contractPayments,
    contracts,
    developerProducts,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { paymentService } from './payment.service.js';
import { notifyContractParties } from './contract-stream.service.js';

export const ContractStatus = {
    PENDING_DEVELOPER_ACCEPTANCE: 'pending_developer_acceptance',
    REJECTED_BY_DEVELOPER: 'rejected_by_developer',
    AWAITING_CLIENT_PAYMENT: 'awaiting_client_payment',
    AWAITING_AMENDMENT_PAYMENT: 'awaiting_amendment_payment',
    ACTIVE: 'active',
    SUBMITTED: 'submitted',
    DISPUTED: 'disputed',
    COMPLETED: 'completed',
    CANCELLED_BY_CLIENT: 'cancelled_by_client',
} as const;

export type ContractStatusType = (typeof ContractStatus)[keyof typeof ContractStatus];

/** Standard non-refundable processing fee on gross contract value (2.36%). Not env-driven. */
export const CLIENT_NON_REFUNDABLE_FEE_BPS = 236;

function bps(amount: number, bpsValue: number): number {
    return Math.round((amount * bpsValue) / 10000);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function computeContractAmounts(grossPaise: number): { nonRefundableFeePaise: number; escrowAmountPaise: number } {
    const nonRefundableFeePaise = bps(grossPaise, CLIENT_NON_REFUNDABLE_FEE_BPS);
    const escrowAmountPaise = Math.max(0, grossPaise - nonRefundableFeePaise);
    return { nonRefundableFeePaise, escrowAmountPaise };
}

/** Split of escrow on successful completion (same math as `settleCompleted`). */
export function escrowCompletionSplit(
    escrowAmountPaise: number,
    platformCommissionPercent: number
): { developerPaise: number; platformFromEscrowPaise: number } {
    const platformFromEscrow = Math.round((escrowAmountPaise * platformCommissionPercent) / 100);
    const platformFromEscrowPaise = Math.min(escrowAmountPaise, Math.max(0, platformFromEscrow));
    const developerPaise = escrowAmountPaise - platformFromEscrowPaise;
    return { developerPaise, platformFromEscrowPaise };
}

/** Gross → fee + escrow + estimated completion split (for checkout UI). */
export function contractCheckoutBreakdown(grossPaise: number, platformCommissionPercent: number) {
    const { nonRefundableFeePaise, escrowAmountPaise } = computeContractAmounts(grossPaise);
    const split = escrowCompletionSplit(escrowAmountPaise, platformCommissionPercent);
    return {
        grossPaise,
        nonRefundableFeePaise,
        escrowAmountPaise,
        developerOnCompletionPaise: split.developerPaise,
        platformFromEscrowOnCompletionPaise: split.platformFromEscrowPaise,
    };
}

/** API/UI helper — mirrors stored contract amounts + completion split (and optional ledger totals). */
export function buildContractSettlementPreview(contract: {
    status: string;
    escrowAmountPaise: number;
    grossAmountPaise: number;
    nonRefundableFeePaise: number;
    developerReleasedPaise: number | null;
    platformReleasedPaise: number | null;
}) {
    const platformPct = env.CONTRACT_PLATFORM_COMMISSION_PERCENT;
    const split = escrowCompletionSplit(contract.escrowAmountPaise, platformPct);
    const completed = contract.status === ContractStatus.COMPLETED;
    return {
        platformCommissionPercent: platformPct,
        developerEscrowSplitPercent: 100 - platformPct,
        nonRefundableFeeBps: CLIENT_NON_REFUNDABLE_FEE_BPS,
        grossAmountPaise: contract.grossAmountPaise,
        nonRefundableFeePaise: contract.nonRefundableFeePaise,
        escrowAmountPaise: contract.escrowAmountPaise,
        estimatedDeveloperOnCompletionPaise: split.developerPaise,
        estimatedPlatformFromEscrowPaise: split.platformFromEscrowPaise,
        recordedDeveloperReleasedPaise: completed ? contract.developerReleasedPaise : null,
        recordedPlatformReleasedPaise: completed ? contract.platformReleasedPaise : null,
        note: completed
            ? 'Ledger totals reflect how this contract was settled. Estimated split is what the current escrow balance would pay on a standard completion.'
            : 'Assumes successful completion without dispute. The processing fee is non-refundable and is not part of the escrow split.',
    };
}

type TierRow = { id?: string; fixedPriceInr?: number | null };

/**
 * Gross contract amount in paise (INR) from the listing’s customization tiers (`fixedPriceInr` = whole rupees).
 * Pro tier may omit price — then `quotedGrossPaise` must be supplied (agreed quote in paise).
 */
export function resolveGrossPaiseFromListingTiers(
    customizationTiersJson: string | null | undefined,
    planTier: string,
    quotedGrossPaise?: number | null
): number {
    const tierId = planTier.trim().toLowerCase();
    if (!tierId) throw new Error('Select a package (base, plus, or pro).');

    const tiers = parseJson<TierRow[]>(customizationTiersJson, []);
    const tier = tiers.find((t) => String(t.id || '').toLowerCase() === tierId);
    if (!tier) {
        throw new Error(
            `This listing does not define a “${tierId}” package. The seller sets Base / Plus / Pro pricing on the listing.`
        );
    }

    if (tier.fixedPriceInr != null && tier.fixedPriceInr > 0) {
        return Math.round(tier.fixedPriceInr * 100);
    }

    if (tierId === 'pro' && quotedGrossPaise != null && quotedGrossPaise >= 100) {
        return quotedGrossPaise;
    }

    throw new Error(
        'This Pro package is quoted per scope on the listing. Enter the agreed total in INR on the contract form, or ask the seller to set a fixed Pro price on the listing.'
    );
}

async function logEvent(
    contractId: number,
    from: string | null,
    to: string,
    actorRole: string,
    actorId: number | null,
    meta?: Record<string, unknown>
) {
    await db.insert(contractEvents).values({
        contractId,
        fromStatus: from,
        toStatus: to,
        actorRole,
        actorId: actorId ?? undefined,
        metaJson: meta ? JSON.stringify(meta) : undefined,
    });
}

async function notify(contractId: number, text: string) {
    const [row] = await db
        .select({ clientId: contracts.clientId, developerId: contracts.developerId })
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
    if (row) await notifyContractParties(row.clientId, row.developerId, text);
}

export const contractService = {
    async getByPublicId(publicId: string) {
        const [c] = await db.select().from(contracts).where(eq(contracts.publicId, publicId)).limit(1);
        return c ?? null;
    },

    async listForClient(clientId: number, productId?: number) {
        const cond = productId
            ? and(eq(contracts.clientId, clientId), eq(contracts.productId, productId))
            : eq(contracts.clientId, clientId);
        return db.select().from(contracts).where(cond).orderBy(desc(contracts.createdAt));
    },

    async listForDeveloper(developerId: number, productId?: number) {
        const cond = productId
            ? and(eq(contracts.developerId, developerId), eq(contracts.productId, productId))
            : eq(contracts.developerId, developerId);
        return db.select().from(contracts).where(cond).orderBy(desc(contracts.createdAt));
    },

    async createContract(input: {
        clientId: number;
        productId: number;
        scopeText: string;
        deadlineAt: Date;
        /** Required for Pro custom quotes when the listing has no `fixedPriceInr` on the Pro tier. */
        quotedGrossPaise?: number | null;
        planTier: string;
    }) {
        const [product] = await db
            .select({
                id: developerProducts.id,
                developerId: developerProducts.developerId,
                name: developerProducts.name,
                customizationTiers: developerProducts.customizationTiers,
                listingStatus: developerProducts.listingStatus,
            })
            .from(developerProducts)
            .where(eq(developerProducts.id, input.productId))
            .limit(1);
        if (!product) throw new Error('Product not found');
        if ((product.listingStatus || '').toLowerCase() !== 'live') {
            throw new Error('Contracts can only be started on live marketplace listings.');
        }

        const gross = resolveGrossPaiseFromListingTiers(
            product.customizationTiers,
            input.planTier,
            input.quotedGrossPaise ?? null
        );
        if (gross < 100) throw new Error('Invalid contract amount');

        const { nonRefundableFeePaise, escrowAmountPaise } = computeContractAmounts(gross);
        const publicId = randomUUID();

        const [inserted] = await db
            .insert(contracts)
            .values({
                publicId,
                clientId: input.clientId,
                developerId: product.developerId,
                productId: product.id,
                status: ContractStatus.PENDING_DEVELOPER_ACCEPTANCE,
                planTier: input.planTier.trim().toLowerCase(),
                scopeText: input.scopeText,
                deadlineAt: input.deadlineAt,
                grossAmountPaise: gross,
                nonRefundableFeePaise,
                escrowAmountPaise,
                currency: 'INR',
            })
            .returning();

        const c = inserted!;
        await logEvent(c.id, null, c.status, 'client', input.clientId, { publicId });
        await notify(
            c.id,
            `📄 New contract #${publicId.slice(0, 8)} for "${product.name}" — pending your acceptance. Amount (incl. fees): ₹${(gross / 100).toFixed(2)}`
        );
        return c;
    },

    async developerAccept(contractId: number, developerId: number) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c || c.developerId !== developerId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) throw new Error('Invalid state for acceptance');

        const next = ContractStatus.AWAITING_CLIENT_PAYMENT;
        await db
            .update(contracts)
            .set({
                status: next,
                lockedFieldsAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, contractId));

        await logEvent(contractId, c.status, next, 'developer', developerId);
        await notify(
            contractId,
            `✅ Contract #${c.publicId.slice(0, 8)} accepted by developer. Please complete escrow payment to activate.`
        );
    },

    async developerReject(contractId: number, developerId: number) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c || c.developerId !== developerId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) throw new Error('Invalid state');

        const next = ContractStatus.REJECTED_BY_DEVELOPER;
        await db.update(contracts).set({ status: next, updatedAt: new Date() }).where(eq(contracts.id, contractId));
        await logEvent(contractId, c.status, next, 'developer', developerId);
        await notify(contractId, `❌ Contract #${c.publicId.slice(0, 8)} was declined by the developer.`);
    },

    async clientCancelBeforeAccept(contractId: number, clientId: number) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.PENDING_DEVELOPER_ACCEPTANCE) throw new Error('Only pending contracts can be cancelled this way');

        const next = ContractStatus.CANCELLED_BY_CLIENT;
        await db.update(contracts).set({ status: next, updatedAt: new Date() }).where(eq(contracts.id, contractId));
        await logEvent(contractId, c.status, next, 'client', clientId);
        await notify(contractId, `🛑 Contract #${c.publicId.slice(0, 8)} cancelled by client before acceptance.`);
    },

    async createInitialEscrowOrder(contractPublicId: string, clientId: number) {
        const c = await this.getByPublicId(contractPublicId);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.AWAITING_CLIENT_PAYMENT) throw new Error('Contract is not awaiting payment');

        const order = await paymentService.createContractOrder(c.grossAmountPaise, {
            contractPublicId: c.publicId,
            contractId: String(c.id),
            clientId: String(c.clientId),
            purpose: 'initial_escrow',
        });

        await db.insert(contractPayments).values({
            contractId: c.id,
            purpose: 'initial_escrow',
            orderId: order.id,
            amountPaise: c.grossAmountPaise,
            status: 'created',
        });

        return { orderId: order.id as string, amount: order.amount, currency: order.currency, contract: c };
    },

    async onEscrowPaymentCaptured(input: { orderId: string; paymentId: string; amount: number }) {
        const [pay] = await db.select().from(contractPayments).where(eq(contractPayments.orderId, input.orderId)).limit(1);
        if (!pay) return;

        await db
            .update(contractPayments)
            .set({ status: 'completed', paymentId: input.paymentId, completedAt: new Date() })
            .where(eq(contractPayments.id, pay.id));

        const [c] = await db.select().from(contracts).where(eq(contracts.id, pay.contractId)).limit(1);
        if (!c) return;

        if (pay.purpose === 'initial_escrow') {
            if (c.status !== ContractStatus.AWAITING_CLIENT_PAYMENT) return;
            const next = ContractStatus.ACTIVE;
            await db.update(contracts).set({ status: next, updatedAt: new Date() }).where(eq(contracts.id, c.id));
            await logEvent(c.id, c.status, next, 'system', null, { paymentId: input.paymentId });
            await notify(c.id, `💰 Escrow funded. Contract #${c.publicId.slice(0, 8)} is now **active**. Work may begin.`);
            return;
        }

        if (pay.purpose === 'amendment' && pay.amendmentId) {
            const [am] = await db.select().from(contractAmendments).where(eq(contractAmendments.id, pay.amendmentId)).limit(1);
            if (!am || am.status !== 'awaiting_payment') return;

            await db
                .update(contractAmendments)
                .set({ status: 'applied', appliedAt: new Date() })
                .where(eq(contractAmendments.id, am.id));

            const nextV = c.version + 1;
            await db
                .update(contracts)
                .set({
                    scopeText: am.scopeText,
                    deadlineAt: am.deadlineAt,
                    grossAmountPaise: c.grossAmountPaise + am.additionalAmountPaise,
                    escrowAmountPaise: c.escrowAmountPaise + am.additionalAmountPaise,
                    version: nextV,
                    status: ContractStatus.ACTIVE,
                    updatedAt: new Date(),
                })
                .where(eq(contracts.id, c.id));

            await logEvent(c.id, c.status, ContractStatus.ACTIVE, 'system', null, { amendmentId: am.id, paymentId: input.paymentId });
            await notify(c.id, `📝 Amendment #${am.amendmentNumber} paid and applied. Contract is active again (v${nextV}).`);
        }
    },

    async submitDeliverables(contractId: number, developerId: number, deliverablesText: string) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c || c.developerId !== developerId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.ACTIVE) throw new Error('Only active contracts can be submitted');
        if (!deliverablesText.trim()) throw new Error('Deliverables are required');

        const days = Math.max(1, env.CONTRACT_CLIENT_DECISION_DAYS);
        const decisionDue = new Date();
        decisionDue.setDate(decisionDue.getDate() + days);

        const next = ContractStatus.SUBMITTED;
        await db
            .update(contracts)
            .set({
                status: next,
                deliverablesText: deliverablesText.trim(),
                submittedAt: new Date(),
                clientDecisionDeadlineAt: decisionDue,
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, contractId));

        await logEvent(contractId, c.status, next, 'developer', developerId, {});
        await notify(
            contractId,
            `📦 Developer submitted deliverables for #${c.publicId.slice(0, 8)}. Please accept, request revision, or open a dispute within ${days} days.`
        );
    },

    async clientAcceptCompletion(contractPublicId: string, clientId: number) {
        const c = await this.getByPublicId(contractPublicId);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.SUBMITTED) throw new Error('Contract is not awaiting your decision');

        await this.settleCompleted(c.id);
    },

    async clientRequestRevision(contractPublicId: string, clientId: number, note?: string) {
        const c = await this.getByPublicId(contractPublicId);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.SUBMITTED) throw new Error('Invalid state');

        const next = ContractStatus.ACTIVE;
        await db
            .update(contracts)
            .set({
                status: next,
                submittedAt: null,
                clientDecisionDeadlineAt: null,
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, c.id));

        await logEvent(c.id, c.status, next, 'client', clientId, { note });
        await notify(c.id, `🔁 Client requested revisions on #${c.publicId.slice(0, 8)}.${note ? ` Note: ${note}` : ''}`);
    },

    async clientOpenDispute(contractPublicId: string, clientId: number, reason: string) {
        const c = await this.getByPublicId(contractPublicId);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        if (c.status !== ContractStatus.SUBMITTED) throw new Error('Disputes can be opened after submission');

        await db.insert(contractDisputes).values({
            contractId: c.id,
            openedByClient: true,
            reason: reason.trim(),
            status: 'open',
        });

        const next = ContractStatus.DISPUTED;
        await db
            .update(contracts)
            .set({ status: next, escrowFrozen: true, updatedAt: new Date() })
            .where(eq(contracts.id, c.id));

        await logEvent(c.id, c.status, next, 'client', clientId, { reason });
        await notify(c.id, `⚠️ Client opened a dispute on #${c.publicId.slice(0, 8)}. Funds are frozen pending admin review.`);
    },

    async maybeAutoCompleteClientDeadline(contractId: number) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c || c.status !== ContractStatus.SUBMITTED || !c.clientDecisionDeadlineAt) return;
        if (new Date(c.clientDecisionDeadlineAt).getTime() > Date.now()) return;

        await this.settleCompleted(contractId, 'auto_complete_client_inactive');
    },

    async settleCompleted(contractId: number, reason: string = 'client_accepted') {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
        if (!c) return;
        if (c.status === ContractStatus.COMPLETED) return;
        if (c.status !== ContractStatus.SUBMITTED) throw new Error('Contract cannot be completed from this state');

        const platformPct = env.CONTRACT_PLATFORM_COMMISSION_PERCENT;
        const { developerPaise: devShare, platformFromEscrowPaise: platShare } = escrowCompletionSplit(
            c.escrowAmountPaise,
            platformPct
        );

        const next = ContractStatus.COMPLETED;
        await db
            .update(contracts)
            .set({
                status: next,
                completedAt: new Date(),
                developerReleasedPaise: devShare,
                platformReleasedPaise: platShare + c.nonRefundableFeePaise,
                payoutNotes: JSON.stringify({
                    reason,
                    escrowSplit: {
                        developerPaise: devShare,
                        platformFromEscrowPaise: platShare,
                        platformCommissionPercent: platformPct,
                    },
                    nonRefundableFeePaise: c.nonRefundableFeePaise,
                    note: 'Ledger only — configure RazorpayX payouts to move developer share to seller bank.',
                }),
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, contractId));

        await logEvent(contractId, c.status, next, reason === 'auto_complete_client_inactive' ? 'system' : 'client', null, {
            reason,
        });
        await notify(
            contractId,
            `🎉 Contract #${c.publicId.slice(0, 8)} marked **completed**. From escrow: developer ₹${(devShare / 100).toFixed(2)} (${100 - platformPct}%), platform ₹${(platShare / 100).toFixed(2)} (${platformPct}%).`
        );
    },

    async proposeAmendment(input: {
        contractId: number;
        actorClientId?: number;
        actorDeveloperId?: number;
        scopeText: string;
        deadlineAt: Date;
        additionalAmountPaise: number;
    }) {
        const [c] = await db.select().from(contracts).where(eq(contracts.id, input.contractId)).limit(1);
        if (!c) throw new Error('Contract not found');
        if (c.status !== ContractStatus.ACTIVE) throw new Error('Amendments only while active');

        const proposedByClient = Boolean(input.actorClientId);
        if (proposedByClient && input.actorClientId !== c.clientId) throw new Error('Forbidden');
        if (!proposedByClient && input.actorDeveloperId !== c.developerId) throw new Error('Forbidden');

        const proposerId = proposedByClient ? input.actorClientId! : input.actorDeveloperId!;
        const [lastAm] = await db
            .select()
            .from(contractAmendments)
            .where(eq(contractAmendments.contractId, c.id))
            .orderBy(desc(contractAmendments.amendmentNumber))
            .limit(1);
        const nextNum = (lastAm?.amendmentNumber ?? 0) + 1;

        const [am] = await db
            .insert(contractAmendments)
            .values({
                contractId: c.id,
                amendmentNumber: nextNum,
                proposedByClient: proposedByClient,
                proposerId,
                scopeText: input.scopeText,
                deadlineAt: input.deadlineAt,
                additionalAmountPaise: Math.max(0, input.additionalAmountPaise),
                status: 'pending_counterparty',
            })
            .returning();

        await logEvent(c.id, c.status, c.status, proposedByClient ? 'client' : 'developer', proposerId, {
            amendmentId: am!.id,
        });
        await notify(c.id, `📝 Amendment #${nextNum} proposed for #${c.publicId.slice(0, 8)} — awaiting other party.`);
        return am!;
    },

    async approveAmendment(amendmentId: number, actorClientId?: number, actorDeveloperId?: number) {
        const [am] = await db.select().from(contractAmendments).where(eq(contractAmendments.id, amendmentId)).limit(1);
        if (!am || am.status !== 'pending_counterparty') throw new Error('Invalid amendment');

        const [c] = await db.select().from(contracts).where(eq(contracts.id, am.contractId)).limit(1);
        if (!c) throw new Error('Contract missing');

        if (am.proposedByClient && actorDeveloperId !== c.developerId) throw new Error('Only developer can approve');
        if (!am.proposedByClient && actorClientId !== c.clientId) throw new Error('Only client can approve');

        if (am.additionalAmountPaise > 0) {
            await db
                .update(contractAmendments)
                .set({ status: 'awaiting_payment', counterpartyApprovedAt: new Date() })
                .where(eq(contractAmendments.id, amendmentId));

            const order = await paymentService.createContractOrder(am.additionalAmountPaise, {
                contractPublicId: c.publicId,
                contractId: String(c.id),
                amendmentId: String(am.id),
                clientId: String(c.clientId),
                purpose: 'amendment',
            });

            await db
                .update(contractAmendments)
                .set({ razorpayOrderId: order.id as string })
                .where(eq(contractAmendments.id, amendmentId));

            await db.insert(contractPayments).values({
                contractId: c.id,
                amendmentId: am.id,
                purpose: 'amendment',
                orderId: order.id as string,
                amountPaise: am.additionalAmountPaise,
                status: 'created',
            });

            await db
                .update(contracts)
                .set({ status: ContractStatus.AWAITING_AMENDMENT_PAYMENT, updatedAt: new Date() })
                .where(eq(contracts.id, c.id));

            await logEvent(c.id, c.status, ContractStatus.AWAITING_AMENDMENT_PAYMENT, am.proposedByClient ? 'developer' : 'client', actorDeveloperId ?? actorClientId!, { amendmentId });
            await notify(c.id, `💳 Amendment #${am.amendmentNumber} approved — please pay additional ₹${(am.additionalAmountPaise / 100).toFixed(2)} to apply changes.`);
            return { needsPayment: true as const, orderId: order.id as string, amount: order.amount, currency: order.currency };
        }

        await db
            .update(contractAmendments)
            .set({ status: 'applied', counterpartyApprovedAt: new Date(), appliedAt: new Date() })
            .where(eq(contractAmendments.id, amendmentId));

        const nextV = c.version + 1;
        await db
            .update(contracts)
            .set({
                scopeText: am.scopeText,
                deadlineAt: am.deadlineAt,
                version: nextV,
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, c.id));

        await logEvent(c.id, c.status, c.status, am.proposedByClient ? 'developer' : 'client', actorDeveloperId ?? actorClientId!, { amendmentApplied: amendmentId });
        await notify(c.id, `📝 Amendment #${am.amendmentNumber} applied (no extra payment). Contract v${nextV}.`);
        return { needsPayment: false as const };
    },

    async createAmendmentEscrowOrder(contractPublicId: string, clientId: number, amendmentId: number) {
        const c = await this.getByPublicId(contractPublicId);
        if (!c || c.clientId !== clientId) throw new Error('Contract not found');
        const [am] = await db
            .select()
            .from(contractAmendments)
            .where(and(eq(contractAmendments.id, amendmentId), eq(contractAmendments.contractId, c.id)))
            .limit(1);
        if (!am || am.status !== 'awaiting_payment' || !am.razorpayOrderId) throw new Error('Amendment not awaiting this payment');

        return {
            orderId: am.razorpayOrderId,
            amount: am.additionalAmountPaise,
            currency: 'INR',
            contract: c,
        };
    },

    async listEvents(contractId: number) {
        return db.select().from(contractEvents).where(eq(contractEvents.contractId, contractId)).orderBy(desc(contractEvents.createdAt));
    },

    async listDisputesForAdmin() {
        return db
            .select()
            .from(contractDisputes)
            .where(eq(contractDisputes.status, 'open'))
            .orderBy(desc(contractDisputes.createdAt));
    },

    async resolveDispute(input: {
        disputeId: number;
        adminId: number;
        refundClientPaise: number;
        releaseDeveloperPaise: number;
        retainPlatformPaise: number;
        adminResolution: string;
    }) {
        const [d] = await db.select().from(contractDisputes).where(eq(contractDisputes.id, input.disputeId)).limit(1);
        if (!d || d.status !== 'open') throw new Error('Dispute not found');

        const [c] = await db.select().from(contracts).where(eq(contracts.id, d.contractId)).limit(1);
        if (!c) throw new Error('Contract missing');

        const total = input.refundClientPaise + input.releaseDeveloperPaise + input.retainPlatformPaise;
        if (total > c.escrowAmountPaise + c.nonRefundableFeePaise) throw new Error('Resolution amounts exceed recorded contract funds');

        await db
            .update(contractDisputes)
            .set({
                status: 'resolved',
                adminResolution: input.adminResolution,
                refundClientPaise: input.refundClientPaise,
                releaseDeveloperPaise: input.releaseDeveloperPaise,
                retainPlatformPaise: input.retainPlatformPaise,
                resolvedAt: new Date(),
                resolvedByAdminId: input.adminId,
            })
            .where(eq(contractDisputes.id, d.id));

        await db
            .update(contracts)
            .set({
                status: ContractStatus.COMPLETED,
                escrowFrozen: false,
                completedAt: new Date(),
                developerReleasedPaise: input.releaseDeveloperPaise,
                platformReleasedPaise: input.retainPlatformPaise + c.nonRefundableFeePaise,
                payoutNotes: JSON.stringify({
                    disputeResolution: true,
                    refundClientPaise: input.refundClientPaise,
                    releaseDeveloperPaise: input.releaseDeveloperPaise,
                    retainPlatformPaise: input.retainPlatformPaise,
                }),
                updatedAt: new Date(),
            })
            .where(eq(contracts.id, c.id));

        await logEvent(c.id, c.status, ContractStatus.COMPLETED, 'admin', input.adminId, { disputeId: d.id });
        await notify(c.id, `⚖️ Dispute resolved by platform for #${c.publicId.slice(0, 8)}. See contract for settlement breakdown.`);
    },

    async listAmendments(contractId: number) {
        return db.select().from(contractAmendments).where(eq(contractAmendments.contractId, contractId)).orderBy(desc(contractAmendments.createdAt));
    },
};
