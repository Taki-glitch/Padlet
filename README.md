# Padlet

Application web statique de mur de documents. Firebase Firestore conserve les
métadonnées dans la collection `padletItems`; Supabase Storage stocke les fichiers
dans le bucket `documents`.

## Configuration Supabase

1. Dans Supabase, créez un bucket **public** nommé `documents`.
2. Copiez `supabase-config.example.js` vers `supabase-config.js` et renseignez
   `SUPABASE_URL` et la clé publique/anon affichées dans **Settings > API**.
   Ces valeurs sont nécessaires au navigateur. Ne renseignez jamais une clé
   `service_role` dans ce fichier.
3. Les nouveaux fichiers sont enregistrés avec le chemin
   `<id-firestore>/<timestamp>-<uuid>-<nom-nettoye>`. Firestore conserve leur
   URL publique dans `fileUrl` et le chemin Storage dans `filePath`, ce qui permet
   leur suppression lors de la suppression ou du remplacement d'un document.

Le projet n'ayant pas de système de build ni de variables d'environnement, ce
fichier de configuration JavaScript est la configuration frontend adaptée. La clé
anon est volontairement publique; la sécurité repose sur les politiques Storage.

## Politiques Storage

Dans l'éditeur SQL de Supabase, créez les politiques suivantes après avoir créé le
bucket. Elles limitent les droits au seul bucket `documents` sans désactiver RLS
globalement :

```sql
create policy "Public read documents"
on storage.objects for select to anon
using (bucket_id = 'documents');

create policy "Public upload documents"
on storage.objects for insert to anon
with check (bucket_id = 'documents');

create policy "Public delete documents"
on storage.objects for delete to anon
using (bucket_id = 'documents');
```

Cette application ne possède pas encore d'authentification Supabase : pour
permettre l'ajout et la suppression depuis un navigateur public, les rôles `anon`
doivent donc disposer de ces droits sur ce bucket précis. Pour une application non
publique, ajoutez Supabase Auth et remplacez les deux dernières politiques par des
politiques d'accès limitées à `auth.uid()`.

## Vérification après configuration

Après avoir renseigné les deux variables et créé le bucket/politiques, vérifiez
dans cet ordre : ajoutez un document avec fichier, contrôlez dans Supabase le
nouvel objet sous le dossier de son identifiant Firestore, puis contrôlez dans
Firestore les champs `fileUrl` et `filePath`. Rechargez la page et ouvrez le
document, puis supprimez-le : l'objet correspondant doit disparaître du bucket.

Ces vérifications nécessitent un projet Firebase/Supabase réel et des règles
effectivement déployées ; elles ne peuvent pas être simulées avec les valeurs
vides fournies dans ce dépôt.
