// Les bibliothèques chargées depuis un CDN doivent avoir une version exacte (x.y.z), jamais flottante (@2, @latest).
// Fichiers du navigateur : erreur. Fonctions Edge (Deno) : avertissement (déploiement manuel).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { listFiles } from "./check-imports.mjs";

const PATTERNS = [/cdn\.jsdelivr\.net\/npm\/((?:@[^/@]+\/)?[^/@]+)@([^/+"'\s]+)/g, /esm\.sh\/((?:@[^/@]+\/)?[^/@]+)@([^/"'\s]+)/g, /gstatic\.com\/(firebasejs)\/([^/"'\s]+)\//g, /cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/"'\s]+)/g];
export function checkPinned(root) {
    const errors = [], warnings = [];
    for (const file of listFiles(root)) {
        if (!/\.(?:m?js|ts|html?)$/i.test(file) || /^(?:tests|scripts)\//.test(file)) continue;
        const text = readFileSync(join(root, file), "utf8");
        for (const pattern of PATTERNS) for (const match of text.matchAll(pattern)) {
            if (/^\d+\.\d+\.\d+$/.test(match[2])) continue;
            const entry = { file, line: text.slice(0, match.index).split("\n").length, message: `${match[1]}@${match[2]} n'est pas une version exacte` };
            (file.startsWith("supabase/functions/") ? warnings : errors).push(entry);
        }
    }
    return { errors, warnings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { errors, warnings } = checkPinned(resolve(process.argv[2] || "."));
    for (const w of warnings) console.warn(`::warning file=${w.file},line=${w.line}::${w.message} (Edge Function : à épingler au prochain déploiement)`);
    for (const e of errors) console.error(`::error file=${e.file},line=${e.line}::${e.message}`);
    console.log(errors.length ? `${errors.length} dépendance(s) non épinglée(s).` : `Dépendances du navigateur épinglées (${warnings.length} avertissement(s) côté Edge Functions).`);
    process.exit(errors.length ? 1 : 0);
}
