# Plan : collections, plusieurs fichiers par fiche, versions, récurrences

**Statut : plan seul, rien n'est codé. À valider avant toute migration.** Tous ces changements sont **additifs** : de nouveaux champs optionnels, les anciennes fiches continuent de fonctionner telles quelles (les règles actuelles ne limitent pas les champs inconnus).

## 1. Collections (dossiers virtuels)
- Champ `collections` : liste de noms (texte, ≤ 40 par fiche, chaque nom ≤ 60 caractères) sur la fiche. Une fiche peut être dans plusieurs collections ; aucun fichier n'est dupliqué.
- Pas de nouvelle collection Firestore : la liste des collections se déduit des fiches (comme les thèmes). Renommer une collection = action groupée (comme les actions groupées de la 0.10.0).
- Interface : filtre « Collection » à côté du thème et des tags ; action groupée « Ajouter à une collection ».
- Risque faible. Retour arrière : ignorer le champ.

## 2. Plusieurs fichiers par fiche
- Champ `attachments` : liste d'objets `{ filePath, fileName, fileType, fileSize, sha256, addedAt }`. Les champs actuels (`filePath`, `fileName`…) restent le **fichier principal** : une ancienne fiche n'a pas `attachments` et reste valide.
- Impacts à traiter ensemble : suppression et corbeille (supprimer tous les fichiers), purge, sauvegarde/restauration (inclure les pièces jointes), réconciliation Firestore/Storage, indexation PDF (par fichier), calcul de l'espace.
- Risque **élevé** (touche 5 mécanismes). Étapes : (a) lecture seule d'`attachments` + sauvegarde, (b) ajout, (c) suppression, chacune testée.

## 3. Versions d'un fichier
- Sous-liste `versions` : `{ filePath, sha256, replacedAt, replacedBy }` ; l'ancien fichier n'est plus supprimé au remplacement mais gardé selon une durée à définir (par exemple 12 mois) puis purgé.
- Impact stockage : chaque remplacement conserve un fichier de plus (limite 50 Mio chacun). À décider : durée de conservation et plafond de versions par fiche.

## 4. Échéances récurrentes
- Champ `recurrence` : `{ every: "month"|"week"|"year", interval: 1, until: "AAAA-MM-JJ" }`. Une échéance terminée crée la suivante (identifiant dérivé stable `<id>-<date>` pour ne jamais dupliquer).
- Export .ics : `RRULE` standard. Cas à trancher : fin de mois (31 → 28/30), modification d'une occurrence ou de la série.

## Ce que j'ai besoin de savoir
1. Collections d'abord ? (recommandé : faible risque, grande utilité)
2. Pour les versions : durée de conservation souhaitée ?
3. Pour les récurrences : quels rythmes (mensuel, annuel) ?
