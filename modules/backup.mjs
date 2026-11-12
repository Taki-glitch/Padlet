// Sauvegarde complète (padlet-backup-v1.zip) et restauration. Logique pure : les accès Supabase/Firestore sont injectés.
import { createZip, readZip, extractEntry } from "./zip.mjs";

export const BACKUP_FORMAT = "padlet-backup", BACKUP_VERSION = 1;
export const MAX_BACKUP_ARCHIVE_BYTES = 512 * 1024 * 1024;
const enc = (value) => new TextEncoder().encode(JSON.stringify(value, null, 2)), dec = (bytes) => new TextDecoder().decode(bytes);
const unsafePath = (path) => Boolean(path) && (typeof path !== "string" || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".."));
const validId = (id) => typeof id === "string" && /^[\w-]{1,128}$/.test(id);
const isByteArray = (value) => ArrayBuffer.isView(value) && (Object.prototype.toString.call(value) === "[object Uint8Array]" || Object.prototype.toString.call(value) === "[object Uint8ClampedArray]");
const SECRET_FIELDS = new Set(["password", "passwd", "token", "accesstoken", "refreshtoken", "idtoken", "privatekey", "servicerolekey", "supabaseservicerolekey", "firebaseprivatekey", "secret", "apikey", "authorization", "bearer", "credential", "credentials"]);
function containsCredentialField(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsCredentialField);
    return Object.entries(value).some(([key, nested]) => {
        const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
        return SECRET_FIELDS.has(normalized) || normalized.includes("secret") || normalized.endsWith("password") || normalized.endsWith("token") || normalized.endsWith("privatekey") || containsCredentialField(nested);
    });
}

export async function sha256Hex(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Reprise idempotente d'un upload : un objet déjà présent n'est réutilisé qu'après vérification de son empreinte.
export async function uploadOrReuseFile({ path, bytes, upload, readExisting, getUrl, alreadyExists }) {
    let duplicate = false;
    try { await upload(path, bytes); }
    catch (error) {
        if (!alreadyExists(error)) throw error;
        duplicate = true;
    }
    if (duplicate) {
        const existing = await readExisting(path);
        if (!isByteArray(existing) || await sha256Hex(existing) !== await sha256Hex(bytes)) throw new Error("Un fichier différent existe déjà à ce chemin ; aucune fiche n'a été enregistrée.");
    }
    const url = await getUrl(path);
    if (!url) throw new Error("URL du fichier restauré indisponible.");
    return url;
}

export async function buildBackup({ items, readFile, onProgress = () => {}, maxBytes = 400 * 1024 * 1024, now = new Date() }) {
    if (!Array.isArray(items)) throw new TypeError("Les fiches à sauvegarder sont invalides.");
    if (items.some(containsCredentialField)) { const error = new Error("Sauvegarde interrompue : une fiche contient un champ ressemblant à un secret ou un identifiant d’authentification."); error.code = "BACKUP_CREDENTIAL_FIELD"; throw error; }
    const filesByPath = new Map(), records = [], problems = []; let total = 0;
    for (const [index, item] of items.entries()) {
        onProgress({ done: index, total: items.length, label: item.title || item.id });
        const record = { id: item.id, filePath: item.filePath || null };
        if (item.filePath) {
            try {
                if (!validId(item.id) || unsafePath(item.filePath)) throw new Error("Identifiant ou chemin de fichier invalide.");
                let bytes = filesByPath.get(item.filePath);
                if (!bytes) {
                    bytes = await readFile(item.filePath, item);
                    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
                    total += bytes.length;
                    if (total > maxBytes) { const error = new Error("Sauvegarde trop volumineuse pour le navigateur : exportez par lots."); error.code = "BACKUP_TOO_LARGE"; throw error; }
                    filesByPath.set(item.filePath, bytes);
                }
                Object.assign(record, { size: bytes.length, sha256: await sha256Hex(bytes), archivePath: `files/${item.filePath}` });
            } catch (error) {
                if (error?.code === "BACKUP_TOO_LARGE") throw error;
                record.missing = true; problems.push({ id: item.id, title: item.title || "", filePath: item.filePath, reason: error?.message || "Lecture impossible" });
            }
        } else if (item.fileUrl) {
            record.missing = true; problems.push({ id: item.id, title: item.title || "", filePath: "", reason: "fichier référencé sans chemin Storage" });
        }
        records.push(record);
    }
    const entries = [...filesByPath].map(([path, data]) => ({ name: `files/${path}`, data }));
    const archiveItems = items.map((item) => item.fileUrl ? { ...item, fileUrl: "" } : item);
    const manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), counts: { items: items.length, files: entries.length, missingFiles: problems.length, bytes: total }, items: records };
    const manifestBytes = enc(manifest), itemsBytes = enc(archiveItems);
    const zipEntries = [{ name: "manifest.json", data: manifestBytes }, { name: "items.json", data: itemsBytes }, ...entries];
    const estimatedBytes = 22 + zipEntries.reduce((sum, entry) => { const nameLength = new TextEncoder().encode(entry.name).length; return sum + 76 + 2 * nameLength + entry.data.length; }, 0);
    if (estimatedBytes > MAX_BACKUP_ARCHIVE_BYTES) throw new Error("Archive complète trop volumineuse pour le navigateur (limite 512 Mio, métadonnées comprises).");
    return { blob: createZip(zipEntries), manifest, problems };
}

export async function parseBackup(bytes) {
    if (!isByteArray(bytes)) throw new TypeError("L’archive doit être fournie sous forme binaire.");
    if (bytes.length > MAX_BACKUP_ARCHIVE_BYTES) throw new Error("Archive trop volumineuse pour le navigateur (limite 512 Mio).");
    const zip = readZip(bytes);
    let manifest, items;
    try { manifest = JSON.parse(dec(extractEntry(bytes, zip, "manifest.json"))); }
    catch (error) { throw new Error(`Manifeste illisible ou corrompu : ${error?.message || "JSON invalide"}`); }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Manifeste de sauvegarde invalide.");
    if (manifest.format !== BACKUP_FORMAT) throw new Error("Ce fichier n’est pas une sauvegarde Padlet.");
    if (manifest.version !== BACKUP_VERSION) throw new Error(`Version de sauvegarde non prise en charge : ${manifest.version}.`);
    try { items = JSON.parse(dec(extractEntry(bytes, zip, "items.json"))); }
    catch (error) { throw new Error(`Liste de fiches illisible ou corrompue : ${error?.message || "JSON invalide"}`); }
    if (!Array.isArray(items) || !Array.isArray(manifest.items)) throw new Error("Sauvegarde mal formée.");
    const report = { missing: [], corrupted: [] }, files = new Map();
    if (manifest.items.length !== items.length || !manifest.counts || manifest.counts.items !== items.length) throw new Error("Le manifeste et la liste des fiches ne concordent pas.");
    const itemIds = new Set(), recordIds = new Set(), expectedEntries = new Set(["manifest.json", "items.json"]), pathOwners = new Map(), fileSizes = new Map();
    let missingRecords = 0, legacyFileRecords = 0, legacyBytes = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i], record = manifest.items[i];
        if (!item || typeof item !== "object" || Array.isArray(item) || !record || typeof record !== "object") throw new Error(`Fiche ou entrée de manifeste invalide à la position ${i + 1}.`);
        if (!validId(item.id) || !validId(record.id) || item.id !== record.id || itemIds.has(item.id) || recordIds.has(record.id)) throw new Error("L’archive contient un identifiant invalide, dupliqué ou incohérent.");
        itemIds.add(item.id); recordIds.add(record.id);
        const itemPath = item.filePath || null;
        if ((record.filePath ?? null) !== itemPath || (unsafePath(itemPath) && !record.missing)) throw new Error(`Chemin de fichier invalide ou incohérent pour la fiche ${item.id}.`);
        if (record.missing) {
            if (record.missing !== true) throw new Error(`Indicateur de fichier manquant invalide pour la fiche ${item.id}.`);
            if (record.archivePath || record.size !== undefined || record.sha256 !== undefined) throw new Error(`Entrée de fichier manquant invalide pour la fiche ${item.id}.`);
            missingRecords++;
            report.missing.push({ id: record.id, reason: "fichier absent au moment de la sauvegarde" });
            continue;
        }
        if (!itemPath) {
            if (record.archivePath || record.size !== undefined || record.sha256 !== undefined) throw new Error(`Métadonnées de fichier inattendues pour la fiche ${item.id}.`);
            continue;
        }
        if (record.archivePath !== `files/${itemPath}` || !Number.isSafeInteger(record.size) || record.size < 0 || !/^[a-f\d]{64}$/i.test(record.sha256 || "")) throw new Error(`Métadonnées de fichier invalides pour la fiche ${item.id}.`);
        expectedEntries.add(record.archivePath);
        legacyFileRecords++;
        legacyBytes += record.size;
        if (pathOwners.has(record.archivePath) && (pathOwners.get(record.archivePath).path !== itemPath || pathOwners.get(record.archivePath).size !== record.size || pathOwners.get(record.archivePath).sha256 !== record.sha256)) throw new Error(`Chemin d’archive réutilisé de façon incohérente : ${record.archivePath}`);
        pathOwners.set(record.archivePath, { path: itemPath, size: record.size, sha256: record.sha256 });
        fileSizes.set(record.archivePath, record.size);
    }
    const expectedBytes = [...fileSizes.values()].reduce((sum, size) => sum + size, 0);
    const uniqueFileCount = expectedEntries.size - 2;
    const uniqueCountsMatch = manifest.counts.files === uniqueFileCount && manifest.counts.bytes === expectedBytes;
    const legacyCountsMatch = manifest.counts.files === legacyFileRecords && manifest.counts.bytes === legacyBytes;
    if (!Number.isSafeInteger(manifest.counts.files) || !Number.isSafeInteger(manifest.counts.bytes) || (!uniqueCountsMatch && !legacyCountsMatch) || manifest.counts.missingFiles !== missingRecords) throw new Error("Les compteurs du manifeste sont invalides.");
    for (const name of zip.keys()) if (!expectedEntries.has(name)) throw new Error(`Entrée non déclarée dans l’archive : ${name}`);
    for (const name of ["manifest.json", "items.json"]) {
        if (!zip.has(name)) throw new Error(`Fichier absent de l’archive : ${name}`);
    }
    for (const record of manifest.items) {
        if (record.missing || !record.archivePath) continue;
        try {
            const bytesOfFile = extractEntry(bytes, zip, record.archivePath);
            if (bytesOfFile.length !== record.size) throw new Error("taille différente du manifeste");
            if ((await sha256Hex(bytesOfFile)) !== record.sha256) throw new Error("empreinte SHA-256 différente du manifeste");
            files.set(record.id, bytesOfFile);
        } catch (error) { (String(error.message).startsWith("Fichier absent") ? report.missing : report.corrupted).push({ id: record.id, reason: error.message }); }
    }
    return { manifest, items, files, report };
}

export function planRestore({ items, report, existingIds, mode = "merge" }) {
    if (!["merge", "copy"].includes(mode)) throw new Error("Mode de restauration non pris en charge.");
    const blocked = new Map([...report.missing, ...report.corrupted].map((p) => [p.id, p.reason]));
    const counts = new Map();
    for (const item of items) if (item?.id !== undefined) counts.set(item.id, (counts.get(item.id) || 0) + 1);
    return items.map((item) => {
        const bad = !item || !validId(item.id) ? "identifiant invalide" : counts.get(item.id) > 1 ? "identifiant dupliqué dans l’archive" : unsafePath(item.filePath) ? "chemin de fichier invalide" : blocked.get(item.id);
        if (bad) return { item, action: "blocked", reason: bad };
        if (mode === "copy") return { item, action: "copy" };
        return existingIds.has(item.id) ? { item, action: "skip", reason: "déjà présente" } : { item, action: "create" };
    });
}

// Fichier d'abord, fiche ensuite : une interruption laisse au pire un fichier sans fiche, jamais l'inverse.
// Relancer la même restauration en mode « fusion » reprend où elle s'est arrêtée, sans doublon.
export async function executeRestore({ plan, files, upload, saveItem, makePath, newId, onProgress = () => {} }) {
    const report = { restored: [], skipped: [], failed: [] };
    for (const [index, step] of plan.entries()) {
        const label = step.item?.title || step.item?.id || "?";
        onProgress({ done: index, total: plan.length, label });
        if (step.action === "skip" || step.action === "blocked") { (step.action === "skip" ? report.skipped : report.failed).push({ id: step.item?.id, label, reason: step.reason }); continue; }
        try {
            const item = { ...step.item };
            if (step.action === "copy") {
                item.id = newId();
                if (!validId(item.id)) throw new Error("Nouvel identifiant invalide.");
                if (item.filePath) {
                    item.filePath = makePath(item.id, item.fileName || item.filePath.split("/").pop());
                    if (unsafePath(item.filePath)) throw new Error("Nouveau chemin de fichier invalide.");
                }
            }
            if (item.filePath) {
                const bytes = files.get(step.item.id);
                if (!isByteArray(bytes)) throw new Error("Fichier vérifié absent du plan de restauration.");
                item.fileUrl = await upload(item.filePath, bytes, item.fileType);
            }
            await saveItem(item.id, item);
            report.restored.push({ id: item.id, label });
        } catch (error) { report.failed.push({ id: step.item.id, label, reason: error?.message || "Erreur inconnue" }); }
    }
    return report;
}
