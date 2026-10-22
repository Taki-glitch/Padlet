import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const firebasePrivateKey = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function base64Url(value: string | Uint8Array) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; let binary = ""; bytes.forEach((byte) => binary += String.fromCharCode(byte)); return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

async function createFirebaseCustomToken(uid: string, role: "admin" | "user") {
  if (!firebaseClientEmail || !firebasePrivateKey) throw new Error("Secrets Firebase incomplets.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Firebase only propagates custom-token claims nested under `claims` to the
  // Firebase ID token used by Firestore Security Rules.
  const payload = base64Url(JSON.stringify({ iss: firebaseClientEmail, sub: firebaseClientEmail, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3600, uid, claims: { role } }));
  const der = Uint8Array.from(atob(firebasePrivateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "")), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuration Supabase incomplète.");
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: corsHeaders });
    const client = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: corsHeaders });
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = profile?.role;
    if (profileError || (role !== "admin" && role !== "user")) return new Response(JSON.stringify({ error: "Profil applicatif introuvable" }), { status: 403, headers: corsHeaders });
    return Response.json({ token: await createFirebaseCustomToken(user.id, role), uid: user.id, role }, { headers: corsHeaders });
  } catch (error) { console.error("Firebase custom token impossible", error); return new Response(JSON.stringify({ error: "Jeton Firebase indisponible" }), { status: 500, headers: corsHeaders }); }
});
