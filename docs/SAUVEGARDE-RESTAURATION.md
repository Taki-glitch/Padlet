# Sauvegarde complète et restauration

**Où :** Paramètres → Sauvegarde (administrateurs uniquement).

## Contenu de `padlet-backup-v1.zip`
`manifest.json` (format, version, date, compteurs, taille et SHA-256 de chaque fichier), `items.json` (toutes les fiches, frise comprise), `files/<chemin Storage>` (fichiers réels). Jamais de mot de passe, de jeton ni de préférence personnelle.

## Créer
1. Cliquez sur « Créer une sauvegarde complète » et attendez le message final.
2. Si le message indique « sauvegarde incomplète », des fichiers n'ont pas pu être lus (ou sont d'anciens fichiers Firebase Storage) : conservez l'archive mais corrigez la cause.
3. Limite : 400 Mo par archive (tout est assemblé en mémoire dans le navigateur).

## Restaurer
1. Choisissez l'archive : elle est vérifiée (structure, version, CRC, tailles, SHA-256) avant tout aperçu.
2. Mode **Fusion** (défaut) : crée les fiches absentes, ignore celles qui existent. Mode **Copies** : crée tout avec de nouveaux identifiants. Il n'existe volontairement pas de mode « remplacement ».
3. Confirmez. Le fichier est envoyé avant la fiche : une interruption laisse au pire un fichier sans fiche. Relancez en mode Fusion pour reprendre sans doublon.
4. Les fiches dont le fichier est manquant ou corrompu sont **bloquées** et listées dans le rapport.

## Limites connues
- Firestore et Storage ne sont pas transactionnels. En mode Copies, relancer après une interruption crée des doublons.
- Seules les archives non compressées créées par Padlet sont lisibles (une archive recompressée par un autre outil est refusée avec un message explicite).
- Test sur un projet isolé : créez un projet Supabase/Firebase de test, restaurez-y l'archive et comparez les fiches et les fichiers. **Cette vérification de bout en bout n'a pas été faite.**
