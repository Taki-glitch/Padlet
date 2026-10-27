// Authentification à deux facteurs (code à 6 chiffres d'une application d'authentification) : aides pures.
export function cleanTotpCode(value) {
    return String(value ?? "").replace(/\s+/g, "");
}
export function validateTotpCode(value) {
    return /^\d{6}$/.test(cleanTotpCode(value)) ? "" : "Saisissez le code à 6 chiffres affiché par votre application.";
}
// Après la connexion par mot de passe : faut-il demander le code ? (niveaux renvoyés par Supabase : aal1 = mot de passe seul, aal2 = + code)
export function needsMfaChallenge(level) {
    return Boolean(level) && level.nextLevel === "aal2" && level.currentLevel !== "aal2";
}
export function verifiedTotpFactor(factors) {
    return (factors?.totp || []).find((factor) => factor.status === "verified") || null;
}
