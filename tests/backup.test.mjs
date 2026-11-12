import test from "node:test";
import assert from "node:assert/strict";
import { createZip, readZip, extractEntry } from "../modules/zip.mjs";
import { buildBackup, parseBackup, planRestore, executeRestore, uploadOrReuseFile, sha256Hex } from "../modules/backup.mjs";

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
const text = (s) => new TextEncoder().encode(s);
const items = [
  { id: "a1", type: "document", title: "A", filePath: "a1/a.pdf", fileName: "a.pdf", fileType: "application/pdf", tags: ["x"] },
  { id: "b2", type: "deadline", title: "B", date: "2026-10-21", timelineColor: "#f00" },
  { id: "c3", type: "document", title: "C", filePath: "c3/c.txt", fileName: "c.txt" },
];
const store = { "a1/a.pdf": text("%PDF contenu A"), "c3/c.txt": text("contenu C") };
const readFile = async (path) => { if (!store[path]) throw new Error("introuvable"); return store[path]; };
const make = async (extra = {}) => { const built = await buildBackup({ items, readFile, ...extra }); return { ...built, bytes: await bytesOf(built.blob) }; };

test("zip : aller-retour et contrôle CRC", async () => {
  const bytes = await bytesOf(createZip([{ name: "x/é.txt", data: text("bonjour") }]));
  const zip = readZip(bytes);
  assert.equal(new TextDecoder().decode(extractEntry(bytes, zip, "x/é.txt")), "bonjour");
  const broken = bytes.slice(); broken[40] ^= 0xff;
  assert.throws(() => extractEntry(broken, readZip(broken), "x/é.txt"), /corrompue/);
});
test("zip : archive tronquée, noms dangereux", async () => {
  const bytes = await bytesOf(createZip([{ name: "a.txt", data: text("x") }]));
  assert.throws(() => readZip(bytes.slice(0, bytes.length - 10)), /invalide ou tronquée/);
  assert.throws(() => createZip([{ name: "../evil", data: text("x") }]), /invalide/);
});
test("zip : refuse les doublons ambigus et accepte les copies identiques", async () => {
  const bytes = await bytesOf(createZip([{ name: "same.txt", data: text("a") }, { name: "same.txt", data: text("b") }]));
  assert.throws(() => readZip(bytes), /double avec contenu différent/);
  const identical = await bytesOf(createZip([{ name: "same.txt", data: text("a") }, { name: "same.txt", data: text("a") }]));
  assert.equal(new TextDecoder().decode(extractEntry(identical, readZip(identical), "same.txt")), "a");
});
test("sauvegarde puis lecture : fiches, fichiers, empreintes", async () => {
  const { bytes, manifest, problems } = await make();
  assert.equal(problems.length, 0); assert.equal(manifest.counts.files, 2);
  const parsed = await parseBackup(bytes);
  assert.deepEqual(parsed.items, items); assert.equal(parsed.files.size, 2);
  assert.deepEqual([...parsed.files.get("a1")], [...store["a1/a.pdf"]]);
  assert.deepEqual(parsed.report, { missing: [], corrupted: [] });
});
test("sauvegarde : un même chemin partagé entre fiches n'est archivé qu'une fois", async () => {
  let reads = 0;
  const duplicateItems = [items[0], { ...items[0], id: "a2" }];
  const built = await buildBackup({ items: duplicateItems, readFile: async (path) => { reads++; return store[path]; } });
  const parsed = await parseBackup(await bytesOf(built.blob));
  assert.equal(reads, 1); assert.equal(built.manifest.counts.files, 1);
  assert.deepEqual([...parsed.files.keys()], ["a1", "a2"]);
});
test("restauration : conserve les anciennes sauvegardes v1 avec fichiers partagés en double", async () => {
  const shared = text("contenu partagé"), sharedItems = [{ id: "one", filePath: "shared/a.pdf" }, { id: "two", filePath: "shared/a.pdf" }];
  const hash = await sha256Hex(shared);
  const records = sharedItems.map((item) => ({ id: item.id, filePath: item.filePath, archivePath: `files/${item.filePath}`, size: shared.length, sha256: hash }));
  const manifest = { format: "padlet-backup", version: 1, counts: { items: 2, files: 2, missingFiles: 0, bytes: shared.length * 2 }, items: records };
  const archive = await bytesOf(createZip([{ name: "manifest.json", data: text(JSON.stringify(manifest)) }, { name: "items.json", data: text(JSON.stringify(sharedItems)) }, { name: "files/shared/a.pdf", data: shared }, { name: "files/shared/a.pdf", data: shared }]));
  const parsed = await parseBackup(archive);
  assert.equal(parsed.files.size, 2);
  assert.deepEqual(parsed.report, { missing: [], corrupted: [] });
});
test("sauvegarde : retire les URL porteuses de jetons et refuse les champs d'identification sensibles", async () => {
  const withUrl = [{ ...items[0], fileUrl: "https://firebasestorage.googleapis.com/file?token=do-not-export" }];
  const built = await buildBackup({ items: withUrl, readFile });
  const parsed = await parseBackup(await bytesOf(built.blob));
  assert.equal(parsed.items[0].fileUrl, "");
  assert.equal(new TextDecoder().decode(await bytesOf(built.blob)).includes("do-not-export"), false);
  await assert.rejects(buildBackup({ items: [{ id: "x", nested: { refresh_token: "secret-value" } }], readFile }), /champ ressemble à un secret|ressemblant à un secret/);
});
test("sauvegarde : une URL de fichier sans filePath est signalée et bloquée", async () => {
  const built = await buildBackup({ items: [{ id: "legacy", fileUrl: "https://files.example/old" }], readFile });
  const parsed = await parseBackup(await bytesOf(built.blob));
  assert.equal(parsed.report.missing.length, 1);
  assert.equal(planRestore({ ...parsed, existingIds: new Set() })[0].action, "blocked");
});
test("fichier manquant à la sauvegarde : signalé, jamais restauré", async () => {
  const { bytes, problems } = await make({ items: items, readFile: async (p) => { if (p === "c3/c.txt") throw new Error("absent"); return store[p]; } });
  assert.equal(problems.length, 1);
  const parsed = await parseBackup(bytes);
  const plan = planRestore({ ...parsed, existingIds: new Set() });
  assert.equal(plan.find((s) => s.item.id === "c3").action, "blocked");
  assert.equal(plan.find((s) => s.item.id === "a1").action, "create");
});
test("empreinte différente du manifeste : fichier bloqué", async () => {
  const { bytes } = await make();
  const zip = readZip(bytes), manifest = JSON.parse(new TextDecoder().decode(extractEntry(bytes, zip, "manifest.json")));
  manifest.items[0].sha256 = "0".repeat(64);
  const forged = await bytesOf(createZip([{ name: "manifest.json", data: text(JSON.stringify(manifest)) }, { name: "items.json", data: extractEntry(bytes, zip, "items.json") }, ...["files/a1/a.pdf", "files/c3/c.txt"].map((name) => ({ name, data: extractEntry(bytes, zip, name) }))]));
  const parsed = await parseBackup(forged);
  assert.equal(parsed.report.corrupted.length, 1); assert.match(parsed.report.corrupted[0].reason, /SHA-256/);
});
test("prévalidation : fichier retiré de l'archive est signalé et bloqué", async () => {
  const { bytes } = await make(), zip = readZip(bytes);
  const retained = [...zip.keys()].filter((name) => name !== "files/c3/c.txt").map((name) => ({ name, data: extractEntry(bytes, zip, name) }));
  const parsed = await parseBackup(await bytesOf(createZip(retained)));
  assert.equal(parsed.report.missing.length, 1);
  assert.equal(planRestore({ ...parsed, existingIds: new Set() }).find((step) => step.item.id === "c3").action, "blocked");
});
test("prévalidation : entrées ZIP non répertoriées et fiches incohérentes sont refusées", async () => {
  const { bytes } = await make(), zip = readZip(bytes);
  const entries = [...zip.keys()].map((name) => ({ name, data: extractEntry(bytes, zip, name) }));
  await assert.rejects(parseBackup(await bytesOf(createZip([...entries, { name: "extra.txt", data: text("inconnu") }]))), /non déclarée/);
  const itemsEntry = entries.find((entry) => entry.name === "items.json");
  const changed = JSON.parse(new TextDecoder().decode(itemsEntry.data)); changed[0].title = "altéré"; changed[0].id = "autre-id";
  const inconsistent = await bytesOf(createZip(entries.map((entry) => entry.name === "items.json" ? { ...entry, data: text(JSON.stringify(changed)) } : entry)));
  await assert.rejects(parseBackup(inconsistent), /identifiant invalide, dupliqué ou incohérent/);
});
test("format ou version non pris en charge", async () => {
  const mk = async (m) => bytesOf(createZip([{ name: "manifest.json", data: text(JSON.stringify(m)) }, { name: "items.json", data: text("[]") }]));
  await assert.rejects(parseBackup(await mk({ format: "autre", version: 1, items: [] })), /pas une sauvegarde Padlet/);
  await assert.rejects(parseBackup(await mk({ format: "padlet-backup", version: 99, items: [] })), /Version/);
});
test("plan : fusion, copies, identifiants et chemins invalides", async () => {
  const { bytes } = await make(); const parsed = await parseBackup(bytes);
  assert.deepEqual(planRestore({ ...parsed, existingIds: new Set(["a1"]) }).map((s) => s.action), ["skip", "create", "create"]);
  assert.deepEqual(planRestore({ ...parsed, existingIds: new Set(["a1"]), mode: "copy" }).map((s) => s.action), ["copy", "copy", "copy"]);
  const bad = planRestore({ items: [{ id: "../x" }, { id: "ok", filePath: "../../etc" }], report: { missing: [], corrupted: [] }, existingIds: new Set() });
  assert.deepEqual(bad.map((s) => s.action), ["blocked", "blocked"]);
});
function fakeServer() {
  const docs = new Map(), objects = new Map(); let uploads = 0, ids = 0;
  return { docs, objects, get uploads() { return uploads; },
    deps: { makePath: (id, name) => `${id}/${name}`, newId: () => `copy${++ids}`,
      upload: async (path, bytes) => { uploads++; const current = objects.get(path); if (current) { if (String(current) !== String(bytes)) throw new Error("different duplicate object"); } else objects.set(path, bytes.slice()); return `https://s/${path}`; },
      saveItem: async (id, item) => { docs.set(id, item); } } };
}
test("restauration complète, puis copies sans écraser l'existant", async () => {
  const { bytes } = await make(); const parsed = await parseBackup(bytes), server = fakeServer();
  const report = await executeRestore({ plan: planRestore({ ...parsed, existingIds: new Set() }), files: parsed.files, ...server.deps });
  assert.equal(report.restored.length, 3); assert.equal(server.docs.get("a1").fileUrl, "https://s/a1/a.pdf");
  const copies = await executeRestore({ plan: planRestore({ ...parsed, existingIds: new Set(server.docs.keys()), mode: "copy" }), files: parsed.files, ...server.deps });
  assert.equal(copies.restored.length, 3); assert.equal(server.docs.size, 6); assert.equal(server.docs.get("a1").title, "A");
});
test("erreur isolée puis reprise après interruption : aucun doublon", async () => {
  const { bytes } = await make(); const parsed = await parseBackup(bytes), server = fakeServer();
  let crash = true; const flaky = { ...server.deps, saveItem: async (id, item) => { if (id === "a1" && crash) throw new Error("coupure réseau"); return server.deps.saveItem(id, item); } };
  const first = await executeRestore({ plan: planRestore({ ...parsed, existingIds: new Set() }), files: parsed.files, ...flaky });
  assert.deepEqual([first.restored.length, first.failed.length], [2, 1]);
  assert.equal(server.objects.has("a1/a.pdf"), true, "l'interruption après upload laisse un objet orphelin vérifiable");
  crash = false;
  const second = await executeRestore({ plan: planRestore({ ...parsed, existingIds: new Set(server.docs.keys()) }), files: parsed.files, ...flaky });
  assert.deepEqual([second.restored.length, second.skipped.length], [1, 2]);
  assert.equal(server.docs.size, 3);
});
test("reprise d'upload : objet existant réutilisable uniquement si son SHA-256 concorde", async () => {
  const expected = text("fichier sauvegardé"), same = text("fichier sauvegardé"), different = text("autre contenu");
  let reads = 0;
  const args = { path: "a1/a.pdf", bytes: expected, upload: async () => { throw { statusCode: "409" }; }, readExisting: async () => { reads++; return same; }, getUrl: async (path) => `https://storage/${path}`, alreadyExists: (error) => String(error?.statusCode) === "409" };
  assert.equal(await uploadOrReuseFile(args), "https://storage/a1/a.pdf"); assert.equal(reads, 1);
  await assert.rejects(uploadOrReuseFile({ ...args, readExisting: async () => different }), /fichier différent/i);
  await assert.rejects(uploadOrReuseFile({ ...args, upload: async () => { throw new Error("réseau indisponible"); } }), /réseau indisponible/);
});
