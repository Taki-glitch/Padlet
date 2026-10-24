# Journal des modifications

Les versions sont numérotées à partir de 0.7.0 (première version numérotée ; le numéro vit dans `package.json` et `modules/version.mjs`, un test vérifie qu'ils sont identiques). Les phases 1 à 6 précédentes ne portaient pas de numéro.

## 0.7.0 — Phase 7 (audit, finitions, journal serveur)

### Nouveautés (dans le code, **non vérifiées dans un navigateur** — voir docs/PHASE7.md)
- Paramètres : **changement de mot de passe personnel** (mot de passe actuel, nouveau, confirmation, affichage temporaire, anti double envoi ; succès affiché seulement après la réponse de Supabase).
- Paramètres : **export .ics** des échéances et des dates d'expiration de documents (journées entières, accents, pliage RFC 5545, identifiants stables). Export ponctuel, pas de synchronisation.
- **Lien direct vers une fiche** : `…/Padlet/#fiche=<id>` + bouton « Copier le lien » dans la fiche. Une fiche en corbeille ou inexistante affiche un message « introuvable ».
- Recherche : sous une carte, « Trouvé aussi dans : … » quand le terme n'est présent que dans un champ non affiché (type de fichier, date, tags, durée de conservation…).
- Feuille d'impression (masque les menus, conserve les couleurs de la frise).
- Titre, description, favicon, couleur de thème ; version affichée dans Paramètres.

### Sécurité
- `admin-users` : **journal côté serveur** des créations, changements de rôle (ancien → nouveau), réinitialisations de mot de passe (sans le mot de passe) et suppressions de comptes, avec l'acteur vérifié par le serveur, y compris les échecs. Au mieux : un échec du journal n'annule pas l'opération (`auditLogged: false`). **Nécessite le redéploiement de la fonction.**
- Edge Functions : `supabase-js` épinglé en **2.45.4** (comme le navigateur). **Nécessite le redéploiement** ; à tester après (connexion, liste/création d'utilisateur, purge).

### Corrections
- Migration `20261021000000 documents storage usage.sql` renommée `20261021000000_documents_storage_usage.sql` : avec des espaces, la CLI Supabase l'ignorait (calcul d'espace de stockage absent si la base a été migrée par `db push`). Contenu inchangé, idempotent.

### Outils
- `check-syntax` analyse maintenant les Edge Functions `.ts` (Node ≥ 22.13).
- 9 nouveaux tests (`tests/phase7.test.mjs`) : 54 tests au total.

### Configuration / migrations
- Aucune nouvelle migration SQL. Aucune modification de `firestore.rules`.

### Limitations connues
- Voir « Non intégré » dans docs/PHASE7.md (corbeille visible des utilisateurs via Firestore, bucket public, pas de test navigateur automatisé, etc.).
