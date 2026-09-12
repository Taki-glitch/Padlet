# Padlet

Application web statique de mur de documents. Firebase Firestore conserve les
métadonnées dans la collection `padletItems`; Supabase Storage stocke les fichiers
dans le bucket `documents`.

## Recherche, stockage et expiration

La recherche est réalisée dans le navigateur sur les éléments déjà synchronisés :
elle ignore la casse et les accents et couvre titre, résumé, tags, thème, contenu et
description. Elle filtre aussi la frise. Le compteur additionne les tailles réelles
(`metadata.size`) des objets retournés par l'API Storage, y compris dans les dossiers.
Il impose une limite de 50 Mio avant l'upload. La politique `select` du bucket est donc
requise en plus des politiques déjà listées ci-dessous.

Les documents créés ou modifiés avec une durée de conservation enregistrent dans
Firestore `publishedAt` (ISO), `retentionMonths` et `expiresAt` (`YYYY-MM-DD`). Les
anciens documents restent valides car ces champs sont facultatifs. La date de la frise
reste le champ existant `date`.

L'expiration est exécutée côté serveur, même sans navigateur ouvert. Déployez d'abord
la fonction et ses secrets, puis appliquez la migration :

```sh
supabase functions deploy purge-expired-documents
supabase secrets set FIREBASE_PROJECT_ID=padlet-assembly FIREBASE_CLIENT_EMAIL='…' FIREBASE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n'
```

Dans **SQL Editor**, créez ensuite les deux secrets Vault suivants (remplacez les
valeurs, ne les commitez jamais), puis appliquez
`supabase/migrations/20260912000000_schedule_expired_documents_purge.sql` :

```sql
select vault.create_secret('https://VOTRE_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('VOTRE_SERVICE_ROLE_KEY', 'service_role_key');
```

Le cron appelle quotidiennement la fonction à 00:15 UTC. La fonction demande un jeton
OAuth au compte de service Firebase stocké dans les secrets, cherche les documents dont
`expiresAt` est atteint, supprime d'abord leur objet Storage puis leur document
Firestore. Si Storage échoue, Firestore est conservé et le prochain cron réessaie.
Le compte de service Firebase doit avoir le rôle minimal permettant de lire/supprimer
les documents Firestore (par exemple **Cloud Datastore User**). Le `service_role` reste
strictement dans Vault et dans l'environnement Edge Function, jamais dans le frontend.

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
