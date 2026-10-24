// Calculs du tableau de bord (purs, testables). Les entrées sont des fiches déjà autorisées et non supprimées.
export function themeCounts(documents, { emptyLabel = "Sans thème", limit = 8 } = {}) {
    const counts = new Map();
    for (const item of documents) {
        const theme = String(item.theme ?? "").trim() || emptyLabel;
        counts.set(theme, (counts.get(theme) || 0) + 1);
    }
    return [...counts].map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "fr", { sensitivity: "base" })).slice(0, limit);
}

export function largestFiles(documents, limit = 5) {
    return documents.filter((item) => Number.isFinite(item.fileSize) && item.fileSize > 0)
        .sort((a, b) => b.fileSize - a.fileSize || String(a.title || "").localeCompare(String(b.title || ""), "fr")).slice(0, limit);
}

const DAY = 86400000;
const civil = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? Date.UTC(...String(value).split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0))) : NaN;
// Échéances dont la date est passée depuis au plus `windowDays` jours (aujourd'hui exclu), la plus récente d'abord.
export function overdueDeadlines(entries, today, dateOf, windowDays = 30) {
    const now = civil(today);
    return entries.map((item) => ({ item, late: Math.round((now - civil(dateOf(item))) / DAY) }))
        .filter(({ late }) => Number.isFinite(late) && late >= 1 && late <= windowDays)
        .sort((a, b) => a.late - b.late).map(({ item, late }) => ({ ...item, daysLate: late }));
}
