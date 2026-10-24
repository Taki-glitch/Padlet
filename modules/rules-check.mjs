// Miroir côté navigateur de validItem() dans firestore.rules, pour dire POURQUOI une écriture serait refusée
// (« Missing or insufficient permissions » ne dit rien). tests/phase7.test.mjs compare ces limites au fichier de règles.
export const STRING_LIMITS = {
    title: 300, theme: 120, summary: 20000, content: 100000, description: 20000, timelineTitle: 300, timelineContent: 20000,
    fileName: 300, filePath: 400, fileUrl: 2048, fileType: 150, date: 10, timelineDate: 10, color: 20, timelineColor: 20,
    pdfText: 20000, pdfTextStatus: 10
};
const has = (data, key) => Object.prototype.hasOwnProperty.call(data, key);
const length = (text) => [...text].length;

// Les règles valident le document RÉSULTANT de l'écriture : un champ déjà trop long dans une ancienne fiche bloque
// donc aussi une modification sans rapport (y compris l'indexation d'un PDF).
export function ruleViolations(data) {
    const problems = [];
    for (const [key, max] of Object.entries(STRING_LIMITS)) {
        if (!has(data, key)) continue;
        if (typeof data[key] !== "string") problems.push(`« ${key} » n’est pas du texte`);
        else if (length(data[key]) > max) problems.push(`« ${key} » dépasse ${max} caractères (${length(data[key])})`);
    }
    if (has(data, "type") && !["document", "deadline"].includes(data.type)) problems.push("« type » inconnu");
    if (has(data, "tags")) {
        const ok = (Array.isArray(data.tags) && data.tags.length <= 50) || (typeof data.tags === "string" && length(data.tags) <= 2000);
        if (!ok) problems.push("« tags » invalide ou trop long");
    }
    if (has(data, "retentionMonths")) {
        const value = data.retentionMonths;
        const ok = (typeof value === "number" && value >= 0 && value <= 600) || (typeof value === "string" && length(value) <= 4);
        if (!ok) problems.push("« retentionMonths » hors limites");
    }
    if (has(data, "fileSize") && !(typeof data.fileSize === "number" && data.fileSize >= 0 && data.fileSize <= 52428800)) problems.push("« fileSize » hors limites (50 Mio max)");
    return problems;
}

// Les règles refusent « retentionMonths: null » (ni nombre ni texte) alors que l'ancien formulaire l'enregistrait quand la durée
// de conservation était vide. Une telle fiche ne pouvait donc plus être modifiée, mise à la corbeille ni indexée. Liste des champs
// à SUPPRIMER (deleteField) dans l'écriture, qu'ils soient nuls dans l'écriture ou déjà nuls dans la fiche enregistrée.
export const NULL_FORBIDDEN_FIELDS = ["retentionMonths"];
export function nullFieldsToDelete(stored = {}, patch = {}) {
    return NULL_FORBIDDEN_FIELDS.filter((key) => (has(patch, key) ? patch[key] : stored?.[key]) === null);
}
// Document tel qu'il serait après l'écriture (pour le pré-contrôle) : champs nuls interdits retirés.
export function effectiveDocument(stored = {}, patch = {}) {
    const result = { ...stored, ...patch };
    for (const key of nullFieldsToDelete(stored, patch)) delete result[key];
    return result;
}
