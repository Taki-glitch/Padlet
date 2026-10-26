// Schéma documenté des fiches `padletItems` (document ou échéance) et diagnostic en lecture seule.
// Sert à repérer, sans rien modifier, les fiches que les règles Firestore refuseraient d'écrire (ex. retentionMonths nul)
// et les champs inconnus, avant de durcir les règles (voir docs/AUDIT-0.12.md). Ne change aucune donnée.
import { ruleViolations } from "./rules-check.mjs";

export const ITEM_FIELDS = [
    "id", "type", "title", "theme", "tags", "collections", "summary", "content", "description",
    "date", "publishedAt", "retentionMonths", "expiresAt", "color",
    "fileUrl", "filePath", "fileName", "fileType", "fileSize", "sha256", "pdfText", "pdfTextStatus",
    "timelineDate", "timelineTitle", "timelineContent", "timelineColor",
    "shared", "sharedBeforeTrash", "deletedAt", "deletedBy",
    "done", "doneAt", "recurrence", "seriesId", "occurrence"
];
const KNOWN = new Set(ITEM_FIELDS);

export const unknownFields = (item) => Object.keys(item || {}).filter((key) => !KNOWN.has(key));

export function auditItems(entries) {
    const problems = [];
    const counts = { total: entries.length, ruleProblems: 0, unknown: 0, missingShared: 0 };
    for (const item of entries) {
        const issues = [];
        const violations = ruleViolations(item);
        if (violations.length) { counts.ruleProblems += 1; issues.push(...violations.map((entry) => `règles Firestore : ${entry}`)); }
        const unknown = unknownFields(item);
        if (unknown.length) { counts.unknown += 1; issues.push(`champ(s) inconnu(s) : ${unknown.slice(0, 5).join(", ")}`); }
        if (typeof item.shared !== "boolean") { counts.missingShared += 1; issues.push("état de partage absent"); }
        if (issues.length) problems.push({ id: item.id, title: item.title || item.id, issues });
    }
    return { counts, problems };
}
