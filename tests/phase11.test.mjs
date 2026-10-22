import test from "node:test";
import assert from "node:assert/strict";
import { addRetentionMonths, isCivilDate, isDueForPurge } from "../supabase/functions/_shared/expiration.mjs";
import { buildTimelineTicks, timelineDateRatio } from "../modules/timeline.mjs";
import { readPersonalPreferences, writePersonalPreferences } from "../modules/preferences.mjs";
import { buildMetadataExportPayload } from "../modules/admin.mjs";
import { deleteDocumentAndFile, PartialDocumentDeletionError } from "../modules/data.mjs";
import { createAuthGateway, hasAdminRole } from "../modules/auth.mjs";

test("calendar-month expiry clamps month ends and rejects invalid dates", () => {
  assert.equal(addRetentionMonths("2025-01-31", 1), "2025-02-28");
  assert.equal(addRetentionMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addRetentionMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addRetentionMonths("2025-03-31", 1), "2025-04-30");
  assert.equal(addRetentionMonths("2025-02-29", 1), null);
  assert.equal(isCivilDate("2025-02-29"), false);
});

test("expiry is due only after its civil date and shares purge rule", () => {
  assert.equal(isDueForPurge("2025-03-31", "2025-03-31"), false);
  assert.equal(isDueForPurge("2025-03-31", "2025-04-01"), true);
  assert.equal(isDueForPurge("bad", "2025-04-01"), false);
});

test("timeline ticks are calendar dates without next-period overflow", () => {
  const monthly = buildTimelineTicks(new Date(2024, 1, 1), new Date(2024, 2, 1), "month");
  assert.deepEqual(monthly.map((tick) => tick.day), [1, 8, 15, 22, 29]);
  assert.ok(monthly.every((tick) => tick.date.startsWith("2024-02-")));
  const yearly = buildTimelineTicks(new Date(2025, 0, 1), new Date(2026, 0, 1), "year");
  assert.equal(yearly.length, 12);
  assert.deepEqual(yearly.map((tick) => tick.month), Array.from({ length: 12 }, (_, index) => index));
  assert.equal(timelineDateRatio("2024-02-29", new Date(2024, 1, 1), new Date(2024, 2, 1)), 28 / 29);
});

test("personal preferences validate values and fall back when local storage is blocked", () => {
  const defaults = { theme: "system", accent: "indigo", timelineView: "month", timelineAnchor: "" };
  const blockedStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const blocked = readPersonalPreferences("u1", defaults, () => null, { storage: blockedStorage, fallbackAnchor: "2025-01-01" });
  assert.equal(blocked.storageAvailable, false);
  assert.equal(blocked.preferences.timelineAnchor, "2025-01-01");
  const storage = { getItem: () => JSON.stringify({ theme: "unsafe", accent: "rose", timelineView: "year", timelineAnchor: "invalid" }), setItem() {} };
  const restored = readPersonalPreferences("u1", defaults, (value) => isCivilDate(value) ? value : null, { storage, fallbackAnchor: "2025-01-01" });
  assert.equal(restored.preferences.theme, "system");
  assert.equal(restored.preferences.accent, "rose");
  assert.equal(restored.preferences.timelineAnchor, "2025-01-01");
  assert.equal(writePersonalPreferences("u1", defaults, blockedStorage), false);
});

test("metadata export preserves restorable custom fields and excludes session secrets", () => {
  const payload = buildMetadataExportPayload([{ id: "doc-1", type: "document", title: "A", summary: "**bold**", timelineDate: "2025-01-01", timelineColor: "#123456", fileSize: 42, filePath: "doc-1/a.pdf", access_token: "secret", privateKey: "secret" }], new Date("2025-01-01T00:00:00Z"));
  assert.equal(payload.documents[0].summary, "**bold**");
  assert.equal(payload.documents[0].timelineColor, "#123456");
  assert.equal(payload.documents[0].filePath, "doc-1/a.pdf");
  assert.equal("access_token" in payload.documents[0], false);
  assert.equal("privateKey" in payload.documents[0], false);
});

test("delete reports Storage success followed by Firestore failure as partial", async () => {
  const order = [];
  await assert.rejects(() => deleteDocumentAndFile({ id: "doc-1", filePath: "doc-1/a.pdf" }, {
    removeFile: async () => { order.push("storage"); },
    deleteMetadata: async () => { order.push("firestore"); throw new Error("offline"); }
  }), PartialDocumentDeletionError);
  assert.deepEqual(order, ["storage", "firestore"]);
  await assert.rejects(() => deleteDocumentAndFile({ id: "legacy", filePath: "legacy/path" }, {
    removeFile: async () => false,
    deleteMetadata: async () => { throw new Error("offline"); }
  }), (error) => !(error instanceof PartialDocumentDeletionError));
});

test("auth gateway keeps role checks local to the returned profile", async () => {
  assert.equal(hasAdminRole({ role: "admin" }), true);
  assert.equal(hasAdminRole({ role: "user" }), false);
  let requestedEmail = "";
  const gateway = createAuthGateway({ auth: { signInWithPassword: ({ email }) => { requestedEmail = email; return Promise.resolve({}); } } });
  await gateway.signInWithUsername(" Alice ", "unused");
  assert.equal(requestedEmail, "alice@auth.padlet.invalid");
});
