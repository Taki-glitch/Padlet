import test from "node:test";
import assert from "node:assert/strict";
import { theocraticYearStart, timelineGroup, documentGaps } from "../modules/timeline.mjs";

test("année théocratique : du 1er septembre au 31 août", () => {
  assert.equal(theocraticYearStart("2026-09-01"), 2026);
  assert.equal(theocraticYearStart("2027-08-31"), 2026);
  assert.equal(theocraticYearStart("2027-09-01"), 2027);
  assert.equal(theocraticYearStart("2027-01-15"), 2026);
  assert.equal(theocraticYearStart("2026-08-31"), 2025);
  assert.equal(theocraticYearStart("2024-02-29"), 2023);
});

test("libellés et clés de regroupement", () => {
  assert.deepEqual(timelineGroup("2026-10-21", "theocratic"), { key: "2026", label: "Année théocratique 2026-2027" });
  assert.equal(timelineGroup("2027-03-10", "theocratic").key, timelineGroup("2026-12-01", "theocratic").key);
  assert.equal(timelineGroup("2027-03-10", "month").label, "Mars 2027");
  assert.equal(timelineGroup("2027-03-10", "month").key, "2027-03");
  assert.notEqual(timelineGroup("2026-12-31", "month").key, timelineGroup("2027-01-01", "month").key);
});

test("dates invalides ou mode neutre : aucun groupe, sans exception", () => {
  for (const bad of ["", null, undefined, "2026-02-30", "pas une date", "2026-13-01"]) {
    assert.equal(timelineGroup(bad, "month"), null);
    assert.equal(theocraticYearStart(bad), null);
  }
  assert.equal(timelineGroup("2026-10-21", "none"), null);
});

test("documents à compléter : thème, résumé et date", () => {
  assert.deepEqual(documentGaps({ theme: "A", summary: "x", date: "2026-10-21" }), []);
  assert.deepEqual(documentGaps({ theme: " ", summary: "", date: "2026-02-30" }), ["thème", "résumé", "date"]);
  assert.deepEqual(documentGaps(null), ["thème", "résumé", "date"]);
});
