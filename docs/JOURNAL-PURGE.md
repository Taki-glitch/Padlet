# Journal d'activité et purge sécurisée

## Journal d'activité (collection Firestore `activityLog`)
- Événements : création/modification/suppression douce/restauration/purge d'un document, recalcul d'échéance, sauvegarde, restauration, analyse de cohérence, actions sur les utilisateurs (création, rôle, mot de passe, suppression — **sans** le mot de passe).
- Champs : `action`, `resourceType`, `resourceId`, `result` (success/failure), `operationId` (relie les étapes d'un même traitement), `userId`, `label` (titre, 120 caractères max), `count`, `at` (heure du serveur), `expireAt`. Jamais de contenu de document, de mot de passe ni de jeton.
- **Anti-falsification** (`firestore.rules`) : lecture et ajout réservés aux admins ; `userId` doit être celui de l'appelant ; `at` doit être l'heure du serveur ; ni modification ni suppression possibles. Limite : un admin peut ajouter un événement faux **à son propre nom** ; un événement ne peut pas être écrit au nom d'un autre.
- **Depuis la phase 7**, `admin-users` écrit lui-même les entrées `user.create`, `user.role-change` (champs `oldRole`/`newRole`, `label` « user → admin »), `user.reset-password` et `user.delete`, avec `source: "server"` et l'acteur vérifié par le serveur, échecs compris. Au mieux : la réponse contient `auditLogged: false` si l'écriture échoue. Le navigateur continue d'écrire ses propres entrées `user.*` : une même action peut donc apparaître deux fois (navigateur + serveur) ; seule l'entrée « enregistrée par le serveur » fait foi.
- Journalisation « au mieux » : si l'écriture échoue (règles non publiées, réseau), l'opération principale n'est jamais bloquée (avertissement en console seulement).
- Rétention : 12 mois (`expireAt`). Activez la suppression automatique : Firebase Console → Firestore → *Time-to-live* → ajouter une règle sur le groupe de collections `activityLog`, champ `expireAt`.
- Les changements de rôle faits directement dans Supabase (SQL Editor) ne passent pas par l'application et ne sont pas journalisés.

## Étapes manuelles obligatoires
1. **Publier `firestore.rules`** (Firebase Console → Firestore → Règles, ou `firebase deploy --only firestore:rules`). Tant que ce n'est pas fait, le journal reste vide.
2. **Redéployer la fonction** : `supabase functions deploy purge-expired-documents`.
3. Activer la règle TTL ci-dessus.
4. Vérifier : faire une modification, puis Paramètres → Journal → « Afficher les 50 derniers événements ».

## Purge planifiée
- Authentification : l'en-tête `Authorization` doit être exactement `Bearer <clé service>` ; comparaison désormais **à temps constant**. Un appel sans ce secret reçoit 401. Aucun secret n'apparaît dans les réponses ni les journaux.
- Réponse : `{ deleted, skippedInconsistent, failureCount, failures }`. Les documents à échéance **incohérente** sont conservés et comptés dans `skippedInconsistent` (réponse 200) ; seules les erreurs techniques renvoient 500.
- Après chaque passage, l'état est écrit dans `system/lastPurge` (lecture admin seulement, écriture serveur seule), affiché sous le journal.
- Ordre inchangé : Storage d'abord, Firestore ensuite ; un échec laisse la fiche pour un nouvel essai.
- Recalcul d'échéance : le bouton « Recalculer l'échéance » (Paramètres) existait déjà ; il affiche l'ancienne et la nouvelle valeur, demande confirmation, utilise le calcul de `expiration.mjs`, et est maintenant journalisé.
