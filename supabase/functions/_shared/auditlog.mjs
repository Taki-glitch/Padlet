// Entrée de journal écrite PAR LE SERVEUR (Edge Function admin-users) pour les opérations sur les comptes.
// Contrairement au journal écrit par le navigateur, l'acteur est celui dont le jeton Supabase a été vérifié côté serveur,
// et l'ancien rôle est lu en base avant la modification. Aucun mot de passe ni jeton. Format Firestore REST.
export const AUDIT_ACTIONS = ["user.role-change", "user.create", "user.delete", "user.reset-password"];
const ROLES = ["admin", "user"];

export function buildAuditFields({ action, actorId, targetId, oldRole = null, newRole = null, result = "success", operationId, now = new Date(), retentionDays = 365 }) {
  if (!AUDIT_ACTIONS.includes(action)) throw new Error("Action d'audit invalide.");
  if (typeof actorId !== "string" || !actorId) throw new Error("Acteur d'audit manquant.");
  if (!["success", "failure"].includes(result)) throw new Error("Résultat d'audit invalide.");
  for (const role of [oldRole, newRole]) if (role !== null && !ROLES.includes(role)) throw new Error("Rôle d'audit invalide.");
  const fields = {
    action: { stringValue: action },
    resourceType: { stringValue: "user" },
    result: { stringValue: result },
    operationId: { stringValue: String(operationId || globalThis.crypto.randomUUID()).slice(0, 64) },
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
