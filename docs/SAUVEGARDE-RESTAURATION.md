# Sauvegarde complète et restauration

**Où :** Paramètres → Sauvegarde (administrateurs uniquement).

## Contenu de `padlet-backup-v1.zip`
`manifest.json` (format, version, date, compteurs, taille et SHA-256 de chaque fichier), `items.json` (toutes les fiches, frise comprise), `files/<chemin Storage>` (fichiers réels). Les URL `fileUrl` ne sont pas conservées dans l’archive : elles sont régénérées après envoi et peuvent contenir un jeton d’accès hérité. Les champs metadata dont le nom ressemble à un mot de passe, jeton, secret ou clé privée interrompent la sauvegarde avec un message qui ne révèle pas leur valeur. Jamais de préférence personnelle.

## Créer
1. Cliquez sur « Créer une sauvegarde complète » et attendez le message final.
2. Si le message indique « sauvegarde incomplète », un fichier n'a pas pu être lu (y compris un ancien objet Firebase refusé ou inaccessible) : l'archive est conservée avec les identifiants des fiches concernées, qui seront bloquées lors de la restauration.
3. Limite : 400 Mio de contenu de fichiers, et 512 Mio au total avec les métadonnées. Tout est assemblé en mémoire dans le navigateur.

## Restaurer
1. Choisissez l'archive : avant toute écriture, Padlet valide la structure ZIP et ses entrées, les chemins, les doublons, le manifeste, la correspondance avec les fiches, les compteurs, le CRC de chaque entrée et la taille/SHA-256 de chaque fichier. Une entrée inconnue ou une structure incohérente refuse l'archive ; un fichier référencé manquant ou corrompu est signalé et sa fiche est bloquée.
2. Mode **Fusion** (défaut) : crée les fiches absentes, ignore celles qui existent. Mode **Copies** : crée tout avec de nouveaux identifiants. Il n'existe volontairement pas de mode « remplacement ».
3. Confirmez. Le fichier est envoyé avant la fiche : une interruption peut laisser un fichier orphelin, jamais une fiche qui pointe vers un fichier non envoyé. En mode Fusion, la reprise vérifie par SHA-256 tout objet déjà présent avant de le réutiliser ; un objet différent bloque la fiche.
4. Le rapport affiche les réussites, les fiches ignorées et les échecs. En cas d'échec, le message est « Restauration partielle » et indique les causes disponibles ; il n'affiche pas de succès global. Les fiches dont le fichier est manquant ou corrompu sont **bloquées** et listées dans l'aperçu.
5. Pour reprendre, choisissez Fusion et resélectionnez la même archive. Les fiches déjà écrites sont ignorées, les échecs sont retentés.

## Limites connues
- Firestore et Storage ne sont pas transactionnels. En mode Copies, relancer après une interruption peut créer des doublons. Le mode Fusion est le mode de reprise.
- Seules les archives non compressées créées par Padlet sont lisibles (une archive recompressée par un autre outil est refusée avec un message explicite).
- Seule la version de format 1 est prise en charge. Une autre version est refusée sans écrire de données. Les archives v1 antérieures gardent le même format ; leurs URL de fichier sont ignorées et recréées depuis les objets inclus.
- Test sur un projet isolé : créez un projet Supabase/Firebase de test, restaurez-y l'archive et comparez les fiches et les fichiers. **Cette vérification de bout en bout n'a pas été faite.**
