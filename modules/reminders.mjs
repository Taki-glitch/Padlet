// Rappels : échéances dépassées ou proches, statut « à faire / en cours / terminée », rappel de sauvegarde.
import { isCivil } from "./calendar.mjs";
const DAY = 86400000;
const toUtc = (value) => Date.UTC(...String(value).split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)));

export function deadlineStatus(item) {
    if (item?.done === true) return "done";
    return item?.status === "inprogress" ? "inprogress" : "todo";
}
export const STATUS_LABELS = { todo: "À faire", inprogress: "En cours", done: "Terminée" };

// today : AAAA-MM-JJ. Les échéances terminées ne comptent pas ; « en retard » = date passée, « proches » = aujourd'hui à +soonDays.
export function reminderSummary(items, today, soonDays = 7) {
    const summary = { overdue: 0, soon: 0, expiringSoon: 0 };
    if (!isCivil(today)) return summary;
    for (const item of items || []) {
        if (item?.type === "deadline" && item.done !== true && isCivil(item.date)) {
            const days = Math.round((toUtc(item.date) - toUtc(today)) / DAY);
            if (days < 0) summary.overdue += 1; else if (days <= soonDays) summary.soon += 1;
        } else if (item?.type === "document" && isCivil(item.expiresAt)) {
            const days = Math.round((toUtc(item.expiresAt) - toUtc(today)) / DAY);
            if (days >= 0 && days <= soonDays) summary.expiringSoon += 1;
        }
    }
    return summary;
}

export function reminderMessage({ overdue, soon, expiringSoon }) {
    const parts = [];
    if (overdue) parts.push(`${overdue} échéance${overdue > 1 ? "s" : ""} dépassée${overdue > 1 ? "s" : ""}`);
    if (soon) parts.push(`${soon} échéance${soon > 1 ? "s" : ""} dans les 7 jours`);
    if (expiringSoon) parts.push(`${expiringSoon} document${expiringSoon > 1 ? "s" : ""} expirant dans les 7 jours`);
    return parts.join(" · ");
}

// Rappel de sauvegarde : lastBackupMs = date de la dernière sauvegarde enregistrée au journal (ou null).
export function backupReminder(lastBackupMs, nowMs, maxDays = 7) {
    if (!lastBackupMs) return "Aucune sauvegarde n’est enregistrée au journal : pensez à en faire une (Paramètres → Sauvegarde).";
    const days = Math.floor((nowMs - lastBackupMs) / DAY);
    return days > maxDays ? `Dernière sauvegarde il y a ${days} jours : pensez à en refaire une.` : "";
}
