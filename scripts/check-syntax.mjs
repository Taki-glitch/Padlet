// Vérifie la syntaxe de tous les fichiers .js/.mjs (modules ES) et, si Node >= 22.13, des Edge Functions .ts (syntaxe seule :
// ni types ni imports https:// ne sont résolus). Sous un Node plus ancien, les .ts sont ignorés avec un avis.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { listFiles } from "./check-imports.mjs";

const root = resolve(process.argv[2] || ".");
let failures = 0;
for (const file of listFiles(root).filter((name) => /\.m?js$/.test(name))) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: readFileSync(join(root, file)), encoding: "utf8" });
    if (result.status !== 0) { failures += 1; console.error(`::error file=${file}::Erreur de syntaxe\n${result.stderr}`); }
}
// Edge Functions .ts : types retirés par node:module (Node >= 22.13), puis vérification de syntaxe ES. Syntaxe seule :
// les types et les imports https:// ne sont pas résolus. Sous un Node plus ancien, les .ts sont ignorés avec un avis.
const { stripTypeScriptTypes } = await import("node:module");
if (typeof stripTypeScriptTypes === "function") {
    for (const file of listFiles(root).filter((name) => /\.ts$/.test(name))) {
        let javascript = "", problem = "";
        try { javascript = stripTypeScriptTypes(readFileSync(join(root, file), "utf8")); } catch (error) { problem = error.message.split("\n")[0]; }
        if (!problem) { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: javascript, encoding: "utf8" }); if (result.status !== 0) problem = result.stderr.split("\n")[0]; }
        if (problem) { failures += 1; console.error(`::error file=${file}::Erreur de syntaxe TypeScript : ${problem}`); }
    }
} else console.log("Node < 22.13 : fichiers .ts non vérifiés.");
console.log(failures ? `${failures} fichier(s) avec une erreur de syntaxe.` : "Syntaxe valide.");
process.exit(failures ? 1 : 0);
