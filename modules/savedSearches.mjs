// Recherches enregistrées : réglées par utilisateur, stockées dans le navigateur (localStorage), jamais envoyées au serveur.
export const SAVED_SEARCH_MAX = 20;
const clip = (value, max) => String(value ?? "").slice(0, max);

export function sanitizeSaved(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set(), clean = [];
    for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const name = clip(raw.name, 60).trim();
        if (!name || seen.has(name.toLocaleLowerCase("fr-FR"))) continue;
        seen.add(name.toLocaleLowerCase("fr-FR"));
        clean.push({ name, query: clip(raw.query, 200), theme: clip(raw.theme, 120), tag: clip(raw.tag, 120), collection: clip(raw.collection, 120), favorites: raw.favorites === "favorites" ? "favorites" : "", sort: clip(raw.sort, 30) || "date-desc" });
        if (clean.length >= SAVED_SEARCH_MAX) break;
    }
    return clean;
}

// Remplace une recherche du même nom (casse ignorée). Retourne { list } ou { error }.
export function addSaved(list, entry) {
    const name = clip(entry?.name, 60).trim();
    if (!name) return { error: "Donnez un nom à la recherche." };
    const hasCriteria = Boolean(String(entry.query ?? "").trim() || entry.theme || entry.tag || entry.collection || entry.favorites || (entry.sort && entry.sort !== "date-desc"));
    if (!hasCriteria) return { error: "Aucun critère à enregistrer : saisissez une recherche ou choisissez un filtre." };
    const key = name.toLocaleLowerCase("fr-FR");
    const others = sanitizeSaved(list).filter((item) => item.name.toLocaleLowerCase("fr-FR") !== key);
    if (others.length >= SAVED_SEARCH_MAX) return { error: `Limite de ${SAVED_SEARCH_MAX} recherches enregistrées atteinte.` };
    return { list: sanitizeSaved([...others, { ...entry, name }]).sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" })) };
}

export function removeSaved(list, name) {
    const key = String(name ?? "").toLocaleLowerCase("fr-FR");
    return sanitizeSaved(list).filter((item) => item.name.toLocaleLowerCase("fr-FR") !== key);
}
