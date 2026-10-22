import test from "node:test";
import assert from "node:assert/strict";
import { splitTrash, trashDaysLeft, isTrashed } from "../modules/trash.mjs";
import { reconcile } from "../modules/reconcile.mjs";

const now = new Date("2026-11-20T12:00:00Z");
test("corbeille : les anciennes fiches sans deletedAt restent actives", () => {
  const { active, trashed } = splitTrash([{ id: "a" }, { id: "b", deletedAt: "2026-11-01T00:00:00Z" }, { id: "c", deletedAt: null }]);
  assert.deepEqual([active.map((i) => i.id), trashed.map((i) => i.id)], [["a", "c"], ["b"]]);
  assert.equal(isTrashed({}), false);
});
test("corbeille : limites du délai de 30 jours", () => {
  const at = (iso) => trashDaysLeft({ deletedAt: iso }, now);
  assert.equal(at("2026-11-20T12:00:00Z"), 30);
  assert.equal(at("2026-10-21T12:00:01Z"), 1);   // 29 j 23 h 59 : pas encore
  assert.equal(at("2026-10-21T12:00:00Z"), 0);   // exactement 30 j : autorisé
  assert.ok(at("2026-09-01T00:00:00Z") < 0);
  assert.equal(at("pas une date"), null);
  assert.equal(trashDaysLeft({}, now), null);
});
const obj = (path, createdAt = "2026-01-01T00:00:00Z") => ({ path, size: 10, createdAt });
test("réconciliation : fiche sans fichier, fichier orphelin, doublon, chemin invalide, ancien fichier", () => {
  const items = [
    { id: "1", title: "ok", filePath: "1/a.pdf" },
    { id: "2", title: "absent", filePath: "2/b.pdf" },
    { id: "3", title: "corbeille", filePath: "3/c.pdf", deletedAt: "2026-11-10T00:00:00Z" },
    { id: "4", filePath: "1/a.pdf" },
    { id: "5", filePath: "../x" },
    { id: "6", filePath: "padlet-files/old.pdf" },
    { id: "7", type: "deadline" },
  ];
  const r = reconcile({ items, objects: [obj("1/a.pdf"), obj("3/c.pdf"), obj("9/orphelin.pdf")], now });
  assert.deepEqual(r.missingFile.map((e) => e.id), ["2"]);
  assert.deepEqual(r.orphanFiles.map((e) => e.path), ["9/orphelin.pdf"]);
  assert.deepEqual(r.duplicatePath, [{ filePath: "1/a.pdf", ids: ["1", "4"] }]);
  assert.deepEqual(r.invalidPath.map((e) => e.id), ["5"]);
  assert.deepEqual(r.legacyRefs.map((e) => e.id), ["6"]);
  assert.equal(r.missingFile.some((e) => e.trashed), false);   // le fichier d'une fiche en corbeille est bien « référencé »
});
test("réconciliation : un fichier récent sans fiche n'est pas un orphelin (envoi en cours)", () => {
  const r = reconcile({ items: [{ id: "1", filePath: "1/a" }], objects: [obj("1/a"), obj("8/neuf", "2026-11-20T06:00:00Z")], now });
  assert.deepEqual([r.orphanFiles.length, r.recentUnreferenced.length], [0, 1]);
});
test("réconciliation : listage vide alors que des fiches référencent des fichiers → analyse refusée", () => {
  assert.throws(() => reconcile({ items: [{ id: "1", filePath: "1/a" }], objects: [], now }), /analyse annulée/);
  assert.deepEqual(reconcile({ items: [{ id: "1" }], objects: [], now }).missingFile, []);
});
