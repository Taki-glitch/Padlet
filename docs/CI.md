# Contrôles automatiques (GitHub Actions)

**État au 2026-11-12 : aucun workflow GitHub Actions n'est présent dans ce dépôt.** Les étapes ci-dessous décrivent la CI souhaitée et ne sont pas exécutées par GitHub. Ajouter et vérifier les workflows avant de s'appuyer sur ces statuts ou de configurer une protection de branche.

Le workflow à créer `.github/workflows/ci.yml` devra s'exécuter à chaque pull request et à chaque push sur `main` (Node 22, aucun secret, aucun déploiement).

| Étape | Commande | Ce qu'elle détecte |
|---|---|---|
| Syntaxe | `node scripts/check-syntax.mjs` | erreur de syntaxe dans un `.js`/`.mjs` |
| Imports | `node scripts/check-imports.mjs` | import relatif ou `src`/`href` vers un fichier absent, mauvaise casse, mauvaise extension (`.js` au lieu de `.mjs`), chemin absolu, dossier `_` sans `.nojekyll` |
| Versions | `node scripts/check-pinned.mjs` | bibliothèque CDN en version flottante (`@2`, `@latest`) côté navigateur (erreur) ou Edge Functions (avertissement) |
| Tests | `node --test tests/*.mjs` | tests unitaires |

Les imports `https://`, `npm:` et les modules nus (Deno) ne sont pas traités comme des fichiers locaux. Les Edge Functions `.ts` sont vérifiées pour la **syntaxe seulement** (types retirés, imports `https://` non résolus ; Node ≥ 22.13).

**Bloquer la fusion d'une pull request en échec :** GitHub → *Settings → Branches → Add rule* sur `main` → cocher *Require status checks to pass* → choisir `verify`. (Réglage GitHub à faire manuellement.)

En cas d'échec, ouvrez l'onglet *Actions* de la pull request : le fichier, la ligne et l'import fautifs sont indiqués.

## Règles Firestore sur l'émulateur
Le workflow à créer `.github/workflows/rules-emulator.yml` devra exécuter `tests-rules/` sur l'émulateur Firebase, sans donnée réelle, manuellement ou lors d'une modification des règles. Le rendre bloquant après un premier passage vert.
