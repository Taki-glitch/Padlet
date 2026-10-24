# Cas de test des règles Firestore (simulateur : Console → Firestore → Règles → Simulateur)

**Statut : jamais exécutés** (aucun émulateur ni accès Firebase pendant la phase 7). Cochez ce que vous avez réellement passé. Pour les cas « admin », ajoutez dans le jeton simulé la revendication `role = "admin"` ; « user » : `role = "user"`.

| # | Chemin | Opération | Acteur | Attendu |
|---|---|---|---|---|
| 1 | `padletItems/x` | get | non connecté | refusé |
| 2 | `padletItems/x` | get | user | autorisé |
| 3 | `padletItems/x` | create `{type:"document", title:"Test"}` | admin | autorisé |
| 4 | `padletItems/x` | create (même données) | user | refusé |
| 5 | `padletItems/x` | create `{title: <400 caractères>}` | admin | refusé |
| 6 | `padletItems/x` | create `{type:"autre"}` | admin | refusé |
| 7 | `padletItems/x` | create `{fileSize: 60000000}` | admin | refusé |
| 8 | `padletItems/x` | update `{title:"Nouveau"}` | user | refusé |
| 9 | `padletItems/x` | delete | user | refusé |
| 10 | `padletItems/x` | delete | admin | autorisé |
| 11 | `activityLog/e` | get | user | refusé |
| 12 | `activityLog/e` | create valide (`userId` = uid de l'admin, `at` = heure serveur, `expireAt` dans 365 j) | admin | autorisé |
| 13 | `activityLog/e` | create avec `userId` d'un autre | admin | refusé |
| 14 | `activityLog/e` | update ou delete | admin | refusé |
| 15 | `system/lastPurge` | get | user | refusé |
| 16 | `system/lastPurge` | write | admin | refusé |

Cas **connu et non corrigé** : un `user` peut lire une fiche en corbeille (#2 sur une fiche avec `deletedAt`). Voir docs/PHASE7.md §4.
Les écritures de la fonction `admin-users` dans `activityLog` passent par le compte de service (contourne les règles, comme `system/lastPurge`) ; leurs champs supplémentaires (`source`, `oldRole`, `newRole`) ne concernent donc pas la règle #12.
