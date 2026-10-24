# Architecture de Padlet

Ce document décrit ce qui existe réellement dans le dépôt (état : 0.7.0). Détails de mise en place : `README.md` ; sécurité : `docs/SECURITE.md` ; sauvegarde : `docs/SAUVEGARDE-RESTAURATION.md` ; journal et purge : `docs/JOURNAL-PURGE.md`.

## Composants
| Couche | Technologie | Rôle |
|---|---|---|
| Interface | `index.html`, `style.css`, `script.js` + `modules/*.mjs` | Application statique servie par GitHub Pages sous `/Padlet/` |
| Comptes | Supabase Auth | Connexion par identifiant (pseudo-e-mail `<identifiant>@auth.padlet.invalid`), table `profiles` (rôle `admin` ou `user`) |
| Session de données | Firebase Auth (jeton personnalisé) | Edge Function `firebase-custom-token` : échange la session Supabase contre un jeton Firebase portant le rôle |
| Métadonnées | Firestore | `padletItems` (documents **et** échéances, champ `type`), `activityLog` (journal), `system/lastPurge` (état de la purge) |
| Fichiers | Supabase Storage | Bucket `documents` (50 Mio max par fichier), chemin conservé dans `filePath` |
| Opérations serveur | Supabase Edge Functions (Deno) | `admin-users`, `firebase-custom-token`, `purge-expired-documents` |

## Flux principaux
1. **Connexion** : navigateur → Supabase Auth → session. Puis `firebase-custom-token` (vérifie la session, lit le rôle dans `profiles`) → jeton Firebase → `onSnapshot` sur `padletItems`. Le navigateur refuse de continuer si l'UID ou le rôle du jeton ne correspondent pas à la session Supabase.
2. **Droits** : appliqués côté serveur — Firestore (`firestore.rules`, rôle lu dans le jeton) et Storage (politiques SQL, écriture réservée aux admins). Masquer un bouton n'est jamais la seule protection. Limite connue : le rôle est figé dans le jeton jusqu'à son renouvellement (≤ 1 h) ; la rétrogradation d'un admin révoque ses sessions Firebase via `admin-users`.
3. **Gestion des comptes** : l'interface appelle `admin-users` (vérifie que l'appelant est admin dans `profiles`, puis agit avec la clé de service). Depuis 0.7.0 la fonction écrit aussi une entrée dans `activityLog` (acteur vérifié, ancien → nouveau rôle).
4. **Documents** : fiche dans Firestore + fichier dans Storage. Suppression « douce » (corbeille, champ `deletedAt`) puis suppression définitive ou purge ; l'aperçu utilise une URL signée d'une heure calculée depuis `filePath` (jamais enregistrée).
5. **Purge planifiée** : tâche `pg_cron` → `purge-expired-documents` (Storage d'abord, Firestore ensuite) → état dans `system/lastPurge`.
6. **Sauvegarde / restauration** : fichier de sauvegarde généré par le navigateur (`modules/backup.mjs`) avec empreintes SHA-256 ; restauration par plan d'abord (`planRestore`), puis exécution. Voir `docs/SAUVEGARDE-RESTAURATION.md`. **Le test réel sur un environnement isolé reste à faire** (voir docs/PHASE7.md).

## Rôles
- `admin` : tout (création/modification/suppression, corbeille, sauvegarde, utilisateurs, journal).
- `user` : lecture des fiches, recherche, favoris (stockés localement), préférences personnelles, export .ics, changement de son mot de passe.

## Où se trouve quoi
`modules/` logique pure testable (recherche, ics, sauvegarde, corbeille, files, activité…) ; `supabase/functions/_shared/` code partagé navigateur/Edge ; `supabase/migrations/` SQL ; `tests/` tests Node ; `scripts/` contrôles CI.
