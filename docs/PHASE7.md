# Phase 7 — audit des deux prompts et lot de finitions

Base : `Padlet-phase6.zip` + `firestore.rules`. Aucune connexion à Firebase, Supabase ou GitHub depuis l'environnement de travail ; pas de navigateur.

## Légende des preuves
**[auto]** test Node exécuté · **[code]** relu dans le code, non exécuté · **[bloqué]** demande un accès (Firebase, Supabase, navigateur) · **[à faire]** action manuelle

## 1. Matrice des fonctionnalités (état réel)
| Sujet | État | Preuve |
|---|---|---|
| Connexion/déconnexion, rôles, pont Firebase | présent | [code] |
| Gestion des utilisateurs (admin) | présent | [code] |
| Documents, échéances, favoris (locaux par utilisateur), recherche, filtres, frise, tableau de bord | présent | [code] |
| Corbeille, restauration, purge planifiée + état `system/lastPurge` | présent | [code] + tests unitaires `trash-reconcile` [auto] |
| Sauvegarde/restauration avec SHA-256 | présent, testé **en simulation** | [auto] unitaires ; **test réel à faire** [bloqué] |
| Recherche dans le texte des PDF (`pdfText`) | présente (indexation à l'envoi) | [code] |
| Aperçus par URL signée (1 h) | présent | [code] ; mobile [à faire] |
| Limite 50 Mio, types par signature de contenu | présent (client + migration bucket) | [auto] `files.test` ; migration appliquée ? [à faire] |
| Journal d'activité + TTL | présent ; TTL à activer | [code] ; [à faire] |
| CI (syntaxe, imports, versions, tests) | présente | [auto] 54 tests OK |
| Changement de mot de passe par `window.prompt()` | **n'existe pas** : aucun `prompt()` dans le code. Il n'y avait que la réinitialisation par l'admin (formulaire intégré). Le changement **personnel** manquait : ajouté. | [code] |
| « Consultés récemment » absent de la frise | le code le masque quand la frise est affichée | [code] — non confirmé en navigateur |

## 2. Problèmes confirmés dans le code
1. **Migration mal nommée** (espaces) → ignorée par la CLI Supabase. Corrigé.
2. **Edge Functions non épinglées** (`supabase-js@2`). Corrigé (2.45.4), redéploiement requis.
3. **Journal des changements de rôle écrit par le navigateur**, sans ancien/nouveau rôle. Complété côté serveur.
4. **Recherche : champs indexés mais invisibles** (type de fichier, dates, durée de conservation…) → résultat sans surlignage. Indice ajouté.
5. **Corbeille lisible par tous les utilisateurs connectés** : la règle `allow read: if request.auth != null` renvoie aussi les fiches supprimées ; seul le navigateur les masque. **Non corrigé** (voir §4).
6. **Bucket `documents` public** (documenté, bascule à décider).
7. Pas de test navigateur ; règles Firestore jamais exécutées dans un simulateur.
8. Pas de `ARCHITECTURE.md`, `DEPLOIEMENT.md`, `CHANGELOG.md`, version, favicon, description : ajoutés.

## 3. Ce qui a été ajouté (voir CHANGELOG.md)
Mot de passe personnel · export .ics · lien direct `#fiche=` · indice de recherche · journal serveur des comptes · impression · métadonnées/version · migration renommée · Edge épinglées · contrôle de syntaxe `.ts` · 3 documents + ce rapport.
Tests [auto] : `tests/phase7.test.mjs` (9 tests) ; `npm run check` et `node --test tests/*.mjs` : **54/54**.
**Non vérifié en navigateur** : tout le câblage visuel (modale mot de passe, bouton .ics, bouton « Copier le lien », indice de recherche, impression). Seuls les modules purs sont testés.
**Non vérifié en conditions réelles** : `admin-users` modifié (syntaxe vérifiée seulement), changement de mot de passe avec Supabase (la réauthentification utilise `signInWithUsername`).

## 4. Non intégré pour l'instant — et pourquoi
| Idée (prompt) | Raison |
|---|---|
| Masquer la corbeille **à la source** (3.4) | Firestore filtre par règle seulement si la requête le prouve : il faut soit ajouter un champ `deletedAt: null` à *toutes* les fiches (migration de données), soit deux requêtes distinctes. Chantier à valider avec vous ; une règle posée seule casserait la liste des utilisateurs. |
| Bucket privé (3.2) | Bascule de production : procédure déjà dans `docs/SECURITE.md` ; à faire par vous après test des aperçus. |
| Tests Playwright (3.1) | Pas de navigateur ni de réseau ici : je ne peux pas les exécuter, donc pas les livrer comme validés. À faire en pull request avec CI, itérer sur les erreurs. |
| Test réel sauvegarde/restauration (1.1) | Exige un projet Supabase/Firebase de test. Procédure à suivre dans `docs/TESTS-MANUELS.md`. |
| Tests des règles Firestore (1.2) | Pas d'émulateur ici. Cas à passer dans le simulateur : `docs/REGLES-FIRESTORE-TESTS.md`. |
| Purge automatique de la corbeille (3.3) | Suppression définitive : durée de conservation et mode simulation à décider avec vous. |
| Alertes e-mail, notifications (3.6, 4.8, 10) | Aucun service d'envoi configuré ; je ne l'invente pas. |
| CSP (3.7) | Peut bloquer la connexion ; à tester navigateur ouvert (proposition dans `docs/SECURITE.md`). |
| Liste MIME serveur (3.8) | Demande l'inventaire de vos fichiers existants (requête SQL dans `docs/SECURITE.md`). |
| « Donner un avis » (2.2) | Aucun service de réception. Option réaliste : collection Firestore `feedback` (nouvelles règles + protection anti-spam). À valider. |
| Statut/récurrence des échéances (4.3), collections/dossiers (4.5), plusieurs fichiers (4.6), versions et doublons (5.4–5.6) | Changements du modèle de données : le prompt exige de proposer la structure et de rester rétrocompatible avant de coder. |
| Opérations en masse (thème/tags), import glisser-déposer (4.1, 4.7) | Interface lourde, à tester en navigateur ; la sécurité serveur existe déjà (écriture admin seulement). |
| Navigation temporelle de la frise, liste accessible (4.2, 5.3) | Touche à un rendu déjà complexe (plusieurs couches CSS) ; sans navigateur je risquerais une régression. |
| Tableau de bord enrichi, rôle éditeur, invitations, PWA, préférences synchronisées, guide, miniatures PDF, historique | Valeur/risque à arbitrer ; PWA et rôle éditeur touchent à la sécurité (cache, matrice de droits). |
| OCR, IA, migration Supabase, refonte | Explicitement exclus par les deux prompts. |
| Découpage de `script.js` (6.1) | Prévu **après** les tests navigateur, selon les prompts. |

## 5. À faire de votre côté (ordre conseillé)
1. Fusionner ce lot, laisser la CI passer, puis `docs/TESTS-MANUELS.md` en navigateur (mobile compris).
2. Vérifier `select public.documents_storage_usage();` dans Supabase (la migration renommée) ; vérifier que la migration `…_bucket_limits.sql` est appliquée.
3. Redéployer `admin-users` (et les deux autres fonctions, épinglées) puis tester une création d'utilisateur et un changement de rôle ; contrôler l'entrée dans Paramètres → Journal. Si `auditLogged` est faux, vérifier que le compte de service Firebase a le droit d'écrire dans Firestore.
4. Passer les cas de `docs/REGLES-FIRESTORE-TESTS.md` dans le simulateur, comparer avec les règles publiées.
5. Activer le TTL `activityLog.expireAt`.
6. Faire une sauvegarde et une **restauration réelle** sur un projet de test.

## 6. Retour arrière
Voir `DEPLOIEMENT.md` §4. Ce lot ne modifie ni `firestore.rules`, ni les données, ni le format des fiches : `git revert` de la pull request suffit pour l'interface ; la fonction `admin-users` se redéploie depuis le commit précédent.

## 7. Indexation des PDF (0.7.1 et 0.7.2)
Symptôme signalé : l'indexation ne fonctionne pas ; une erreur « Missing or insufficient permissions » a été vue dans la console. **La cause exacte n'est pas confirmée** : les règles Firestore relues acceptent l'écriture `pdfText`/`pdfTextStatus` d'un administrateur (limites 20 000 et 10 caractères respectées par l'extraction).
Causes plausibles, de la plus probable à la moins probable :
1. une ancienne fiche contient un champ que les règles refusent (texte trop long, `fileSize` en texte…) : Firestore valide le document **résultant**, donc toute écriture sur cette fiche est refusée. Le pré-contrôle (0.7.1) nomme le champ ;
2. jeton Firebase sans le rôle `admin` (session périmée) : reconnexion automatique (0.7.1) ;
3. bibliothèque pdf.js non chargée (source bloquée) : seconde source (0.7.2) ;
4. échecs précédents mémorisés (`error`) donc jamais retentés : corrigé (0.7.2).
À faire après déploiement : Paramètres → « Indexer les PDF non indexés », puis **lire le message affiché** : il nomme la fiche et la cause.
