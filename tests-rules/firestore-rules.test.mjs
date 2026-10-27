// Tests des règles Firestore sur l'ÉMULATEUR (aucune donnée réelle). Lancés par .github/workflows/rules-emulator.yml.
// ÉCRIT MAIS JAMAIS EXÉCUTÉ dans l'environnement de rédaction (ni Java ni réseau) : à valider au premier passage de la CI.
// Vérifient les accès autorisés ET les refus de firestore.rules.partage (version cible) et le comportement connu de firestore.rules.
import test, { before, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp } from "firebase/firestore";

const rules = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
let env, current;

const seed = async (environment) => environment.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, "padletItems/shared"), { type: "document", title: "Partagée", shared: true });
  await setDoc(doc(db, "padletItems/private"), { type: "document", title: "Privée", shared: false });
  await setDoc(doc(db, "padletItems/legacy"), { type: "document", title: "Ancienne fiche sans champ shared" });
  await setDoc(doc(db, "padletItems/trashed"), { type: "document", title: "Corbeille", shared: false, deletedAt: "2026-10-01T00:00:00Z" });
  await setDoc(doc(db, "activityLog/e1"), { action: "x.y", resourceType: "document", result: "success", operationId: "o", userId: "adm", at: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 86400000) });
  await setDoc(doc(db, "system/lastPurge"), { ok: true });
  await setDoc(doc(db, "feedback/f1"), { type: "bug", message: "message de test assez long", userId: "usr", at: Timestamp.now() });
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: "padlet-rules-test", firestore: { rules: rules("firestore.rules.partage") } });
  await seed(env);
});
after(async () => { await env?.cleanup(); });

const as = (role, uid = role === "admin" ? "adm" : "usr") => (role === "anon" ? env.unauthenticatedContext() : env.authenticatedContext(uid, { role })).firestore();

test("fiches : visiteur refusé, utilisateur = partagées seulement, administrateur = tout", async () => {
  await assertFails(getDoc(doc(as("anon"), "padletItems/shared")));
  await assertSucceeds(getDoc(doc(as("user"), "padletItems/shared")));
  await assertFails(getDoc(doc(as("user"), "padletItems/private")));
  await assertFails(getDoc(doc(as("user"), "padletItems/trashed")));
  await assertFails(getDoc(doc(as("user"), "padletItems/legacy")));
  for (const id of ["shared", "private", "trashed", "legacy"]) await assertSucceeds(getDoc(doc(as("admin"), `padletItems/${id}`)));
});

test("liste : la requête filtrée sur shared == true passe, la requête non filtrée est refusée pour un utilisateur", async () => {
  await assertSucceeds(getDocs(query(collection(as("user"), "padletItems"), where("shared", "==", true))));
  await assertFails(getDocs(collection(as("user"), "padletItems")));
  await assertSucceeds(getDocs(collection(as("admin"), "padletItems")));
});

test("écriture des fiches : réservée aux administrateurs, données invalides refusées", async () => {
  const fresh = { type: "document", title: "Nouvelle", shared: false };
  await assertFails(setDoc(doc(as("user"), "padletItems/n1"), fresh));
  await assertFails(updateDoc(doc(as("user"), "padletItems/shared"), { title: "Piratée" }));
  await assertFails(deleteDoc(doc(as("user"), "padletItems/shared")));
  await assertSucceeds(setDoc(doc(as("admin"), "padletItems/n1"), fresh));
  await assertFails(setDoc(doc(as("admin"), "padletItems/n2"), { ...fresh, type: "autre" }));
  await assertFails(setDoc(doc(as("admin"), "padletItems/n3"), { ...fresh, shared: "oui" }));
  await assertFails(setDoc(doc(as("admin"), "padletItems/n4"), { ...fresh, title: "x".repeat(301) }));
  await assertFails(setDoc(doc(as("admin"), "padletItems/n5"), { ...fresh, fileSize: 60000000 }));
  await assertFails(setDoc(doc(as("admin"), "padletItems/n6"), { ...fresh, retentionMonths: null }), "cas connu : retentionMonths nul refusé");
  await assertSucceeds(deleteDoc(doc(as("admin"), "padletItems/n1")));
});

test("journal : lecture admin seulement, ajout contrôlé, jamais modifiable", async () => {
  const entry = (userId) => ({ action: "doc.test", resourceType: "document", result: "success", operationId: "op1", userId, at: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 365 * 86400000) });
  await assertFails(getDoc(doc(as("user"), "activityLog/e1")));
  await assertSucceeds(getDoc(doc(as("admin"), "activityLog/e1")));
  await assertSucceeds(setDoc(doc(as("admin"), "activityLog/ok"), entry("adm")));
  await assertFails(setDoc(doc(as("admin"), "activityLog/usurpe"), entry("quelquun-d-autre")));
  await assertFails(setDoc(doc(as("user"), "activityLog/u"), entry("usr")));
  await assertFails(updateDoc(doc(as("admin"), "activityLog/e1"), { result: "failure" }));
  await assertFails(deleteDoc(doc(as("admin"), "activityLog/e1")));
});

test("system : jamais en écriture, lecture administrateur seulement", async () => {
  await assertFails(getDoc(doc(as("user"), "system/lastPurge")));
  await assertSucceeds(getDoc(doc(as("admin"), "system/lastPurge")));
  await assertFails(setDoc(doc(as("admin"), "system/lastPurge"), { ok: false }));
});

test("avis : tout compte connecté peut en envoyer à son nom ; lecture administrateur seulement", async () => {
  const feedback = (userId, message = "Un avis suffisamment long") => ({ type: "suggestion", message, userId, at: serverTimestamp() });
  await assertSucceeds(setDoc(doc(as("user"), "feedback/new1"), feedback("usr")));
  await assertFails(setDoc(doc(as("user"), "feedback/new2"), feedback("autre-compte")));
  await assertFails(setDoc(doc(as("user"), "feedback/new3"), feedback("usr", "court")));
  await assertFails(setDoc(doc(as("anon"), "feedback/new4"), feedback("usr")));
  await assertFails(getDoc(doc(as("user"), "feedback/f1")));
  await assertSucceeds(getDoc(doc(as("admin"), "feedback/f1")));
  await assertFails(updateDoc(doc(as("admin"), "feedback/f1"), { message: "modifié par un admin" }));
});

test("notes privées : administrateurs seulement, jamais lisibles par un utilisateur", async () => {
  const note = (uid) => ({ text: "Note privée", updatedAt: serverTimestamp(), updatedBy: uid });
  await assertSucceeds(setDoc(doc(as("admin"), "adminNotes/shared"), note("adm")));
  await assertFails(setDoc(doc(as("admin"), "adminNotes/x"), note("quelquun-d-autre")));
  await assertFails(setDoc(doc(as("admin"), "adminNotes/y"), { ...note("adm"), text: "x".repeat(2001) }));
  await assertFails(getDoc(doc(as("user"), "adminNotes/shared")));
  await assertFails(setDoc(doc(as("user"), "adminNotes/z"), note("usr")));
  await assertSucceeds(getDoc(doc(as("admin"), "adminNotes/shared")));
});

test("règles ACTUELLES (firestore.rules) : comportement connu — tout utilisateur connecté lit toutes les fiches", async () => {
  current = await initializeTestEnvironment({ projectId: "padlet-rules-test-current", firestore: { rules: rules("firestore.rules") } });
  await seed(current);
  await assertSucceeds(getDoc(doc(current.authenticatedContext("usr", { role: "user" }).firestore(), "padletItems/private")));
  await assertFails(getDoc(doc(current.unauthenticatedContext().firestore(), "padletItems/shared")));
  await current.cleanup();
});
