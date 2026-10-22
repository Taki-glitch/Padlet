// Fichiers : politique d'envoi (taille, extensions, signature du contenu) et résolution d'URL signées avec cache.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Extensions acceptées. Adaptez cette liste après avoir fait l'inventaire de vos documents (voir docs/SECURITE.md).
export const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "csv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "zip", "mp3", "m4a", "mp4"];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const SIGNATURES = { pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], png: [[0x89, 0x50, 0x4e, 0x47]], jpg: [[0xff, 0xd8, 0xff]], jpeg: [[0xff, 0xd8, 0xff]], gif: [[0x47, 0x49, 0x46, 0x38]], webp: [[0x52, 0x49, 0x46, 0x46]],
    docx: [ZIP], xlsx: [ZIP], pptx: [ZIP], odt: [ZIP], ods: [ZIP], odp: [ZIP], zip: [ZIP] };
const startsWith = (bytes, signature) => signature.every((value, index) => bytes[index] === value);

export function checkUpload({ name = "", size = 0 }, headBytes = new Uint8Array()) {
    const extension = String(name).toLowerCase().split(".").pop();
    if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: "Ce fichier dépasse 50 Mo, la taille maximale par fichier." };
    if (!String(name).includes(".") || !ALLOWED_EXTENSIONS.includes(extension)) return { ok: false, reason: `Type de fichier non autorisé (.${extension}). Types acceptés : ${ALLOWED_EXTENSIONS.join(", ")}.` };
    const signatures = SIGNATURES[extension];
    if (signatures && !signatures.some((signature) => startsWith(headBytes, signature))) return { ok: false, reason: `Le contenu du fichier ne correspond pas à son extension .${extension}.` };
    return { ok: true };
}

export const isLegacyPath = (path) => String(path).startsWith("padlet-files/");

// Résout l'URL d'un fichier : URL signée à durée limitée (mise en cache, renouvelée avant expiration).
// Les anciens fichiers Firebase ou une signature impossible retombent sur l'URL enregistrée (fileUrl).
export function createUrlResolver({ sign, now = () => Date.now(), ttlSeconds = 3600, marginSeconds = 300 }) {
    const cache = new Map(), pending = new Map();
    const resolve = (item) => {
        const path = item?.filePath, fallback = item?.fileUrl || "";
        if (!path || isLegacyPath(path)) return Promise.resolve(fallback);
        const hit = cache.get(path);
        if (hit && hit.expires - now() > marginSeconds * 1000) return Promise.resolve(hit.url);
        if (pending.has(path)) return pending.get(path);
        const promise = (async () => {
            try {
                const url = await sign(path, ttlSeconds);
                if (!url) throw new Error("URL signée vide");
                cache.set(path, { url, expires: now() + ttlSeconds * 1000 });
                return url;
            } catch { return fallback; } finally { pending.delete(path); }
        })();
        pending.set(path, promise);
        return promise;
    };
    resolve.clear = () => cache.clear();
    return resolve;
}
