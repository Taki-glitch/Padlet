# Matrice des permissions (état réel, vérifié par lecture du code et des règles ; jamais exécutée dans un simulateur)

| Action | Visiteur | Utilisateur | Administrateur | Appliqué par |
|---|---|---|---|---|
| Lire les fiches actives | non | oui | oui | règles Firestore |
| Lire les fiches en corbeille | non | **oui (limite connue)**, masquées à l'écran | oui | règles Firestore (voir PLAN-CORBEILLE.md) |
| Créer / modifier / supprimer une fiche | non | non | oui | règles Firestore (jeton `role`) |
| Mettre à la corbeille, restaurer | non | non | oui | règles Firestore |
| Envoyer / supprimer un fichier | non | non | oui | politiques Storage |
| Lire / télécharger un fichier | non (bucket public : **toute personne avec le lien**) | oui | oui | bucket public (voir SECURITE.md) |
| Favoris, recherches enregistrées, préférences | — | oui, sur l'appareil | oui | navigateur (localStorage) |
| Exporter les échéances (.ics), changer son mot de passe | non | oui | oui | navigateur + Supabase Auth |
| Marquer une échéance terminée | non | non | oui | règles Firestore |
| Créer, modifier le rôle, supprimer un compte | non | non | oui | Edge Function `admin-users` (rôle relu en base) |
| Lire le journal d'activité | non | non | oui | règles Firestore |
| Écrire dans le journal | non | non | oui (son propre nom) + le serveur | règles / compte de service |
| Sauvegarde, restauration, indexation PDF | non | non | oui | règles + interface |

Limites : le rôle est figé dans le jeton Firebase jusqu'à son renouvellement (≤ 1 h) ; la rétrogradation d'un administrateur révoque ses sessions Firebase.
