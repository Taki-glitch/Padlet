// Aide à la recherche : indique dans quels champs NON affichés sur la carte un terme a été trouvé.
// Même normalisation que filteredItems() (script.js) : casse et accents ignorés. Aucune expression régulière :
// les caractères spéciaux saisis par l'utilisateur sont comparés tels quels.
export function foldSearchText(value = "") {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

export function searchTerms(query = "") {
    return foldSearchText(query).trim().split(/\s+/).filter(Boolean);
}

// Champs indexés par la recherche mais invisibles (ou non surlignés) sur la carte. Le titre et le résumé sont surlignés.
const HIDDEN_FIELDS = [
    ["theme", "thème"], ["tags", "tags"], ["collections", "collections"], ["content", "contenu"], ["description", "description"],
    ["fileName", "nom du fichier"], ["fileType", "type de fichier"], ["date", "date"],
    ["publishedAt", "date d’ajout"], ["expiresAt", "date d’expiration"], ["retentionMonths", "durée de conservation"]
];

export function hiddenMatchFields(item, terms) {
    if (!item || !terms?.length) return [];
    const visible = foldSearchText(`${item.title ?? ""} ${item.summary ?? ""}`);
    if (terms.every((term) => visible.includes(term))) return [];
    return HIDDEN_FIELDS
        .filter(([key]) => {
            const value = item[key];
            if (value === null || value === undefined || value === "") return false;
            const folded = foldSearchText(Array.isArray(value) ? value.join(" ") : value);
            return terms.some((term) => folded.includes(term));
        })
        .map(([, label]) => label);
}
