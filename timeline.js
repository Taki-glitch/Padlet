import { parseCivilDate } from "../supabase/functions/_shared/expiration.mjs";

const dateParts = (date) => ({ year: date.getFullYear(), month: date.getMonth(), day: date.getDate() });
const utcDay = (date) => {
    const { year, month, day } = dateParts(date);
    return Date.UTC(year, month, day);
};
const dateValue = (year, month, day) => `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function buildTimelineTicks(start, end, scale) {
    const ticks = [];
    if (scale === "year") {
        const { year } = dateParts(start);
        for (let month = 0; month < 12; month += 1) {
            ticks.push({ date: dateValue(year, month, 1), month, day: 1 });
        }
        return ticks;
    }
    const { year, month } = dateParts(start);
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day += 7) {
        ticks.push({ date: dateValue(year, month, day), month, day });
    }
    return ticks;
}

export function timelineDateRatio(value, start, end) {
    const date = parseCivilDate(value);
    if (!date) return null;
    const startDay = utcDay(start);
    const endDay = utcDay(end);
    if (endDay <= startDay) return null;
    const dateDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return (dateDay - startDay) / (endDay - startDay);
}

// Année théocratique : du 1er septembre au 31 août (2026-2027 = 01/09/2026 → 31/08/2027).
export function theocraticYearStart(value) {
    const date = parseCivilDate(value);
    if (!date) return null;
    return date.getUTCMonth() + 1 >= 9 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export function timelineGroup(value, mode) {
    const date = parseCivilDate(value);
    if (!date) return null;
    if (mode === "month") {
        const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
        return { key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, label: label.charAt(0).toUpperCase() + label.slice(1) };
    }
    if (mode === "theocratic") {
        const start = theocraticYearStart(value);
        return { key: String(start), label: `Année théocratique ${start}-${start + 1}` };
    }
    return null;
}
