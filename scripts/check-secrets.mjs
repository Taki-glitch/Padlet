// Détecte les secrets qui ne doivent jamais être publiés : clés privées, clés « service_role » / « secret » Supabase.
// Les clés publiques (anon / publishable) destinées au navigateur sont autorisées. Ne scanne que les fichiers du dépôt
// (pas l'historique Git : voir docs/SECURITE.md). N'affiche jamais la valeur trouvée.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listFiles } from "./check-imports.mjs";

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf)$/i;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

export function scanText(text) {
    const findings = [];
    // Corps réel de clé (≥ 40 caractères base64 après l'en-tête), pas un exemple de documentation avec « … ».
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\n|\\r|\s)*[A-Za-z0-9+\/]{40,}/.test(text)) findings.push("clé privée (PEM)");
    if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) findings.push("clé secrète Supabase (sb_secret_…)");
    for (const match of text.matchAll(JWT)) {
        try {
            const role = JSON.parse(Buffer.from(match[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role;
            if (role === "service_role") findings.push("jeton Supabase « service_role »");
        } catch { /* jeton illisible : ignoré */ }
    }
    return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const root = process.cwd();
    let problems = 0;
    for (const file of listFiles(root).filter((name) => !BINARY.test(name))) {
        let text;
        try { text = readFileSync(join(root, file), "utf8"); } catch { continue; }
        for (const finding of scanText(text)) { problems += 1; console.error(`::error file=${file}::Secret probable : ${finding} (valeur non affichée)`); }
    }
    console.log(problems ? `${problems} secret(s) probable(s) trouvé(s).` : "Aucun secret détecté dans les fichiers du dépôt.");
    process.exit(problems ? 1 : 0);
}
