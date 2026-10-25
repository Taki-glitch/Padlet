// Actions groupées : calculs purs (la boucle d'écriture, la confirmation et le bilan sont dans script.js).
const fold = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");

export function cleanBulkText(value, max) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Les tags sont stockés en une chaîne « a, b, c ». Ajoute un tag sans doublon (casse et accents ignorés), 50 tags maximum.
export function addTag(tags, tag) {
    const clean = cleanBulkText(String(tag ?? "").replace(/,/g, " "), 60);
    const list = String(tags ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
    if (!clean) return { tags: list.join(", "), changed: false, error: "Saisissez un tag." };
    if (list.some((entry) => fold(entry) === fold(clean))) return { tags: list.join(", "), changed: false };
    if (list.length >= 50) return { tags: list.join(", "), changed: false, error: "Cette fiche a déjà 50 tags." };
    return { tags: [...list, clean].join(", "), changed: true };
}

export function bulkSummary({ done, unchanged, failures }) {
    const parts = [`${done} modifié${done > 1 ? "s" : ""}`];
    if (unchanged) parts.push(`${unchanged} déjà à jour`);
    if (failures.length) parts.push(`${failures.length} échec${failures.length > 1 ? "s" : ""} (${failures.slice(0, 5).map((title) => `« ${title} »`).join(", ")}${failures.length > 5 ? "…" : ""})`);
    return `${parts.join(" · ")}.`;
}
