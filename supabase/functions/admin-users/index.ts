import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// --- Journal d'audit (intégré à ce fichier : déploiement en un seul fichier possible depuis l'éditeur Supabase ; testé par tests/phase7.test.mjs) ---
const AUDIT_ACTIONS = ["user.role-change", "user.create", "user.delete", "user.reset-password"];
const AUDIT_ROLES = ["admin", "user"];
function buildAuditFields({ action, actorId, targetId, oldRole = null, newRole = null, result = "success", operationId, now = new Date(), retentionDays = 365 }: Record<string, any>) {
  if (!AUDIT_ACTIONS.includes(action)) throw new Error("Action d'audit invalide.");
  if (typeof actorId !== "string" || !actorId) throw new Error("Acteur d'audit manquant.");
  if (!["success", "failure"].includes(result)) throw new Error("Résultat d'audit invalide.");
  for (const role of [oldRole, newRole]) if (role !== null && !AUDIT_ROLES.includes(role)) throw new Error("Rôle d'audit invalide.");
  const fields: Record<string, unknown> = {
    action: { stringValue: action },
    resourceType: { stringValue: "user" },
    result: { stringValue: result },
    operationId: { stringValue: String(operationId || crypto.randomUUID()).slice(0, 64) },
    userId: { stringValue: actorId },
    source: { stringValue: "server" },
    at: { timestampValue: now.toISOString() },
    expireAt: { timestampValue: new Date(now.getTime() + retentionDays * 86400000).toISOString() },
  };
  if (targetId) fields.resourceId = { stringValue: String(targetId).slice(0, 128) };
  if (oldRole) fields.oldRole = { stringValue: oldRole };
  if (newRole) fields.newRole = { stringValue: newRole };
  if (oldRole && newRole) fields.label = { stringValue: `${oldRole} → ${newRole}` };
  return fields;
}
// --- fin du journal d'audit ---

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

async function googleAccessToken() {
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
  return { accessToken, now };
}

// Journal serveur des opérations sur les comptes (Firestore REST, collection activityLog). Best effort : un échec du
// journal n'annule jamais l'opération ; la fonction renvoie false et le résultat l'indique (auditLogged).
async function writeAuditLog(entry: Record<string, unknown>) {
  try {
    const { accessToken } = await googleAccessToken();
    const fields = buildAuditFields(entry as never);
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/activityLog`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields })
    });
    return response.ok;
  } catch { console.error("Journal serveur indisponible."); return false; }
}

async function revokeFirebaseRefreshTokens(uid: string) {
  const { accessToken, now } = await googleAccessToken();
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
  let pending: Record<string, unknown> | null = null;
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
    pending = { action: body.action === "update" ? "user.role-change" : `user.${body.action}`, actorId: caller.id, targetId: typeof body.id === "string" ? body.id : undefined };
    if (body.action === "list") { const { data, error } = await admin.from("profiles").select("id, username, role, created_at").order("username"); if (error) throw error; return Response.json({ users: data }, { headers: corsHeaders }); }
    if (body.action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      if (!validUsername(username) || typeof body.password !== "string" || body.password.length < 8 || !["admin", "user"].includes(body.role)) throw new Error("Données utilisateur invalides.");
      const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${domain}`, password: body.password, email_confirm: true, user_metadata: { username } });
      if (error || !data.user) throw error ?? new Error("Création impossible.");
      const { error: roleError } = await admin.from("profiles").update({ role: body.role }).eq("id", data.user.id); if (roleError) throw roleError;
      const auditLogged = await writeAuditLog({ action: "user.create", actorId: caller.id, targetId: data.user.id, newRole: body.role });
      pending = null;
      return Response.json({ user: { id: data.user.id, username, role: body.role }, auditLogged }, { status: 201, headers: corsHeaders });
    }
    if (body.action === "update") {
      if (!["admin", "user"].includes(body.role) || typeof body.id !== "string") throw new Error("Rôle invalide.");
      const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", body.id).maybeSingle();
      if (targetError || !target) throw new Error("Utilisateur introuvable.");
      if (target.role === "admin" && body.role === "user") await revokeFirebaseRefreshTokens(body.id);
      const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", body.id);
      if (error) throw error;
      pending = null;
      const auditLogged = target.role === body.role ? null : await writeAuditLog({ action: "user.role-change", actorId: caller.id, targetId: body.id, oldRole: target.role, newRole: body.role });
      return Response.json({ ok: true, auditLogged }, { headers: corsHeaders });
    }
    if (body.action === "reset-password") { if (typeof body.password !== "string" || body.password.length < 8) throw new Error("Mot de passe invalide."); const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password }); if (error) throw error; pending = null; const auditLogged = await writeAuditLog({ action: "user.reset-password", actorId: caller.id, targetId: body.id }); return Response.json({ ok: true, auditLogged }, { headers: corsHeaders }); }
    if (body.action === "delete") {
      if (typeof body.id !== "string" || body.id === caller.id) throw new Error("Un administrateur ne peut pas supprimer son propre compte.");
      const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", body.id).maybeSingle();
      if (targetError || !target) throw new Error("Utilisateur introuvable.");
      if (target.role === "admin") await revokeFirebaseRefreshTokens(body.id);
      const { error } = await admin.auth.admin.deleteUser(body.id); if (error) throw error;
      pending = null;
      const auditLogged = await writeAuditLog({ action: "user.delete", actorId: caller.id, targetId: body.id, oldRole: target.role });
      return Response.json({ ok: true, auditLogged }, { headers: corsHeaders });
    }
    throw new Error("Action inconnue.");
  } catch (error) {
    console.error("Administration utilisateurs impossible.");
    if (pending && ["user.role-change", "user.create", "user.delete", "user.reset-password"].includes(String(pending.action))) await writeAuditLog({ ...pending, result: "failure" }); return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), { status: 400, headers: corsHeaders }); }
});
