import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { clients } from '../db/schema.js';

export type ClientOnboardingStatus = {
    intentComplete: boolean;
    billingComplete: boolean;
    canStartContract: boolean;
    missingIntentFields: string[];
    missingBillingFields: string[];
    onboardingCompletedAt: string | null;
};

function parseJsonArray(raw: string | null | undefined): unknown[] {
    if (!raw?.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function textFilled(value: string | null | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

export function buildClientOnboardingStatus(
    client: typeof clients.$inferSelect
): ClientOnboardingStatus {
    const goals = parseJsonArray(client.primaryGoals);
    const categories = parseJsonArray(client.interestedCategoryIds);
    const isBusiness = client.accountType === 'business';

    const intentChecks: { label: string; ok: boolean }[] = [
        { label: 'Account type', ok: client.accountType === 'business' || client.accountType === 'individual' },
        { label: 'Primary goal', ok: goals.length > 0 },
        { label: 'Categories of interest', ok: categories.length > 0 },
        { label: 'Industry', ok: textFilled(client.industry) },
        { label: 'Company size', ok: textFilled(client.companySize) },
        { label: 'Budget band', ok: textFilled(client.budgetBand) },
        { label: 'Timeline', ok: textFilled(client.timeline) },
        { label: 'Technical comfort', ok: textFilled(client.technicalComfort) },
    ];

    if (isBusiness) {
        intentChecks.push({ label: 'Company name', ok: textFilled(client.companyName) });
    }

    const intentComplete = intentChecks.every((c) => c.ok);
    const missingIntentFields = intentChecks.filter((c) => !c.ok).map((c) => c.label);

    const billingChecks: { label: string; ok: boolean }[] = [
        { label: 'Phone', ok: textFilled(client.phone) },
        { label: 'Country', ok: textFilled(client.country) },
        { label: 'Billing address', ok: textFilled(client.billingAddress) },
    ];

    if (isBusiness) {
        billingChecks.push({ label: 'Company name', ok: textFilled(client.companyName) });
    }

    const billingComplete = billingChecks.every((c) => c.ok);
    const missingBillingFields = billingChecks.filter((c) => !c.ok).map((c) => c.label);

    return {
        intentComplete,
        billingComplete,
        canStartContract: intentComplete && billingComplete,
        missingIntentFields,
        missingBillingFields,
        onboardingCompletedAt: client.onboardingCompletedAt?.toISOString() ?? null,
    };
}

export async function fetchClientOnboardingStatus(
    clientId: number
): Promise<ClientOnboardingStatus | null> {
    const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
    if (!client) return null;
    return buildClientOnboardingStatus(client);
}

export function contractOnboardingErrorMessage(status: ClientOnboardingStatus): string {
    const parts: string[] = [];
    if (!status.intentComplete) parts.push('complete your buyer preferences');
    if (!status.billingComplete) parts.push('add billing and contact details');
    return `Before starting a contract, ${parts.join(' and ')}.`;
}

export async function assertClientMayStartContract(
    c: Context,
    clientId: number
): Promise<Response | null> {
    const status = await fetchClientOnboardingStatus(clientId);
    if (!status) return c.json({ success: false, error: 'Client not found' }, 404);
    if (status.canStartContract) return null;

    return c.json(
        {
            success: false,
            error: contractOnboardingErrorMessage(status),
            code: 'CLIENT_ONBOARDING_INCOMPLETE',
            onboarding: status,
        },
        403
    );
}

export function parseClientJsonIds(raw: string | null | undefined): number[] {
    return parseJsonArray(raw)
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0);
}

export function serializeJsonArray(values: unknown[]): string {
    return JSON.stringify(values);
}
