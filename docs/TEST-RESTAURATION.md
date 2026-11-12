# Test réel de la sauvegarde et de la restauration (à faire sur un projet de TEST)

**Ne jamais restaurer dans la production.** Une sauvegarde n'est fiable qu'après une restauration réussie dans un environnement séparé.

## Ce qu'il faut préparer (une fois, depuis les tableaux de bord web)
1. **Supabase** : nouveau projet « padlet-test » ; y appliquer les migrations de `supabase/migrations/` (SQL Editor, dans l'ordre des noms) ; créer un compte administrateur de test ; déployer les 3 Edge Functions de test (éditeur du tableau de bord) avec leurs secrets.
2. **Firebase** : nouveau projet « padlet-test » ; activer Firestore ; publier `firestore.rules` ; créer un compte de service pour les secrets de test.
3. **Interface de test** : une copie du dépôt (fork privé) dont `supabase-config.js` et la configuration Firebase de `script.js` pointent vers les projets de test, publiée sur son propre GitHub Pages.

## Scénario
1. Dans la copie de test : créer 5 fiches fictives (tags, thèmes, dates), 2 PDF, 2 images, 1 échéance, 1 fiche en corbeille.
2. Paramètres → Sauvegarde → créer ; noter les comptes, confirmer qu'aucun URL de fichier avec `token=` n'est dans l'archive, et conserver une copie témoin.
3. Vider la copie de test (supprimer les fiches) puis Paramètres → Restauration : **lire le plan avant de confirmer**.
4. Comparer le nombre de fiches et fichiers, ouverture d'un PDF et d'une image, tags/thèmes/dates, fiche en corbeille et indexation PDF.
5. Refaire la restauration en mode Fusion : aucun doublon ne doit apparaître.
6. Tester un fichier manquant, une empreinte SHA-256 incorrecte, une entrée ZIP inconnue et une archive tronquée : les fiches touchées doivent être bloquées ou l'archive refusée avant toute écriture.
7. Simuler une interruption après l'upload d'un fichier mais avant l'écriture de sa fiche, puis reprendre en mode Fusion. L'objet existant doit être vérifié par SHA-256 et la fiche écrite sans second objet.
8. Simuler un objet déjà présent avec un contenu différent : la fiche doit échouer sans remplacer cet objet.
9. Essayer une archive de version inconnue : elle doit être refusée sans modifier les données.

Résultat à consigner : date, nombre attendu/restauré, anomalies. Tant que ce test n'est pas fait, la sauvegarde reste « non éprouvée ».
