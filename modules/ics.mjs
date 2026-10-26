// Export iCalendar (RFC 5545) : fichier .ics à importer à la main. Ce n'est PAS une synchronisation.
// Événements « journée entière » (DTSTART;VALUE=DATE), sans fuseau horaire : la date civile saisie est conservée.
import { isCivilDate } from "../supabase/functions/_shared/expiration.mjs";

const encoder = new TextEncoder();

export function escapeIcsText(value) {
    return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

// Pliage à 75 octets UTF-8 sans couper un caractère (accents, émojis).
export function foldIcsLine(line) {
    if (encoder.encode(line).length <= 75) return line;
    const parts = []; let current = ""; let size = 0; let limit = 75;
    for (const character of line) {
        const bytes = encoder.encode(character).length;
        if (size + bytes > limit) { parts.push(current); current = ""; size = 0; limit = 74; }
        current += character; size += bytes;
    }
    parts.push(current);
    return parts.join("\r\n ");
}

function compact(date) { return date.replace(/-/g, ""); }
function nextDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
function stamp(now) { return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

// Règle iCalendar d'une échéance récurrente. Limite : un « chaque mois le 31 » saute les mois courts dans l'agenda,
// alors que l'application recule au dernier jour du mois.
const FREQ = { week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };
function rruleFor(rule) {
    if (!rule || !FREQ[rule.every]) return "";
    return `FREQ=${FREQ[rule.every]}${isCivilDate(rule.until) ? `;UNTIL=${compact(rule.until)}` : ""}`;
}

// items = fiches actives (hors corbeille). Retourne les événements exportables ; ignore les dates invalides.
export function buildCalendarEvents(items) {
    const events = [], skipped = [];
    for (const item of items || []) {
        if (!item?.id) continue;
        if (item.type === "deadline") {
            if (item.done === true) continue;   // échéance terminée : pas exportée
            if (isCivilDate(item.date)) events.push({ uid: `deadline-${item.recurrence ? item.seriesId || item.id : item.id}@padlet`, date: item.date, summary: item.title || "Échéance", description: item.description || "", rrule: rruleFor(item.recurrence) });
            else skipped.push(item.title || item.id);
        } else if (item.type === "document" && item.expiresAt) {
            if (isCivilDate(item.expiresAt)) events.push({ uid: `expiry-${item.id}@padlet`, date: item.expiresAt, summary: `Expiration : ${item.title || "Sans titre"}`, description: "Fin de la durée de conservation du document." });
            else skipped.push(item.title || item.id);
        }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
    return { events, skipped };
}

export function buildIcs(events, now = new Date()) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Padlet//Echeances//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Padlet"];
    for (const event of events) {
        lines.push("BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stamp(now)}`,
            `DTSTART;VALUE=DATE:${compact(event.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(event.date))}`,
            ...(event.rrule ? [`RRULE:${event.rrule}`] : []),
            `SUMMARY:${escapeIcsText(event.summary)}`);
        if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
        lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
