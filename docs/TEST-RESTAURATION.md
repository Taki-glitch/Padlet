# Test réel de la sauvegarde et de la restauration (à faire sur un projet de TEST)

**Ne jamais restaurer dans la production.** Une sauvegarde n'est fiable qu'après une restauration réussie dans un environnement séparé.

## Ce qu'il faut préparer (une fois, depuis les tableaux de bord web)
1. **Supabase** : nouveau projet « padlet-test » ; y appliquer les migrations de `supabase/migrations/` (SQL Editor, dans l'ordre des noms) ; créer un compte administrateur de test ; déployer les 3 Edge Functions de test (éditeur du tableau de bord) avec leurs secrets.
2. **Firebase** : nouveau projet « padlet-test » ; activer Firestore ; publier `firestore.rules` ; créer un compte de service pour les secrets de test.
3. **Interface de test** : une copie du dépôt (fork privé) dont `supabase-config.js` et la configuration Firebase de `script.js` pointent vers les projets de test, publiée sur son propre GitHub Pages.

## Scénario
1. Dans la copie de test : créer 5 fiches fictives (tags, thèmes, dates), 2 PDF, 2 images, 1 échéance, 1 fiche en corbeille.
2. Paramètres → Sauvegarde → créer ; noter le nombre de fiches et de fichiers.
3. Vider la copie de test (supprimer les fiches) puis Paramètres → Restauration : **lire le plan avant de confirmer**.
4. Comparer : nombre de fiches, ouverture d'un PDF et d'une image, tags/thèmes/dates, fiche en corbeille, indexation des PDF.
5. Refaire la restauration une 2ᵉ fois : aucun doublon ne doit apparaître.
6. Tester une sauvegarde volontairement altérée (fichier tronqué) : la restauration doit la refuser.

Résultat à consigner : date, nombre attendu/restauré, anomalies. Tant que ce test n'est pas fait, la sauvegarde reste « non éprouvée ».
