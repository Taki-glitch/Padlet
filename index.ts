import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
const firebasePrivateKey = (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
const domain = "auth.padlet.invalid";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const validUsername = (username: unknown) => typeof username === "string" && /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function revokeFirebaseRefreshTokens(uid: string) {
  if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) throw new Error("Secrets Firebase requis pour révoquer les sessions.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: firebaseClientEmail, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const keyBytes = Uint8Array.from(atob(firebasePrivateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "")), (char) => char.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey("pkcs8", keyBytes.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${claims}`));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}` }) });
  if (!tokenResponse.ok) throw new Error("Impossible d’obtenir une autorisation Firebase pour révoquer les sessions.");
  const { access_token: accessToken } = await tokenResponse.json();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseProjectId}/accounts:update`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, validSince: String(now) })
  });
  if (!response.ok) {
    let errorCode = "";
    try { errorCode = (await response.json())?.error?.message || ""; } catch { /* Keep the operational error generic. */ }
    if (response.status === 400 && errorCode === "USER_NOT_FOUND") return;
    throw new Error("Impossible de révoquer les sessions Firebase de cet utilisateur.");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!url || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) throw new Error("Non authentifié");
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    const admin = createClient(url, serviceRoleKey);
    const { data: profile, error: profileError } = caller ? await admin.from("profiles").select("id, username, role").eq("id", caller.id).maybeSingle() : { data: null, error: null };
    if (callerError || profileError) throw new Error("Vérification de la session impossible.");
    if (!caller || profile?.role !== "admin") return new Response(JSON.stringify({ error: "Accès administrateur requis" }), { status: 403, headers: corsHeaders });
    const body = await request.json();
    if (body.action === "list") { const { data, error } = await admin.from("profiles").select("id, username, role, created_at").order("username"); if (error) throw error; return Response.json({ users: data }, { headers: corsHeaders }); }
    if (body.action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      if (!validUsername(username) || typeof body.password !== "string" || body.password.length < 8 || !["admin", "user"].includes(body.role)) throw new Error("Données utilisateur invalides.");
      const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${domain}`, password: body.password, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw error ?? new Error("Création impossible.");
      const { error: roleError } = await admin.from("profiles").update({ role: body.role }).eq("id", data.user.id); if (roleError) throw roleError;
      return Response.json({ user: { id: data.user.id, username, role: body.role } }, { status: 201, headers: corsHeaders });
    }
    if (body.action === "update") {
      if (!["admin", "user"].includes(body.role) || typeof body.id !== "string") throw new Error("Rôle invalide.");
      const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", body.id).maybeSingle();
      if (targetError || !target) throw new Error("Utilisateur introuvable.");
      if (target.role === "admin" && body.role === "user") await revokeFirebaseRefreshTokens(body.id);
      const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
    if (body.action === "reset-password") { if (typeof body.password !== "string" || body.password.length < 8) throw new Error("Mot de passe invalide."); const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password }); if (error) throw error; return Response.json({ ok: true }, { headers: corsHeaders }); }
    if (body.action === "delete") {
      if (typeof body.id !== "string" || body.id === caller.id) throw new Error("Un administrateur ne peut pas supprimer son propre compte.");
      const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", body.id).maybeSingle();
      if (targetError || !target) throw new Error("Utilisateur introuvable.");
      if (target.role === "admin") await revokeFirebaseRefreshTokens(body.id);
      const { error } = await admin.auth.admin.deleteUser(body.id); if (error) throw error;
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
    throw new Error("Action inconnue.");
  } catch (error) { console.error("Administration utilisateurs impossible."); return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), { status: 400, headers: corsHeaders }); }
});
