# Phase 6 — Expérience documentaire

## Réalisé
- **Liens cliquables** dans « Contenu ou lien » : seules les URL http(s) sont reconnues, ouvertes dans un nouvel onglet avec `rel="noopener noreferrer"`. Le texte n'est jamais interprété comme du HTML.
- **Cartes** : résumé Markdown déjà rendu ; au-delà de 280 caractères ou 6 lignes il est limité en hauteur avec « Lire la suite » (ouvre la fiche). Miniatures **d'images** (signées, chargées seulement quand la carte devient visible). États de chargement et d'erreur dans l'aperçu.
- **Aperçu PDF intégré** dans la fiche (bouton « Aperçu intégré », en plus du lien d'ouverture). Sur Safari iPad/iPhone, l'iframe n'affiche parfois que la première page : utilisez alors le lien.
- **Recherche dans le contenu des PDF** : extraction dans le navigateur avec pdf.js, à l'envoi d'un PDF (en arrière-plan) ou via Paramètres → « Indexer les PDF non indexés ». La recherche existante est conservée ; le texte du PDF s'y ajoute et un extrait « Dans le PDF : … » s'affiche sur la carte.

## Évaluation de pdf.js
Version **4.4.168** (cdnjs, épinglée), licence **Apache-2.0**, chargée **à la demande** (jamais au démarrage) ; le worker passe par un Blob car un worker ne peut pas venir d'une autre origine. Poids approximatif : plusieurs centaines de Ko + le worker (à vérifier dans l'onglet Réseau). Aucune donnée n'est envoyée à un tiers (hors téléchargement de la bibliothèque).

## Stockage et confidentialité
Champs facultatifs `pdfText` (20 000 caractères max., 60 pages max.) et `pdfTextStatus` (`ok`, `empty` = PDF scanné sans texte, `error`). Le texte est lu par tous les utilisateurs connectés, comme le PDF lui-même. Les anciennes fiches sans ces champs fonctionnent normalement. La sauvegarde complète les inclut. Pas d'OCR : les PDF scannés ne sont pas cherchables.

## Non fait dans cette étape (et pourquoi)
Collections et relations (11.3), opérations en masse au-delà de la suppression (11.4), plusieurs fichiers par document (11.5), historique des versions et détection des doublons (11.6) : ils modifient le modèle de données et méritent chacun une étape validée séparément.

## Non vérifié
Le chargement réel de pdf.js, l'iframe PDF sur Safari et le rendu des cartes n'ont **pas** été testés dans un navigateur.
