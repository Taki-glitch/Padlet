// Journal d'activité : construction d'un événement normalisé. Aucun contenu de document, mot de passe ni jeton.
// `at` (serverTimestamp) et `expireAt` sont ajoutés par l'appelant ; la liste ACTIVITY_FIELDS doit rester identique
// à celle de la règle `hasOnly` de firestore.rules (vérifié par tests/activity.test.mjs).
export const ACTIVITY_FIELDS = ["action", "resourceType", "resourceId", "result", "operationId", "userId", "label", "count", "at", "expireAt"];
export const ACTIVITY_RETENTION_DAYS = 365;
const RESOURCES = ["document", "deadline", "backup", "storage", "user"];

export function buildActivityEvent(input, userId, fallbackOperationId = globalThis.crypto.randomUUID()) {
    const { action, resourceType, resourceId, result = "success", label, count, operationId } = input || {};
    if (typeof action !== "string" || action.length > 60 || !/^[a-z]+(\.[a-z-]+)+$/.test(action)) throw new Error("Action de journal invalide.");
    if (!RESOURCES.includes(resourceType)) throw new Error("Type de ressource de journal invalide.");
    if (!["success", "failure"].includes(result)) throw new Error("Résultat de journal invalide.");
    if (typeof userId !== "string" || !userId) throw new Error("Utilisateur de journal manquant.");
    const event = { action, resourceType, result, userId, operationId: String(operationId || fallbackOperationId).slice(0, 64) };
    if (resourceId) event.resourceId = String(resourceId).slice(0, 128);
    const cleanLabel = String(label ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
    if (cleanLabel) event.label = cleanLabel;
    if (Number.isInteger(count) && count >= 0) event.count = count;
    return event;
}
