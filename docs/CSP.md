# Content Security Policy (CSP) — étude, **non appliquée**

Une CSP posée sans test peut bloquer silencieusement la connexion ou les aperçus. GitHub Pages ne permet pas d'en-têtes HTTP : seule la balise `<meta http-equiv="Content-Security-Policy">` est possible (sans mode « rapport seul »). À essayer **dans une copie de test**, navigateur ouvert, avec la console visible.

## Inventaire (relevé dans le code)
| Besoin | Hôte |
|---|---|
| Scripts Firebase (importés) | `https://www.gstatic.com` |
| Supabase JS (importé), pdf.js 2ᵉ source | `https://cdn.jsdelivr.net` |
| pdf.js 1ʳᵉ source | `https://cdnjs.cloudflare.com` |
| Données Supabase, fichiers, aperçus | `https://aqrodkkplivxkynqpyqq.supabase.co` |
| Firestore / Auth Firebase | `https://firestore.googleapis.com`, `https://identitytoolkit.googleapis.com`, `https://securetoken.googleapis.com` (à confirmer dans la console réseau) |
| Worker pdf.js | `blob:` |
| Favicon | `data:` |

## Obstacle connu
`index.html` contient un **script en ligne** (anti-flash du thème). Une CSP stricte l'exige : soit un `sha256-…` de ce script dans `script-src`, soit le déplacer dans un fichier `.js`.

## Politique de départ à essayer (copie de test)
```
default-src 'self';
script-src 'self' https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'sha256-<empreinte du script en ligne>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://aqrodkkplivxkynqpyqq.supabase.co;
connect-src 'self' https://aqrodkkplivxkynqpyqq.supabase.co https://*.googleapis.com https://www.gstatic.com;
frame-src https://aqrodkkplivxkynqpyqq.supabase.co;
worker-src blob:;
object-src 'none'; base-uri 'self'; form-action 'self';
```
`'unsafe-inline'` n'est accepté que pour les styles (attributs `style=` générés par l'interface). **Interdit** : `unsafe-eval` et `unsafe-inline` pour les scripts.

## Procédure de test
Connexion, liste, aperçu PDF et image, indexation PDF, frise, tableau de bord, avis, export .ics : aucune erreur « Refused to … » dans la console. Ne publier qu'après.
