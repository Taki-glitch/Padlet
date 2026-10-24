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
