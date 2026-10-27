# Journal des modifications

Les versions sont numérotées à partir de 0.7.0 (première version numérotée ; le numéro vit dans `package.json` et `modules/version.mjs`, un test vérifie qu'ils sont identiques). Les phases 1 à 6 précédentes ne portaient pas de numéro.

## 1.0.0-rc.1 — Version candidate 1.0.0

Toutes les fonctions listées ci-dessous sont dans le code et leurs calculs sont testés ; **l'interface n'a pas été vue dans un navigateur**. Passage en 1.0.0 : docs/RELEASE-1.0.0.md.

### Nouveautés
- **Authentification à deux étapes** (code à 6 chiffres) : activation dans Paramètres, code demandé à la connexion ; exigence côté serveur pour les administrateurs possible avec `REQUIRE_MFA_FOR_ADMIN` (désactivée par défaut). Voir docs/MFA.md.
- **CORS limitable** (`ALLOWED_ORIGINS`) dans `admin-users` et `firebase-custom-token` ; sans le secret, comportement inchangé.
- **Calendrier mensuel** des échéances et expirations (tableau de bord).
- **Bandeau de rappel** (échéances dépassées ou proches, expirations, rappel de sauvegarde pour l'administrateur) et **bandeau hors connexion**.
- **Statut « en cours »** des échéances ; **épingler** des fiches en haut de la liste ; **note privée** d'administrateur par fiche (collection `adminNotes`, règles à republier).
- **Santé du site** (administrateur) : dernière sauvegarde, dernière purge, PDF à indexer, partage, conformité des fiches.
- **Export CSV** des fiches affichées (protégé contre l'injection de formule) ; **journal** filtrable et exportable en CSV.
- **Frise** : regroupement par année civile, légende cliquable (filtre par thème).
- **Raccourcis clavier** (`/` rechercher, `?` guide, `n` ajouter, `1` `2` `3` vues) et lien « Aller au contenu ».
- **Application installable** (manifeste et icônes ; pas de mode hors ligne, aucun document privé conservé sur l'appareil).
- **CI et outils** : Dependabot (actions GitHub), workflows manuels Lighthouse et test de fumée navigateur (écrits, jamais exécutés).
- Déjà présents et non refaits : vue liste/grille de la bibliothèque, vue liste de la frise, suppression automatique du journal (à activer), contrôle des secrets.

### Documentation
- `docs/RELEASE-1.0.0.md` (check-list et fonctions reportées avec leurs raisons), `docs/MFA.md`, `docs/SECRETS-ET-ROTATION.md`, `docs/SAUVEGARDE-PLANIFIEE.md`, `docs/NOTIFICATIONS-EMAIL.md`.

### À savoir
- `firestore.rules.partage` contient un nouveau bloc `adminNotes` : à republier. Les fonctions `admin-users` et `firebase-custom-token` changent : à redéployer.
- 89 tests.

## 0.13.0 — Navigation dans la frise et vue liste

### Nouveautés (module testé ; interface **non vérifiée dans un navigateur**)
- **Navigation** : boutons Début, Précédent, Aujourd'hui, Suivant, Fin, « Aller à » une date, et « Tout afficher » (réinitialise les filtres). « Précédent/Suivant » passent au regroupement voisin (mois ou année théocratique) ; sans regroupement, ils avancent d'environ 80 % de l'écran.
- **Vue liste accessible** (case « Vue liste ») : mêmes données et mêmes filtres que la frise graphique, dans l'ordre des dates, avec titres de regroupement, lisible au clavier et par les lecteurs d'écran ; mémorisée avec le zoom et le regroupement. La frise graphique n'est pas modifiée.
- La zone défilable de la frise est atteignable au clavier (Tab, puis flèches).
- Aucune date ni donnée n'est modifiée : le regroupement reste purement visuel.

### À savoir
- Aucune modification des règles Firebase ni des données. 82 tests.

## 0.12.0 — Audit : correction de régression, contrôles statiques, diagnostic des fiches

### Correction
- Le filtre « Collection » (0.11.0) est maintenant compté dans les puces de critères, le compteur de filtres, le message « aucun résultat » et l'état vide.

### Nouveautés (interface **non vérifiée dans un navigateur**)
- Paramètres → « Contrôler les fiches (lecture seule) » : fiches que les règles refuseraient, champs inconnus, partage absent. Ne modifie rien. Prépare un éventuel durcissement des règles.

### Tests
- `tests/security-static.test.mjs` : pas d'injection HTML ni d'`eval`, `rel=noopener` sur les liens, collections et accès des règles, vérification du jeton dans les fonctions sans contrôle de passerelle, cohérence des filtres, schéma des fiches. 81 tests.
- `tests-rules/` et `.github/workflows/rules-emulator.yml` : tests des règles sur l'émulateur Firebase, **écrits mais jamais exécutés** ; non bloquants au premier passage.

### Documentation
- `docs/AUDIT-0.12.md` (constats, risques, points non vérifiables), `docs/CSP.md` (étude, non appliquée).

## 0.11.0 — Collections et échéances récurrentes

### Nouveautés (modules testés ; interface **non vérifiée dans un navigateur**)
- **Collections** (dossiers virtuels, sans doublon de fichier) : champ « Collections » dans le formulaire (noms séparés par des virgules, comme les tags), filtre « Collection », recherche, action groupée « Ajouter à la collection », recherches enregistrées. Thèmes et tags restent inchangés.
- **Échéances récurrentes** : « Répétition » (chaque semaine / mois / année) et « Répéter jusqu'au » dans le formulaire d'une échéance. Terminer une échéance crée la suivante (identifiant stable `<série>-<n>` : pas de doublon en cas de double clic ou de nouvel essai). Le jour du mois d'origine est conservé (31 → 28 février → 31 mars). Rouvrir une échéance ne supprime pas la suivante.
- **Export .ics** : une échéance récurrente est exportée avec la règle de répétition (`RRULE`) et un identifiant de série ; l'occurrence terminée n'est pas exportée. Limite : un « chaque mois le 31 » saute les mois courts dans l'agenda, alors que l'application recule au dernier jour du mois.

### À savoir
- Aucune modification de `firestore.rules` ni de `firestore.rules.partage` : les nouveaux champs (`collections`, `recurrence`, `seriesId`, `occurrence`) sont des champs facultatifs.
- 75 tests.

## 0.10.0 — Actions groupées, guide, avis, accessibilité

### Nouveautés (modules testés ; interface **non vérifiée dans un navigateur**)
- **Actions groupées** (administrateur, mode « Sélectionner ») : Partager, Ne plus partager, Définir le thème, Ajouter le tag. Confirmation avant écriture, bilan « n modifiés · n déjà à jour · échecs listés », journalisé (`document.bulk-update`).
- **Guide d'utilisation** : s'ouvre une fois par compte à la première connexion avec cette version, relançable depuis le menu du compte ; le contenu dépend du rôle.
- **Donner un avis** (menu du compte) : type, description, étapes, page ; enregistré dans la collection Firestore `feedback` avec l'identifiant du compte et la version ; lisible dans Paramètres → « Avis reçus » (administrateur). **Le succès n'est annoncé qu'après confirmation de Firestore.** Nécessite la publication des règles à jour (`firestore.rules.partage`, bloc `feedback`).
- **Accessibilité** : contour de focus visible, respect de « réduire les animations ».

### Documentation
- `docs/PLAN-MODELE-DONNEES.md` (collections, pièces jointes, versions, récurrences : plan à valider), cas 22 à 25 dans `docs/REGLES-FIRESTORE-TESTS.md`.
- 71 tests.

### À savoir
- Si `firestore.rules.partage` est déjà publiée : la republier (elle contient maintenant `feedback`), sinon l'envoi d'un avis affiche « pas encore activé ».

## 0.9.1 — Message d'erreur réel pour la gestion des comptes

- Gestion des utilisateurs : l'échec d'une suppression ou d'un changement de rôle affiche maintenant la **cause renvoyée par le serveur** au lieu d'un texte générique (diagnostic de la suppression d'un compte administrateur impossible).

## 0.9.0 — Partage document par document

### Nouveautés (modules et règles testés ; interface **non vérifiée dans un navigateur**)
- Case « Visible par les utilisateurs » dans le formulaire (nouvelles fiches : non partagées par défaut ; anciennes : état actuel conservé). Pastille « Non partagé » pour les administrateurs.
- Paramètres → « Partage avec les utilisateurs » : résumé, **simulation** puis **préparation** des anciennes fiches (écrit `shared` partout sans changer ce que les utilisateurs voient ; idempotent ; reprise possible).
- La corbeille rend la fiche non partagée et la restauration rétablit l'ancien état : les fiches supprimées ne seront plus envoyées aux utilisateurs.
- Écoute Firestore des utilisateurs ordinaires filtrée sur `shared == true`, **désactivée par défaut** (`SHARING_ENFORCED = false` dans `modules/sharing.mjs`) pour éviter une liste vide avant la préparation.
- `firestore.rules.partage` : règles cibles, **à ne pas publier avant les étapes 2 et 4 de `docs/PARTAGE.md`**. `firestore.rules` (règles actuelles) est inchangé.

### Documentation
- `docs/PARTAGE.md` (mise en place pas à pas et retour arrière), cas 17 à 21 dans `docs/REGLES-FIRESTORE-TESTS.md`, `docs/PERMISSIONS.md` mis à jour.
- 68 tests.

### Limites
- Fichiers toujours accessibles par lien direct (bucket public, décision du propriétaire) ; partage « tout le monde ou personne ».

## 0.8.0 — Doublons, recherches enregistrées, échéances terminées, contrôle des secrets

### Nouveautés (modules testés ; affichage **non vérifié dans un navigateur**)
- **Avertissement de doublon** à l'envoi d'un fichier : empreinte SHA-256 calculée dans le navigateur ; « fichier identique » (même contenu) ou « même nom et même taille » (anciennes fiches sans empreinte). Avertissement seulement, jamais de suppression. L'empreinte est conservée dans la fiche (`sha256`).
- **Recherches enregistrées** (Filtres) : par utilisateur, sur l'appareil (localStorage), 20 maximum.
- **Échéances terminées** : bouton dans la fiche (administrateur), champs `done`/`doneAt` ; masquées du tableau de bord et de l'export .ics, conservées dans la frise ; réversible.
- **Contrôle des secrets** en CI (`scripts/check-secrets.mjs`) : clés privées, jeton `service_role`, clé `sb_secret_`. Les clés publiques sont autorisées.

### Correction de cohérence
- Le journal d'audit des comptes est **intégré à `admin-users/index.ts`** (déployable en un seul fichier depuis l'éditeur Supabase) ; `_shared/auditlog.mjs` est supprimé (plus d'import manquant possible). Le test exécute le code réellement déployé.

### Documentation
- `docs/PLAN-CORBEILLE.md` (plan à valider), `docs/PERMISSIONS.md`, `docs/TEST-RESTAURATION.md`, tests d'appareils réels dans `docs/TESTS-MANUELS.md`.
- 65 tests.

## 0.7.3 — Cause trouvée : fiches avec « retentionMonths: null »

### Correction importante
- Les règles Firestore refusent `retentionMonths: null` (ni nombre ni texte). L'ancien formulaire enregistrait cette valeur quand la durée de conservation était vide. Conséquence : toute écriture sur une telle fiche était refusée — **indexation PDF** (3 fiches signalées), mais aussi modification, mise à la corbeille, restauration et recalcul d'expiration. Désormais toutes les écritures sur `padletItems` passent par `mergeItem()`, qui supprime ce champ nul (`deleteField`) au passage. Le formulaire n'enregistre plus de nul non plus. Aucune modification des règles Firestore ni des données à faire à la main : les fiches se réparent à leur prochaine écriture.
- Test ajouté (60 tests).

## 0.7.2 — Indexation des PDF fiabilisée, tableau de bord

Cumule 0.7.1 (diagnostic) : si vous êtes en 0.7.0, ce lot contient les deux.

### Corrections (indexation des PDF)
- Un PDF dont la lecture avait échoué une fois gardait l'état « error » et n'était **jamais retenté** (le bouton répondait « Tous les PDF sont déjà indexés »). Désormais ils sont retentés, et un échec n'est plus mémorisé.
- pdf.js est chargé depuis **deux sources** (cdnjs, puis jsDelivr) : une source bloquée n'empêche plus l'indexation.
- Messages précis par cause : lecture du fichier impossible, bibliothèque non chargée, PDF illisible, règles Firestore, écriture refusée.
- Paramètres affiche en permanence : nombre de PDF, indexés, sans texte (scannés), à indexer.
- (0.7.1) Écoute Firestore refusée : code d'erreur affiché et reconnexion avec un jeton neuf ; pré-contrôle des limites des règles (`modules/rules-check.mjs`).

### Nouveautés
- Tableau de bord : « Échéances dépassées (30 jours) », « Documents par thème », « Fichiers les plus volumineux » (calculs dans `modules/dashboard.mjs`, testés ; affichage **non vérifié dans un navigateur**).

### Tests
- 59 tests (5 de plus).

## 0.7.1 — Diagnostic de l'indexation des PDF
Rapport : « Missing or insufficient permissions » dans la console pendant l'indexation. **Cause non confirmée** (voir docs/PHASE7.md) ; ce correctif la rend identifiable.
- Écoute Firestore refusée : le code d'erreur exact est affiché et une reconnexion avec un jeton neuf est tentée une fois par minute.
- Indexation : une fiche refusée n'arrête plus tout ; arrêt après 3 échecs ; les fiches fautives sont nommées avec leur code d'erreur.
- Pré-contrôle (`modules/rules-check.mjs`) : indique le champ d'une ancienne fiche qui ferait refuser toute écriture par les règles (les règles valident le document résultant). Un test vérifie que ses limites sont identiques à `firestore.rules`.

## 0.7.0 — Phase 7 (audit, finitions, journal serveur)

### Nouveautés (dans le code, **non vérifiées dans un navigateur** — voir docs/PHASE7.md)
- Paramètres : **changement de mot de passe personnel** (mot de passe actuel, nouveau, confirmation, affichage temporaire, anti double envoi ; succès affiché seulement après la réponse de Supabase).
- Paramètres : **export .ics** des échéances et des dates d'expiration de documents (journées entières, accents, pliage RFC 5545, identifiants stables). Export ponctuel, pas de synchronisation.
- **Lien direct vers une fiche** : `…/Padlet/#fiche=<id>` + bouton « Copier le lien » dans la fiche. Une fiche en corbeille ou inexistante affiche un message « introuvable ».
- Recherche : sous une carte, « Trouvé aussi dans : … » quand le terme n'est présent que dans un champ non affiché (type de fichier, date, tags, durée de conservation…).
- Feuille d'impression (masque les menus, conserve les couleurs de la frise).
- Titre, description, favicon, couleur de thème ; version affichée dans Paramètres.

### Sécurité
- `admin-users` : **journal côté serveur** des créations, changements de rôle (ancien → nouveau), réinitialisations de mot de passe (sans le mot de passe) et suppressions de comptes, avec l'acteur vérifié par le serveur, y compris les échecs. Au mieux : un échec du journal n'annule pas l'opération (`auditLogged: false`). **Nécessite le redéploiement de la fonction.**
- Edge Functions : `supabase-js` épinglé en **2.45.4** (comme le navigateur). **Nécessite le redéploiement** ; à tester après (connexion, liste/création d'utilisateur, purge).

### Corrections
- Migration `20261021000000 documents storage usage.sql` renommée `20261021000000_documents_storage_usage.sql` : avec des espaces, la CLI Supabase l'ignorait (calcul d'espace de stockage absent si la base a été migrée par `db push`). Contenu inchangé, idempotent.

### Outils
- `check-syntax` analyse maintenant les Edge Functions `.ts` (Node ≥ 22.13).
- 9 nouveaux tests (`tests/phase7.test.mjs`) : 54 tests au total.

### Configuration / migrations
- Aucune nouvelle migration SQL. Aucune modification de `firestore.rules`.

### Limitations connues
- Voir « Non intégré » dans docs/PHASE7.md (corbeille visible des utilisateurs via Firestore, bucket public, pas de test navigateur automatisé, etc.).
