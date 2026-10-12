export type ClientNotificationPrefs = {
    emailUnreadDm: boolean;
    emailContractUpdates: boolean;
    emailMarketing: boolean;
};

export const DEFAULT_CLIENT_NOTIFICATION_PREFS: ClientNotificationPrefs = {
    emailUnreadDm: true,
    emailContractUpdates: true,
    emailMarketing: false,
};

export function parseClientNotificationPrefs(raw: string | null | undefined): ClientNotificationPrefs {
    if (!raw) return { ...DEFAULT_CLIENT_NOTIFICATION_PREFS };
    try {
        const parsed = JSON.parse(raw) as Partial<ClientNotificationPrefs>;
        return {
            emailUnreadDm:
                typeof parsed.emailUnreadDm === 'boolean'
                    ? parsed.emailUnreadDm
                    : DEFAULT_CLIENT_NOTIFICATION_PREFS.emailUnreadDm,
            emailContractUpdates:
                typeof parsed.emailContractUpdates === 'boolean'
                    ? parsed.emailContractUpdates
                    : DEFAULT_CLIENT_NOTIFICATION_PREFS.emailContractUpdates,
            emailMarketing:
                typeof parsed.emailMarketing === 'boolean'
                    ? parsed.emailMarketing
                    : DEFAULT_CLIENT_NOTIFICATION_PREFS.emailMarketing,
        };
    } catch {
        return { ...DEFAULT_CLIENT_NOTIFICATION_PREFS };
    }
}

export function serializeClientNotificationPrefs(prefs: ClientNotificationPrefs): string {
    return JSON.stringify({
        emailUnreadDm: !!prefs.emailUnreadDm,
        emailContractUpdates: !!prefs.emailContractUpdates,
        emailMarketing: !!prefs.emailMarketing,
    });
}
