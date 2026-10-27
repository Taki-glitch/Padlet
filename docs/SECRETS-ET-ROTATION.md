# Secrets, origines autorisées et rotation

Aucun secret ne doit être dans le dépôt (la CI le vérifie). Les secrets vivent dans Supabase → Edge Functions → Secrets.

| Secret | Rôle | Obligatoire |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | accès à Supabase depuis les fonctions | oui |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | jeton Firebase, journal, purge | oui |
| `ALLOWED_ORIGINS` | sites autorisés à appeler les fonctions, séparés par des virgules. Exemple : `https://taki-glitch.github.io` | non (absent = tous, comme avant) |
| `REQUIRE_MFA_FOR_ADMIN` | `true` = deuxième étape exigée des administrateurs (voir docs/MFA.md) | non |

## Limiter les origines (CORS)
Ajoute `ALLOWED_ORIGINS` = `https://taki-glitch.github.io` (depuis la rc.2 une barre finale ou `/Padlet/` sont tolérés ; avant, ils bloquaient la connexion), puis **redéploie** `admin-users` et `firebase-custom-token`. Teste immédiatement la connexion. Si tu changes un jour de nom de domaine, mets à jour ce secret **avant**, sinon plus personne ne pourra se connecter. Retour arrière : supprimer le secret.

## Rotation (à faire si un secret a pu fuiter, ou une fois par an)
**Clé de compte de service Firebase** (`FIREBASE_PRIVATE_KEY`) :
1. Google Cloud Console → IAM et administration → Comptes de service → ton compte de service → Clés → **Ajouter une clé** (JSON).
2. Mets à jour les 3 secrets `FIREBASE_*` dans Supabase avec la nouvelle clé.
3. Vérifie : connexion au site, indexation d'un PDF, journal.
4. Retourne dans Google Cloud et **supprime l'ancienne clé**.

**Clé de service Supabase** : Supabase → Project Settings → API (ou API Keys) → régénérer la clé `service_role` / secret ; mets à jour `SUPABASE_SERVICE_ROLE_KEY` ; redéploie ; vérifie la création d'un utilisateur de test.

**Clé publique (anon / publishable)** : pas un secret ; la changer oblige à mettre à jour `supabase-config.js` sur GitHub.

Ne colle jamais une clé dans une conversation, une issue GitHub ou un fichier du dépôt. Active **Secret scanning** et **Push protection** sur GitHub (Settings → Code security).

## Si la connexion échoue après un déploiement (« Failed to send a request to the Edge Function »)
1. Supabase → Edge Functions → Secrets : si `ALLOWED_ORIGINS` existe, **supprime-le** (ou corrige-le) puis redéploie la fonction.
2. Ouvre `https://<ton-projet>.supabase.co/functions/v1/firebase-custom-token` dans le navigateur : `{"error":"Non authentifié"}` = la fonction répond.
3. Sinon, remets l'ancien code (GitHub → History du fichier) et redéploie.
