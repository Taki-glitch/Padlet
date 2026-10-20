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
