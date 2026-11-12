# Audit initial — Padlet

Date : 2026-11-12. Base examinée : dépôt public `taki-glitch/Padlet`, branche `main` récupérée pour cet audit. Examen statique des fichiers suivis ; aucun accès aux consoles Firebase, Supabase ou GitHub ni à un navigateur n'a été utilisé.

## Portée et preuves

- Arborescence, README, architecture, règles Firestore, migrations SQL, Edge Functions, scripts de contrôle, tests et documentation ont été recensés ou lus.
- Les commandes demandées `npm run check` et `npm test` n'ont pas pu s'exécuter : `npm` et `node` ne sont pas installés dans l'environnement. Les contrôles individuels avec Node sont donc également impossibles.
- Ce document distingue les constats dans le dépôt des états distants, qui ne sont pas observables ici.

## Fonctionnalités repérées

L'application est un frontend statique HTML/CSS/JavaScript avec modules natifs. Le code contient l'authentification Supabase et son pont vers Firebase Auth, l'accès Firestore, le stockage Supabase, le partage par fiche, recherche et indexation PDF côté navigateur, thèmes/tags, collections, favoris et recherches sauvegardées, frise et regroupements, échéances et récurrences, tableau de bord, corbeille, gestion des utilisateurs, journal, exportations CSV/ICS/JSON, sauvegarde/restauration ZIP avec empreintes, conservation et purge, préférences, MFA optionnelle, retours utilisateurs et contrôles de schéma.

Tests présents : modules Node sous `tests/`, tests de règles Firebase Emulator sous `tests-rules/`, et un scénario Playwright de fumée sous `e2e/`. Leur présence ne prouve pas leur exécution ni la couverture complète des parcours demandés.

## Anomalies confirmées

| Constat | Preuve | Conséquence |
|---|---|---|
| Le dossier de l'Edge Function était nommé `firebase-custome-token`, alors que la configuration Supabase, les tests, les consignes de déploiement et les références documentaires attendent `firebase-custom-token`. | Arborescence et références dans les fichiers | Le nom passé au CLI et le chemin source ne concordaient pas. Le dossier a été renommé dans cette branche de travail ; aucune fonction distante n'a été supprimée ou modifiée. |
| `scripts/check-pinned.mjs` existait mais n'était pas invoqué par `npm run check`. | `package.json` | Les versions CDN flottantes ne faisaient pas partie du contrôle standard. L'intégration est faite dans cette branche. |
| La documentation décrivait des workflows CI, émulateur, navigateur et Lighthouse absents de l'arborescence `.github/workflows/`. | Inventaire des fichiers, `docs/CI.md`, `docs/RELEASE-1.0.0.md`, changelog | Les instructions présentaient comme accessibles des Actions qui n'existaient pas. `docs/CI.md` et la checklist de version ont été rectifiés pour refléter l'état réel. |
| Les règles `firestore.rules` autorisent la lecture de toutes les fiches à tout utilisateur Firebase authentifié ; aucune condition ne vérifie `shared` ou `deletedAt`. | Lecture statique de `firestore.rules` | Risque confirmé d'accès aux fiches privées et aux éléments en corbeille via Firestore direct. `firestore.rules.partage` est une cible distincte et n'est pas publiée par cette intervention. |
| Le bucket de documents est documenté comme public, et des politiques SQL historiques accordent une lecture publique. | `README.md` et migrations Supabase | Une URL publique connue donne accès au fichier indépendamment de l'accès à sa fiche. Le statut réel du bucket et des politiques doit être contrôlé dans Supabase. |
| Les tests d'émulateur et Playwright sont déclarés non exécutés dans leurs propres commentaires/docs ; leurs dépendances ne sont pas déclarées dans `package.json`. | `tests-rules/`, `e2e/`, `package.json`, `docs/` | La reproduction nécessite une installation/outillage séparés. Aucun résultat d'exécution n'est affirmé ici. |

## Risques potentiels et vérifications requises

- **Confidentialité Firestore — confirmé dans le code, impact distant à vérifier :** les règles actuellement versionnées laissent lire `padletItems` à tout utilisateur connecté. Il faut comparer ces règles à Firebase et évaluer le contenu déjà présent. Le fichier cible `firestore.rules.partage` requiert une préparation des fiches anciennes et une vérification des requêtes avant publication. Aucune règle n'a été publiée.
- **Corbeille / partage — risque de cohérence :** le client filtre les utilisateurs ordinaires sur `shared == true`; les règles cibles font de même. La sécurité finale dépend donc des données préparées correctement et des règles effectivement publiées.
- **Storage — confidentialité limitée :** le code conserve des URL publiques selon la documentation. Les politiques, l'existence du bucket, les limites et l'état de production ne sont pas vérifiables localement.
- **Origines CORS :** les fonctions acceptent par défaut toutes les origines si `ALLOWED_ORIGINS` manque (état documenté dans `docs/SECRETS-ET-ROTATION.md`). L'impact dépend des secrets actuellement configurés. Aucun changement de secret ni redéploiement n'a été fait.
- **Secrets / historique Git :** `supabase-config.js` contient une URL de projet et une clé publishable, prévue pour le frontend. Le script de contrôle des secrets existe mais n'a pas été exécutable. L'historique distant et les réglages secret scanning/push protection ne sont pas audités.
- **MFA :** option documentée et désactivée par défaut ; comptes et parcours réels non vérifiés. Aucune exigence MFA n'a été activée.
- **Restauration et purge :** code et tests sont présents, mais un cycle réel isolé et l'état des migrations, cron, Vault et droits IAM doivent être vérifiés manuellement. Aucun test destructif n'a été lancé.

## Fonctionnalités non vérifiées dans un navigateur

Connexion/déconnexion, permissions avec comptes réels, affichage et recherche, extraction PDF via CDN, aperçu, upload/suppression Storage, partage, frise et écriture Firestore, corbeille, échéances, gestion des comptes, sauvegarde/restauration complète, responsive et accessibilité. Le test E2E présent n'est qu'un test de fumée lecture seule et n'a pas été exécuté.

## Changements ciblés de la phase 1 dans cette branche

- Renommage du répertoire de fonction en `supabase/functions/firebase-custom-token/` pour s'aligner sur `supabase/config.toml`, les tests et la procédure de déploiement.
- Ajout de `scripts/check-pinned.mjs` à la commande `npm run check`.
- Correction de la documentation CI et de la checklist 1.0 pour signaler explicitement l'absence actuelle des workflows.

## Actions manuelles nécessaires

1. Après installation de Node.js/npm, exécuter `npm run check` et `npm test`, puis examiner chaque échec.
2. Faire vérifier les règles et les fiches existantes dans Firebase, utiliser le simulateur / émulateur, valider la migration de partage et prévoir le retour arrière avant toute publication.
3. Vérifier dans Supabase le bucket, ses politiques, `ALLOWED_ORIGINS`, les fonctions déployées, Vault et les migrations réellement appliquées.
4. Vérifier dans GitHub les secrets d'historique et la configuration des protections de branche ; ajouter et exécuter les workflows avant de s'appuyer sur leurs statuts.
5. Exécuter les parcours de navigateur et une restauration sur un environnement isolé avec données jetables.

## Retour arrière

Les changements de phase 1 sont locaux au dépôt : restaurer le nom précédent du dossier seulement si un consommateur local inattendu l'exige, retirer `&& node scripts/check-pinned.mjs` du script `check`, et rétablir les deux fichiers de documentation. Ils n'altèrent aucune règle, migration ou donnée distante. Un revert du commit annule tous ces changements ensemble.
