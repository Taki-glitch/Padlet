# Sauvegardes régulières : ce qui existe et ce qui reste à décider

**Honnêteté : le site ne fait pas de sauvegarde automatique.** La sauvegarde se lance à la main (Paramètres → Sauvegarde) car elle lit les fichiers depuis le navigateur d'un administrateur.

## Ce que fait la version 1.0.0
- Tableau de bord → « Santé du site » : date de la dernière sauvegarde (lue dans le journal).
- Bandeau de rappel pour les administrateurs si la dernière sauvegarde a plus de 7 jours ou n'existe pas.
- Une sauvegarde n'est **fiable** qu'après une restauration réussie sur un projet de test (docs/TEST-RESTAURATION.md).

## Pour une vraie sauvegarde automatique (à décider ensemble)
| Option | Principe | Contrepartie |
|---|---|---|
| Sauvegardes natives Supabase | Supabase → Database → Backups (selon ton offre) | sauvegarde la base, pas les fichiers du bucket ; pas Firestore |
| Export Firestore planifié | Google Cloud → Firestore → Import/Export vers un bucket Cloud Storage, planifié | demande la facturation Google Cloud (faible coût) |
| Copie des fichiers | tâche planifiée qui copie le bucket `documents` vers un autre stockage | à écrire et à tester ; secrets à gérer |
| Rappel mensuel | rappel dans ton agenda « faire la sauvegarde » | repose sur toi |

Recommandation : rappel + sauvegarde manuelle vérifiée chaque mois, plus l'export Firestore planifié si tu acceptes d'activer la facturation Google Cloud.
