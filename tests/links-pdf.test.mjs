import test from "node:test";
import assert from "node:assert/strict";
import { linkSegments, isLongText } from "../modules/links.mjs";
import { extractPdfText, buildSnippet } from "../modules/pdftext.mjs";

test("liens : URL http(s) reconnues, ponctuation finale exclue, jamais de HTML", () => {
  assert.deepEqual(linkSegments("Voir https://exemple.fr/page?x=1, puis (https://a.b/c)."), [
    { text: "Voir " }, { href: "https://exemple.fr/page?x=1", text: "https://exemple.fr/page?x=1" }, { text: ", puis (" }, { href: "https://a.b/c", text: "https://a.b/c" }, { text: ")." }]);
  assert.deepEqual(linkSegments("<script>alert(1)</script> javascript:alert(1) ftp://x.y"), [{ text: "<script>alert(1)</script> javascript:alert(1) ftp://x.y" }]);
  assert.deepEqual(linkSegments(""), []); assert.deepEqual(linkSegments(null), []);
  assert.ok(linkSegments("https://fr.wikipedia.org/wiki/A_(b)").some((s) => s.href === "https://fr.wikipedia.org/wiki/A_(b)"));
});
test("résumé long : seuils de caractères et de lignes", () => {
  assert.equal(isLongText("court"), false);
  assert.equal(isLongText("x".repeat(281)), true);
  assert.equal(isLongText("a\nb\nc\nd\ne\nf\ng"), true);
});
const fakePdfjs = (pages, onDestroy = () => {}) => async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: pages.length, destroy: onDestroy, getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1].map((str) => ({ str })) }) }) }) }) });
test("extraction PDF : texte, normalisation, destruction du document", async () => {
  let destroyed = false;
  const r = await extractPdfText(new Uint8Array([1]), fakePdfjs([["Bonjour", "  le   monde"], ["Page", "deux"]], () => { destroyed = true; }));
  assert.deepEqual([r.text, r.status, r.pages, r.truncated, destroyed], ["Bonjour le monde Page deux", "ok", 2, false, true]);
});
test("extraction PDF : PDF scanné, limites de pages et de caractères, erreur propagée", async () => {
  assert.equal((await extractPdfText(new Uint8Array(), fakePdfjs([[], [""]]))).status, "empty");
  const limited = await extractPdfText(new Uint8Array(), fakePdfjs([["a".repeat(50)], ["b"], ["c"]]), { maxPages: 2, maxChars: 20 });
  assert.equal(limited.text.length, 20); assert.equal(limited.truncated, true);
  assert.equal((await extractPdfText(new Uint8Array(), fakePdfjs([["x"], ["y"], ["z"]]), { maxPages: 2 })).truncated, true);
  await assert.rejects(extractPdfText(new Uint8Array(), async () => ({ getDocument: () => ({ promise: Promise.reject(new Error("PDF invalide")) }) })), /invalide/);
});
test("extrait de recherche : sans accents ni casse, avec ellipses", () => {
  const text = "x".repeat(100) + " La Décision du conseil " + "y".repeat(100);
  const s = buildSnippet(text, ["decision"]);
  assert.ok(s.startsWith("…") && s.endsWith("…") && s.includes("Décision"));
  assert.equal(buildSnippet(text, ["absent"]), ""); assert.equal(buildSnippet("", ["a"]), ""); assert.equal(buildSnippet(text, []), "");
});
