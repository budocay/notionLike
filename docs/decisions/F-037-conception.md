# F-037 — Conception : écran d'accès, connexion d'abord, espace de l'appareil en choix secondaire

Date : 2026-10-30
Spec : `specs/F-037.md`, validée, structurel, lue sur la branche `F-037` à `39d4dfd` (`main` `a64bf5f`). ADR : amendement F-037 de l'ADR-0019 (proposé), un seul : le fichier qui nomme `localStorage` porte aussi la marque d'accès. Aucune ADR nouvelle : la porte au-dessus de la coquille (H2) est confirmée et ne renverse aucune décision écrite (ADR-0007 : `main.tsx` reste l'entrée, `EspaceDeLOnglet` y reste rendu).

Note écrite avant le code. `ARCHITECTURE.md` décrit le code de `main` et n'est pas touché ici ; il sera aligné après le code.

## Approche

Une idée porte la feature : **une porte hors de la coquille choisit, d'après une marque à deux valeurs et l'état du compte, entre l'écran d'accès et `EspaceDeLOnglet` ; rien en dessous d'elle ne la connaît.**

1. **Marque d'accès** (`persistance/reglages-de-vue.ts`, trois fonctions de plus, exportées par `persistance/index.ts`) : `lireLaMarqueDAcces(): "compte" | "local" | undefined`, `inscrireLaMarqueDAcces(valeur): boolean`, `effacerLaMarqueDAcces(): boolean`. La clé `notionlike:acces` est assemblée dans ce fichier seul. Toute valeur autre que `compte` ou `local` est lue comme absente (AC13) ; une exception du stockage est interceptée et rendue en `undefined` ou `false` (AC15), jamais levée. Pourquoi ce fichier et pas un module neuf : c'est le seul fichier d'`apps/web` qui a le droit de nommer `localStorage` (ESLint, F-018-AC40, ADR-0019) et d'écrire un littéral `notionlike:` hors des noms de base (F-003-AC36) ; un module neuf imposerait une retouche d'`eslint.config.mjs` (protégé) et de deux tests de F-018 et F-003 hors de la liste fermée de H5 (voir « Options écartées »). L'amendement F-037 de l'ADR-0019 élargit la règle : « le seul fichier qui nomme `localStorage` », pas « le fichier des réglages de vue seulement ».
2. **Porte** (`interface/porte-d-acces.ts`, nouveau, sans React) : un magasin né dans `main.tsx` avant le rendu, comme le pilote et le compte (ADR-0007 : `StrictMode` ne double rien). Il reçoit les trois fonctions de la marque et le suivi du compte (`compte.suivi`), lit la marque une fois et tient en mémoire, pour l'onglet, la valeur courante (repli d'AC15 : stockage indisponible, la mémoire seule vaut, et l'écran revient au lancement suivant). État : `{ ecran: "acces", motif: "premiere" | "deconnexion" | "invitation", jeton? }` ou `{ ecran: "coquille", invitation? }`. Règles, toutes écrites en un seul endroit et éprouvables sans React :
   - lancement : marque absente → `acces` ; marque `compte` ou `local` → `coquille`, sans attendre `moi` (AC1, AC2) ;
   - adresse `#/invitation/<jeton>` au lancement et marque autre que `compte` → le jeton est lu par `estUnJetonDInvitation`, tenu en mémoire, l'adresse remplacée par `remplacerParLEcran({ ecran: "invitation" })` (`navigation/fragment.ts`, comme F-014-AC21), `acces` motif `invitation` sans « Continuer sans compte » (AC11 ; voir la retouche R2 pour la marque `local`) ;
   - premier état concluant du suivi après le lancement : `connecte` → marque `compte`, `coquille` (AC3, AC5) ; `deconnecte` sous la marque `compte` → marque effacée, `acces` (AC4) ; `inconnu` (réseau, délai, 5xx) → rien ne change (AC4, hors ligne conservé) ;
   - tout état `connecte` ensuite → marque `compte` (AC8), sans changer d'écran si la coquille est montrée ;
   - tout `deconnecte` ensuite sans déconnexion demandée (expiration, revérification de F-010-AC5) → rien : ni écran, ni marque (AC10) ;
   - déconnexion confirmée (voir le point 4) → marque effacée, `acces` motif `deconnexion` (AC9) ;
   - « Continuer sans compte » → marque `local`, `coquille`, aucune requête (AC6).
3. **Écrans** : `interface/PorteDAcces.tsx` (abonné au magasin par `useSyncExternalStore`, rend l'écran d'accès ou ses enfants) et `interface/EcranDAcces.tsx` (lit le fragment par `abonnerAuFragment`/`lireFragment` et `lireRoute` : `#/inscription` → formulaire d'inscription, toute autre adresse → formulaire de connexion ; aucun paramètre n'est lu, AC12). Le formulaire est celui de F-010 : `EcranDeCompte` (`interface/EcranDeCompte.tsx`) gagne deux propriétés facultatives, `sortie` (le lien-bouton « Continuer sans compte », qui remplace « Retour à l'application » dans le pied) et `mention` (« Connectez-vous ou créez un compte pour rejoindre l'espace », « Vos pages restent sur cet appareil »), et `MessageDEnvoi` la phrase de plus d'AC7 quand l'erreur est `hors-ligne` et que `sortie` est donnée. Sans ces propriétés, l'écran est celui de F-010, octet pour octet (AC17, H7). Le retour après succès reste `allerAuRetour(retour)` d'`EcranDeCompte` : la porte lui passe le fragment de la dernière adresse qui n'était pas un écran de compte (la page ouverte au lancement, ou l'accueil), ou `#/invitation` (écran, sans jeton) pour le motif `invitation` ; la destination n'est jamais lue dans l'adresse (AC12). Le focus va au champ courriel à l'ouverture (`usePremierChamp` d'`EcranDeCompte`, déjà là, AC16).
4. **Déconnexion vue par la porte** : `main.tsx` enveloppe une fois `compte.client.deconnecter` (`avecLaPorte(compte, porte)`, exporté de `porte-d-acces.ts`, comme `avecLesNoms` de F-032) : après un `sign-out` réussi, la porte attend `compte.suivi.reverifier()` (requête partagée avec celle que lance `ZoneDeCompte`, `suivi-du-compte.ts` ne fait qu'un appel pour des demandes simultanées) et, sur `deconnecte`, passe en `acces` motif `deconnexion`. `ZoneDeCompte.tsx`, `suivi-du-compte.ts` et `client-auth.ts` ne changent pas (H2).
5. **Entrée** (`main.tsx`) : `const porte = ouvrirLaPorte({ marque, suivi: compte.suivi })` après le compte ; rendu `<PorteDAcces porte={porte} compte={compteAvecLaPorte}>{(invitation) => <EspaceDeLOnglet … invitation={invitation} />}</PorteDAcces>`. `<EspaceDeLOnglet` reste écrit dans `main.tsx` seul (couture F-032-AC32, `espace-coutures.test.ts` l.184) ; `piloterLOnglet`, `ouvrirLeMagasinDeLAppareil`, `demarrerSessionEspace` restent appelés par lui seul, avant le rendu, quel que soit l'écran (F-032-AC32, F-002-AC31) : la base de l'appareil s'ouvre pendant que l'écran d'accès s'affiche, ce qui ne coûte rien au réseau.
6. **Jeton remis à la coquille** (AC11) : `EspaceDeLOnglet` et `Application` gagnent une propriété facultative `invitation` (un jeton déjà lu), que `useNavigationDeLEspace` prend pour mémoire de départ (`DEPART.invitation`, dans l'initialiseur d'état : `StrictMode` le relit sans double effet). Absente : comportement d'avant pour tous les tests qui montent `Application` ou `EspaceDeLOnglet`.
7. **Démontage de la coquille** : passer de la coquille à l'écran d'accès démonte `EspaceDeLOnglet`, donc `Application` : les pages et tables ouvertes se ferment par leurs effets (`usePagesOuvertes`, `useTablesOuvertes`), la synchronisation par le sien ; la session d'espace, tenue par le pilote, reste ouverte. C'est le chemin que `StrictMode` éprouve déjà à chaque montage. « Continuer sans compte » remonte une coquille neuve sur la même session.

Ce que la conception confirme : la porte au-dessus de la coquille, dans `main.tsx` (H2) ; la marque à deux valeurs, sans identité (H3, H4). Ce qu'elle écarte : une route `#/acces` (H2) ; un module `persistance/marque-d-acces.ts` (option A ci-dessous) ; une coquille montée cachée derrière l'écran (`hidden`/`inert`) : ses effets (focus, annonces, première lecture) courraient sous l'écran d'accès et prendraient le focus au champ courriel (AC16) ; forcer l'espace de l'appareil par `pilote.changer` à « Continuer sans compte » (voir R1).

### Options pour la marque

- **A. Module neuf `persistance/marque-d-acces.ts`.** Le plus cohésif. Coût : `eslint.config.mjs` (protégé : le dev ajoute le fichier à la dérogation `localStorage` et à `FICHIERS_NOM_DE_BASE_WEB`), `test/table-reglages.test.ts` (F-018-AC40, l.61 à l.67 : un seul fichier nomme `localStorage`) et `test/structure-edition.test.ts` (F-003-AC36, l.213 à l.218 : fichiers qui portent le préfixe `notionlike:`) retouchés, en plus de `test/structure.test.ts`.
- **B. Trois fonctions de plus dans `persistance/reglages-de-vue.ts`.** Retenue. Coût : ce fichier n'est plus seulement celui des réglages de vue (amendement F-037 de l'ADR-0019), et `test/structure.test.ts` (exports de la persistance) gagne trois noms. Aucun fichier protégé.

## Décisions par critère

- **AC1, AC2, AC14** : porte (point 2) ; la marque n'est lue que par la porte, jamais par la synchronisation ni le compte : une marque `compte` forgée sans session montre la coquille, et la synchronisation n'ouvre rien tant que le suivi n'est pas `connecte` (F-013-AC7, inchangé). Test d'AC14 : marque forgée, `moi` 401, aucune WebSocket construite (environnement simulé de la synchronisation), aucune requête portant un identifiant d'espace (serveur simulé de `aides-compte.tsx`).
- **AC3 à AC5, AC8 à AC10** : règles du point 2, éprouvées sur le magasin seul (suivi simulé), puis à l'écran.
- **AC6** : « Continuer sans compte » est un `button` du pied ; aucun appel du client ; la coquille montrée est celle que le pilote a ouverte (espace retenu ou espace de l'appareil, F-032-AC17 inchangé, voir R1).
- **AC7** : messages de F-010 inchangés (`messages-erreur.ts`), phrase ajoutée seulement sous `sortie` et `hors-ligne` ; aucune marque écrite sur un échec (la marque ne s'écrit que sur `connecte`).
- **AC11, AC12** : points 2, 3 et 6.
- **AC13** : test d'énumération du stockage (liste fermée de F-010-AC19 : `compte-zone.test.tsx`, entrée `notionlike:acces` déclarée dans son inventaire, l.370) après connexion, choix local, déconnexion et expiration ; valeurs `Compte`, `LOCAL`, `"compte "`, JSON lues comme absentes.
- **AC15** : `Storage.prototype.getItem` et `setItem` qui lèvent (espion) : écran d'accès, mémoire de l'onglet, aucune erreur ni rejet non géré (écouteurs `error` et `unhandledrejection` du test).
- **AC16** : clavier seul, ordre de tabulation, Entrée, focus à l'ouverture, annonces (régions de F-010), et focus porté au premier titre de la coquille au passage (pas de piège : le formulaire est démonté).
- **AC17, AC18** : suites existantes sans modification hors de la liste ci-dessous.
- **AC19** : `e2e/acces.spec.ts` (nouveau), ignoré sans serveur comme ceux de F-013 ; joué par le dev sur la pile de F-031 (D-003).

## Plan par blocs (un commit par bloc)

Tous les blocs sont d'`agent-frontend` (`apps/web` seulement : spec, hors périmètre `apps/server`, `packages/**`).

1. **Marque** : `persistance/reglages-de-vue.ts` (trois fonctions), `persistance/index.ts` (exports). Tests : `test/acces-marque.test.ts` (nouveau : valeurs admises, valeurs refusées lues comme absentes, exceptions du stockage, aucune autre clé écrite, réglages de vue intacts) ; `test/structure.test.ts` (trois noms de plus, F-002-AC22).
2. **Porte, sans React** : `interface/porte-d-acces.ts` (magasin, `avecLaPorte`). Tests : `test/acces-porte.test.ts` (nouveau, suivi simulé, horloge simulée pour le délai de `moi` : AC1 à AC6, AC8 à AC11, AC14, AC15).
3. **Écrans et entrée** : `interface/PorteDAcces.tsx`, `interface/EcranDAcces.tsx`, `interface/EcranDeCompte.tsx` (`sortie`, `mention`), `interface/messages-compte.ts` (textes d'AC7, AC9, AC11), `interface/EspaceDeLOnglet.tsx` et `interface/Application.tsx` (propriété `invitation`), `interface/navigation-espaces.ts` (mémoire de départ), `main.tsx`. Tests : `test/acces-ecran.test.tsx` (nouveau : AC1 à AC13, AC15, AC16 à l'écran, porte et `EspaceDeLOnglet` montés comme `main.tsx` les monte, aide `aides-onglet.tsx` réutilisée sans modification) ; tests modifiés de la liste fermée : `compte-zone.test.tsx`, `compte-ecrans.test.tsx`, `aides-compte.tsx` si l'inventaire y est déclaré, `test/aides-facade.ts` (écart E2).
4. **Bout en bout** : `e2e/aides.ts` (`ouvrir` pose la marque `local` par `page.addInitScript` avant le premier chargement), `e2e/arborescence.spec.ts`, `e2e/demonstration.spec.ts`, `e2e/aides-ecrans.ts` (écart E3), `e2e/compte.spec.ts`, et `e2e/acces.spec.ts` (nouveau, AC19).
5. `agent-architecte-conception` : `ARCHITECTURE.md` aligné sur le code livré (module `interface/` : porte et écran d'accès ; persistance : marque ; flux de lancement ; menaces), après le code.

## Fichiers

Nouveaux, `apps/web` : `src/interface/porte-d-acces.ts`, `src/interface/PorteDAcces.tsx`, `src/interface/EcranDAcces.tsx`, `test/acces-marque.test.ts`, `test/acces-porte.test.ts`, `test/acces-ecran.test.tsx`, `e2e/acces.spec.ts`.

Modifiés, `apps/web/src` : `main.tsx`, `persistance/{reglages-de-vue,index}.ts`, `interface/{EcranDeCompte,EspaceDeLOnglet,Application}.tsx`, `interface/{navigation-espaces,messages-compte}.ts`.

Non touchés : `apps/server/**`, `packages/**`, `compte/**` (le module d'état du compte n'en sait rien, H2), `navigation/route.ts`, `navigation/fragment.ts`, `espace/**`, `synchronisation/**`, `interface/ZoneDeCompte.tsx`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `vitest.config.ts`, `playwright.config.ts`, tous les `package.json`, `pnpm-lock.yaml`.

Dépendances : aucune. Contrats de dépendances : aucun changement : `interface/` importe l'index de la persistance (`web-persistance-par-son-interface`), `navigation/` et `compte/`, comme aujourd'hui ; `main.tsx` importe `interface/`.

## Tests d'autres features modifiés, confrontés à la liste fermée de H5

Dans la liste : `test/compte-zone.test.tsx` (F-010-AC1, AC3, AC19), `test/compte-ecrans.test.tsx` (F-010-AC6), `test/aides-compte.tsx` (si l'inventaire du stockage y est déclaré), `e2e/aides.ts`, `e2e/arborescence.spec.ts`, `e2e/demonstration.spec.ts`, `e2e/compte.spec.ts`. `test/espaces-acceptation.test.tsx` (F-014-AC41, l.398) est dans la liste mais ne devrait pas changer : la porte n'appelle pas `allerAuRetour`, elle passe `retour` à `EcranDeCompte`, dont les deux appels énumérés restent ; à constater au bloc 3.

Hors de la liste, nécessaires (retouche de H5 à faire valider, voir « Retouches de spec ») :

- **E1** `apps/web/test/structure.test.ts` (F-002-AC22, l.57 : liste exacte des exports de `persistance/index.ts`) : trois noms de plus. Toute option fait sortir la marque par l'index de la persistance (`web-persistance-par-son-interface`) ; F-018 et F-032 ont allongé la même liste.
- **E2** `apps/web/test/aides-facade.ts` (`importerEntree`, l.66) : l'aide pose la marque `local` avant d'importer `main.tsx`. Sans cela, `test/coquille.test.tsx` (F-004, l.151 à l.154 : la navigation « Pages » dans `#racine` après l'entrée réelle), que H5 veut inchangé, verrait l'écran d'accès. Même procédé que `e2e/aides.ts` ; `coquille.test.tsx` lui-même n'est pas modifié.
- **E3** `apps/web/e2e/aides-ecrans.ts` (`construireLeChargement`, l.205 : `page.goto("/")` sans `ouvrir`, attend « Chargement… », que l'écran d'accès cacherait) : la marque est posée par la même aide d'initialisation. L'appel de l.187 suit `construireUnePage`, qui passe par `ouvrir` : le script d'initialisation vaut pour toute la page, rien à changer.

Constatés inchangés : `test/coutures.test.ts` (F-002-AC31), `test/espace-coutures.test.ts` (F-032-AC32 : `<EspaceDeLOnglet` dans `main.tsx` seul, `<Application` dans `EspaceDeLOnglet.tsx` seul), `test/reprise-coutures.test.tsx` (l.129 : `main.tsx` ne lit toujours pas l'état de la session), `test/demonstration.test.tsx` (F-004-AC53 : la démonstration n'est pas atteinte), `test/table-reglages.test.ts` (F-018-AC40 : le seul fichier qui nomme `localStorage` reste `reglages-de-vue.ts`), `test/structure-edition.test.ts` (F-003-AC36 : le préfixe `notionlike:` reste dans les trois mêmes fichiers), `test/vues-de-table/structure.test.ts` (F-018-AC39 : aucune API de réseau dans `reglages-de-vue.ts`), `test/compte-client.test.ts`, `test/compte-structure.test.ts`, `test/coquille-echecs.test.tsx` (l'entrée lève avant le rendu sans `#racine`).

## Retouches de spec à proposer au dev (spec non modifiée)

- **R1 (AC6, AC9, information ou retouche)** : « afficher la coquille sur l'espace de l'appareil » se lit, dans cette conception, comme « la coquille du pilote » : si un espace ajouté est retenu (F-032-AC17), c'est lui qui s'ouvre, ses pages lues sur l'appareil, sans réseau (F-032-AC24). C'est ce que dit AC19 (« constater les mêmes pages »). Forcer l'espace de l'appareil imposerait un `pilote.changer` depuis la porte et une couture de plus de F-032-AC32. Proposition : écrire « affiche la coquille (espace ouvert par F-032-AC17) ».
- **R2 (AC11 contre AC2, à trancher)** : sous la marque `local`, un lien d'invitation donne, à la lettre d'AC11, l'écran d'accès sans « Continuer sans compte » : la personne qui ne veut pas se connecter ne peut plus rouvrir ses pages sans retoucher l'adresse. Proposition : AC11 seulement sans marque ; sous `local`, la coquille et l'écran d'invitation de F-014 (« Connectez-vous pour accepter »), comme aujourd'hui. Sans décision, le code suit AC11 à la lettre.
- **R3 (H5)** : ajouter E1, E2 et E3 à la liste fermée.
- **R4 (AC4, information)** : marque `compte`, lien d'invitation et session expirée : la coquille montrée au lancement a déjà retiré le jeton de l'adresse (F-014-AC21) ; le 401 qui suit démonte la coquille et le jeton est perdu. Proposition : accepter la limite (le lien se rouvre), ou garder le jeton dans la porte dès le lancement quelle que soit la marque.

## Menaces propres à F-037

- Marque forgée (script de la même origine, extension) : elle ne choisit qu'un écran ; aucune requête, WebSocket ni autorisation n'en dépend (AC14) ; le serveur reste juge (cookie `HttpOnly`, F-009).
- Fuite d'identité par le stockage : deux valeurs fixes, sans courriel, nom, identifiant ni jeton (AC13) ; liste fermée de F-010-AC19 étendue d'une entrée.
- Jeton d'invitation : retiré de l'adresse dès le lancement, tenu en mémoire seulement, jamais écrit dans un stockage ni passé par la marque ; la destination de retour n'est jamais lue dans l'adresse, `document.referrer`, `window.name` ni un message (AC12).
- Appareil partagé : après une déconnexion, l'écran d'accès revient, mais « Continuer sans compte » rouvre les pages de l'appareil (F-010 H4, limite connue et voulue : pas de verrouillage par compte).
- Accès à un document d'un autre espace, membre retiré, mise à jour forgée ou géante, contenu de page piégé : inchangés (la porte ne touche ni la session, ni la synchronisation, ni le contenu).

## Annexe : fichiers protégés et partagés

Aucun fichier protégé ni partagé à changer (option B) : ni `.dependency-cruiser.cjs`, ni `eslint.config.mjs`, ni `vitest.config.ts`, ni `playwright.config.ts`, ni un `package.json`. Si le dev préfère l'option A, il commite dans `eslint.config.mjs` : la constante `const FICHIER_MARQUE_D_ACCES = "apps/web/src/persistance/marque-d-acces.ts";`, ce fichier ajouté à `FICHIERS_NOM_DE_BASE_WEB` et `files: [FICHIER_REGLAGES_DE_VUE, FICHIER_MARQUE_D_ACCES]` dans le bloc de la dérogation `localStorage` ; la spec est alors retouchée de deux tests de plus (`table-reglages.test.ts` l.61, `structure-edition.test.ts` l.213).
