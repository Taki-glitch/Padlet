// Avis des utilisateurs : validation côté navigateur (les règles Firestore imposent les mêmes limites côté serveur).
export const FEEDBACK_TYPES = { bug: "Bug", suggestion: "Suggestion", utilisation: "Problème d’utilisation", autre: "Autre" };
export const FEEDBACK_LIMITS = { messageMin: 10, message: 2000, steps: 1000, page: 60 };

export function validateFeedback({ type, message, steps = "", page = "" } = {}) {
    const text = String(message ?? "").trim();
    if (!Object.hasOwn(FEEDBACK_TYPES, type)) return { error: "Choisissez un type d’avis." };
    if (text.length < FEEDBACK_LIMITS.messageMin) return { error: `Décrivez le problème ou la suggestion (au moins ${FEEDBACK_LIMITS.messageMin} caractères).` };
    if (text.length > FEEDBACK_LIMITS.message) return { error: `Message trop long (${FEEDBACK_LIMITS.message} caractères maximum).` };
    const details = String(steps ?? "").trim();
    if (details.length > FEEDBACK_LIMITS.steps) return { error: `Étapes trop longues (${FEEDBACK_LIMITS.steps} caractères maximum).` };
    const data = { type, message: text };
    if (details) data.steps = details;
    const where = String(page ?? "").trim().slice(0, FEEDBACK_LIMITS.page);
    if (where) data.page = where;
    return { data };
}
