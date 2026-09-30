import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const domain = "auth.padlet.invalid";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const validUsername = (username: unknown) => typeof username === "string" && /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!url || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) throw new Error("Non authentifié");
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    const admin = createClient(url, serviceRoleKey);
    const { data: profile } = caller ? await admin.from("profiles").select("role").eq("id", caller.id).maybeSingle() : { data: null };
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
    if (body.action === "update") { if (!["admin", "user"].includes(body.role)) throw new Error("Rôle invalide."); const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", body.id); if (error) throw error; return Response.json({ ok: true }, { headers: corsHeaders }); }
    if (body.action === "reset-password") { if (typeof body.password !== "string" || body.password.length < 8) throw new Error("Mot de passe invalide."); const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password }); if (error) throw error; return Response.json({ ok: true }, { headers: corsHeaders }); }
    if (body.action === "delete") { if (body.id === caller.id) throw new Error("Un administrateur ne peut pas supprimer son propre compte."); const { error } = await admin.auth.admin.deleteUser(body.id); if (error) throw error; return Response.json({ ok: true }, { headers: corsHeaders }); }
    throw new Error("Action inconnue.");
  } catch (error) { console.error("Administration utilisateurs impossible", error); return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), { status: 400, headers: corsHeaders }); }
});
