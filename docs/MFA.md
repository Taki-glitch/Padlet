# Authentification à deux étapes (code à 6 chiffres)

Le mot de passe seul peut être deviné ou volé. Avec la deuxième étape, il faut aussi un code qui change toutes les 30 secondes, affiché par une application sur ton téléphone (Google Authenticator, Authy, Microsoft Authenticator…). Elle s'appuie sur Supabase Auth (protocole TOTP).

## Activer pour ton compte
1. **Supabase** : Authentication → Sign In / Providers (ou « Multi-Factor ») → vérifie que **TOTP** est activé (il l'est par défaut sur un projet récent).
2. Sur le site, connecté : Paramètres → « Authentification à deux étapes » → **Activer**.
3. Scanne le code QR avec l'application, saisis le code à 6 chiffres, **Valider**.
4. Déconnecte-toi puis reconnecte-toi : le site demande le code après le mot de passe.
5. **Garde un moyen de récupération** : l'application sur ton téléphone est ta seule source de code. Si tu la perds, il faudra retirer le facteur depuis Supabase (Authentication → Users → ton compte → Factors → supprimer). Fais l'activation sur deux appareils si possible (scanne le même QR avec deux téléphones).

## Rendre obligatoire pour les administrateurs (facultatif, après avoir activé le tien)
Sans cette étape, la deuxième étape est une **protection volontaire** : un compte qui ne l'a pas activée se connecte avec son mot de passe seul.
Pour l'imposer aux administrateurs côté serveur : Supabase → Edge Functions → Secrets → ajouter `REQUIRE_MFA_FOR_ADMIN` = `true`. Les fonctions `admin-users` et `firebase-custom-token` refusent alors un administrateur dont la session n'a pas passé la deuxième étape.

**Attention — risque de blocage.** Active d'abord la deuxième étape sur **chaque** compte administrateur et vérifie la connexion, **avant** d'ajouter ce secret. Retour arrière : supprimer le secret (ou le mettre à `false`) ; effet immédiat à la prochaine connexion.

## Ce qui est testé
Les calculs (validation du code, niveaux de session, refus d'un administrateur sans deuxième étape) sont testés. **Le parcours réel avec Supabase et ton téléphone n'a pas été testé** : fais-le avec un compte de test avant de l'imposer.
