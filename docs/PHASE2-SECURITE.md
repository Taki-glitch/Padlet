# Phase 2 — Audit sécurité et plan de durcissement

État au 2026-11-12. Analyse du dépôt uniquement. Aucune règle, migration SQL, secret, bucket ou fonction distante n'a été publiée ou modifiée.

## Constats

### Firestore

- **Confirmé — exposition dans les règles versionnées.** `firestore.rules` accorde `read` à tout compte Firebase authentifié sur `padletItems`, sans vérifier `shared` ou `deletedAt`. Une lecture directe Firestore peut donc récupérer une fiche non partagée ou en corbeille.
- **Confirmé — candidat partage incomplet pour les états incohérents.** `firestore.rules.partage` autorise une fiche lorsque `shared == true`, même si `deletedAt` est présent. Le code de suppression logique met normalement `shared` à `false`, et le plan de préparation prévoit de masquer les fiches de corbeille ; la règle seule n'assure toutefois pas l'invisibilité si les champs ne concordent pas.
- **Confirmé — filtre client déjà activé dans le dépôt.** `modules/sharing.mjs` définit `SHARING_ENFORCED = true`; le client ordinaire requête `shared == true`. Cela ne prouve ni que le code publié est identique, ni que les données de production sont préparées.
- **Point bloquant avant règle stricte :** les règles Firestore ne filtrent pas les résultats. Pour garantir aussi la lecture directe et l'accès aux fiches de corbeille, il faut un marqueur d'état actif obligatoire dans les documents, une migration rétrocompatible des fiches existantes, une requête client qui contraint ce marqueur et des tests émulateur. Proposition : écrire `deletedAt: null` sur toutes les fiches actives, remplacer les effacements du champ à la création/restauration par cette valeur, exiger le champ présent et nul dans la règle, et requêter `shared == true` avec `deletedAt == null`. Les éléments à la corbeille gardent leur date ISO. L'émulateur doit confirmer le comportement des requêtes avec ce schéma avant tout déploiement.
- **À vérifier manuellement :** règles réellement déployées, version du frontend servie, nombre de fiches sans `shared`, fiches à `deletedAt` avec `shared == true`, anciennes fiches, et résultat simulé du plan de préparation. Je ne peux pas consulter ces données depuis le dépôt.

### Supabase Storage

- **Confirmé — bucket public selon le code et les migrations/documentations versionnés.** Une URL publique connue permet la lecture sans authentification.
- **Confirmé — la lecture authentifiée n'est pas limitée au partage.** La migration `20260930000001_authenticated_documents_storage.sql` autorise `select` sur tous les objets `documents` pour `authenticated`. La migration suivante limite les écritures et suppressions aux admins, mais conserve cette lecture générale.
- **Conséquence :** rendre le bucket privé ne suffirait pas pour l'objectif de partage par fiche. Avec la politique de lecture authentifiée actuelle, un compte connecté pourrait encore lire un objet s'il connaît son chemin, et demander une URL signée depuis le client. Il faut d'abord une fonction serveur de signature qui vérifie le rôle dans `profiles`, le document Firestore, son `shared`, son état actif et l'égalité exacte de `filePath`; puis retirer la lecture générale et faire passer les téléchargements/aperçus par ce service.
- **Compatibilité à préserver :** les chemins persistés (`filePath`), `fileUrl`, les références héritées `padlet-files/`, les aperçus PDF, la lecture pendant la sauvegarde, le remplacement de fichier, la suppression et la purge. Aucun chemin ni objet ne doit être réécrit pendant cette phase.
- **Migration progressive et retour arrière :** voir `docs/SECURITE.md`. Elle place la bascule `public = false` en dernier, après inventaire, Edge Function, tests isolés, et préparation du rétablissement des politiques et du bucket public.

### Edge Functions

- `firebase-custom-token` vérifie l'utilisateur avec `supabase.auth.getUser()`, relit son rôle dans `profiles` et ne renvoie que le jeton Firebase, l'UID et le rôle. Les secrets Firebase sont lus depuis `Deno.env`.
- `admin-users` vérifie le bearer Supabase et le rôle admin en base avant les opérations d'administration. La fonction utilise le rôle service côté serveur.
- `purge-expired-documents` est protégée par un bearer de service comparé en temps constant, valide les expirations avant suppression et supprime Storage avant les métadonnées Firestore. Les journaux évitent les valeurs de secrets ; les réponses sont génériques sur l'échec général.
- Limites non vérifiables localement : secrets réellement configurés, journaux distants, IAM Firebase, journaux de déploiement et droits exacts du service account.

### CORS et secrets

- Les deux fonctions appelées par le navigateur partageaient un défaut `Access-Control-Allow-Origin: *` lorsque `ALLOWED_ORIGINS` était absente. Cette branche utilise maintenant le domaine GitHub Pages comme valeur de repli ; une liste explicite peut inclure les environnements de test. Une liste vide n'accorde aucun en-tête CORS. `OPTIONS` répond toujours. CORS ne remplace pas le contrôle du bearer.
- La configuration se prend en compte seulement après déploiement des fonctions. Aucun secret n'a été modifié.
- Le contrôle local `scripts/check-secrets.mjs` détecte certaines clés privées et clés Supabase à risque, sans imprimer leurs valeurs ; il ne scanne pas l'historique Git. La clé frontend `sb_publishable_…` est une clé publique prévue à cet effet.

## Changements de cette étape

- Défaut CORS restreint aux deux Edge Functions `admin-users` et `firebase-custom-token`.
- Test unitaire étendu : défaut de production, origine explicitement vide, origine autorisée, origine refusée, préservation de `Vary` et cohérence du bloc des deux fonctions.
- Test Firebase Emulator complété avec un scénario de restauration par un administrateur et lecture permise après restauration.
- Documentation de partage rectifiée : état actuel `SHARING_ENFORCED`, préparation inconnue, exigence de schéma actif pour fermer le cas `deletedAt` incohérent.
- Procédure Storage mise à jour pour éviter la bascule seule et préserver les chemins.

## Résultats de validation

- Le diff textuel a été contrôlé ; l'exécution des tests reste **non vérifiée** car Node.js/npm ne sont pas installés dans l'environnement courant. Les tests émulateur requièrent en plus Firebase Emulator Suite et ses dépendances.
- Aucun simulateur Firebase/Supabase ni navigateur connecté n'a été utilisé.
- Les CORS ne changent dans Supabase qu'au prochain déploiement manuel. Les règles et politiques distantes restent inchangées.

## Actions manuelles avant tout déploiement

1. Installer Node.js/npm et exécuter `npm run check` et `npm test`.
2. Exécuter `tests-rules/` avec l'émulateur. Étendre d'abord les fixtures au marqueur `deletedAt: null` et valider lectures directes, requêtes, corbeille, restauration, anciennes fiches et documents partagés.
3. Dans Firebase, vérifier la version des règles publiées et préparer le décompte des fiches. Tester le jeu de règles candidat sans publier.
4. Dans Supabase, vérifier bucket, politiques, taille maximale, anciennes URL et fonctions déployées.
5. Tester CORS avec GitHub Pages et chacun des domaines d'aperçu/test autorisés avant de redéployer les deux Edge Functions.
6. Ne rendre le bucket privé qu'après implémentation et tests d'un service de signature qui autorise chaque document côté serveur.

## Retour arrière

- Code CORS : revert des deux blocs et du test associé, puis redéploiement explicite de l'ancienne fonction uniquement si nécessaire. Note : l'ancienne version autorise `*` si `ALLOWED_ORIGINS` est absent.
- Firestore et Storage : aucun changement distant n'ayant été effectué, aucune restauration distante n'est nécessaire.
- Tests/documentation : revert des fichiers de la phase 2.
