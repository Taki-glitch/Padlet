import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { APP_VERSION } from "../modules/version.mjs";
import { foldSearchText, searchTerms, hiddenMatchFields } from "../modules/search.mjs";
import { escapeIcsText, foldIcsLine, buildCalendarEvents, buildIcs } from "../modules/ics.mjs";
import { validatePasswordChange } from "../modules/password.mjs";
import { buildAuditFields } from "../supabase/functions/_shared/auditlog.mjs";

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
