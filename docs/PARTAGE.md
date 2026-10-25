# Partage document par document

**Principe** : chaque fiche (document ou échéance) a un champ `shared`. Un administrateur voit tout ; un utilisateur ordinaire ne voit que les fiches « Visible par les utilisateurs ». Une fiche mise à la corbeille devient non partagée (donc plus envoyée aux utilisateurs) ; sa restauration rétablit son ancien état.

**Limites connues**
- Les **fichiers** restent dans un bucket public (décision prise) : une personne qui a le lien direct d'un fichier peut l'ouvrir, même si la fiche n'est pas partagée. Les liens ne sont jamais montrés aux utilisateurs qui n'ont pas accès à la fiche, mais ce n'est pas une barrière. Pour une vraie confidentialité des fichiers, il faudra un bucket privé.
- Partage « tout le monde ou personne » : pas de partage par personne (possible plus tard).
- Sans l'étape 6, le filtre n'est appliqué que par l'application ; ce sont les règles Firestore (étape 6) qui l'imposent vraiment.

## Mise en place — dans cet ordre, sans en sauter
**Étape 1 — Fusionner la version 0.9.0.** Aucun changement visible pour les utilisateurs (interrupteur `SHARING_ENFORCED = false`).

**Étape 2 — Préparer les anciennes fiches.** Connecté en administrateur : Paramètres → « Partage avec les utilisateurs » → **Simuler la préparation du partage** (rien n'est écrit, tu lis les chiffres) → **Appliquer la préparation**. Toutes les fiches actives deviennent « partagées » (comme aujourd'hui) ; celles de la corbeille deviennent non partagées. Vérifie que « À préparer » tombe à **0**.

**Étape 3 — Choisir quoi cacher.** Ouvre les fiches à réserver aux administrateurs (bouton Modifier), décoche « Visible par les utilisateurs », enregistre. Une pastille « Non partagé » apparaît sur la carte. Les nouvelles fiches sont **non partagées par défaut**.

**Étape 4 — Activer le filtre côté utilisateurs.** Sur GitHub, ouvre `modules/sharing.mjs`, remplace `SHARING_ENFORCED = false` par `SHARING_ENFORCED = true`, enregistre sur une branche, fusionne. Puis **teste avec un compte ordinaire** : il ne voit que les fiches partagées. Si la liste est vide, l'étape 2 n'est pas terminée : remets `false`.

**Étape 5 — Contrôler les règles dans le simulateur Firebase** (voir `docs/REGLES-FIRESTORE-TESTS.md`, cas 17 à 20) en utilisant le contenu de `firestore.rules.partage`, **sans publier**.

**Étape 6 — Publier les règles.** Firebase → Firestore → Règles : remplace tout par le contenu de `firestore.rules.partage` (sans les 2 lignes de commentaire du haut si tu préfères) → Publier. Re-teste : compte ordinaire (liste normale), compte administrateur (tout visible, corbeille comprise).

## Retour arrière
- Règles : Firebase → Règles → historique → republier l'ancienne version.
- Filtre : remettre `SHARING_ENFORCED = false`.
- Les champs `shared` / `sharedBeforeTrash` peuvent rester dans les fiches sans effet.

## À ne pas faire
Ne publie **jamais** `firestore.rules.partage` avant les étapes 2 et 4 : tant que des fiches n'ont pas `shared: true`, les utilisateurs ordinaires ne verraient plus rien.
