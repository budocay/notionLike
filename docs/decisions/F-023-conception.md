# F-023 — Conception : PWA installable, coquille servie hors ligne, mise à jour de version

Date : 2026-10-27
Spec : `specs/F-023.md`, validée (revalidée par le dev le 2026-10-27 : R1 à R7, D1 `demo.html` hors de la liste), structurel, lue sur la branche `F-023` à `178b018`. ADR : ADR-0020 (proposé), service worker écrit à la main, stratégie de cache et de mise à jour, fenêtre résiduelle de H4/R7. Veille : `MEMORY/VEILLE.md`, sections du 2026-10-27 (Vite 8.3.4, service worker écrit à la main, installabilité et conservation, greffon PWA de repli, tests sous jsdom et Playwright, verdicts F-023).

Note écrite avant le code. `ARCHITECTURE.md` décrit le code de `main` et n'est pas touché ici : il sera aligné après le code (bloc 7).

**Ordonnancement.** Le code de F-023 démarre après l'entrée de F-032 dans `main` (puis de F-019, F-020, F-021 si elles la précèdent) et l'intégration de `main` dans `F-023` : F-032 réécrit `main.tsx`, `Application.tsx` et l'écran bloquant de version (action « Ouvrir l'espace de cet appareil »), que F-023 complète (voir « Recouvrements »). Chaque bloc se relit contre le code fusionné, pas contre cette note.

## Approche

Trois pièces, chacune confinée, aucune dépendance nouvelle (H2, AC25) :

1. **Le service worker** (`apps/web/src/service-worker/`, TypeScript, aucun import hors de lui) : une fonction pure de décision (liste blanche, AC6), une installation tout ou rien dans un cache par identifiant de construction (AC5), une réponse « cache, sinon réseau » sans aucune écriture (AC7 à AC9), un ménage à l'activation (AC13), `skipWaiting` sur message seulement (AC10). Chaque partie reçoit `fetch` et `caches` en paramètre ; seule l'entrée `sw.ts` les prend sur `self`. Testé sous Node.
2. **Le greffon de construction** (`apps/web/construction/coquille-hors-ligne.ts`, branché dans `vite.config.ts`, `apply: "build"`, `enforce: "post"`, `writeBundle` en `order: "post"`) : énumère le dossier de sortie (fichiers de `public/` compris, R1), retire `sw.js` et `demo.html` (D1), calcule l'identifiant, l'inscrit dans le gabarit, puis construit `sw.ts` en un seul script classique par `build()` de Vite (construction imbriquée, `define` de `__COQUILLE__`) et l'écrit à `sw.js`. Détail dans ADR-0020.
3. **La page** : un module `apps/web/src/installation/` (seul à nommer `navigator.serviceWorker` : inscription, ménage du développement, état de version, vérifications, application de la mise à jour ; invite d'installation ; lecture de l'identifiant), un fichier `persistance/conservation.ts` (seul à nommer `navigator.storage`) exposé par `espace/conservation-de-l-appareil.ts`, et dans `interface/` les notices, la commande d'installation, l'identifiant et la suite du message des gardes de version.

Ce que la conception écarte : le greffon PWA et Workbox (H2, ADR-0020) ; un script JavaScript recopié tel quel (hors typage et non testable) ; toute mise en cache à l'usage ; un `version.json` ou un message au worker pour afficher l'identifiant (ADR-0020) ; un service Docker Compose pour la coquille (H8 : pas d'`agent-devops`) ; une modification de `web-src-liste-blanche` (les nouveaux modules ont chacun leur règle plus stricte, ajoutée à la fin du fichier).

## Décisions par critère

- **AC1, AC3** : `public/manifest.webmanifest` (champs d'AC1, `theme_color` et `background_color` à `#10151c`, valeur de `<meta name="theme-color">` du gabarit et de F-004-AC6 ; aucune clé `shortcuts`, `share_target`, `file_handlers`, `protocol_handlers`, `related_applications`), icônes provisoires `public/icones/icone-180.png`, `icone-192.png`, `icone-512.png`, `icone-512-masquable.png` (H10 : aplat `#10151c` et monogramme, PNG produits une fois par un script hors du dépôt qui n'emploie que `node:zlib`, seuls les PNG sont commités). `index.html` gagne `<link rel="manifest" href="/manifest.webmanifest" />`, `<link rel="apple-touch-icon" href="/icones/icone-180.png" />` et `<meta name="notionlike-construction" content="developpement" />`. Test sur la sortie construite : champs, chaque icône présente et de même origine, dimensions lues dans l'en-tête IHDR.
- **AC2** : `installation/invite.ts` retient l'événement `beforeinstallprompt` (`preventDefault`), expose « installable », `proposer()` (un seul `prompt()` par événement retenu) ; `appinstalled` ou `matchMedia('(display-mode: standalone)')` vrai retirent la commande. Commande « Installer l'application » dans la barre latérale. Doublures : `Event` ordinaire portant `prompt()`, `matchMedia` simulé (R5).
- **AC4, AC22** : `installation/service-worker.ts` ; `import.meta.env.PROD` inscrit, `import.meta.env.DEV` désinscrit et nettoie (R2) ; après l'affichage (`load`, ou tout de suite si `document.readyState === "complete"`) ; tout rejet capté, état `sans-service-worker`.
- **AC5 à AC9, AC13** : dans le service worker, selon ADR-0020. La table de cas d'AC6 est une constante unique de `test/service-worker/` ; elle s'ajoute aux cas « servir » (fichier de la liste, navigation vers `/`, navigation vers `/` avec fragment ou chaîne de requête).
- **AC7, contrôle statique** : un test lit chaque fichier de `src/service-worker/` et le `sw.js` construit, et échoue sur `indexedDB`, `localStorage`, `document.cookie`, `cache.put`/`cache.add` hors de la mise en cache, ou un littéral commençant par `/api` hors de la règle d'exclusion de `regle.ts`. ESLint tient en plus les globales (annexe). Le test de F-010-AC19 (`test/compte-client.test.ts`) ne voit pas de cache sous jsdom : rien à changer, à confirmer au bloc 5 (H9).
- **AC10 à AC12, AC14, AC17** : état de version et vérifications dans `installation/service-worker.ts`, selon ADR-0020 ; horloge et visibilité injectées pour les tests (60 minutes simulées). Rechargement d'AC12 par `location.reload()`, une fois par onglet, seulement si l'onglet avait un contrôleur à l'ouverture.
- **AC15** : l'identifiant (16 caractères hexadécimaux) est lu de la balise `notionlike-construction` par `installation/identifiant.ts` ; la coquille en montre les 8 premiers, comme du texte, au pied de la barre latérale (« Version 1a2b3c4d ») ; valeur `developpement` : « Version de développement ». Voir R3.
- **AC16** : aucun code du service worker ni du module d'installation n'atteint IndexedDB ou le `localStorage` (règles et contrôle statique) ; test : espace rempli sous fake-indexeddb, installation, attente, activation et ménage déroulés contre les doublures, puis état encodé de chaque document et liste des bases relus octet pour octet.
- **AC17, AC18** : un composant de `interface/` (`SuiteDeLaGardeDeVersion`) ajouté sous le message de la garde d'espace (écran bloquant d'`Application.tsx`, tel que F-032 l'aura livré, action « Ouvrir l'espace de cet appareil » comprise) et sous celui de la page (`ZonePrincipale.tsx`, F-003-AC19 et AC29). À son montage, il demande une vérification ; textes et commandes d'AC17 selon l'état de version ; « sans service worker » : « Rechargez l'application pour la mettre à jour. ». Les gardes elles-mêmes ne changent pas (aucun éditeur, aucune liaison, aucune écriture) ; seuls les textes attendus de leurs tests s'allongent (H9). AC18 : un test ouvre un document de page de version N + 1 écrit par `yjs` seul, avant l'ouverture puis par une mise à jour reçue, et constate la garde intacte et le texte d'AC17. Voir R2 pour F-013-AC34.
- **AC19 à AC21** : `persistance/conservation.ts` : `lireLaConservation()` (`garantie`, `non-garantie`, `indisponible`, d'après `navigator.storage.persisted()`) et `demanderLaConservation()` (`garantie`, `refusee`, `indisponible`), jamais rejetées, sans état mémorisé. `espace/conservation-de-l-appareil.ts` en fait un magasin relu à l'ouverture et après chaque demande. Demandes : commande de la notice ; `appinstalled` (branché dans `main.tsx`) ; création d'une page quand l'arborescence de l'espace ouvert, corbeille comprise, était vide (voir R4). Notice d'AC20 par l'`Avertissement` existant (`composants/Etats.tsx`) ; masquée tant que l'avertissement de F-002-AC16 (`AvertissementDEnregistrement`) est affiché.
- **AC23** : rien à écrire dans `preview.*` (R3) ; test Vitest sur la configuration résolue en prévisualisation (`resolveConfig(…, "serve", "production", "production", true)`) : `preview.host`, `preview.strictPort`, `preview.proxy` égaux à ceux de `server.*`. Passage du relais service worker actif : Playwright, cible HTTP locale du test qui relève `Cookie` et `Origin` (bloc 6).
- **AC24, AC15 (construction)** : tests Node de construction réelle (`build()` de Vite sur `apps/web/vite.config.ts`, sortie dans un dossier temporaire, `NODE_ENV` forcé à `production` le temps de la construction, délai porté par le crochet ou le test) : liste = fichiers de la sortie moins `/sw.js` et `/demo.html`, chaque fichier présent, aucun chemin en `/api` ; deux constructions, même identifiant et même liste ; une troisième avec un greffon de test qui ajoute un commentaire à un module source, identifiant différent.
- **AC25** : règles de `.dependency-cruiser.cjs` et d'`eslint.config.mjs` (annexe) ; `pnpm contrats` sans violation.
- **AC26** : test de couture qui énumère : gabarit (manifeste, icône, `theme-color` inchangée, balise d'identifiant), `vite.config.ts` (serveur `127.0.0.1:5173`, port strict, relais objet `ws: true`, greffon présent et `apply: "build"`), formes d'adresse livrées (toutes de fragment ; celles de F-026 si elle est fusionnée avant), aucune requête de plus à l'ouverture (l'inscription part après `load`, une seule requête `/sw.js`), écran de F-002-AC26 hors contexte sécurisé (aucune inscription).
- **AC27** : boutons natifs ; notices annoncées à leur apparition sans prise de focus. L'`Avertissement` porte `role="alert"` : si la revue demande une annonce polie (`role="status"`) pour des notices permanentes, la variante s'ajoute à `composants/Etats.tsx` avec son spécimen dans la page de démonstration (zone de recouvrement, voir plus bas).
- **AC28** : Playwright, projet `coquille-construite` (annexe), Chromium. Le scénario construit lui-même deux sorties (la seconde avec le greffon de test d'AC15), lance `vite preview --outDir <sortie A>` sur un port fixe, puis l'arrête (coupure du réseau, R6) et lance `vite preview --outDir <sortie B>` **sur le même port** (voir R1). Preuves : `controllerchange`, `response.fromServiceWorker()`, identifiant affiché, énumération des caches par `page.evaluate`.

## Plan par blocs (un commit par bloc)

Tous les blocs de code sont d'`agent-frontend`. `agent-devops` n'a aucun bloc (H8 : aucun fichier d'infrastructure ; le « packaging PWA côté build » est le greffon d'`apps/web`, H2 entérinée par le dev).

0. Orchestrateur : fusion de `main` (F-032 et les features fusionnées avant) dans `F-023`. Dev : commit des fichiers protégés de l'annexe (`.dependency-cruiser.cjs`, `eslint.config.mjs`, `apps/web/playwright.config.ts`, `.agents/fiche.yaml`) ; celui d'`apps/web/vitest.config.ts` au plus tard avec le bloc 1 (le projet `web-hors-de-la-page` doit trouver des tests).
1. **Service worker** — agent-frontend. Fichiers : `src/service-worker/{coquille,regle,mise-en-cache,reponse,menage,messages,sw}.ts` ; `test/service-worker/*.test.ts` (Node), doublures de `caches`, `Cache` et `fetch` dans `test/service-worker/aides-service-worker.ts`. AC : AC5, AC6, AC7 (clés des caches après installation et requêtes, contrôle statique des sources), AC8 (repli réseau), AC9, AC10 (côté worker), AC13, AC16 (sous fake-indexeddb), AC18 (dernière phrase, contrôle statique), AC25 (part du worker).
2. **Construction** — agent-frontend. Fichiers : `construction/coquille-hors-ligne.ts`, `construction/node.d.ts` (types minimaux de Node, sur le modèle de `test/node.d.ts`), `public/manifest.webmanifest`, `public/icones/*.png`, `index.html` ; fichiers partagés signalés au dev : `vite.config.ts`, `tsconfig.json`, `package.json` (script `preview`) ; tests `test/construction/*.test.ts` (Node). AC : AC1, AC3, AC7 (contrôle statique sur `sw.js` construit), AC15 (part construction), AC23 (configuration résolue), AC24, AC25 (`pnpm contrats`), AC26 (gabarit et configuration de Vite). Premier constat à faire : la construction imbriquée fonctionne sous Vite 8.3.4 ; sinon arrêt et retour à la conception (ADR-0020).
3. **Module d'installation** — agent-frontend. Fichiers : `src/installation/{service-worker,invite,identifiant,index}.ts`, `src/main.tsx` (inscription après l'affichage, magasins passés à l'interface, `appinstalled` vers la conservation une fois le bloc 4 livré). Tests jsdom, doublures de `navigator.serviceWorker`, `ServiceWorkerRegistration`, `matchMedia`, horloge et visibilité : AC2 (magasin), AC4, AC10 et AC11 (attente lue au démarrage et suivie), AC12 (double `controllerchange`, premier contrôle sans rechargement), AC14, AC17 (vérification), AC22.
4. **Conservation** — agent-frontend. Fichiers : `src/persistance/conservation.ts`, `src/persistance/index.ts` (exports), `src/espace/conservation-de-l-appareil.ts`. Tests jsdom, doublure de `navigator.storage` : AC19 (aucun appel à l'ouverture, refus normal, interface absente, rejet capté), AC20 (états relus, jamais mémorisés), AC21 (aucune requête, aucun document touché) ; `test/structure.test.ts` (exports de la persistance, liste fermée qui s'allonge).
5. **Interface** — agent-frontend. Fichiers : `src/interface/` (notices de mise à jour et de conservation, `SuiteDeLaGardeDeVersion`, commande « Installer l'application » et identifiant dans la barre latérale, `Application.tsx`, `ZonePrincipale.tsx`, `BarreLaterale.tsx` ou `barreLateraleDe`, `messages.ts`), éventuellement `composants/Etats.tsx` (AC27). Tests jsdom : AC2 (commande), AC11, AC15 (affichage), AC17, AC18, AC20, AC21 (priorité de F-002-AC16), AC26 (couture complète), AC27 ; tests modifiés au seul texte des gardes (H9) : ceux de F-002-AC17, F-003-AC19 et AC29 (`test/page-version.test.tsx`, `test/coquille-echecs.test.tsx`, `test/espace-version.test.tsx` de F-032 ; liste à confirmer sur le code fusionné).
6. **Bout en bout** — agent-frontend. Fichiers : `e2e/coquille-construite/hors-ligne-et-mise-a-jour.spec.ts` (AC28, avec AC8 et AC12 réels), `e2e/coquille-construite/relais.spec.ts` (AC23, service worker actif), `e2e/coquille-construite/aides-construction.ts` (deux constructions, serveur de prévisualisation lancé et arrêté). Joués à la main par le dev avant le DONE (D-003), Chromium seul.
7. **agent-architecte-conception** : `ARCHITECTURE.md` aligné sur le diff livré (modules `service-worker/`, `installation/`, `construction/`, conservation, flux de construction, d'installation, de mise à jour et de démarrage hors ligne, menaces) ; addendum des écarts dans ADR-0020 et dans cette note.

## Fichiers

Nouveaux : `apps/web/src/service-worker/` (7 fichiers), `apps/web/src/installation/` (4), `apps/web/src/persistance/conservation.ts`, `apps/web/src/espace/conservation-de-l-appareil.ts`, `apps/web/construction/{coquille-hors-ligne.ts,node.d.ts}`, `apps/web/public/manifest.webmanifest`, `apps/web/public/icones/` (4 PNG), composants de notice dans `apps/web/src/interface/`, tests `apps/web/test/{service-worker,construction}/`, `apps/web/e2e/coquille-construite/`.

Modifiés : `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/persistance/index.ts`, `apps/web/src/interface/{Application,ZonePrincipale,BarreLaterale}.tsx`, `apps/web/src/interface/messages.ts`, éventuellement `apps/web/src/interface/composants/Etats.tsx` et la page de démonstration. Partagés, signalés au dev : `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/package.json`. Protégés, par le dev : annexe.

Non touchés : `apps/server/**`, `packages/**`, `infra/**`, `pnpm-lock.yaml` (aucune dépendance), `apps/web/src/{synchronisation,compte,navigation,edition,page,table,vues-de-table,glisser}/**`, `apps/web/src/espace/garde-version.ts`, `apps/web/demo.html`.

## Ce qui est prouvé, et où

- Vitest, Node (projet `web-hors-de-la-page`) : service worker contre doublures (AC5 à AC10, AC13, AC16, contrôle statique d'AC7 et AC18) ; construction réelle (AC1, AC3, AC15, AC23 configuration, AC24).
- Vitest, jsdom : module d'installation, conservation, interface, couture (AC2, AC4, AC11, AC12, AC14, AC17 à AC22, AC26, AC27).
- Playwright, Chromium, à la main : cycle de vie réel, hors ligne, deux onglets, relais service worker actif (AC8, AC12, AC23, AC28). Non vérifiés à l'exécution : Firefox et WebKit (hors périmètre), `controllerchange` sans `claim` (texte de la spécification seulement, veille), l'exception de `127.0.0.1` pour l'installabilité (veille, H7).

## Recouvrements avec les branches en cours

Lus le 2026-10-27 : `F-032` à `fd7ccec`, `F-019` à `2a836e3`, `F-020` à `bcab1b8`, `F-021` à `bd21d68`, `F-026` à `c1f59b5` (spec seulement, conception en parallèle).

- `apps/web/src/main.tsx` : F-032 le réécrit (pilote de l'onglet, `EspaceDeLOnglet`, magasin de l'appareil, noms retenus). F-023 y ajoute l'inscription après l'affichage et le branchement d'`appinstalled` vers la conservation. **Écrire contre la version de F-032.**
- `apps/web/src/interface/Application.tsx` : F-032 (propriété `espaces`, `EcranDeVersion` avec l'action « Ouvrir l'espace de cet appareil », sélecteur, `barreLateraleDe`) ; F-023 : notices, commande d'installation, identifiant, suite de la garde. Recouvrement le plus fort.
- `apps/web/src/interface/composants/Etats.tsx` et `etats.classes.ts` : F-032 ajoute l'action facultative d'`EcranBloquant` ; F-023 l'emploie et peut ajouter une variante polie d'`Avertissement` (AC27).
- `apps/web/src/interface/messages.ts`, `ZonePrincipale.tsx` : F-032 les modifie ; F-023 y ajoute les textes d'AC11, AC17, AC20 et la suite de la note de page.
- `apps/web/src/persistance/index.ts` et `apps/web/test/structure.test.ts` : F-032 y porte trente-cinq exports ; F-023 en ajoute deux.
- `apps/web/src/espace/` : F-032 y ajoute `appareil.ts` et `espace-ouvert.ts` ; F-023 y ajoute `conservation-de-l-appareil.ts` (aucun fichier commun).
- `apps/web/src/demonstration/{PageDemonstration.tsx,donnees.ts}`, `apps/web/test/demonstration.test.tsx` : touchés par F-032, F-019, F-020 et F-021 ; F-023 seulement si un composant de présentation change (AC27), en dernier, après les fusions.
- Tests de couture communs : `test/coutures.test.ts`, `test/reprise-coutures.test.tsx`, `test/corbeille-coutures.test.ts`, `test/coutures-lecture-seule.test.ts` (F-019, F-020, F-021, F-032) : F-023 ne prévoit que `coutures.test.ts` ou un fichier de couture propre (AC26) ; tests des gardes de version, dont `test/espace-version.test.tsx` créé par F-032.
- `apps/web/e2e/largeurs.spec.ts` et `e2e/aides-ecrans.ts` (F-021) : la règle des 360 pixels (F-004-AC45, ROADMAP) vaut pour les notices ; si elles y sont mesurées, ce fichier est commun.
- `.dependency-cruiser.cjs` : F-020 y modifie trois lignes (règle de `glisser/`) ; les règles de F-023 s'ajoutent à la fin de la liste, sans toucher aux règles existantes.
- `eslint.config.mjs` : aucune autre branche en cours ne le touche.
- F-026 (serveur et courriels, apps/web pour les écrans de jeton) : formes d'adresse `#/reinitialisation/<jeton>` et `#/verification/<jeton>` (F-026-AC28, AC36), toutes de fragment : servies par le gabarit, compatibles avec AC6 ; si F-026 est fusionnée avant, la couture d'AC26 les énumère. Fichiers probablement communs : `src/navigation/route.ts` (F-023 n'y touche pas), `src/interface/Application.tsx`, `test/coutures.test.ts`. **Numéro d'ADR** : F-023 prend ADR-0020 ; si la conception de F-026 le prend aussi, la seconde à fusionner renumérote.
- `ARCHITECTURE.md` et `MEMORY/VEILLE.md` : modifiés par F-032, F-019, F-020, F-021 ; un conflit se résout par leur propriétaire.

## Retouches de spec à proposer au dev (spec non modifiée)

- **R1 (AC28, R6)** : « second port » ne convient pas. Un enregistrement de service worker est propre à l'origine, port compris : une seconde construction servie sur un autre port serait une autre application, sans attente ni notice. Proposition : « La seconde construction est servie par un vrai serveur à la même origine (même hôte, même port : le serveur de la première est arrêté puis remplacé) et non par `route()` ».
- **R2 (AC17, H5)** : le refus de version par le serveur (F-013-AC34, `messages-synchronisation.ts` : « Mettez l'application à jour, puis réessayez ») mène à la même impasse qu'H5 décrit : avec un service worker, recharger ne met plus à jour. H5 cite F-013-AC34, AC17 ne l'énumère pas. Proposition : ajouter F-013-AC34 à la liste d'AC17 (et à H9 pour son test) ; sans décision, le code suit AC17 à la lettre et le message de F-013-AC34 reste tel quel.
- **R3 (vocabulaire « identifiant de construction », AC15)** : l'empreinte porte sur des fichiers dont le gabarit, qui porte l'identifiant à afficher. Proposition : « calculée sur les chemins et le contenu des fichiers de la liste, le gabarit HTML étant pris avant l'inscription de l'identifiant ».
- **R4 (AC19, « première page sur l'appareil »)** : définition proposée : la création d'une page alors que l'arborescence de l'espace ouvert, corbeille comprise, était vide. Raison : demander à chaque création, tant que la garantie manque, ferait afficher sa fenêtre par Firefox à chaque page ; l'état n'est pas mémorisé (AC20). Conséquence : une demande au plus par espace neuf.
- **R5 (D1, information)** : `demo.html` n'est pas dans la sortie aujourd'hui (Vite ne construit que `index.html`, F-004-AC50, `preuve:construction`) ; l'exclusion d'AC24 est une garde et ne change pas la comparaison.
- **R6 (AC6, information)** : une navigation vers une adresse hors de `/api` et de ses sous-chemins reçoit le gabarit, `/API/v1/moi`, `/api%2Fv1/moi`, `/sante` ou `/pret` compris (le serveur d'Express compare ses routes sans la casse) ; aucune réponse d'API n'est gardée ni fabriquée, la table d'AC6 n'est pas en défaut (ses cas sont des requêtes, pas des navigations).
- **R7 (AC12, information)** : le rechargement d'un onglet dont la confirmation avant de quitter est armée (F-030-AC16) ouvre la confirmation du navigateur ; un refus laisse cet onglet sur l'ancienne construction (ADR-0020, fenêtre résiduelle ; ROADMAP l'annonce pour F-023).

## Menaces propres à F-023

- Réponse de l'API, cookie ou jeton gardés dans un cache (fuite entre comptes d'un appareil partagé) : liste blanche (AC6), installation sans cookie, aucune écriture à l'usage ; contrôle statique et énumération des clés (AC7). Clé du cache = chemin de la liste, jamais la requête : un jeton de fragment (invitation de F-014, liens de F-026) n'y entre pas.
- Cache empoisonné à l'installation : même origine, 200, sans redirection, tout ou rien (AC5). Un serveur compromis sert ce qu'il veut avec ou sans service worker ; avec, la construction reste jusqu'à la mise à jour suivante, que `/sw.js` en `no-cache` permet.
- Service worker étranger inscrit sur l'origine par un script injecté : il faudrait une réponse de type JavaScript dont le contenu est fourni par un utilisateur ; exigence écrite pour le serveur (ADR-0020, conséquences) et à reprendre par F-022 (images) et le déploiement.
- Activation forcée par un message forgé : seul un script de même origine peut l'envoyer, et il a déjà tous les pouvoirs ; l'activation ne touche à aucun document (AC16).
- Version ancienne servie par le serveur, document plus récent : gardes de version inchangées (AC18, H5).
- Accès à un document d'un autre espace, membre retiré qui garde une copie locale, mise à jour de synchronisation forgée ou géante, invitation rejouée, contenu de page piégé : inchangés ; le service worker ne connaît aucun document, ne voit aucun passage en WebSocket (veille, H1) et ne lit aucun contenu.
- Appareil partagé : le cache ne contient que la coquille publique ; la conservation garantie allonge la vie des bases déjà lisibles par la personne suivante (F-032 H3).

## Annexe : fichiers protégés et partagés (texte exact)

### `.dependency-cruiser.cjs` (protégé, dev)

À la fin de `forbidden`, après la règle `web-demonstration-liste-blanche` :

```diff
       to: {
         pathNot: [
           "^apps/web/src/demonstration/",
           "^apps/web/src/interface/composants/",
           "^apps/web/src/interface/messages\\.ts$",
           "^apps/web/src/interface/raccourcis\\.ts$",
           "^apps/web/src/styles/",
           "(^|/)node_modules/(react|react-dom)/",
         ],
       },
     },
+    {
+      name: "web-service-worker-sans-import",
+      severity: "error",
+      comment:
+        "F-023-AC25, ADR-0020 : le service worker n'importe que ses propres fichiers (ni module de l'application, ni yjs, ni react, ni @notionlike/contrats, ni bibliothèque de cache).",
+      from: { path: "^apps/web/src/service-worker/" },
+      to: { pathNot: "^apps/web/src/service-worker/" },
+    },
+    {
+      name: "web-service-worker-hors-de-la-page",
+      severity: "error",
+      comment:
+        "F-023-AC25, ADR-0020 : aucun fichier de src/ hors du service worker ne l'importe ; seul le greffon de construction le construit, par son chemin.",
+      from: { path: "^apps/web/src/", pathNot: "^apps/web/src/service-worker/" },
+      to: { path: "^apps/web/src/service-worker/" },
+    },
+    {
+      name: "web-installation-liste-blanche",
+      severity: "error",
+      comment:
+        "F-023-AC4, AC25, ADR-0020 : le module d'installation (inscription du service worker, invite d'installation, identifiant de construction) n'importe que lui-même : ni React, ni la persistance, ni l'interface.",
+      from: { path: "^apps/web/src/installation/" },
+      to: { pathNot: "^apps/web/src/installation/" },
+    },
+    {
+      name: "web-installation-par-son-interface",
+      severity: "error",
+      comment:
+        "ADR-0020 : hors du module d'installation, seul son index.ts est importable (tests compris).",
+      from: { path: "^apps/web/", pathNot: "^apps/web/src/installation/" },
+      to: { path: "^apps/web/src/installation/", pathNot: "^apps/web/src/installation/index\\.ts$" },
+    },
+    {
+      name: "web-construction-liste-blanche",
+      severity: "error",
+      comment:
+        "ADR-0020 : le greffon de construction n'importe que lui-même, vite et les modules de Node ; il n'importe ni src/ ni aucun autre paquet.",
+      from: { path: "^apps/web/construction/" },
+      to: {
+        pathNot: ["^apps/web/construction/", "(^|/)node_modules/vite/", "^vite$"],
+        dependencyTypesNot: ["core"],
+      },
+    },
   ],
```

### `eslint.config.mjs` (protégé, dev)

```diff
@@ const GLOBALES_INTERDITES_WEB = [
   ["localStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
   ["sessionStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
+  [
+    "caches",
+    "F-023-AC7, ADR-0020 : seul le service worker écrit un cache ; la page n'en supprime qu'en développement, par src/installation/service-worker.ts.",
+  ],
 ].map(([name, message]) => ({ name, message }));
@@ const PROPRIETES_INTERDITES_WEB = [
   ["getXmlElement", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
+  [
+    "serviceWorker",
+    undefined,
+    "F-023-AC25 : seul src/installation/service-worker.ts emploie navigator.serviceWorker.",
+  ],
+  ["storage", "navigator", "F-023-AC19 : seul src/persistance/conservation.ts lit navigator.storage."],
 ].map(([property, object, message]) =>
@@ const SYNTAXES_NOM_DE_BASE = [
   message:
     "F-002-AC25, F-018-AC40 : seuls nom-de-base.ts, espace-local.ts et reglages-de-vue.ts écrivent un nom de base ou de clé.",
 }));
+// F-023-AC4, AC19, AC25, ADR-0020 : seuls fichiers de la page qui nomment navigator.serviceWorker
+// et caches (ménage du développement), et navigator.storage.
+const FICHIER_SERVICE_WORKER_DE_LA_PAGE = "apps/web/src/installation/service-worker.ts";
+const FICHIER_CONSERVATION = "apps/web/src/persistance/conservation.ts";
+// F-023-AC7, AC25, ADR-0020 : le service worker s'exécute hors de la page ; seul son fichier
+// d'entrée nomme self, fetch et caches, qu'il passe aux autres ; aucun ne nomme le DOM, le stockage
+// de l'appareil ni importScripts.
+const DOSSIER_SERVICE_WORKER = "apps/web/src/service-worker/**";
+const FICHIER_ENTREE_SERVICE_WORKER = "apps/web/src/service-worker/sw.ts";
+const GLOBALES_LIBRES_DE_L_ENTREE = new Set(["self", "fetch", "caches"]);
+const GLOBALES_INTERDITES_SERVICE_WORKER = [
+  "window",
+  "self",
+  "globalThis",
+  "document",
+  "location",
+  "history",
+  "navigator",
+  "fetch",
+  "caches",
+  "indexedDB",
+  "localStorage",
+  "sessionStorage",
+  "XMLHttpRequest",
+  "WebSocket",
+  "EventSource",
+  "importScripts",
+].map((name) => ({
+  name,
+  message:
+    "F-023-AC7, AC25 : le service worker reçoit self, fetch et caches de sw.ts seul et ne nomme ni le DOM ni le stockage de l'appareil.",
+}));
@@ export default tseslint.config(
   {
     files: ["packages/contrats/src/**"],
     rules: {
       "no-restricted-globals": [
         "error",
         {
           globals: GLOBALES_INTERDITES_CONTRATS,
           checkGlobalObject: true,
         },
       ],
     },
   },
+  {
+    files: [FICHIER_SERVICE_WORKER_DE_LA_PAGE],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        {
+          globals: [
+            ...GLOBALES_INTERDITES_WEB.filter(({ name }) => name !== "caches"),
+            GLOBALE_INDEXEDDB,
+          ],
+          checkGlobalObject: true,
+        },
+      ],
+      "no-restricted-properties": [
+        "error",
+        ...PROPRIETES_INTERDITES_WEB.filter(({ property }) => property !== "serviceWorker"),
+        PROPRIETE_RANDOMUUID,
+      ],
+    },
+  },
+  {
+    files: [FICHIER_CONSERVATION],
+    rules: {
+      "no-restricted-properties": [
+        "error",
+        ...PROPRIETES_INTERDITES_WEB.filter(({ property }) => property !== "storage"),
+        PROPRIETE_RANDOMUUID,
+      ],
+    },
+  },
+  {
+    files: [DOSSIER_SERVICE_WORKER],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        { globals: GLOBALES_INTERDITES_SERVICE_WORKER, checkGlobalObject: true },
+      ],
+    },
+  },
+  {
+    files: [FICHIER_ENTREE_SERVICE_WORKER],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        {
+          globals: GLOBALES_INTERDITES_SERVICE_WORKER.filter(
+            ({ name }) => !GLOBALES_LIBRES_DE_L_ENTREE.has(name),
+          ),
+          checkGlobalObject: true,
+        },
+      ],
+    },
+  },
 );
```

Les quatre blocs viennent après ceux d'`apps/web/src/**` et de `persistance/**` : dans une configuration à plat, le dernier bloc qui s'applique fixe les options d'une règle. `caches`, `serviceWorker` et `navigator.storage` sont absents d'`apps/web/src` aujourd'hui (relevé du 2026-10-27).

### `apps/web/vitest.config.ts` (protégé, dev)

```diff
 const SYNCHRONISATION = "test/synchronisation/**/*.test.ts";
+// F-023 H11 : la construction réelle (F-023-AC15, AC24) et le service worker, qui s'exécute hors
+// de la page, s'éprouvent sous Node, sans DOM simulé ni la préparation des écrans.
+const HORS_DE_LA_PAGE = "test/{construction,service-worker}/**/*.test.ts";

 export default defineConfig({
   test: {
     projects: [
       {
         test: {
           name: "web",
           environment: "jsdom",
           include: ["test/**/*.test.{ts,tsx}"],
-          exclude: [SYNCHRONISATION],
+          exclude: [SYNCHRONISATION, HORS_DE_LA_PAGE],
           setupFiles: ["./test/preparation.ts"],
           restoreMocks: true,
           unstubGlobals: true,
         },
       },
       {
         test: {
           name: "web-synchronisation",
           environment: "node",
           include: [SYNCHRONISATION],
           restoreMocks: true,
           unstubGlobals: true,
         },
       },
+      {
+        test: {
+          name: "web-hors-de-la-page",
+          environment: "node",
+          include: [HORS_DE_LA_PAGE],
+          restoreMocks: true,
+          unstubGlobals: true,
+        },
+      },
     ],
   },
 });
```

Raison : `test/preparation.ts` écrit `window.location.hash` à chaque test ; un test de construction sous jsdom chargerait Vite et Tailwind dans un DOM simulé. Délais : portés par les tests de construction eux-mêmes, aucun `testTimeout` ni `hookTimeout` global.

### `apps/web/playwright.config.ts` (protégé, dev)

```diff
 const ADRESSE = "http://127.0.0.1:5174";
+// F-023-AC23, AC28 (H11, D-003) : les scénarios de la coquille construite lancent eux-mêmes leurs
+// constructions et leur serveur de prévisualisation, remplacé sur le même port (une seule origine) ;
+// Chromium seul prend en charge les service workers dans Playwright.
+const COQUILLE_CONSTRUITE = /coquille-construite\/.*\.spec\.ts$/;
+const ADRESSE_DE_LA_COQUILLE_CONSTRUITE = "http://127.0.0.1:4175";

 export default defineConfig({
   testDir: "./e2e",
   forbidOnly: true,
   retries: 0,
   reporter: "list",
   use: { baseURL: ADRESSE, trace: "retain-on-failure" },
-  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
+  projects: [
+    { name: "chromium", testIgnore: COQUILLE_CONSTRUITE, use: { ...devices["Desktop Chrome"] } },
+    {
+      name: "coquille-construite",
+      testMatch: COQUILLE_CONSTRUITE,
+      timeout: 180_000,
+      use: {
+        ...devices["Desktop Chrome"],
+        baseURL: ADRESSE_DE_LA_COQUILLE_CONSTRUITE,
+        serviceWorkers: "allow",
+      },
+    },
+  ],
   webServer: {
```

Lancement : `pnpm --filter @notionlike/web exec playwright test --project coquille-construite`. Les scénarios livrés restent dans `chromium`, inchangés (AC22).

### `.agents/fiche.yaml` (protégé, dev)

```diff
-  packaging: "PWA (vite-plugin-pwa)"
+  packaging: "PWA : service worker écrit à la main, liste de la coquille produite par un greffon Vite d'apps/web (ADR-0020)"
```

### Fichiers partagés (écrits par agent-frontend, signalés au dev)

`apps/web/vite.config.ts` :

```diff
 import tailwindcss from "@tailwindcss/vite";
 import react from "@vitejs/plugin-react";
 import { defineConfig, loadEnv } from "vite";

+import { coquilleHorsLigne } from "./construction/coquille-hors-ligne.ts";
+
 const HOTE_LOCAL = "127.0.0.1";
@@
 export default defineConfig(({ mode }) => ({
-  plugins: [react(), tailwindcss()],
+  // F-023-AC24, ADR-0020 : à la construction seulement, la liste de la coquille est lue dans le
+  // dossier de sortie et inscrite dans /sw.js. Aucune clé `preview.*` : la prévisualisation reprend
+  // l'hôte, le port strict et le relais de `server.*` (F-023-AC23, R3).
+  plugins: [react(), tailwindcss(), coquilleHorsLigne()],
   server: {
```

`apps/web/tsconfig.json` :

```diff
-  "include": ["src", "test", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
+  "include": [
+    "src",
+    "test",
+    "e2e",
+    "construction",
+    "vite.config.ts",
+    "vitest.config.ts",
+    "playwright.config.ts"
+  ]
```

`apps/web/package.json` (les clés `scripts.test`, `scripts.lint`, `scripts.format`, `scripts.typecheck` ne changent pas) :

```diff
     "build": "vite build",
+    "preview": "vite preview",
     "test": "vitest run",
```
