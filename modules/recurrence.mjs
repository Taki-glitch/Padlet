// Échéances récurrentes. Une échéance terminée crée la suivante (identifiant déterministe : jamais de doublon, même en cas de double clic
// ou de nouvelle tentative). Le jour du mois d'origine (anchorDay) est conservé pour éviter la dérive 31 → 28 → 28.
export const RECURRENCES = { week: "Chaque semaine", month: "Chaque mois", year: "Chaque année" };
const CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();   // month : 1-12

export function parseCivil(value) {
    const match = CIVIL.exec(String(value ?? ""));
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month) ? { year, month, day } : null;
}

export function addPeriod(date, every, anchorDay) {
    const d = parseCivil(date);
    if (!d || !Object.hasOwn(RECURRENCES, every)) return null;
    if (every === "week") return new Date(Date.UTC(d.year, d.month - 1, d.day + 7)).toISOString().slice(0, 10);
    const total = d.year * 12 + (d.month - 1) + (every === "month" ? 1 : 12);
    const year = Math.floor(total / 12), month = (total % 12) + 1;
    const day = Math.min(Number(anchorDay) || d.day, daysIn(year, month));
    return `${year}-${pad(month)}-${pad(day)}`;
}

export function recurrenceFor({ every, until }, date) {
    if (!every) return null;
    if (!Object.hasOwn(RECURRENCES, every)) return { error: "Répétition invalide." };
    const start = parseCivil(date);
    if (!start) return { error: "Indiquez d’abord la date de l’échéance pour la répéter." };
    if (until) {
        if (!parseCivil(until)) return { error: "Date de fin de répétition invalide." };
        if (until < date) return { error: "La date de fin de répétition doit être après la date de l’échéance." };
    }
    return { recurrence: { every, ...(until ? { until } : {}), anchorDay: start.day } };
}

// Prochaine occurrence d'une échéance récurrente : { id, date, occurrence } ou null (pas de récurrence, ou série terminée).
export function nextOccurrence(item) {
    const rule = item?.recurrence;
    if (!rule || !Object.hasOwn(RECURRENCES, rule.every)) return null;
    const date = addPeriod(item.date, rule.every, rule.anchorDay);
    if (!date || (rule.until && date > rule.until)) return null;
    const occurrence = (Number(item.occurrence) || 0) + 1, series = item.seriesId || item.id;
    return { id: `${series}-${occurrence}`, date, occurrence };
}

export function buildNextItem(item, next) {
    return {
        type: "deadline", title: item.title || "Échéance", date: next.date, color: item.color || "#f97316", description: item.description || "",
        shared: item.shared !== false, recurrence: item.recurrence, seriesId: item.seriesId || item.id, occurrence: next.occurrence
    };
}
