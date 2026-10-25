# Vérifications manuelles (à cocher après chaque mise en ligne)

- [ ] Connexion et déconnexion, rechargement de la page
- [ ] Consultation, création et modification d'un document
- [ ] Ajout et ouverture d'un fichier
- [ ] Recherche, filtres et favoris
- [ ] Frise à 25 % et à 50 % sur mobile ; clic sur les cartes ; zoom et regroupement
- [ ] Compteurs du tableau de bord, espace utilisé
- [ ] Navigation clavier (Tab, Maj+Tab, Échap) dans les modales
- [ ] Échec réseau (mode avion) : message compréhensible
- [ ] Accès refusé à un utilisateur non administrateur
- [ ] Compatibilité Safari sur iPad / iPhone

## Phase 7 (nouveautés, jamais vues dans un navigateur)
- [ ] Paramètres → « Changer mon mot de passe » : mauvais mot de passe actuel refusé ; confirmation différente refusée ; succès puis reconnexion avec le nouveau
- [ ] Échap ferme la modale ; « Afficher les mots de passe » fonctionne ; pas de double envoi
- [ ] Paramètres → « Exporter les échéances (.ics) » : le fichier s'importe dans l'agenda (dates, accents) ; sans échéance, message clair
- [ ] Fiche → « Copier le lien », puis ouvrir le lien dans un autre onglet connecté ; lien d'une fiche supprimée → message « introuvable »
- [ ] Recherche « pdf » ou une date : l'indice « Trouvé aussi dans » apparaît ; absent quand le terme est dans le titre
- [ ] Impression de la frise (Ctrl+P) : menus masqués, couleurs conservées, rien de coupé
- [ ] Journal : après un changement de rôle, une ligne « enregistré par le serveur » (après redéploiement d'`admin-users`)
- [ ] Liste de non-régression de base : admin et utilisateur, corbeille et restauration, PDF et image, sauvegarde et restauration sur projet de test, calcul de l'espace

## 0.7.2
- [ ] Paramètres : la ligne sous « Indexer les PDF » indique le nombre de PDF, indexés, sans texte, à indexer
- [ ] « Indexer… » : message final clair ; en cas d'échec, il nomme la fiche et la cause
- [ ] Recherche d'un mot présent seulement dans un PDF indexé : la fiche apparaît avec un extrait « Dans le PDF »
- [ ] Tableau de bord : panneaux « Échéances dépassées », « Documents par thème », « Fichiers les plus volumineux »

## 0.8.0
- [ ] Ajouter un document avec un fichier déjà présent : message « ressemble à un document déjà enregistré », annuler fonctionne, « OK » enregistre quand même
- [ ] Filtres → « Recherches enregistrées » : enregistrer (nom + critères), la réappliquer, la supprimer ; absente sur un autre compte
- [ ] Échéance (admin) : fiche → « Marquer comme terminée » ; elle disparaît du tableau de bord et de l'export .ics ; « rouvrir » la remet
- [ ] Un utilisateur ordinaire ne voit pas le bouton « Marquer comme terminée »

## 0.9.0 (partage) — suivre docs/PARTAGE.md
- [ ] Paramètres → Partage : « Simuler » affiche des chiffres et n'écrit rien ; « Appliquer » puis « À préparer : 0 »
- [ ] Nouvelle fiche : case « Visible par les utilisateurs » décochée ; ancienne fiche : cochée à l'ouverture
- [ ] Fiche décochée : pastille « Non partagé » (administrateur)
- [ ] Mise à la corbeille puis restauration : l'état de partage est retrouvé
- [ ] Après `SHARING_ENFORCED = true` : compte ordinaire = seulement les fiches partagées ; lien direct `#fiche=` d'une fiche non partagée → « introuvable »
- [ ] Après publication des règles « partage » : compte ordinaire et administrateur fonctionnent encore

## Appareils réels (à cocher seulement si testés sur l'appareil, pas en émulation)
- [ ] iPhone / Safari : connexion, recherche, aperçu PDF, téléchargement, frise (zoom au doigt), modales (clavier à l'écran)
- [ ] iPad / Safari : mêmes tests, orientation portrait et paysage
- [ ] Ordinateur : 3 largeurs d'écran, navigation au clavier (Tab, Entrée, Échap), focus visible
- [ ] Réseau coupé pendant un envoi : message clair, réessai possible, pas de doublon
- [ ] Session expirée : retour à la connexion sans perte de données saisies critiques

Ne cochez que ce que vous avez réellement vérifié.
