export function parseJsonArray(value, fallback = []) {
    if (!value?.trim())
        return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    }
    catch {
        return fallback;
    }
}
export function parseSkills(value) {
    return parseJsonArray(value);
}
export function parseWorkExperiences(value) {
    return parseJsonArray(value);
}
export function parsePortfolioProjects(value) {
    return parseJsonArray(value);
}
export function parseServicesOffered(value) {
    if (!value?.trim())
        return [];
    const fromJson = parseJsonArray(value);
    if (fromJson.length > 0)
        return fromJson;
    return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
export function serializeServicesOffered(items) {
    const cleaned = items.map((s) => s.trim()).filter(Boolean);
    return JSON.stringify(cleaned);
}
export function parseExperienceYears(value) {
    if (value == null || value === "")
        return null;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}
export function toPublicExperiences(rows) {
    return rows.map((row) => ({
        title: row.title,
        company: row.company,
        period: [row.startDate, row.endDate].filter(Boolean).join(" — ") || "—",
        summary: row.description ?? "",
    }));
}
export function toPublicPortfolioProjects(rows) {
    return rows.map((row) => ({
        title: row.title,
        url: row.projectUrl || row.url || "",
        description: row.description ?? "",
    }));
}
