# Padlet

Application web statique de mur de documents. Firebase Firestore conserve les
métadonnées dans la collection `padletItems`; Supabase Storage stocke les fichiers
dans le bucket `documents`.

## Recherche, stockage et expiration

La recherche est réalisée dans le navigateur sur les éléments déjà synchronisés :
elle ignore la casse et les accents et couvre titre, résumé, tags, thème, contenu et
description. Elle filtre aussi la frise. La barre d’outils propose des filtres par
thème et tag construits depuis les documents chargés, ainsi qu’un tri des cartes par
date ou titre. Les comparaisons de thèmes et tags ignorent casse, accents et espaces
superflus, sans migration ni modification destructive des documents existants. La
frise conserve toujours son ordre chronologique. Le compteur additionne les tailles réelles
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

## Authentification Supabase et pont Firebase

L'application conserve les appels Firestore client existants (`onSnapshot`,
`setDoc`, `deleteDoc`). Ils ne démarrent désormais qu'après cette chaîne :
**Supabase Auth → Edge Function `firebase-custom-token` → Firebase Custom Token →
Firebase Auth → Firestore**. La clé privée du compte de service Firebase ne quitte
jamais les secrets des Edge Functions ; `SUPABASE_SERVICE_ROLE_KEY` non plus.

### Convention d'identifiant

L'écran ne demande que **Identifiant** et **Mot de passe**. L'identifiant est en
minuscules, de 3 à 32 caractères (`a-z`, `0-9`, `.`, `_`, `-`) et doit commencer par
une lettre ou un chiffre. Supabase Auth reçoit en interne l'adresse technique
`<identifiant>@auth.padlet.invalid`. Le domaine `.invalid` est réservé et non
distribuable : il évite d'envoyer du courrier à une vraie adresse. Cette adresse a
une syntaxe e-mail compatible avec l'API `signInWithPassword` et avec
`auth.admin.createUser`; elle n'est jamais affichée dans l'interface.

### Mise en place obligatoire (dans cet ordre)

> Ne déployez **pas** `firestore.rules` à ce stade. Les règles publiques restent
> nécessaires uniquement pendant la validation du pont Firebase.

1. Dans Supabase, ouvrez **Authentication > Providers > Email**. Activez Email,
   puis désactivez **Confirm email** : les adresses `.invalid` ne peuvent pas
   recevoir de message. Désactivez aussi les inscriptions publiques dans
   **Authentication > Providers** si l'option est affichée. Ne créez aucun compte
   depuis le navigateur.
2. Dans **SQL Editor**, exécutez les migrations, dans cet ordre :
   `supabase/migrations/20260930000000_profiles_and_auth.sql`, puis
   `supabase/migrations/20260930000001_authenticated_documents_storage.sql`, puis
   `supabase/migrations/20260930000002_admin_only_documents_storage.sql`.
   La première crée `profiles`, les rôles `admin`/`user`, RLS, et le déclencheur
   qui crée le profil lors de la création Auth. Les deux suivantes conservent la
   lecture des fichiers pour les utilisateurs authentifiés, mais réservent les
   écritures et suppressions Storage aux administrateurs, sans changer les URLs
   publiques existantes.
3. Créez le premier administrateur **maintenant**, avant le déploiement de la
   fonction de gestion : ouvrez **Authentication > Users > Add user**. Saisissez
   par exemple `premier-admin@auth.padlet.invalid`, choisissez un mot de passe
   robuste et cochez **Auto Confirm User** si la boîte est proposée. Ensuite, dans
   **SQL Editor**, exécutez, avec l'identifiant choisi :

   ```sql
   update public.profiles set role = 'admin'
   where username = 'premier-admin';
   ```

   Vérifiez avec `select username, role from public.profiles;`. Ne créez jamais un
   administrateur en insérant directement dans `auth.users`, et ne mettez jamais
   le mot de passe dans SQL, un fichier ou un commit.
4. Dans **Project Settings > Edge Functions > Secrets** (ou via `supabase secrets
   set`), ajoutez les secrets suivants : `FIREBASE_CLIENT_EMAIL` et
   `FIREBASE_PRIVATE_KEY` depuis le JSON du compte de service Firebase. La seconde
   valeur doit contenir la clé PEM complète et rester un secret. `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis à l'exécution
   des fonctions Supabase; ne copiez jamais `SUPABASE_SERVICE_ROLE_KEY` dans
   `supabase-config.js` ni dans le navigateur.
5. Déployez les fonctions seulement après les secrets :

   ```sh
   supabase functions deploy firebase-custom-token --no-verify-jwt
   supabase functions deploy admin-users --no-verify-jwt
   ```

   La configuration versionnée `supabase/config.toml` désactive la vérification
   JWT de passerelle pour les deux fonctions appelées depuis le navigateur afin
   que leurs réponses `OPTIONS` puissent satisfaire le préflight CORS. Chacune
   vérifie toujours elle-même `Authorization: Bearer <Supabase JWT>` avec
   `supabase.auth.getUser()`. `firebase-custom-token` lit en plus le rôle réel
   dans `profiles` et signe le claim Firebase `role` ; `admin-users` relit ce rôle
   côté serveur avant chaque action.

   `admin-users` exige un appelant dont `profiles.role = 'admin'`. Ses actions JSON
   sont `list`, `create`, `update`, `reset-password` et `delete`; aucun mot de
   passe n'est retourné ni enregistré en clair.
6. Dans Firebase Console, ouvrez **Project settings > Service accounts > Firebase
   Admin SDK > Generate new private key**. Créez un JSON de compte de service,
   copiez uniquement `client_email` et `private_key` dans les secrets ci-dessus,
   puis conservez le fichier JSON hors du dépôt. Vérifiez dans **Authentication >
   Sign-in method** que le projet Firebase est utilisable : l'échange d'un Custom
   Token créera les utilisateurs Firebase à la première connexion.
7. Déployez le frontend avec ses valeurs publiques Supabase. Connectez-vous avec
   le premier administrateur, puis vérifiez les opérations listées ci-dessous avec
   cet administrateur et un compte `user` créé via `admin-users`.
8. **Uniquement après ces tests réussis**, ouvrez Firebase Console > **Firestore
   Database > Rules**, remplacez les règles publiques par le contenu de
   `firestore.rules`, puis cliquez **Publish**. Ne publiez pas le fichier avant
   qu'une connexion frontend ait effectivement reçu et utilisé un Custom Token.
   Les règles autorisent la lecture de `padletItems` à tout utilisateur Firebase
   authentifié, mais exigent le claim `request.auth.token.role == 'admin'` pour
   créer, modifier ou supprimer. Après un changement de rôle, l'utilisateur
   concerné doit se déconnecter puis se reconnecter afin de recevoir un nouveau
   Custom Token Firebase avec son nouveau claim.

### Vérification fonctionnelle avant les règles Firestore

Avec un compte `user`, puis avec un compte `admin`, vérifiez : chargement
temps-réel (`onSnapshot`), ajout/modification/suppression (`setDoc`, `deleteDoc`),
documents, résumés Markdown, frise et ses modifications, upload Supabase,
prévisualisation, compteur de stockage et suppression automatique planifiée.
Après publication des règles, répétez au minimum la lecture, un ajout, une
modification de frise et une suppression avec chacun des deux rôles. Les règles
Firestore accordent le même accès aux deux rôles : le rôle `admin` sert à gérer les
comptes via l'Edge Function.

### Configuration Supabase

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

La migration `20260930000001_authenticated_documents_storage.sql` remplace les
politiques historiques par les mêmes permissions pour le rôle `authenticated` :
les uploads, listes nécessaires au compteur et suppressions continuent donc à
fonctionner après connexion. Le bucket reste public pour ne pas casser les URLs et
prévisualisations existantes. Rendre le bucket privé plus tard implique de remplacer
les URLs publiques existantes par des URLs signées et ne doit pas être fait à moitié.

## Vérification après configuration

Après avoir renseigné les deux variables et créé le bucket/politiques, vérifiez
dans cet ordre : ajoutez un document avec fichier, contrôlez dans Supabase le
nouvel objet sous le dossier de son identifiant Firestore, puis contrôlez dans
Firestore les champs `fileUrl` et `filePath`. Rechargez la page et ouvrez le
document, puis supprimez-le : l'objet correspondant doit disparaître du bucket.

Ces vérifications nécessitent un projet Firebase/Supabase réel et des règles
effectivement déployées ; elles ne peuvent pas être simulées avec les valeurs
vides fournies dans ce dépôt.
