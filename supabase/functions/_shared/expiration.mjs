export function parseCivilDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(year, month - 1, day);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

export function isCivilDate(value) {
    return parseCivilDate(value) !== null;
}

export function addRetentionMonths(dateValue, months) {
    const source = parseCivilDate(dateValue);
    if (!source || !Number.isSafeInteger(months) || months < 1) return null;
    const year = source.getUTCFullYear();
    const monthIndex = source.getUTCMonth() + months;
    const targetYear = year + Math.floor(monthIndex / 12);
    const targetMonth = monthIndex % 12;
    if (targetYear > 9999) return null;
    const firstTargetDay = new Date(0);
    firstTargetDay.setUTCHours(0, 0, 0, 0);
    firstTargetDay.setUTCFullYear(targetYear, targetMonth, 1);
    const lastDay = new Date(firstTargetDay);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    firstTargetDay.setUTCDate(Math.min(source.getUTCDate(), lastDay.getUTCDate()));
    return firstTargetDay.toISOString().slice(0, 10);
}

export function isDueForPurge(expiresAt, utcToday) {
    return isCivilDate(expiresAt) && isCivilDate(utcToday) && expiresAt < utcToday;
}

export function daysUntil(dateValue, now = new Date()) {
    const target = parseCivilDate(dateValue);
    if (!target) return null;
    const today = new Date(0);
    today.setUTCHours(0, 0, 0, 0);
    today.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function dateLabel(dateValue, locale = "fr-FR") {
    const parsed = parseCivilDate(dateValue);
    return parsed ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(parsed) : "Date non renseignée";
}
