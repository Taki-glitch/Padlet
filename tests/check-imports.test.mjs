// check-imports: ignore-file
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { checkImports } from "../scripts/check-imports.mjs";

function project(files) {
  const root = mkdtempSync(join(tmpdir(), "padlet-"));
  for (const [name, content] of Object.entries(files)) { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), content); }
  return root;
}
const run = (files) => { const root = project(files); try { return checkImports(root); } finally { rmSync(root, { recursive: true, force: true }); } };

test("le dépôt réel n'a aucun import invalide", () => {
  assert.deepEqual(checkImports(new URL("..", import.meta.url).pathname), []);
});
test("projet valide", () => {
  assert.deepEqual(run({ "a.js": 'import { x } from "./modules/b.mjs";', "modules/b.mjs": "export const x = 1;", "index.html": '<script type="module" src="a.js"></script>' }), []);
});
test("fichier introuvable", () => {
  const [error] = run({ "a.js": 'import "./absent.mjs";' });
  assert.equal(error.file, "a.js"); assert.match(error.reason, /introuvable/);
});
test("casse incorrecte (Timeline.mjs vs timeline.mjs)", () => {
  const [error] = run({ "a.js": 'import "./modules/Timeline.mjs";', "modules/timeline.mjs": "" });
  assert.match(error.reason, /casse/);
});
test("extension incorrecte (.js au lieu de .mjs)", () => {
  assert.equal(run({ "a.js": 'import "./modules/timeline.mjs";', "modules/timeline.js": "" }).length, 1);
});
test("dossier _ sans .nojekyll : erreur ; avec .nojekyll : valide", () => {
  const files = { "a.js": 'import "./supabase/_shared/e.mjs";', "supabase/_shared/e.mjs": "" };
  assert.match(run(files)[0].reason, /nojekyll/);
  assert.deepEqual(run({ ...files, ".nojekyll": "" }), []);
});
test("imports multi-lignes, export from et import() dynamique", () => {
  assert.equal(run({ "a.js": 'import {\n  x,\n  y,\n} from "./manquant1.mjs";\nexport * from "./manquant2.mjs";\nawait import("./manquant3.mjs");' }).length, 3);
});
test("URL, npm:, modules nus et commentaires ignorés", () => {
  assert.deepEqual(run({ "a.js": 'import "https://cdn.example/x.js";\nimport "npm:foo";\nimport "firebase";\n// import "./absent.mjs";\n/* import "./absent2.mjs"; */' }), []);
});
test("HTML : chemin absolu et fichier relatif manquant", () => {
  const errors = run({ "index.html": '<link href="/style.css"><script src="manquant.js"></script><a href="https://x.y/z">ok</a><a href="#top">ok</a>' });
  assert.equal(errors.length, 2);
});
