import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { APP_VERSION } from "../modules/version.mjs";
import { foldSearchText, searchTerms, hiddenMatchFields } from "../modules/search.mjs";
import { escapeIcsText, foldIcsLine, buildCalendarEvents, buildIcs } from "../modules/ics.mjs";
import { validatePasswordChange } from "../modules/password.mjs";
import { stripTypeScriptTypes } from "node:module";

// Le journal d'audit est intégré à admin-users/index.ts (un seul fichier, comme déployé via l'éditeur Supabase) :
// le test en extrait le bloc, retire les types et l'exécute, donc teste le code réellement déployé.
const adminSource = readFileSync(new URL("../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
const auditBlock = adminSource.slice(adminSource.indexOf("const AUDIT_ACTIONS"), adminSource.indexOf("// --- fin du journal"));
assert.ok(auditBlock.includes("function buildAuditFields"), "bloc d'audit introuvable dans admin-users/index.ts");
const { buildAuditFields } = await import("data:text/javascript," + encodeURIComponent(`${stripTypeScriptTypes(auditBlock)}\nexport { buildAuditFields };`));

test("la version affichée correspond à package.json", () => {
  assert.equal(APP_VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});

test("les migrations respectent le nom <horodatage>_<nom>.sql attendu par la CLI Supabase", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url));
  assert.ok(files.length > 0);
  for (const file of files) assert.match(file, /^\d{14}_[a-z0-9_]+\.sql$/, `nom de migration invalide : ${file}`);
});

test("la page déclare description, favicon et titre", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
  assert.match(html, /<link rel="icon" /);
  assert.match(html, /<title>[^<]*Padlet[^<]*<\/title>/);
});

test("recherche : accents, casse et caractères spéciaux", () => {
  assert.equal(foldSearchText("ÉCOLE Été"), "ecole ete");
  assert.deepEqual(searchTerms("  Écol(e  [PDF] "), ["ecol(e", "[pdf]"]);
});

test("recherche : champs trouvés mais invisibles sur la carte", () => {
  const item = { title: "Rapport annuel", summary: "Bilan", fileType: "application/pdf", publishedAt: "2025-03-14T10:00:00Z", tags: "Finances, 2025" };
  assert.deepEqual(hiddenMatchFields(item, searchTerms("pdf")), ["type de fichier"]);
  assert.deepEqual(hiddenMatchFields(item, searchTerms("2025-03")), ["date d’ajout"]);
  assert.deepEqual(hiddenMatchFields(item, searchTerms("FINANCES")), ["tags"]);
  assert.deepEqual(hiddenMatchFields(item, searchTerms("rapport bilan")), [], "déjà visible dans titre/résumé : aucun indice");
  assert.deepEqual(hiddenMatchFields(item, searchTerms("rapport pdf")), ["type de fichier"]);
  assert.deepEqual(hiddenMatchFields(item, []), []);
  assert.deepEqual(hiddenMatchFields(item, searchTerms("introuvable")), []);
  assert.deepEqual(hiddenMatchFields({ title: "A", retentionMonths: 24 }, searchTerms("24")), ["durée de conservation"]);
});

test("ics : échappement et pliage à 75 octets sans couper un caractère", () => {
  assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = "Réunion préparatoire — échéance importante ✓ ".repeat(6);
  const folded = foldIcsLine(`SUMMARY:${long}`);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${long}`);
});

test("ics : événements journée entière, UID stables, dates invalides ignorées, corbeille exclue de l'entrée", () => {
  const items = [
    { id: "d1", type: "deadline", title: "Dépôt du dossier", date: "2026-12-31", description: "Ligne 1\nLigne 2" },
    { id: "d2", type: "deadline", title: "Date cassée", date: "2026-02-30" },
    { id: "p1", type: "document", title: "Contrat", expiresAt: "2027-01-15" },
    { id: "p2", type: "document", title: "Sans expiration" }
  ];
  const { events, skipped } = buildCalendarEvents(items);
  assert.deepEqual(skipped, ["Date cassée"]);
  assert.deepEqual(events.map((e) => e.uid), ["deadline-d1@padlet", "expiry-p1@padlet"]);
  const ics = buildIcs(events, new Date("2026-10-23T08:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n/);
  assert.match(ics, /DTSTAMP:20261023T080000Z/);
  assert.match(ics, /SUMMARY:Expiration : Contrat/);
  assert.match(ics, /DESCRIPTION:Ligne 1\\nLigne 2/);
  assert.equal(buildIcs(events, new Date("2030-01-01T00:00:00Z")).match(/UID:[^\r]+/g).join(), ics.match(/UID:[^\r]+/g).join(), "UID identiques à chaque export");
  assert.deepEqual(buildCalendarEvents([]).events, []);
});

test("mot de passe : validation du formulaire", () => {
  const ok = { current: "ancien-mdp", next: "nouveau-mdp-1", confirm: "nouveau-mdp-1" };
  assert.equal(validatePasswordChange(ok), "");
  assert.match(validatePasswordChange({ ...ok, current: "" }), /actuel/);
  assert.match(validatePasswordChange({ ...ok, next: "court", confirm: "court" }), /au moins 8/);
  assert.match(validatePasswordChange({ ...ok, next: "x".repeat(73), confirm: "x".repeat(73) }), /72/);
  assert.match(validatePasswordChange({ ...ok, next: ok.current, confirm: ok.current }), /différent/);
  assert.match(validatePasswordChange({ ...ok, confirm: "autre-chose-1" }), /confirmation/);
});

test("journal serveur : champs, rôles et absence de secret", () => {
  const now = new Date("2026-10-23T08:00:00Z");
  const f = buildAuditFields({ action: "user.role-change", actorId: "admin-1", targetId: "user-2", oldRole: "user", newRole: "admin", operationId: "op-1", now });
  assert.equal(f.action.stringValue, "user.role-change");
  assert.equal(f.userId.stringValue, "admin-1");
  assert.equal(f.resourceId.stringValue, "user-2");
  assert.equal(f.oldRole.stringValue, "user");
  assert.equal(f.newRole.stringValue, "admin");
  assert.equal(f.source.stringValue, "server");
  assert.equal(f.at.timestampValue, "2026-10-23T08:00:00.000Z");
  assert.equal(f.expireAt.timestampValue, "2027-10-23T08:00:00.000Z");
  assert.ok(!/password|token|secret/i.test(JSON.stringify(f)));
  assert.equal(buildAuditFields({ action: "user.reset-password", actorId: "a", targetId: "b", result: "failure" }).result.stringValue, "failure");
  assert.throws(() => buildAuditFields({ action: "user.hack", actorId: "a" }), /Action/);
  assert.throws(() => buildAuditFields({ action: "user.create", actorId: "" }), /Acteur/);
  assert.throws(() => buildAuditFields({ action: "user.create", actorId: "a", newRole: "root" }), /Rôle/);
  assert.throws(() => buildAuditFields({ action: "user.create", actorId: "a", result: "ok" }), /Résultat/);
});

import { STRING_LIMITS, ruleViolations } from "../modules/rules-check.mjs";

test("rules-check : les limites correspondent exactement à firestore.rules", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const fromRules = Object.fromEntries([...rules.matchAll(/optionalString\(data, '(\w+)', (\d+)\)/g)].map(([, key, max]) => [key, Number(max)]));
  assert.deepEqual(fromRules, STRING_LIMITS);
  assert.match(rules, /fileSize <= 52428800/);
});

test("rules-check : détecte ce qui ferait refuser l'écriture", () => {
  assert.deepEqual(ruleViolations({ title: "ok", date: "2026-10-24", tags: ["a"], fileSize: 10, type: "document" }), []);
  assert.match(ruleViolations({ title: "x".repeat(301) })[0], /title.*300/);
  assert.match(ruleViolations({ date: "2026-10-24T10:00:00Z" })[0], /date.*10/);
  assert.match(ruleViolations({ fileSize: "12" })[0], /fileSize/);
  assert.match(ruleViolations({ type: "autre" })[0], /type/);
  assert.match(ruleViolations({ color: null })[0], /pas du texte/);
  assert.equal(ruleViolations({ title: "é".repeat(300) }).length, 0, "les caractères sont comptés, pas les octets");
  assert.equal(ruleViolations({ tags: "a".repeat(2001) }).length, 1);
  assert.equal(ruleViolations({ retentionMonths: 601 }).length, 1);
});

import { loadFirst, pdfIndexSummary, needsPdfIndexing } from "../modules/pdftext.mjs";
import { themeCounts, largestFiles, overdueDeadlines } from "../modules/dashboard.mjs";

test("pdf.js : bascule sur la deuxième source si la première échoue, erreur étiquetée si toutes échouent", async () => {
  const calls = [];
  const value = await loadFirst([async () => { calls.push("a"); throw new Error("bloqué"); }, async () => { calls.push("b"); return "pdfjs"; }]);
  assert.equal(value, "pdfjs"); assert.deepEqual(calls, ["a", "b"]);
  await assert.rejects(loadFirst([async () => { throw new Error("réseau"); }]), (error) => error.code === "pdfjs-load" && /réseau/.test(error.message));
});

test("indexation PDF : les anciens échecs (error) et les PDF jamais traités sont retentés", () => {
  const list = [{ pdfTextStatus: "ok" }, { pdfTextStatus: "empty" }, { pdfTextStatus: "error" }, {}];
  assert.deepEqual(list.map(needsPdfIndexing), [false, false, true, true]);
  assert.deepEqual(pdfIndexSummary(list), { total: 4, ok: 1, empty: 1, todo: 2 });
  assert.deepEqual(pdfIndexSummary([]), { total: 0, ok: 0, empty: 0, todo: 0 });
});

test("tableau de bord : thèmes, fichiers volumineux, échéances dépassées", () => {
  const docs = [{ theme: "Santé" }, { theme: "Santé" }, { theme: "Santé" }, { theme: "Admin" }, {}, { theme: "  " }];
  assert.deepEqual(themeCounts(docs), [{ title: "Santé", count: 3 }, { title: "Sans thème", count: 2 }, { title: "Admin", count: 1 }]);
  assert.equal(themeCounts(docs, { limit: 1 }).length, 1);
  const files = [{ title: "A", fileSize: 10 }, { title: "B", fileSize: 5000 }, { title: "C" }, { title: "D", fileSize: 0 }, { title: "E", fileSize: "9" }];
  assert.deepEqual(largestFiles(files, 5).map((f) => f.title), ["B", "A"]);
  const dl = [{ id: 1, date: "2026-10-23" }, { id: 2, date: "2026-10-24" }, { id: 3, date: "2026-10-01" }, { id: 4, date: "2026-09-01" }, { id: 5, date: "bad" }, { id: 6, date: "2026-12-01" }];
  const late = overdueDeadlines(dl, "2026-10-24", (d) => d.date);
  assert.deepEqual(late.map((d) => [d.id, d.daysLate]), [[1, 1], [3, 23]]);
});

import { nullFieldsToDelete, effectiveDocument } from "../modules/rules-check.mjs";

test("fiche ancienne avec retentionMonths nul : nettoyée à l'écriture au lieu d'être refusée par les règles", () => {
  const stored = { id: "a", type: "document", title: "Liste RPP", retentionMonths: null, expiresAt: null };
  const patch = { pdfText: "texte", pdfTextStatus: "ok" };
  assert.equal(ruleViolations({ ...stored, ...patch }).length, 1, "avant nettoyage : refusé");
  assert.deepEqual(nullFieldsToDelete(stored, patch), ["retentionMonths"]);
  assert.deepEqual(ruleViolations(effectiveDocument(stored, patch)), [], "après nettoyage : accepté");
  assert.deepEqual(nullFieldsToDelete({ retentionMonths: 24 }, { title: "x" }), []);
  assert.deepEqual(nullFieldsToDelete({ retentionMonths: 24 }, { retentionMonths: null }), ["retentionMonths"], "formulaire sans durée");
  assert.deepEqual(nullFieldsToDelete({}, {}), []);
  assert.equal(effectiveDocument({ retentionMonths: null, title: "t" }, { deletedAt: "2026-10-24" }).retentionMonths, undefined);
});

import { scanText } from "../scripts/check-secrets.mjs";
const fakeJwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.c2lnbmF0dXJlLWZpY3RpZg`;

test("détection de secrets : clés privées et service_role refusés, clé publique anon acceptée", () => {
  assert.deepEqual(scanText("pas de secret ici"), []);
  assert.deepEqual(scanText(`clé = ${fakeJwt("anon")}`), [], "la clé anon est publique par conception");
  assert.deepEqual(scanText(`clé = ${fakeJwt("service_role")}`), ["jeton Supabase « service_role »"]);
  assert.deepEqual(scanText(["-----BEGIN", "PRIVATE KEY-----\\n" + "A".repeat(60)].join(" ")), ["clé privée (PEM)"]);
  assert.deepEqual(scanText(["-----BEGIN", "PRIVATE KEY-----\\n…"].join(" ")), [], "exemple de documentation");
  assert.deepEqual(scanText(`sb_${"secret"}_${"a".repeat(20)}`), ["clé secrète Supabase (sb_secret_…)"]);
});

import { sha256Hex, findDuplicates } from "../modules/duplicates.mjs";
import { sanitizeSaved, addSaved, removeSaved, SAVED_SEARCH_MAX } from "../modules/savedSearches.mjs";
import { isDone } from "../modules/dashboard.mjs";

test("sha256 : empreinte connue", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("doublons : identique (empreinte), probable (ancienne fiche), pas de faux positif", () => {
  const items = [
    { id: "1", type: "document", filePath: "a", title: "A", sha256: "aaa", fileName: "x.pdf", fileSize: 10 },
    { id: "2", type: "document", filePath: "b", title: "B", fileName: "Rapport.PDF", fileSize: 500 },
    { id: "3", type: "document", filePath: "c", title: "C", sha256: "bbb", fileName: "Rapport.pdf", fileSize: 500 },
    { id: "4", type: "deadline", title: "échéance" },
    { id: "5", type: "document", title: "sans fichier", fileName: "Rapport.pdf", fileSize: 500 }
  ];
  const same = findDuplicates(items, { sha256: "aaa", fileName: "autre.pdf", fileSize: 10 });
  assert.deepEqual(same.map((d) => [d.item.id, d.certainty]), [["1", "identique"]]);
  const probable = findDuplicates(items, { sha256: "zzz", fileName: "rapport.pdf", fileSize: 500 });
  assert.deepEqual(probable.map((d) => [d.item.id, d.certainty]), [["2", "probable"]], "même nom+taille mais empreinte différente (3) n'est PAS un doublon");
  assert.deepEqual(findDuplicates(items, { sha256: "aaa", fileName: "x.pdf", fileSize: 10 }, "1"), [], "la fiche en cours de modification est ignorée");
  assert.deepEqual(findDuplicates(items, { sha256: "q", fileName: "", fileSize: 0 }), []);
});

test("recherches enregistrées : ajout, remplacement, validation, limite, suppression", () => {
  assert.match(addSaved([], { name: " ", query: "a" }).error, /nom/);
  assert.match(addSaved([], { name: "Vide", query: "  ", sort: "date-desc" }).error, /critère/);
  let { list } = addSaved([], { name: "PDF santé", query: "pdf santé", theme: "Santé", sort: "date-desc" });
  ({ list } = addSaved(list, { name: "Favoris", favorites: "favorites" }));
  assert.deepEqual(list.map((s) => s.name), ["Favoris", "PDF santé"]);
  ({ list } = addSaved(list, { name: "pdf SANTÉ", query: "nouveau" }));
  assert.equal(list.length, 2, "même nom (casse ignorée) : remplacée");
  assert.equal(list.find((s) => s.name === "pdf SANTÉ").query, "nouveau");
  assert.deepEqual(removeSaved(list, "FAVORIS").map((s) => s.name), ["pdf SANTÉ"]);
  assert.deepEqual(sanitizeSaved("pas une liste"), []);
  assert.deepEqual(sanitizeSaved([null, 3, { name: "" }, { name: "ok", favorites: "x", sort: "" }]), [{ name: "ok", query: "", theme: "", tag: "", favorites: "", sort: "date-desc" }]);
  const many = Array.from({ length: SAVED_SEARCH_MAX }, (_, i) => ({ name: `r${i}`, query: "q" }));
  assert.match(addSaved(many, { name: "de trop", query: "q" }).error, /Limite/);
  assert.ok(addSaved(many, { name: "r3", query: "autre" }).list, "remplacer à la limite reste possible");
});

test("échéance terminée : exclue de l'export .ics et du comptage, anciennes fiches « à faire »", () => {
  assert.equal(isDone({ done: true }), true);
  assert.equal(isDone({ done: false }), false);
  assert.equal(isDone({}), false);
  assert.equal(isDone(undefined), false);
  const { events } = buildCalendarEvents([{ id: "a", type: "deadline", title: "Faite", date: "2026-11-01", done: true }, { id: "b", type: "deadline", title: "À faire", date: "2026-11-02" }]);
  assert.deepEqual(events.map((e) => e.summary), ["À faire"]);
});

import { isShared, effectivelyShared, trashChanges, restoreChanges, sharingMigrationPlan, SHARING_ENFORCED } from "../modules/sharing.mjs";

test("partage : états, corbeille et restauration conservent l'état de partage", () => {
  assert.equal(isShared({ shared: true }), true);
  assert.equal(isShared({}), false, "sans champ : pas « partagée » au sens strict");
  assert.equal(effectivelyShared({}), true, "ancienne fiche : visible aujourd'hui");
  assert.equal(effectivelyShared({ shared: false }), false);
  assert.deepEqual(trashChanges({ shared: true }).set, { shared: false, sharedBeforeTrash: true });
  assert.deepEqual(trashChanges({ shared: false }).set, { shared: false, sharedBeforeTrash: false });
  assert.deepEqual(trashChanges({}).set, { shared: false, sharedBeforeTrash: true });
  assert.deepEqual(restoreChanges({ sharedBeforeTrash: true }).set, { shared: true });
  assert.deepEqual(restoreChanges({ sharedBeforeTrash: false }).set, { shared: false });
  assert.deepEqual(restoreChanges({}).set, { shared: false }, "état inconnu : non partagée par prudence");
});

test("partage : plan de préparation (migration) — aucun changement de visibilité pour les fiches actives", () => {
  const active = [{ id: "a" }, { id: "b", shared: true }, { id: "c", shared: false }, { id: "d" }];
  const trashed = [{ id: "t1", deletedAt: "x" }, { id: "t2", deletedAt: "x", shared: true }, { id: "t3", deletedAt: "x", shared: false }, { id: "t4", deletedAt: "x", sharedBeforeTrash: false }];
  const { writes, counts } = sharingMigrationPlan(active, trashed);
  assert.deepEqual(writes.map((w) => w.id), ["a", "d", "t1", "t2", "t4"]);
  assert.deepEqual(writes.find((w) => w.id === "a").patch, { shared: true });
  assert.deepEqual(writes.find((w) => w.id === "t1").patch, { shared: false, sharedBeforeTrash: true });
  assert.deepEqual(writes.find((w) => w.id === "t4").patch, { shared: false, sharedBeforeTrash: false });
  assert.deepEqual(counts, { share: 2, hideTrash: 3, alreadyShared: 1, alreadyPrivate: 1 });
  assert.deepEqual(sharingMigrationPlan([{ id: "x", shared: true }], []).writes, [], "idempotent : rien à refaire");
  assert.equal(typeof SHARING_ENFORCED, "boolean");
});

test("règles « partage » : identiques aux règles actuelles sauf la lecture limitée et le champ shared", () => {
  const current = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const target = readFileSync(new URL("../firestore.rules.partage", import.meta.url), "utf8");
  assert.match(target, /request\.auth\.token\.role == 'admin' \|\| resource\.data\.shared == true/);
  assert.match(target, /data\.shared is bool/);
  let reverted = target.split("\n").slice(2).join("\n")
    .replace("      // PARTAGE : un utilisateur ordinaire ne lit que les fiches `shared == true` (l'application filtre avec where('shared','==',true)).\n      allow read: if request.auth != null\n        && (request.auth.token.role == 'admin' || resource.data.shared == true);", "      allow read: if request.auth != null;")
    .replace("<= 52428800))\n        && (!('shared' in data) || data.shared is bool);", "<= 52428800));");
  const feedbackStart = reverted.indexOf("\n    // Avis des utilisateurs");
  const feedbackEnd = reverted.indexOf("\n    // État de la dernière purge");
  assert.ok(feedbackStart > 0 && feedbackEnd > feedbackStart, "bloc feedback introuvable");
  reverted = reverted.slice(0, feedbackStart) + reverted.slice(feedbackEnd);
  assert.equal(reverted, current, "les deux fichiers de règles ont divergé en dehors du partage");
});

import { cleanBulkText, addTag, bulkSummary } from "../modules/bulk.mjs";
import { validateFeedback, FEEDBACK_TYPES } from "../modules/feedback.mjs";
import { guideSteps, guideSeenKey } from "../modules/guide.mjs";

test("actions groupées : tags sans doublon, texte nettoyé, bilan lisible", () => {
  assert.equal(cleanBulkText("  Santé \n  publique  ", 120), "Santé publique");
  assert.equal(cleanBulkText("x".repeat(200), 60).length, 60);
  assert.deepEqual(addTag("santé, 2025", "Urgent"), { tags: "santé, 2025, Urgent", changed: true });
  assert.deepEqual(addTag("Santé, 2025", "SANTE"), { tags: "Santé, 2025", changed: false }, "doublon (casse et accents ignorés)");
  assert.deepEqual(addTag("", "un,deux"), { tags: "un deux", changed: true }, "la virgule ne crée pas deux tags par erreur");
  assert.match(addTag("a", "  ").error, /tag/);
  assert.match(addTag(Array.from({ length: 50 }, (_, i) => `t${i}`).join(", "), "de trop").error, /50/);
  assert.equal(bulkSummary({ done: 3, unchanged: 1, failures: [] }), "3 modifiés · 1 déjà à jour.");
  assert.match(bulkSummary({ done: 1, unchanged: 0, failures: ["A", "B"] }), /1 modifié · 2 échecs \(« A », « B »\)/);
});

test("avis : validation et limites identiques aux règles", () => {
  assert.match(validateFeedback({ type: "x", message: "un message assez long" }).error, /type/);
  assert.match(validateFeedback({ type: "bug", message: "court" }).error, /au moins 10/);
  assert.match(validateFeedback({ type: "bug", message: "a".repeat(2001) }).error, /trop long/);
  assert.match(validateFeedback({ type: "bug", message: "a".repeat(20), steps: "b".repeat(1001) }).error, /Étapes/);
  assert.deepEqual(validateFeedback({ type: "suggestion", message: "  Ajouter un mode sombre  ", steps: " ", page: "Frise" }).data, { type: "suggestion", message: "Ajouter un mode sombre", page: "Frise" });
  assert.deepEqual(Object.keys(FEEDBACK_TYPES), ["bug", "suggestion", "utilisation", "autre"]);
  const rules = readFileSync(new URL("../firestore.rules.partage", import.meta.url), "utf8");
  for (const type of Object.keys(FEEDBACK_TYPES)) assert.ok(rules.includes(`'${type}'`), `type ${type} absent des règles`);
  assert.match(rules, /message\.size\(\) >= 10 && request\.resource\.data\.message\.size\(\) <= 2000/);
});

test("guide : contenu selon le rôle, une clé par compte", () => {
  const user = guideSteps("user").map(([title]) => title), admin = guideSteps("admin").map(([title]) => title);
  assert.ok(admin.length > user.length);
  assert.ok(!user.some((title) => /Ajouter un document|Actions groupées/.test(title)), "fonctions admin non décrites aux utilisateurs");
  assert.ok(admin.some((title) => /partager/.test(title)));
  assert.equal(guideSeenKey("u1"), "padlet-guide-seen:u1");
  assert.equal(guideSeenKey(""), "");
});
