// Réconciliation en lecture seule entre les fiches Firestore (actives et en corbeille) et les objets Supabase Storage.
const unsafe = (path) => typeof path !== "string" || path.startsWith("/") || path.includes("..") || path.includes("\\");

export function reconcile({ items, objects, now = new Date(), graceHours = 24 }) {
    const referenced = items.filter((item) => item.filePath);
    if (!objects.length && referenced.some((item) => !unsafe(item.filePath) && !item.filePath.startsWith("padlet-files/"))) {
        throw new Error("Le listage du stockage ne renvoie aucun fichier (droits de lecture ?) : analyse annulée pour éviter de faux résultats.");
    }
    const report = { missingFile: [], orphanFiles: [], recentUnreferenced: [], invalidPath: [], duplicatePath: [], legacyRefs: [] };
    const paths = new Set(objects.map((object) => object.path)), byPath = new Map();
    const ref = (item) => ({ id: item.id, title: item.title || "", filePath: item.filePath, trashed: Boolean(item.deletedAt) });
    for (const item of referenced) {
        if (unsafe(item.filePath)) { report.invalidPath.push(ref(item)); continue; }
        if (item.filePath.startsWith("padlet-files/")) { report.legacyRefs.push(ref(item)); continue; }
        if (!byPath.has(item.filePath)) byPath.set(item.filePath, []);
        byPath.get(item.filePath).push(item);
        if (!paths.has(item.filePath)) report.missingFile.push(ref(item));
    }
    for (const [filePath, list] of byPath) if (list.length > 1) report.duplicatePath.push({ filePath, ids: list.map((item) => item.id) });
    for (const object of objects) {
        if (byPath.has(object.path)) continue;
        const created = Date.parse(object.createdAt);
        const recent = Number.isFinite(created) && now.getTime() - created < graceHours * 3600000;
        (recent ? report.recentUnreferenced : report.orphanFiles).push({ path: object.path, size: object.size || 0 });
    }
    return report;
}
