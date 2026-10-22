// Archive ZIP minimale (entrées non compressées, UTF-8) : création et lecture avec contrôle CRC-32.
const encoder = new TextEncoder(), decoder = new TextDecoder();
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export const isSafeName = (name) => name.length > 0 && !name.startsWith("/") && !name.includes("\\") && !name.split("/").includes("..");
const invalid = () => new Error("Archive invalide ou tronquée.");

export function createZip(entries) {
    if (entries.length > 65535) throw new Error("Trop d’entrées pour une archive ZIP.");
    const date = new Date(), dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const parts = [], central = []; let offset = 0;
    for (const { name, data } of entries) {
        if (!isSafeName(name)) throw new Error(`Nom d’entrée invalide : ${name}`);
        if (offset + data.length > 0xf0000000) throw new Error("Archive trop volumineuse (limite 4 Go).");
        const nameBytes = encoder.encode(name), crc = crc32(data);
        const l = new DataView(new ArrayBuffer(30));
        l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(12, dosDate, true);
        l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, nameBytes.length, true);
        parts.push(new Uint8Array(l.buffer), nameBytes, data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, dosDate, true);
        c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nameBytes.length, true); c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), nameBytes);
        offset += 30 + nameBytes.length + data.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, central.reduce((n, p) => n + p.length, 0), true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

export function readZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw invalid();
    const count = view.getUint16(eocd + 10, true), size = view.getUint32(eocd + 12, true), start = view.getUint32(eocd + 16, true);
    if (start + size > eocd) throw invalid();
    const entries = new Map(); let p = start;
    for (let n = 0; n < count; n++) {
        if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw invalid();
        const method = view.getUint16(p + 10, true), nameLength = view.getUint16(p + 28, true);
        const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
        if (!isSafeName(name)) throw new Error(`Nom dangereux dans l’archive : ${name}`);
        if (method !== 0) throw new Error("Archive recompressée non prise en charge : utilisez l’archive telle que créée par Padlet.");
        entries.set(name, { crc: view.getUint32(p + 16, true), size: view.getUint32(p + 24, true), offset: view.getUint32(p + 42, true) });
        p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    }
    return entries;
}

export function extractEntry(bytes, entries, name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Fichier absent de l’archive : ${name}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw invalid();
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    if (start + entry.size > bytes.length) throw invalid();
    const data = bytes.subarray(start, start + entry.size);
    if (crc32(data) !== entry.crc) throw new Error(`Entrée corrompue : ${name}`);
    return data;
}
