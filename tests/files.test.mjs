import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkUpload, createUrlResolver } from "../modules/files.mjs";

const bytes = (...values) => new Uint8Array(values);
test("envoi : taille, extension et signature du contenu", () => {
  assert.equal(checkUpload({ name: "a.pdf", size: 10 }, bytes(0x25, 0x50, 0x44, 0x46, 0x2d)).ok, true);
  assert.match(checkUpload({ name: "a.pdf", size: 60 * 1024 * 1024 }, bytes(0x25)).reason, /50 Mo/);
  assert.match(checkUpload({ name: "virus.exe", size: 10 }).reason, /non autorisé/);
  assert.match(checkUpload({ name: "sansextension", size: 10 }).reason, /non autorisé/);
  assert.match(checkUpload({ name: "faux.pdf", size: 10 }, bytes(0x4d, 0x5a, 0x90)).reason, /ne correspond pas/);
  assert.equal(checkUpload({ name: "ok.DOCX", size: 10 }, bytes(0x50, 0x4b, 0x03, 0x04)).ok, true);
  assert.equal(checkUpload({ name: "notes.txt", size: 10 }, bytes(0x68)).ok, true);   // pas de signature à contrôler
});
test("URL signée : cache, renouvellement, dédoublonnage, repli et anciens fichiers", async () => {
  let t = 0, calls = 0, fail = false;
  const resolve = createUrlResolver({ now: () => t, ttlSeconds: 3600, marginSeconds: 300, sign: async (path) => { calls++; if (fail) throw new Error("refus"); return `https://s/${path}?t=${calls}`; } });
  const item = { filePath: "a/b.pdf", fileUrl: "https://public/a/b.pdf" };
  const [u1, u2] = await Promise.all([resolve(item), resolve(item)]);
  assert.equal(u1, u2); assert.equal(calls, 1);                       // requêtes simultanées dédoublonnées
  t = 3000 * 1000; assert.equal(await resolve(item), u1);             // encore valide : cache
  t = 3400 * 1000; assert.notEqual(await resolve(item), u1);          // proche de l'expiration : renouvelée
  fail = true; t = 99999 * 1000;
  assert.equal(await resolve(item), "https://public/a/b.pdf");        // signature impossible : repli sur fileUrl
  assert.equal(await resolve({ filePath: "padlet-files/x.pdf", fileUrl: "https://old" }), "https://old");
  assert.equal(await resolve({ fileUrl: "" }), "");
});
test("règles Firestore : écriture réservée aux admins avec validation des champs", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const block = rules.slice(rules.indexOf("match /padletItems/"), rules.indexOf("match /activityLog/"));
  assert.match(block, /allow read: if request\.auth != null;/);
  assert.match(block, /request\.auth\.token\.role == 'admin'/);
  assert.match(block, /validItem\(request\.resource\.data\)/);
  assert.match(rules, /function validItem\(data\)/);
});
