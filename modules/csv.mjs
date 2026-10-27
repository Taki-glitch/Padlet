// Export CSV des fiches (séparateur « ; » et BOM UTF-8 : s'ouvre correctement dans Excel en français).
// Protection contre l'injection de formule (un texte commençant par = + - @ pourrait s'exécuter dans un tableur).
export function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns) {
    const lines = [columns.map((column) => csvCell(column.label)).join(";")];
    for (const row of rows) lines.push(columns.map((column) => csvCell(column.value(row))).join(";"));
    return `\ufeff${lines.join("\r\n")}\r\n`;
}

export const ITEM_COLUMNS = [
    { label: "Type", value: (item) => (item.type === "deadline" ? "Échéance" : "Document") },
    { label: "Titre", value: (item) => item.title },
    { label: "Thème", value: (item) => item.theme },
    { label: "Tags", value: (item) => item.tags },
    { label: "Collections", value: (item) => item.collections },
    { label: "Résumé", value: (item) => item.summary || item.description },
    { label: "Date", value: (item) => item.date },
    { label: "Expiration", value: (item) => item.expiresAt },
    { label: "Partagé", value: (item) => (item.shared === false ? "non" : "oui") },
    { label: "Statut", value: (item) => (item.type === "deadline" ? (item.done ? "terminée" : item.status === "inprogress" ? "en cours" : "à faire") : "") },
    { label: "Fichier", value: (item) => item.fileName },
    { label: "Taille (octets)", value: (item) => item.fileSize }
];

export const ACTIVITY_COLUMNS = [
    { label: "Date", value: (entry) => entry.atText },
    { label: "Action", value: (entry) => entry.action },
    { label: "Résultat", value: (entry) => entry.result },
    { label: "Élément", value: (entry) => entry.label || entry.resourceId },
    { label: "Nombre", value: (entry) => entry.count },
    { label: "Compte", value: (entry) => String(entry.userId || "").slice(0, 8) },
    { label: "Source", value: (entry) => entry.source || "navigateur" }
];
