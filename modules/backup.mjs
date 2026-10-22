// Sauvegarde complète (padlet-backup-v1.zip) et restauration. Logique pure : les accès Supabase/Firestore sont injectés.
import { createZip, readZip, extractEntry } from "./zip.mjs";

export const BACKUP_FORMAT = "padlet-backup", BACKUP_VERSION = 1;
const enc = (value) => new TextEncoder().encode(JSON.stringify(value, null, 2)), dec = (bytes) => new TextDecoder().decode(bytes);
const unsafePath = (path) => Boolean(path) && (typeof path !== "string" || path.startsWith("/") || path.includes("..") || path.includes("\\"));

export async function sha256Hex(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildBackup({ items, readFile, onProgress = () => {}, maxBytes = 400 * 1024 * 1024, now = new Date() }) {
    const entries = [], records = [], problems = []; let total = 0;
    for (const [index, item] of items.entries()) {
        onProgress({ done: index, total: items.length, label: item.title || item.id });
        const record = { id: item.id, filePath: item.filePath || null };
        if (item.filePath) {
            try {
                const bytes = await readFile(item.filePath);
                total += bytes.length;
                if (total > maxBytes) { const error = new Error("Sauvegarde trop volumineuse pour le navigateur : exportez par lots."); error.code = "BACKUP_TOO_LARGE"; throw error; }
                Object.assign(record, { size: bytes.length, sha256: await sha256Hex(bytes), archivePath: `files/${item.filePath}` });
                entries.push({ name: record.archivePath, data: bytes });
            } catch (error) {
                if (error?.code === "BACKUP_TOO_LARGE") throw error;
                record.missing = true; problems.push({ id: item.id, title: item.title || "", filePath: item.filePath, reason: error?.message || "Lecture impossible" });
            }
        }
        records.push(record);
    }
    const manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), counts: { items: items.length, files: entries.length, missingFiles: problems.length, bytes: total }, items: records };
    return { blob: createZip([{ name: "manifest.json", data: enc(manifest) }, { name: "items.json", data: enc(items) }, ...entries]), manifest, problems };
}

export async function parseBackup(bytes) {
    const zip = readZip(bytes);
    const manifest = JSON.parse(dec(extractEntry(bytes, zip, "manifest.json")));
    if (manifest.format !== BACKUP_FORMAT) throw new Error("Ce fichier n’est pas une sauvegarde Padlet.");
    if (manifest.version !== BACKUP_VERSION) throw new Error(`Version de sauvegarde non prise en charge : ${manifest.version}.`);
    const items = JSON.parse(dec(extractEntry(bytes, zip, "items.json")));
    if (!Array.isArray(items) || !Array.isArray(manifest.items)) throw new Error("Sauvegarde mal formée.");
    const report = { missing: [], corrupted: [] }, files = new Map();
    for (const record of manifest.items) {
        if (record.missing) { report.missing.push({ id: record.id, reason: "fichier absent au moment de la sauvegarde" }); continue; }
        if (!record.archivePath) continue;
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
    const blocked = new Map([...report.missing, ...report.corrupted].map((p) => [p.id, p.reason]));
    return items.map((item) => {
        const bad = !item || typeof item.id !== "string" || !/^[\w-]{1,128}$/.test(item.id) ? "identifiant invalide" : unsafePath(item.filePath) ? "chemin de fichier invalide" : blocked.get(item.id);
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
            if (step.action === "copy") { item.id = newId(); if (item.filePath) item.filePath = makePath(item.id, item.fileName || item.filePath.split("/").pop()); }
            if (item.filePath) item.fileUrl = await upload(item.filePath, files.get(step.item.id), item.fileType);
            await saveItem(item.id, item);
            report.restored.push({ id: item.id, label });
        } catch (error) { report.failed.push({ id: step.item.id, label, reason: error?.message || "Erreur inconnue" }); }
    }
    return report;
}
