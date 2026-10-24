// Détection de doublons à l'envoi d'un fichier : avertissement uniquement, jamais de suppression automatique.
// « identique » = même empreinte SHA-256 (contenu réel). « probable » = fiche ancienne sans empreinte, même nom ET même taille.
export async function sha256Hex(buffer) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function findDuplicates(items, candidate, excludeId = "") {
    const name = String(candidate?.fileName ?? "").toLocaleLowerCase("fr-FR");
    const found = [];
    for (const item of items || []) {
        if (item.type !== "document" || !item.filePath || item.id === excludeId) continue;
        if (item.sha256 && candidate?.sha256) { if (item.sha256 === candidate.sha256) found.push({ item, certainty: "identique" }); continue; }
        if (!item.sha256 && name && Number(candidate?.fileSize) > 0
            && String(item.fileName ?? "").toLocaleLowerCase("fr-FR") === name && Number(item.fileSize) === Number(candidate.fileSize)) found.push({ item, certainty: "probable" });
    }
    return found.sort((a, b) => (a.certainty === b.certainty ? 0 : a.certainty === "identique" ? -1 : 1));
}
