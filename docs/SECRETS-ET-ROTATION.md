# Secrets, origines autorisées et rotation

Aucun secret ne doit être dans le dépôt (la CI le vérifie). Les secrets vivent dans Supabase → Edge Functions → Secrets.

| Secret | Rôle | Obligatoire |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | accès à Supabase depuis les fonctions | oui |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | jeton Firebase, journal, purge | oui |
| `ALLOWED_ORIGINS` | origines des sites autorisés, séparées par des virgules. Exemple : `https://taki-glitch.github.io` | non (valeur par défaut du code : le domaine GitHub Pages) |
| `REQUIRE_MFA_FOR_ADMIN` | `true` = deuxième étape exigée des administrateurs (voir docs/MFA.md) | non |

## Limiter les origines (CORS)
Le code de cette branche utilise `https://taki-glitch.github.io` si la variable est absente. Une valeur explicite remplace cette liste ; ajoute les origines exactes des environnements de test lorsque nécessaire. Une barre finale ou un chemin comme `/Padlet/` est normalisé en origine. Une liste explicitement vide n'accorde aucun accès CORS. Les prévols `OPTIONS` continuent de répondre, mais le navigateur refusera les origines non autorisées. **CORS n'est pas une authentification** : les fonctions vérifient toujours le bearer Supabase.

Après validation, déploie les nouvelles fonctions puis teste la connexion depuis GitHub Pages et chaque environnement autorisé. Si tu changes de domaine, ajoute le nouveau domaine à la variable avant le déploiement. Retour arrière : redéployer l'ancienne version et rétablir sa configuration d'origines ; ne supprime pas simplement la variable si l'ancienne version retombe sur `*`.

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
1. Vérifie d'abord que la version déployée utilise le défaut restrictif. Avec cette version, corrige `ALLOWED_ORIGINS` pour inclure l'origine réellement utilisée, puis redéploie. Ne supprime pas la variable comme geste automatique : une ancienne version peut alors autoriser `*`.
2. Ouvre `https://<ton-projet>.supabase.co/functions/v1/firebase-custom-token` dans le navigateur : `{"error":"Non authentifié"}` = la fonction répond.
3. Sinon, remets l'ancien code (GitHub → History du fichier) et redéploie.
