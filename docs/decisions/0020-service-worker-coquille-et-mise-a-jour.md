# ADR-0020 — Service worker écrit à la main : coquille en cache par construction, mise à jour au choix de l'utilisateur

Statut : proposé
Date : 2026-10-27

## Contexte et problème

F-023 (`specs/F-023.md`, validée le 2026-10-27, structurel) rend l'application installable et utilisable hors ligne : un service worker, servi à `/sw.js` avec la portée `/`, s'interpose entre l'application et le réseau pour toute l'origine, `/api/` compris (H1). Jusqu'ici, rien ne survivait à la fermeture d'un onglet hors des bases IndexedDB (ADR-0008) et du `localStorage` des réglages de vue (ADR-0019) ; un rechargement chargeait toujours la construction que le serveur servait.

Trois choix s'y défont mal, parce qu'un service worker installé reste dans le navigateur de chaque utilisateur et ne se remplace que par un nouveau script **à la même adresse** :

- ce que le service worker garde et sert (H3, F-023-AC5 à AC9) : une réponse de l'API ou d'une session mise en cache une fois ne se rappelle plus ;
- quand une nouvelle version prend la main (H4, F-023-AC10 à AC14) : une prise de contrôle en cours d'usage ferait tourner une page d'une construction contre le cache d'une autre, et un rechargement imposé perdrait un brouillon de champ ;
- comment la liste des fichiers et l'identifiant de construction sont produits sans dépendance (H2, F-023-AC15, AC24, AC25).

La veille du 2026-10-27 (`MEMORY/VEILLE.md`, sections « Vite 8.3.4 — greffon de construction… », « Service worker écrit à la main… », « Tests : jsdom 30.1.3… » et « Verdicts F-023 ») établit : `bundle` ignore `publicDir`, le dossier de sortie est complet à `writeBundle` (`order: "post"`) ; `skipWaiting()` sans `clients.claim()` fait changer de contrôleur les onglets déjà contrôlés (texte de la spécification, non constaté en exécution) ; un passage en WebSocket n'atteint jamais un service worker ; le navigateur ne revérifie `/sw.js` de lui-même qu'au plus une fois par jour ; jsdom n'offre ni `navigator.serviceWorker`, ni `caches`, ni `navigator.storage`.

## Options étudiées

Production du service worker :

1. **Greffon PWA de Vite et Workbox** (`vite-plugin-pwa@2.0.0`, `workbox-build@7.4.1`, repli nommé par la veille). Écarté (H2) : arbre transitif lourd et non audité (`@babel/core`, `rollup`, `glob`…), compatibilité avec Rolldown non vérifiée, stratégie par défaut (`autoUpdate` : prise de contrôle et rechargement automatiques) contraire à F-023-AC10, et règle de sécurité (« jamais l'API ») à prouver sur la configuration d'un générateur plutôt que sur une fonction.
2. **Script JavaScript écrit tel quel**, recopié par le greffon avec la liste substituée. Écarté : hors du typage et des règles de lint du dépôt, et la fonction de décision ne s'importe pas dans un test sans `export`, qu'un script classique n'admet pas.
3. **Sources TypeScript dans `apps/web/src/service-worker/`, réunies en un seul script classique par une construction imbriquée de Vite** (retenue) : chaque partie (décision, mise en cache, ménage, réponse) est une fonction testée sous Node avec ses dépendances injectées ; seul le fichier d'entrée nomme `self`, `fetch` et `caches`.

Stratégie de cache :

1. Mise en cache à l'usage (« réseau puis cache », « périmé puis revalidé ») : écartée, F-023-AC7 l'interdit et une réponse propre à une session y entrerait.
2. Un seul cache, mis à jour en place : écarté, un onglet pourrait lire des fichiers de deux constructions.
3. **Un cache par identifiant de construction, rempli tout ou rien à l'installation, jamais écrit ensuite** (retenue, H3).

Prise de main d'une nouvelle version :

1. `skipWaiting` et `clients.claim` à l'installation, rechargement automatique : écarté (H4, F-023-AC10).
2. Attendre seulement la fermeture de tous les onglets, sans notice : écarté, un utilisateur qui ne ferme jamais son onglet ne serait jamais mis à jour, et la garde de version (F-023-AC17) n'aurait pas d'issue.
3. **Attente, notice, activation au geste de l'utilisateur, rechargement de tous les onglets** (retenue, H4).

Identifiant de construction visible dans la page (F-023-AC15) : l'empreinte porte sur les fichiers de la page, qui ne peuvent donc pas la contenir sans se contredire.

1. Demander l'identifiant au service worker par message : écarté, rien à afficher sans service worker (développement, navigation privée), et l'affichage dépendrait d'un aller-retour asynchrone.
2. Un fichier `version.json` lu par la page : écarté, une requête de plus à l'ouverture (F-023-AC26, F-013-AC1) et le même cercle si le fichier est dans la liste.
3. **Une balise `<meta name="notionlike-construction">` du gabarit HTML, dont la valeur est remplacée après le calcul de l'empreinte** (retenue) : l'empreinte est calculée sur le gabarit tel que Vite l'a écrit (valeur `developpement`), puis l'identifiant y est inscrit. La page le lit de façon synchrone ; le gabarit tenu en cache porte celui de sa construction.

## Décision

### Fichiers et confinement

- `apps/web/src/service-worker/` : le service worker. N'importe que ses propres fichiers (règle `web-service-worker-sans-import`), et aucun fichier de `src/` hors de lui ne l'importe (`web-service-worker-hors-de-la-page`). Seul `sw.ts` (entrée) nomme `self`, `fetch` et `caches` ; aucun fichier n'y nomme le DOM, `indexedDB`, `localStorage` ni `document.cookie` (`eslint.config.mjs`) ; le littéral `/api` n'y figure que dans la règle d'exclusion de F-023-AC6 (contrôle statique de F-023-AC7, sur les sources et sur `/sw.js` construit). Il ne connaît aucune version de format (F-023-AC18).
- `apps/web/construction/coquille-hors-ligne.ts` : le greffon de construction, branché dans `vite.config.ts`, `apply: "build"`, `enforce: "post"`, `writeBundle` en `order: "post"`. Il n'importe que lui-même, `vite` et des modules de Node (`web-construction-liste-blanche`).
- `apps/web/src/installation/` : côté page, seul module à nommer `navigator.serviceWorker` (F-023-AC4, AC25) ; il tient aussi l'invite d'installation (`beforeinstallprompt`, `appinstalled`, mode autonome) et la lecture de l'identifiant. N'importe que lui-même ; atteint par son `index.ts` seulement.
- `apps/web/src/persistance/conservation.ts` : seul fichier à nommer `navigator.storage` (F-023-AC19), exposé à l'interface par `espace/`, seul module qui atteint la persistance hors d'elle-même (ADR-0007).
- `apps/web/public/` : `manifest.webmanifest` et les icônes, copiés tels quels à la racine de la sortie.

### Construction : liste, identifiant, script

À `writeBundle`, le greffon :

1. énumère le dossier de sortie (`options.dir`), fichiers de `publicDir` compris, et en retire `sw.js` et `demo.html` (F-023 D1) : c'est la liste de la coquille, en chemins absolus (`/index.html`, `/assets/…`, `/manifest.webmanifest`, `/icones/…`), triée ; aucun chemin ne commence par `/api` (sinon la construction échoue) ;
2. calcule l'identifiant : SHA-256 de la suite triée des couples (chemin, SHA-256 du contenu), gabarit pris avant inscription de l'identifiant ; les 16 premiers caractères hexadécimaux. Deux constructions des mêmes sources donnent le même identifiant ; un octet de plus dans un fichier de la liste le change ;
3. inscrit l'identifiant dans la balise `notionlike-construction` de `index.html` ;
4. construit `src/service-worker/sw.ts` par `build()` de Vite (`configFile: false`, aucun greffon, `write: false`, format `iife`, un seul fichier), l'identifiant et la liste remplaçant la constante `__COQUILLE__` par `define`, et écrit le résultat dans `sw.js`, nom fixe, sans empreinte.

Si la construction imbriquée se révèle impossible sous Vite 8.3.4 (à constater au premier bloc de code, la veille ne l'ayant pas essayée), la feature revient à la conception avant d'aller plus loin ; aucun autre moyen (fonction de transformation de Vite, script recopié) n'est retenu sans nouvelle décision.

### Ce que le service worker fait

- **Installation** (F-023-AC5) : supprime un cache déjà nommé `notionlike-coquille-<son identifiant>` (reste d'une installation avortée), demande chaque fichier de la liste avec `credentials: "omit"`, `cache: "no-store"`, `redirect: "error"`, exige de chaque réponse le statut 200, le type `basic` (même origine) et `redirected` faux, puis seulement écrit toutes les réponses dans le cache. Un échec, d'une requête ou d'une écriture, supprime ce cache et rejette `waitUntil` : l'installation échoue en entier, la version en service et son cache restent intacts.
- **Décision** (F-023-AC6) : une fonction pure, `decider(requete, coquille)`, rend « servir le fichier `<chemin>` du cache » pour un `GET` de même origine dont le `pathname` (non décodé) est dans la liste, et « servir `/index.html` du cache » pour une navigation `GET` de même origine dont le `pathname` n'est pas `/api` et ne commence pas par `/api/` ; sinon « réseau », et le gestionnaire n'appelle pas `respondWith`. Le cache est interrogé par le chemin de la liste, jamais par la requête : ni la requête, ni sa chaîne de requête, ni son fragment ne deviennent une clé.
- **Réponse** (F-023-AC8, AC9) : la réponse du cache, telle que reçue à l'installation ; si elle manque (cache évincé), `fetch(event.request)` tel quel. Rien n'est fabriqué, rien n'est écrit (`put` et `add` n'existent que dans l'installation).
- **Attente** (F-023-AC10) : `skipWaiting()` n'est appelé qu'à la réception du message `{ sorte: "activer" }` ; `clients.claim()` n'est jamais appelé. Un message d'une autre forme est ignoré.
- **Activation** (F-023-AC13) : supprime les caches dont le nom commence par `notionlike-coquille-` et dont l'identifiant n'est pas le sien, et eux seuls. Aucun accès à IndexedDB, au `localStorage`, à un autre cache ; jamais `unregister()`.

### Ce que la page fait

- **Inscription** (F-023-AC4) : hors développement (`import.meta.env.PROD`), après l'affichage de la coquille (événement `load`, ou tout de suite s'il est passé), `register("/sw.js", { scope: "/", updateViaCache: "none" })` ; un échec ou une interface absente laisse l'application telle qu'avant F-023, état « sans service worker ».
- **Développement** (F-023-AC22, `import.meta.env.DEV`) : aucune inscription ; désinscription de tout enregistrement de portée `/` de l'origine et suppression des caches `notionlike-coquille-*` ; aucune notice.
- **État de version** (magasin hors de React, lu par `useSyncExternalStore`) : `sans-service-worker`, `a-jour`, `recherche`, `en-attente`, `rien-de-neuf`. `en-attente` se fonde sur `registration.waiting` (lu au démarrage, puis suivi par `updatefound` et l'état `installed` du nouveau worker quand un contrôleur existe), jamais sur le contrôleur : un onglet ouvert pendant l'attente voit la notice (F-023-AC11).
- **Vérification** (F-023-AC14, AC17) : `registration.update()` à l'ouverture, toutes les 60 minutes, au retour de visibilité après 60 minutes au moins sans vérification, et à chaque refus d'une garde de version ; tout rejet est capté et rend `rien-de-neuf` sans rien afficher hors de la garde.
- **Application** (F-023-AC12) : « Mettre à jour maintenant » poste `{ sorte: "activer" }` au worker en attente ; à `controllerchange`, l'onglet se recharge une fois (verrou par onglet), et seulement s'il avait un contrôleur à son ouverture.

### Fenêtre résiduelle entre activation et rechargement (R7)

Entre l'activation de la nouvelle version et le rechargement de chaque onglet, l'onglet exécute encore le code de l'ancienne construction, sous le contrôle du nouveau worker. Une requête de l'ancienne page vers un fichier absent de la nouvelle liste n'est pas interceptée et part au réseau, où le serveur ne sert plus que la nouvelle construction : elle peut échouer.

- Ce qui y est exposé aujourd'hui : aucun `import()` dans `apps/web/src` (relevé du 2026-10-27) ; seuls les fichiers que la page demande à l'usage après son ouverture, c'est-à-dire les polices déclarées par `@font-face` et pas encore employées. Conséquence au pire : une police de repli jusqu'au rechargement. Aucune donnée n'est en jeu : le contenu est dans IndexedDB et le service worker n'y touche pas (F-023-AC16).
- Durée : celle qui sépare `controllerchange` de `location.reload()`, dans le même tour. Elle s'allonge pour un onglet dont la confirmation avant de quitter est armée (F-030-AC16, `espace/garde-onglet.ts`) : le navigateur y demande confirmation, et un refus laisse cet onglet sur l'ancienne construction, contrôlé par la nouvelle, jusqu'à son prochain rechargement. Limite acceptée ; la notice dit déjà que tous les onglets seront rechargés.
- Règle pour la suite : une feature qui ajoute un `import()` à `apps/web/src`, ou un fichier chargé à l'usage dont l'échec n'a pas de repli, reprend cet ADR (garder l'ancien cache jusqu'au rechargement du dernier onglet de l'ancienne construction, par exemple, ce que F-023-AC13 interdit aujourd'hui).

### Ce qui ne change jamais sans nouvel ADR

L'adresse `/sw.js`, la portée `/`, le préfixe `notionlike-coquille-` et la forme du message `{ sorte: "activer" }` : un navigateur qui porte une version installée ne se met à jour que par un script à cette adresse, qui comprend ce message et nettoie ces caches.

## Conséquences

- Aucune dépendance nouvelle ; une étape de plus à la construction (lecture du dossier, deux empreintes par fichier, une construction imbriquée de quelques fichiers), sans effet sur le serveur de développement (`apply: "build"`).
- Le cache ne contient que la coquille publique : ni réponse de l'API, ni cookie, ni document. Sur un appareil partagé, il n'apprend rien de l'utilisateur précédent ; la conservation garantie (F-023-AC19) allonge en revanche la durée de vie des bases de l'appareil, déjà lisibles par la personne suivante (F-032 H3).
- Une construction cassée qui empêche la coquille de s'afficher empêche aussi la notice : l'issue est de fermer tous les onglets de l'application, la version en attente servant à l'ouverture suivante (F-023-AC12). Un serveur qui reviendrait à une construction antérieure la ferait installer comme une mise à jour ; les gardes de version tiennent (H5).
- Exigences pour le futur serveur de la coquille (H8, feature de déploiement) : `https` ; `/sw.js` et le gabarit en `Cache-Control: no-cache` ; `/sw.js` en type JavaScript, à la racine ; une réponse 200 sans redirection pour chaque fichier de la liste ; **aucun contenu fourni par un utilisateur servi sur l'origine avec un type JavaScript** (sinon un script injecté pourrait inscrire un autre service worker sur l'origine), et jamais d'en-tête `Service-Worker-Allowed`.
- Tests : la décision, l'installation, l'activation et le ménage sous Node contre des doublures de `caches` et de `fetch` ; la construction réelle sous Node ; le module d'inscription sous jsdom contre une doublure de `navigator.serviceWorker` ; le cycle de vie réel (attente, prise de contrôle, rechargement de deux onglets, hors ligne) seulement sous Playwright et Chromium, hors des hooks (D-003).
- `.agents/fiche.yaml` (`stack.packaging`) cesse de nommer `vite-plugin-pwa`.
