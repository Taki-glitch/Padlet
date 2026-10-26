# Audit 0.12.0 — constats, corrections et ce qui reste à vérifier

Base : le dépôt de travail à la version 0.11.0 (aucune nouvelle archive fournie). Aucun accès à Firebase, Supabase, GitHub ni à un navigateur.
**Preuves** : [auto] test Node exécuté · [code] lu dans le code, non exécuté · [bloqué] impossible ici (service ou navigateur absent).

## 1. Problèmes confirmés
| # | Constat | Gravité | Statut |
|---|---|---|---|
| 1 | **Régression de la 0.11.0** : le filtre « Collection » n'était pas pris en compte dans les puces de critères, le compteur de filtres, le message « aucun résultat » et le texte d'état vide (5 endroits). Le filtrage lui-même fonctionnait. | Moyenne (affichage) | **Corrigé** + test statique qui empêche l'oubli d'un filtre [auto] |
| 2 | Règles actuelles (`firestore.rules`) : tout utilisateur connecté lit toutes les fiches, corbeille comprise | Haute (confidentialité) | Connu, décision prise ; corrigé par `firestore.rules.partage` **à publier** (docs/PARTAGE.md) [code] |
| 3 | Bucket `documents` public : toute personne ayant le lien lit le fichier, même si la fiche n'est pas partagée | Moyenne | **Accepté par le propriétaire** (connexion requise pour trouver les liens) ; documenté |

## 2. Risques potentiels (non confirmés)
- **CORS `*`** dans `admin-users` et `firebase-custom-token` [code] : les appels exigent un jeton dans l'en-tête (pas de cookies), le risque est faible. Recommandation : limiter à `https://taki-glitch.github.io`. **Non appliqué** : demande un redéploiement et risque de bloquer un autre domaine (aperçu, test). À décider.
- **Pas de liste blanche de champs** dans `validItem` [code] : un administrateur peut écrire un champ arbitraire. Risque faible (écriture réservée aux administrateurs). Durcissement **différé** : il refuserait toute fiche ancienne qui contient un champ inconnu (même mécanisme que `retentionMonths`). Étape préalable livrée : Paramètres → « Contrôler les fiches » liste, en lecture seule, les fiches concernées.
- **Rôle figé dans le jeton** jusqu'à 1 h [code] ; la rétrogradation d'un administrateur révoque ses sessions Firebase (code d'`admin-users`).
- **Pas de limitation de débit** sur les Edge Functions (au-delà des limites de Supabase).
- **Historique Git** : non accessible ici, donc non audité. Voir §5.

## 3. Points déjà corrects
- Aucune injection HTML (`innerHTML`, `eval`, `document.write`… absents du code du navigateur) ; test statique [auto].
- Liens externes : `rel="noopener"` partout ; test statique [auto].
- Fonctions avec `verify_jwt = false` : vérifient bien le jeton (`auth.getUser`) et relisent le rôle en base (`profiles`) [code + test statique auto].
- Règles : seulement les collections prévues, aucun accès ouvert, journal non modifiable, `system` en écriture interdite [test statique auto sur les deux fichiers de règles].
- Le texte des fiches non partagées n'est pas exposé via l'indexation PDF : `pdfText` est un champ de la fiche, soumis aux mêmes règles [code].
- Secrets : contrôle automatique en CI (clés privées, `service_role`, `sb_secret_`) ; clé publique du navigateur autorisée [auto].

## 4. Ce qui ne peut pas être vérifié depuis le code
- Règles **réellement publiées** dans Firebase ; politiques Storage réellement actives ; TTL du journal activé → à contrôler dans les consoles.
- Tests des règles sur l'émulateur : `tests-rules/` + `.github/workflows/rules-emulator.yml` **écrits mais jamais exécutés** ; premier passage dans GitHub Actions (non bloquant).
- Parcours dans un navigateur (Playwright), appareils réels, restauration complète : [bloqué].

## 5. À faire de ton côté
1. GitHub → Settings → Code security → activer **Secret scanning** et **Push protection** (gratuit sur un dépôt public) : couvre l'historique Git, que je ne peux pas lire.
2. Lancer le workflow **Règles Firestore (émulateur)** (Actions → Run workflow) et me donner le résultat ; s'il est vert, retirer `continue-on-error`.
3. Paramètres → **Contrôler les fiches** : me dire le résultat (il prépare le durcissement des règles).
4. Terminer le partage (docs/PARTAGE.md) puis publier `firestore.rules.partage`.
5. Décider pour le CORS (limiter à l'adresse du site ?).

## 6. Retour arrière
Aucune donnée ni règle n'est modifiée par cette version. Revert de la pull request.
