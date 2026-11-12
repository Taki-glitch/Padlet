# Partage document par document

**Principe** : chaque fiche (document ou échéance) a un champ `shared`. Un administrateur voit tout ; un utilisateur ordinaire ne voit que les fiches « Visible par les utilisateurs ». Une fiche mise à la corbeille devient non partagée (donc plus envoyée aux utilisateurs) ; sa restauration rétablit son ancien état.

**État à valider avant toute publication** : le code examiné a déjà `SHARING_ENFORCED = true`. Cela confirme seulement le filtre côté client, pas l'état des données. Je ne peux pas vérifier ici que la préparation des anciennes fiches a été exécutée ni que « À préparer » vaut 0. Les règles `firestore.rules.partage` n'ont pas été publiées par ce travail.

**Limites connues**
- Les **fichiers** restent dans un bucket public (décision prise) : une personne qui a le lien direct d'un fichier peut l'ouvrir, même si la fiche n'est pas partagée. Les liens ne sont jamais montrés aux utilisateurs qui n'ont pas accès à la fiche, mais ce n'est pas une barrière. Pour une vraie confidentialité des fichiers, il faudra un bucket privé.
- Partage « tout le monde ou personne » : pas de partage par personne (possible plus tard).
- Sans l'étape 6, le filtre n'est appliqué que par l'application ; ce sont les règles Firestore (étape 6) qui l'imposent vraiment.

## Mise en place — dans cet ordre, sans en sauter
**Étape 1 — Vérifier le code et l'état distant.** Le dépôt examiné a déjà `SHARING_ENFORCED = true`; ne change pas l'interrupteur sans raison. Vérifie dans le site réellement publié quelle version sert les utilisateurs.

**Étape 2 — Préparer les anciennes fiches.** Connecté en administrateur : Paramètres → « Partage avec les utilisateurs » → **Simuler la préparation du partage** (rien n'est écrit, tu lis les chiffres) → **Appliquer la préparation**. Toutes les fiches actives deviennent « partagées » (comme aujourd'hui) ; celles de la corbeille deviennent non partagées. Vérifie que « À préparer » tombe à **0**.

**Étape 3 — Choisir quoi cacher.** Ouvre les fiches à réserver aux administrateurs (bouton Modifier), décoche « Visible par les utilisateurs », enregistre. Une pastille « Non partagé » apparaît sur la carte. Les nouvelles fiches sont **non partagées par défaut**.

**Étape 4 — Vérifier le filtre côté utilisateurs.** Après préparation réussie, teste avec un compte ordinaire : seules les fiches partagées doivent apparaître. Si la liste est vide, arrête le déploiement des règles et corrige d'abord la préparation des fiches.

**Étape 5 — Contrôler les règles dans le simulateur Firebase** (voir `docs/REGLES-FIRESTORE-TESTS.md`, cas 17 à 20) en utilisant le contenu de `firestore.rules.partage`, **sans publier**.

**Étape 6 — Fermer les prérequis avant publication.** Vérifie que toutes les fiches actives ont un booléen `shared`, que toute fiche en corbeille est `shared: false`, et que « À préparer » vaut 0. Attention : la règle cible actuelle autorise une fiche avec `shared: true` même si `deletedAt` est présent. Avant publication, il faut ajouter une représentation explicite de l'état actif dans la règle et la requête, préparer toutes les anciennes fiches pour ce champ, puis tester les accès directs, les requêtes ordinaires et la restauration dans l'émulateur. Proposition de séquencement dans `docs/PHASE2-SECURITE.md`. Compare la règle à la version réellement publiée dans Firebase et prépare la restauration de cette version.

**Étape 7 — Publication manuelle uniquement après validation.** Firebase → Firestore → Règles : publie le contenu validé, puis teste les accès directs et les requêtes avec les comptes ordinaire et administrateur. Cette documentation ne signifie pas que les règles ont été publiées.

## Retour arrière
- Règles : Firebase → Règles → historique → republier l'ancienne version.
- Filtre : restaurer la valeur précédente de `SHARING_ENFORCED` (dans le dépôt examiné, elle vaut `true`).
- Les champs `shared` / `sharedBeforeTrash` peuvent rester dans les fiches sans effet.

## À ne pas faire
Ne publie **jamais** `firestore.rules.partage` avant les étapes 2 et 4 : tant que des fiches n'ont pas `shared: true`, les utilisateurs ordinaires ne verraient plus rien.
