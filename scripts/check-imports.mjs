// Vérifie que chaque import relatif (JS/TS) et chaque src/href relatif (HTML) pointe vers un fichier
// existant, avec la casse et l'extension exactes (comme GitHub Pages / Linux), et que les dossiers
// commençant par « _ » ne sont pas ignorés par Jekyll (absence de .nojekyll).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP = new Set([".git", "node_modules"]);
const toPosix = (path) => path.split(sep).join("/");

export function listFiles(root, dir = root) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (SKIP.has(entry.name)) return [];
        const path = join(dir, entry.name);
        return entry.isDirectory() ? listFiles(root, path) : [toPosix(relative(root, path))];
    });
}

function exactFile(root, target) {
    const parts = toPosix(relative(root, target)).split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
        const names = existsSync(current) && statSync(current).isDirectory() ? readdirSync(current) : [];
        if (!names.includes(parts[i])) {
            const near = names.find((name) => name.toLowerCase() === parts[i].toLowerCase());
            return { ok: false, reason: near ? `casse différente : le dépôt contient « ${near} »` : "fichier introuvable" };
        }
        current = join(current, parts[i]);
    }
    return statSync(current).isFile() ? { ok: true } : { ok: false, reason: "c'est un dossier, pas un fichier" };
}

function references(file, text) {
    const clean = text.split("\n").map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? "" : line)).join("\n");
    const found = [];
    const add = (regex, filter) => { for (const match of clean.matchAll(regex)) if (filter(match[1])) found.push({ spec: match[1], line: clean.slice(0, match.index).split("\n").length }); };
    if (/\.html?$/i.test(file)) add(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi, (spec) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(spec));
    else if (/\.(?:m?js|ts)$/.test(file)) {
        add(/(?:^|[\s;{}])(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']/g, (spec) => /^\.\.?\//.test(spec));
        add(/\bimport\(\s*["']([^"']+)["']\s*\)/g, (spec) => /^\.\.?\//.test(spec));
    }
    return found;
}

export function checkImports(root) {
    const errors = [], hasNoJekyll = existsSync(join(root, ".nojekyll"));
    for (const file of listFiles(root)) {
        if (!/\.(?:m?js|ts|html?)$/i.test(file)) continue;
        const browserFacing = !/^(?:supabase\/functions|tests|scripts)\//.test(file);
        const text = readFileSync(join(root, file), "utf8");
        if (text.slice(0, 200).includes("check-imports: ignore-file")) continue; // fichiers de test contenant des imports factices
        for (const { spec, line } of references(file, text)) {
            const fail = (reason) => errors.push({ file, line, spec, reason });
            if (spec.startsWith("/")) { fail("chemin absolu : il pointe vers la racine du domaine, pas vers /Padlet/"); continue; }
            const path = spec.split(/[?#]/)[0];
            const target = resolve(root, dirname(file), path);
            if (!toPosix(relative(root, target)) || toPosix(relative(root, target)).startsWith("..")) { fail("sort du dépôt"); continue; }
            const result = exactFile(root, target);
            if (!result.ok) { fail(result.reason); continue; }
            const hidden = toPosix(relative(root, target)).split("/").some((part) => part.startsWith("_") || part.startsWith("."));
            if (browserFacing && hidden && !hasNoJekyll) fail("dossier « _ » ignoré par GitHub Pages : ajoutez un fichier .nojekyll à la racine");
        }
    }
    return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const errors = checkImports(resolve(process.argv[2] || "."));
    for (const e of errors) console.error(`::error file=${e.file},line=${e.line}::Import « ${e.spec} » invalide (${e.reason})`);
    console.log(errors.length ? `${errors.length} import(s) invalide(s).` : "Tous les imports relatifs sont valides.");
    process.exit(errors.length ? 1 : 0);
}
