# Déploiement

Aucun secret ne doit figurer dans le dépôt. La clé `SUPABASE_ANON_KEY` du navigateur est une clé publique par conception ; la clé de service et la clé privée Firebase n'existent que dans les secrets Supabase.

## 1. Interface (GitHub Pages)
Publier depuis la branche `main` (Settings → Pages). L'application est servie sous `/Padlet/` : tous les chemins du code sont relatifs. Avant de fusionner : onglet *Actions* au vert (syntaxe, imports, versions épinglées, tests), puis `docs/TESTS-MANUELS.md`.

## 2. Supabase
- **Secrets des fonctions** (Edge Functions → Secrets) : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (+ ceux de la purge, voir README).
- **Migrations** : dans l'ordre des noms de `supabase/migrations/` (SQL Editor ou `supabase db push`). Vérifier après coup que `select public.documents_storage_usage();` répond.
- **Fonctions** : `supabase functions deploy admin-users`, `firebase-custom-token`, `purge-expired-documents`. Ne déployer qu'après validation ; tester ensuite : connexion, liste et création d'un utilisateur, changement de rôle (puis Paramètres → Journal : l'entrée « enregistré par le serveur » doit apparaître).

## 3. Firebase
- Publier `firestore.rules` (Console → Firestore → Règles, ou `firebase deploy --only firestore:rules`) **après** passage des cas de `docs/REGLES-FIRESTORE-TESTS.md` dans le simulateur. Comparer d'abord avec les règles actuellement publiées.
- TTL : règle sur le groupe de collections `activityLog`, champ `expireAt` (voir `docs/JOURNAL-PURGE.md`).

## 4. Retour arrière
| Élément | Retour arrière |
|---|---|
| Interface | `git revert` du commit fautif sur `main` (GitHub : *Revert* sur la pull request) ; Pages republie seul |
| Edge Function | redéployer la version précédente depuis le commit précédent (`git checkout <commit> -- supabase/functions` puis `supabase functions deploy …`) |
| Règles Firestore | republier l'ancienne version (Console → Règles → historique) |
| Migration SQL | chaque migration à effet durable contient son retour arrière en commentaire ; `documents_storage_usage` se supprime par `drop function public.documents_storage_usage();` |
| Bucket public/privé | `update storage.buckets set public = true where id = 'documents';` |

Avant toute opération risquée : créer une sauvegarde depuis Paramètres et vérifier qu'elle s'ouvre.
