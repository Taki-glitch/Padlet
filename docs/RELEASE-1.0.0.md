# Passer de 1.0.0-rc.1 à 1.0.0

**Pourquoi « rc.1 » (version candidate) et pas 1.0.0 directement ?** Un numéro 1.0.0 dit « éprouvée ». Or cette version contient beaucoup d'écrans que je n'ai pas pu voir dans un navigateur, et plusieurs vérifications dépendent de tes consoles Firebase et Supabase. Le jour où la liste ci-dessous est cochée, on passe à 1.0.0 en changeant **un seul mot** (voir la fin).

## Check-list de passage à 1.0.0 (dans cet ordre)
1. [ ] Fusionner cette version ; **Actions** vert ; Paramètres affiche « Version 1.0.0-rc.1 ».
2. [ ] Tester dans un navigateur tout ce qui est dans `docs/TESTS-MANUELS.md` (sections 0.7.0 à 1.0.0-rc.1), sur ordinateur **et** téléphone.
3. [ ] Terminer le partage (`docs/PARTAGE.md`, étapes 2 à 6) et **republier** `firestore.rules.partage` (elle contient maintenant `feedback` et `adminNotes`).
4. [ ] Passer les tests des règles : GitHub → Actions → « Règles Firestore (émulateur) » → Run workflow, vert. Puis retirer `continue-on-error: true` de `.github/workflows/rules-emulator.yml`.
5. [ ] Lancer « Test de fumée (navigateur) » et « Mesure de performance (Lighthouse) » (Actions → Run workflow) ; noter les résultats.
6. [ ] **Test réel de restauration** sur un projet de test (`docs/TEST-RESTAURATION.md`).
7. [ ] Activer ta deuxième étape (`docs/MFA.md`) ; décider d'imposer ou non `REQUIRE_MFA_FOR_ADMIN`.
8. [ ] Redéployer `admin-users` et `firebase-custom-token` (éditeur Supabase, fichier complet de chaque fonction) ; tester création d'utilisateur, changement de rôle, connexion.
9. [ ] Décider de `ALLOWED_ORIGINS` (`docs/SECRETS-ET-ROTATION.md`).
10. [ ] Activer le TTL du journal (`docs/JOURNAL-PURGE.md`) et le « Secret scanning » GitHub.
11. [ ] Paramètres → « Contrôler les fiches » : aucun problème restant, ou problèmes connus et acceptés.

## Pour passer en 1.0.0
Sur GitHub, dans **deux** fichiers : `modules/version.mjs` (`export const APP_VERSION = "1.0.0-rc.1";` → `"1.0.0"`) et `package.json` (`"version": "1.0.0-rc.1"` → `"1.0.0"`). Un test vérifie qu'ils sont identiques. Ajoute la date dans `CHANGELOG.md`.

## Ce qui n'est PAS dans la 1.0.0, et pourquoi
| Idée | Raison | Prochaine étape |
|---|---|---|
| Plusieurs fichiers par fiche, versions de fichiers | touchent suppression, corbeille, purge, sauvegarde, restauration en même temps ; impossibles à vérifier sans navigateur ni projet de test | à faire **après** le test de restauration, en lecture seule d'abord (`docs/PLAN-MODELE-DONNEES.md`) |
| Import de plusieurs fichiers par glisser-déposer | réécriture du flux d'envoi, risque de fiches incomplètes | après les tests navigateur |
| Import de fiches depuis un CSV | format et règles de doublons à décider ; l'export CSV, lui, est fourni | décision à prendre |
| Bucket privé pour les fichiers non partagés | refonte des liens, des aperçus et de la restauration | si la confidentialité des fichiers devient nécessaire (décision actuelle : bucket public) |
| Partage par personne ou par groupe | change les règles et les requêtes | après la 1.0.0 |
| Invitations par e-mail, rôle « éditeur », notifications e-mail | service d'envoi à choisir (`docs/NOTIFICATIONS-EMAIL.md`), matrice de droits à définir | décision à prendre |
| Sauvegarde automatique | demande un stockage séparé et des secrets (`docs/SAUVEGARDE-PLANIFIEE.md`) ; la 1.0.0 fournit le rappel et le suivi | décision à prendre |
| Miniatures PDF, OCR, recherche tolérante aux fautes | coût et gain à mesurer sur tes vrais documents | si le besoin se confirme |
| Zoom au pincement, mini-carte de la frise, abonnement agenda, synchronisation des préférences | rendu à vérifier visuellement ; abonnement = service en ligne | après les tests navigateur |
| Mode hors ligne (service worker) | risque : garder des documents privés sur l'appareil. La 1.0.0 est **installable** (manifeste) mais sans mode hors ligne | à étudier avec une revue de sécurité |
| Découper `script.js`, historique des modifications, liens document ↔ événement, affichage progressif, remontée d'erreurs | refonte ou gain non mesuré ; à faire avec les tests navigateur | après la 1.0.0 |
| Mode maintenance | les écritures sont déjà réservées aux administrateurs : peu d'intérêt réel | non retenu |
