TFBall — PWA / Test local
=========================

But: rendre l'application installable (PWA) et tester le Service Worker localement.

Prérequis
---------
- Node.js (pour `npx http-server`) ou Python (pour `python -m http.server`).
- Navigateur moderne (Chrome/Edge/Firefox). Utiliser `localhost` facilite le test (contexte sécurisé autorisé).

Commandes rapides pour servir le projet
--------------------------------------
Depuis le dossier du projet (`d:\project Informatique\TFBall`):

Node (npx http-server) — simple et recommandé:

```bash
npx http-server -p 8080 -c-1
# ou si installé globalement:
# http-server -p 8080 -c-1
```

Python 3 (intégré):

```bash
python -m http.server 8080
```

Accéder à l'app
---------------
Ouvrez dans le navigateur:

http://localhost:8080

Ou consultez la version publiée sur GitHub Pages:

https://lsf-comp.github.io/TFBall/

(Vérifiez que `index.html` s'affiche; `file://` ne fonctionne pas avec Firebase ni Service Worker.)

Version publiée en ligne
------------------------
- Accédez à la démo publique : https://lsf-comp.github.io/TFBall/
- Utilisez la console du navigateur pour vérifier que le service worker est bien chargé depuis `/TFBall/service-worker.js`.
- Si vous rencontrez des problèmes, videz le cache et rechargez avec `Ctrl+F5`.

GitHub Pages
------------
- Le site est déployé comme une project page sous :
  https://lsf-comp.github.io/TFBall/
- Assurez-vous que les fichiers `index.html`, `service-worker.js`, `manifest.json`, `icons/`, et `offline.html` soient bien présents dans la branche `main`.
- Si le service worker ne s’enregistre pas, forcez la suppression de l’ancien SW dans DevTools → Application → Service Workers → Unregister.
- Pour un re-déploiement propre, utilisez `git push --force` uniquement si nécessaire après avoir nettoyé le cache du navigateur.

Vérifier le Service Worker & PWA
-------------------------------
1. Ouvrir DevTools → Onglet `Application` (ou `Application / Service Workers`).
2. Sous `Service Workers`: vérifier que `service-worker.js` est enregistré.
3. Sous `Cache Storage`: inspecter le cache `tfball-cache-v1`.
4. Tester hors-ligne: dans DevTools → `Network` sélectionnez `Offline`, recharger la page, l'app doit charger depuis le cache.
5. Installer la PWA: si le navigateur propose une icône d'installation (bouton +), installez et lancez l'app en `standalone`.

Conseils HTTPS (optionnel)
--------------------------
- `localhost` est un contexte sécurisé — pas besoin d'HTTPS pour les SW lors des tests locaux.
- Pour tester depuis un appareil mobile ou via réseau local, créez un tunnel HTTPS (ngrok, localtunnel) ou installez un certificat local (mkcert) et servez sur HTTPS.

Conversion des icônes SVG en PNG (optionnel)
--------------------------------------------
Si vous voulez des PNG pour stores/compatibilité, utilisez ImageMagick (ou `rsvg-convert`):

```bash
# ImageMagick
magick convert icons/icon-192.svg -background none -resize 192x192 icons/icon-192.png
magick convert icons/icon-512.svg -background none -resize 512x512 icons/icon-512.png
```

Note: sur cet environnement, `ImageMagick` n'était pas disponible via la commande `magick` / `convert`, je n'ai donc pas pu générer les PNG automatiquement. Exécutez les commandes ci-dessus sur votre machine locale pour créer les fichiers `icons/icon-192.png` et `icons/icon-512.png`.

J'ai créé aussi une page de fallback `offline.html` qui est mise en cache par le Service Worker.

Dépannage rapide
----------------
- Si le SW ne s'enregistre pas: vider le cache, hard refresh (Ctrl+F5), puis réessayer.
- Si `file://` affiche un message Firebase désactivé — hébergez sur `http://localhost:8080`.

Prochaine étape que je peux faire pour vous
-----------------------------------------
- Générer automatiquement les PNG d'icônes (si ImageMagick installé ici).
- Ajouter une page de fallback `offline.html` et la mettre en cache.
- Aider à insérer la configuration Firebase (clé `window.TFBALL_FIREBASE_CONFIG`).

Dites-moi ce que vous préférez que j'implémente en suite.
