import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const firebasePrivateKey = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function firebaseAccessToken() {
  if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) throw new Error("Secrets Firebase incomplets.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: firebaseClientEmail, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const privateKey = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(firebasePrivateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "")), (char) => char.charCodeAt(0)).buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${claims}`));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}` }) });
  if (!response.ok) throw new Error(`OAuth Firebase: ${await response.text()}`);
  return (await response.json()).access_token as string;
}

const fieldValue = (field: Record<string, unknown> | undefined) => field?.stringValue as string | undefined;

function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

function addRetentionMonths(dateValue: string, months: number): string | null {
  if (!isCivilDate(dateValue) || !Number.isSafeInteger(months) || months < 1) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12 + 1;
  if (targetYear > 9999) return null;
  const leap = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][targetMonth - 1];
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, daysInMonth)).padStart(2, "0")}`;
}

function retentionMonthsValue(field: Record<string, unknown> | undefined): number | null {
  const value = field?.integerValue ?? field?.doubleValue;
  const months = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isSafeInteger(months) && months > 0 ? months : null;
}

Deno.serve(async () => {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error("Secrets Supabase incomplets.");
    const token = await firebaseAccessToken();
    // expiresAt est une date civile UTC, valable toute cette journée. La purge
    // quotidienne ne sélectionne que les échéances strictement antérieures à aujourd'hui.
    const today = new Date().toISOString().slice(0, 10);
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents:runQuery`;
    const query = { structuredQuery: { from: [{ collectionId: "padletItems" }], where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN", value: { stringValue: today } } } } };
    const queryResponse = await fetch(queryUrl, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(query) });
    if (!queryResponse.ok) throw new Error(`Lecture Firestore: ${await queryResponse.text()}`);
    const results = await queryResponse.json();
    const storage = createClient(supabaseUrl, supabaseServiceRoleKey);
    const failures: string[] = [];
    let deleted = 0;
    for (const result of results) {
      if (!result.document) continue;
      const document = result.document;
      const fields = document.fields ?? {};
      const documentDate = fieldValue(fields.date);
      const expiresAt = fieldValue(fields.expiresAt);
      const retentionMonths = retentionMonthsValue(fields.retentionMonths);
      const expectedExpiry = documentDate && retentionMonths ? addRetentionMonths(documentDate, retentionMonths) : null;
      const itemType = fieldValue(fields.type);
      if ((itemType && itemType !== "document") || !isCivilDate(expiresAt) || !expectedExpiry || expectedExpiry !== expiresAt) {
        console.error(`Échéance incohérente conservée pour vérification : ${document.name}`);
        failures.push(document.name);
        continue;
      }
      const filePath = fieldValue(document.fields?.filePath);
      try {
        // Storage est supprimé en premier : en cas d'échec, les métadonnées restent pour un nouvel essai.
        if (filePath) {
          const { error } = await storage.storage.from("documents").remove([filePath]);
          if (error) throw error;
        }
        const deleteResponse = await fetch(`https://firestore.googleapis.com/v1/${document.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!deleteResponse.ok) throw new Error(`Suppression Firestore: ${await deleteResponse.text()}`);
        deleted += 1;
      } catch (error) {
        console.error(`Expiration impossible pour ${document.name}`, error);
        failures.push(document.name);
      }
    }
    return Response.json({ deleted, failures });
  } catch (error) {
    console.error("Purge planifiée impossible.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
});
