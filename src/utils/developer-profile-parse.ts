export type StoredWorkExperience = {
    id?: string;
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    description?: string;
};

export type StoredPortfolioProject = {
    id?: string;
    title: string;
    projectUrl?: string;
    url?: string;
    description?: string;
};

export type PublicWorkExperience = {
    title: string;
    company: string;
    period: string;
    summary: string;
};

export type PublicPortfolioProject = {
    title: string;
    url: string;
    description: string;
};

export function parseJsonArray<T>(value: string | null | undefined, fallback: T[] = []): T[] {
    if (!value?.trim()) return fallback;
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
        return fallback;
    }
}

export function parseSkills(value: string | null | undefined): string[] {
    return parseJsonArray<string>(value);
}

export function parseWorkExperiences(value: string | null | undefined): StoredWorkExperience[] {
    return parseJsonArray<StoredWorkExperience>(value);
}

export function parsePortfolioProjects(value: string | null | undefined): StoredPortfolioProject[] {
    return parseJsonArray<StoredPortfolioProject>(value);
}

export function parseServicesOffered(value: string | null | undefined): string[] {
    if (!value?.trim()) return [];
    const fromJson = parseJsonArray<string>(value);
    if (fromJson.length > 0) return fromJson;
    return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

export function serializeServicesOffered(items: string[]): string {
    const cleaned = items.map((s) => s.trim()).filter(Boolean);
    return JSON.stringify(cleaned);
}

export function parseExperienceYears(value: string | number | null | undefined): number | null {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export function toPublicExperiences(rows: StoredWorkExperience[]): PublicWorkExperience[] {
    return rows.map((row) => ({
        title: row.title,
        company: row.company,
        period: [row.startDate, row.endDate].filter(Boolean).join(" — ") || "—",
        summary: row.description ?? "",
    }));
}

export function toPublicPortfolioProjects(rows: StoredPortfolioProject[]): PublicPortfolioProject[] {
    return rows.map((row) => ({
        title: row.title,
        url: row.projectUrl || row.url || "",
        description: row.description ?? "",
    }));
}
