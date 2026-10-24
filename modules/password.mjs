// Validation du changement de mot de passe personnel (le mot de passe n'est jamais stocké ni journalisé).
// Les bornes reprennent celles de l'Edge Function admin-users (8 caractères minimum) ; 72 = limite bcrypt de Supabase Auth.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function validatePasswordChange({ current = "", next = "", confirm = "" } = {}) {
    if (!current) return "Saisissez votre mot de passe actuel.";
    if (next.length < PASSWORD_MIN) return `Le nouveau mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
    if (next.length > PASSWORD_MAX) return `Le nouveau mot de passe ne peut pas dépasser ${PASSWORD_MAX} caractères.`;
    if (next === current) return "Le nouveau mot de passe doit être différent de l’actuel.";
    if (next !== confirm) return "La confirmation ne correspond pas au nouveau mot de passe.";
    return "";
}
