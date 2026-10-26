// Contrôles statiques de sécurité et de cohérence. Ils lisent le code et les règles : ils NE remplacent PAS un test réel
// des règles Firestore (émulateur) ni des permissions Supabase, impossibles à exécuter sans ces services.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { auditItems, unknownFields, ITEM_FIELDS } from "../modules/schema.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const frontFiles = ["script.js", ...readdirSync(new URL("../modules/", import.meta.url)).map((name) => `modules/${name}`)];

test("aucune injection HTML ni exécution dynamique dans le code du navigateur", () => {
  for (const file of frontFiles) {
    const code = read(file);
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.ok(!code.includes(sink), `${file} contient « ${sink} » : le texte des fiches doit passer par textContent`);
    }
  }
});

test("tout lien ouvert dans un nouvel onglet porte rel=noopener", () => {
  for (const file of frontFiles) {
    const lines = read(file).split("\n");
    lines.forEach((line, index) => {
      if (!/\.target\s*=\s*"_blank"/.test(line)) return;
      const around = lines.slice(index, index + 3).join(" ");
      assert.match(around, /rel\s*=\s*"noopener/, `${file}:${index + 1} : target=_blank sans rel=noopener`);
    });
  }
});

test("règles Firestore (actuelles et « partage ») : seules les collections prévues, pas d'accès ouvert", () => {
  for (const file of ["firestore.rules", "firestore.rules.partage"]) {
    const rules = read(file);
    const collections = [...rules.matchAll(/match \/([A-Za-z]+)\/\{/g)].map((m) => m[1]).filter((name) => name !== "databases").sort();
    assert.deepEqual(collections, file.endsWith("partage") ? ["activityLog", "feedback", "padletItems", "system"] : ["activityLog", "padletItems", "system"], file);
    assert.ok(!/if\s+true/.test(rules), `${file} : « if true » interdit`);
    for (const allow of rules.matchAll(/allow [a-z, ]+:\s*if([^;]*);/g)) {
      assert.ok(allow[1].includes("request.auth != null") || allow[1].trim() === "false", `${file} : règle sans authentification : ${allow[0].slice(0, 60)}`);
    }
    assert.match(rules, /match \/system\/\{docId\} \{[^}]*allow write: if false;/s, `${file} : system doit rester en écriture interdite`);
    assert.match(rules, /allow update, delete: if false;/, `${file} : activityLog doit rester non modifiable`);
  }
  assert.match(read("firestore.rules.partage"), /allow read, delete: if request\.auth != null && request\.auth\.token\.role == 'admin'/, "feedback : lecture réservée aux administrateurs");
});

test("Edge Functions sans vérification de jeton par la passerelle : le code vérifie l'utilisateur lui-même", () => {
  const config = read("supabase/config.toml");
  const open = [...config.matchAll(/\[functions\.([a-z-]+)\]\s*\n(?:#.*\n)*verify_jwt = false/g)].map((m) => m[1]);
  assert.ok(open.length >= 2, "fonctions attendues dans config.toml");
  for (const name of open) {
    const source = read(`supabase/functions/${name}/index.ts`);
    assert.match(source, /auth\.getUser\(/, `${name} : verify_jwt=false exige une vérification du jeton dans le code`);
    assert.match(source, /Authorization/, `${name} : en-tête Authorization non lu`);
  }
  const admin = read("supabase/functions/admin-users/index.ts");
  assert.match(admin, /profiles/, "admin-users : le rôle doit être relu en base, pas pris dans la requête");
  assert.ok(!/body\.role\s*===\s*["']admin["'][^;]*caller/.test(admin), "le rôle de l'appelant ne doit pas venir du corps de la requête");
});

test("cohérence des filtres : tout contrôle qui énumère les filtres actifs inclut aussi « Collection »", () => {
  const lines = read("script.js").split("\n");
  lines.forEach((line, index) => {
    if (line.includes("themeFilter.value") && line.includes("favoriteFilter.value") && !line.includes("entry.")) {
      assert.ok(line.includes("collectionFilter.value"), `script.js:${index + 1} : filtre « Collection » oublié`);
    }
  });
});

test("schéma des fiches : les champs validés par les règles sont documentés, diagnostic en lecture seule", () => {
  const rules = read("firestore.rules.partage");
  const validated = new Set([...rules.matchAll(/optionalString\(data, '([A-Za-z]+)'/g)].map((m) => m[1]));
  for (const key of ["type", "tags", "retentionMonths", "fileSize", "shared"]) validated.add(key);
  for (const field of validated) assert.ok(ITEM_FIELDS.includes(field), `champ validé par les règles absent du schéma : ${field}`);
  const bad = { id: "a", title: "Liste", type: "document", retentionMonths: null, mystere: 1 };
  const copy = JSON.stringify(bad);
  const { counts, problems } = auditItems([bad, { id: "b", title: "OK", type: "document", shared: true }]);
  assert.equal(JSON.stringify(bad), copy, "le diagnostic ne modifie rien");
  assert.deepEqual(counts, { total: 2, ruleProblems: 1, unknown: 1, missingShared: 1 });
  assert.equal(problems.length, 1);
  assert.match(problems[0].issues.join(" "), /retentionMonths/);
  assert.deepEqual(unknownFields(bad), ["mystere"]);
});
