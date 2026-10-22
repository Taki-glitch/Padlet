// Vérifie la syntaxe de tous les fichiers .js/.mjs (traités comme modules ES). Les fichiers .ts (Deno) ne sont pas analysés ici.
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
console.log(failures ? `${failures} fichier(s) avec une erreur de syntaxe.` : "Syntaxe valide.");
process.exit(failures ? 1 : 0);
