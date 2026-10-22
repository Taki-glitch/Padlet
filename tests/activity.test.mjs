import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildActivityEvent, ACTIVITY_FIELDS } from "../modules/activity.mjs";

test("événement normalisé : champs autorisés uniquement, libellé nettoyé et borné", () => {
  const event = buildActivityEvent({ action: "document.trash", resourceType: "document", resourceId: "abc", label: "Titre\nlong " + "x".repeat(300), count: 2, password: "secret", token: "t", content: "texte" }, "user-1", "op-1");
  assert.deepEqual(Object.keys(event).sort(), ["action", "count", "label", "operationId", "resourceId", "resourceType", "result", "userId"]);
  assert.ok(event.label.length <= 120 && !event.label.includes("\n"));
  assert.equal(event.result, "success"); assert.equal(event.operationId, "op-1");
  for (const key of Object.keys(event)) assert.ok(ACTIVITY_FIELDS.includes(key));
});
test("événement refusé : action, ressource, résultat ou utilisateur invalide", () => {
  const base = { action: "user.update", resourceType: "user" };
  assert.throws(() => buildActivityEvent({ ...base, action: "Supprimer tout" }, "u"), /Action/);
  assert.throws(() => buildActivityEvent({ ...base, resourceType: "autre" }, "u"), /ressource/);
  assert.throws(() => buildActivityEvent({ ...base, result: "peut-être" }, "u"), /Résultat/);
  assert.throws(() => buildActivityEvent(base, ""), /Utilisateur/);
  assert.equal(buildActivityEvent({ ...base, action: "user.reset-password", result: "failure" }, "u").result, "failure");
});
test("la liste des champs du client correspond à la règle Firestore (hasOnly)", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const block = rules.slice(rules.indexOf("match /activityLog/"));
  const listed = block.match(/hasOnly\(\[([^\]]*)\]\)/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...listed].sort(), [...ACTIVITY_FIELDS].sort());
  assert.match(block, /allow update, delete: if false/);
  assert.match(block, /userId == request\.auth\.uid/);
  assert.match(block, /at == request\.time/);
});
