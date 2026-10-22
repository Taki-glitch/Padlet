# Corbeille et cohérence des données

## Corbeille (suppression douce)
- Supprimer un document (seul ou en lot) **ne supprime rien** : la fiche reçoit `deletedAt` (date ISO) et `deletedBy`; le fichier reste dans Storage. Les anciennes fiches, sans ces champs, restent actives.
- Les éléments en corbeille disparaissent de toutes les vues et sont listés dans Paramètres → Corbeille avec les jours restants.
- **Restaurer** retire `deletedAt` et `deletedBy` : la fiche retrouve son fichier, sa frise et ses métadonnées.
- **Suppression définitive** : uniquement via « Supprimer définitivement les éléments de plus de 30 jours » (confirmation obligatoire). Fichier d'abord, fiche ensuite ; en cas d'échec, relancez (reprenable). Un fichier encore référencé par une autre fiche n'est jamais supprimé.
- Ce délai est **distinct** de la durée de conservation documentaire (`retentionMonths`).

## Limites connues
- La suppression définitive est **manuelle** (bouton) ; aucune purge serveur automatique de la corbeille n'existe encore.
- La purge planifiée par échéance (`purge-expired-documents`) supprime physiquement un document dont l'échéance est passée, même en corbeille : l'échéance prime.
- Les règles Firestore autorisent la lecture de toute la collection : un utilisateur ordinaire reçoit techniquement les fiches en corbeille, sans jamais les afficher.
- Suppression douce et restauration = une écriture Firestore unique (atomique). Pas de file d'opérations générale : seuls l'envoi (retrait du fichier si l'enregistrement échoue) et la suppression définitive sont reprenables.

## Cohérence des données (lecture seule)
Paramètres → « Analyser la cohérence » compare fiches (actives et en corbeille) et objets Storage : fiches sans fichier, fichiers sans fiche (moins de 24 h : signalés à part, envoi possiblement en cours), fichier partagé par plusieurs fiches, chemins invalides, anciens fichiers Firebase Storage (non vérifiables). Si le listage renvoie 0 fichier alors que des fiches en référencent, l'analyse est refusée (évite de faux résultats). Aucune correction automatique : le rapport sert à décider à la main.
