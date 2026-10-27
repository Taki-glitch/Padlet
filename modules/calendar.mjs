// Calendrier mensuel des échéances et expirations (semaines du lundi au dimanche). Calculs purs, dates civiles AAAA-MM-JJ.
const CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");
const iso = (date) => date.toISOString().slice(0, 10);
export const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function isCivil(value) {
    const m = CIVIL.exec(String(value ?? ""));
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Événements du calendrier : échéances non terminées + expirations de documents.
export function calendarEvents(items) {
    const events = [];
    for (const item of items || []) {
        if (item?.type === "deadline" && item.done !== true && isCivil(item.date)) events.push({ id: item.id, title: item.title || "Échéance", date: item.date, kind: "deadline", inProgress: item.status === "inprogress" });
        else if (item?.type === "document" && isCivil(item.expiresAt)) events.push({ id: item.id, title: item.title || "Sans titre", date: item.expiresAt, kind: "expiry" });
    }
    return events;
}

export const shiftMonth = (year, month, delta) => { const t = year * 12 + (month - 1) + delta; return { year: Math.floor(t / 12), month: (t % 12) + 1 }; };

// month : 1-12. Retourne { label, weeks: [[{ date, day, inMonth, today, events }]] } (6 semaines maximum).
export function monthGrid(year, month, events, today = "") {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7;   // lundi = 0
    const start = new Date(Date.UTC(year, month - 1, 1 - offset));
    const byDate = new Map();
    for (const event of events) { if (!byDate.has(event.date)) byDate.set(event.date, []); byDate.get(event.date).push(event); }
    const weeks = [];
    for (let w = 0; w < 6; w += 1) {
        const week = [];
        for (let d = 0; d < 7; d += 1) {
            const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + w * 7 + d));
            const key = iso(date);
            week.push({ date: key, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1, today: key === today, events: byDate.get(key) || [] });
        }
        if (w >= 4 && !week.some((cell) => cell.inMonth)) break;   // pas de semaine entièrement hors du mois
        weeks.push(week);
    }
    return { label: `${MONTHS[month - 1]} ${year}`, weeks };
}
