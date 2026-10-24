# Sécurité du stockage et des données (phase 5)

## Inventaire (vérifié dans le code)
- `fileUrl` (URL publique) est **écrit** à l'envoi et **lu à un seul endroit** : l'aperçu de la modale de lecture. Il est désormais remplacé par une **URL signée** (1 h, mise en cache, renouvelée) calculée à partir de `filePath` ; `fileUrl` ne sert plus que de repli (anciens fichiers Firebase, signature impossible).
- `filePath` (chemin Storage) est la référence durable : sauvegarde, corbeille, purge, cohérence.
- Aucune URL signée n'est enregistrée dans Firestore.
- Dépendances externes : Firebase 10.14.1 (gstatic, épinglé), supabase-js (jsDelivr, **maintenant épinglé en 2.45.4**), Edge Functions : `esm.sh/@supabase/supabase-js@2.45.4` (**épinglé depuis la phase 7** ; redéploiement à faire).

## Ce qui est appliqué dans le code
- **Envoi** (navigateur) : 50 Mo max, extensions autorisées (`ALLOWED_EXTENSIONS` dans `modules/files.mjs`), et contrôle de la **signature du contenu** pour pdf, png, jpg, gif, webp et formats Office/zip. Le MIME déclaré par le navigateur n'est pas utilisé.
- **Serveur** : `supabase/migrations/20261023000000_documents_bucket_limits.sql` impose 50 Mio par fichier dans le bucket. Retour arrière dans le fichier.
- **Firestore** : `validItem` dans `firestore.rules` limite types et tailles des champs, seulement s'ils sont présents (anciennes fiches compatibles). Suppression et écriture restent réservées aux admins.
- **CI** : `scripts/check-pinned.mjs` refuse une bibliothèque du navigateur en version flottante.

## Ce qui n'est PAS fait (et pourquoi)
- **Bucket toujours public** : changer la visibilité est une bascule de production, à faire après vérification (procédure ci-dessous).
- **Liste de types MIME côté serveur** : sans inventaire de vos fichiers existants, une liste risquerait de bloquer des envois légitimes. Faites d'abord l'inventaire (requête ci-dessous). Un contrôle de contenu serveur demanderait une Edge Function dédiée.
- **CSP appliquée** : une CSP en balise `<meta>` ne peut pas fonctionner en mode « rapport seul » et peut bloquer la connexion si elle est trop stricte. Proposition à tester ci-dessous.
- **Règles Firestore et Storage non testées** (pas d'émulateur ici) : testez-les dans Firebase Console → Règles → *Simulateur* (cas autorisés : admin crée une fiche valide ; cas refusés : utilisateur ordinaire, titre de 400 caractères, `type` inconnu).

## Inventaire des fichiers existants (SQL Editor, lecture seule)
```sql
select coalesce(metadata->>'mimetype','?') as mime, lower(regexp_replace(name,'^.*\.','')) as extension,
       count(*) as fichiers, round(sum((metadata->>'size')::bigint)/1048576.0,1) as mo
from storage.objects where bucket_id = 'documents' group by 1,2 order by 3 desc;
```
Ajoutez à `ALLOWED_EXTENSIONS` toute extension légitime absente de la liste avant de déployer.

## Passer le bucket en privé (bascule progressive)
1. Déployer cette version et vérifier : aperçu d'une image, ouverture d'un PDF, téléchargement (ils utilisent déjà des URL signées).
2. Vérifier qu'aucune fiche n'a un `fileUrl` sans `filePath` (elle cesserait de fonctionner) : l'analyse de cohérence signale les chemins invalides.
3. SQL Editor : `update storage.buckets set public = false where id = 'documents';`
4. Tester : une ancienne URL publique ouverte en navigation privée doit être refusée ; l'application doit continuer à afficher les fichiers.
5. **Retour arrière immédiat** si un problème apparaît : `update storage.buckets set public = true where id = 'documents';`

## CSP proposée (non appliquée)
```
default-src 'self'; script-src 'self' https://www.gstatic.com https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://<projet>.supabase.co;
connect-src 'self' https://<projet>.supabase.co https://*.googleapis.com https://*.firebaseio.com;
frame-src https://<projet>.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'
```
Étapes : ajouter la balise `<meta http-equiv="Content-Security-Policy" content="…">` sur une branche, ouvrir le site avec la console, corriger chaque violation signalée (script en ligne éventuel : ajouter son hash), tester connexion, envoi, aperçu et frise, puis fusionner.
