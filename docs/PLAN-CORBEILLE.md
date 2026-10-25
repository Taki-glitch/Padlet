# Plan : empêcher les utilisateurs ordinaires de recevoir les fiches en corbeille

**Statut : remplacé par `docs/PARTAGE.md` (0.9.0).** Le partage par document règle aussi la corbeille : une fiche supprimée devient non partagée et n'est plus envoyée aux utilisateurs. Ce plan est conservé pour mémoire.

## Constat (vérifié dans le code et les règles)
Les règles autorisent `read` de `padletItems` à tout utilisateur connecté. Le navigateur reçoit donc **toutes** les fiches, y compris celles qui ont un champ `deletedAt`, puis `splitTrash()` les écarte à l'écran. Un utilisateur ordinaire averti pourrait les lire avec les outils de son navigateur.

## Pourquoi une règle seule ne suffit pas
Firestore ne « filtre » pas : une requête qui pourrait renvoyer une fiche interdite est refusée en entier. Et une requête `where deletedAt == null` ne trouve **que** les fiches où ce champ existe avec la valeur `null` ; les fiches actuelles n'ont pas le champ.

## Méthode proposée (4 étapes, dans cet ordre)
1. **Client** : à la création et à la restauration, écrire `deletedAt: null` (au lieu de supprimer le champ). Ajouter un bouton administrateur « Préparer la corbeille » qui ajoute `deletedAt: null` à toutes les fiches qui n'ont pas le champ — avec un **mode simulation** qui compte sans écrire, un compte rendu et une reprise possible. L'utilisateur ordinaire écoute `where deletedAt == null` ; l'administrateur écoute tout.
2. **Contrôle** : le simulateur de règles et un compte à compter (le nombre de fiches sans `deletedAt` doit tomber à 0).
3. **Règle** (publiée seulement quand l'étape 2 est à zéro) : `allow read: if request.auth != null && (request.auth.token.role == 'admin' || resource.data.deletedAt == null);`
4. **Vérification** avec un compte ordinaire : la liste s'affiche, un accès direct à une fiche en corbeille est refusé, l'administrateur voit et restaure la corbeille.

## Risques et retour arrière
- Publier la règle **avant** la migration : les utilisateurs ordinaires voient une liste vide. Retour : republier l'ancienne règle (historique Firebase).
- La fonction de purge et la sauvegarde lisent déjà la corbeille côté administrateur ou serveur : inchangées.
- Aucune donnée n'est supprimée ; le champ `deletedAt: null` est compatible avec tout le code existant (vérifié par lecture du code : `isTrashed` ne considère comme supprimée qu’une fiche dont `deletedAt` est non vide).

## Alternative écartée
Déplacer les fiches supprimées dans une autre collection : plus fort, mais touche la purge, la sauvegarde, la restauration et la réconciliation en même temps.
