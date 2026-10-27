# Alertes et notifications par e-mail : non incluses, options

Il faut un **service d'envoi d'e-mails** : le site seul ne peut pas en envoyer, et aucune clé ne doit être dans le navigateur.

| Option | Coût | Remarque |
|---|---|---|
| SMTP intégré de Supabase (e-mails d'authentification) | gratuit, très limité | prévu pour les mots de passe, pas pour des alertes |
| Resend, Brevo, Postmark… | gratuit jusqu'à un volume, puis payant | clé API à mettre dans les secrets Supabase |
| Alertes sans e-mail | gratuit | le bandeau de rappel et la « Santé du site » (déjà en place) |

Ce qu'il faudrait construire : une fonction planifiée qui lit les échéances et envoie un e-mail par personne (une seule fois par échéance), des préférences et un lien de désinscription, et une alerte à l'administrateur en cas d'échec de purge. **À valider** : le service choisi, le coût, et qui reçoit quoi.
