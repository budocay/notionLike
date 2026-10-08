# F-002 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-002.md`, validée par le dev sur la branche `F-002` (commit `3107639`) : 32 critères (F-002-AC1 à AC32), H1 à H14.
ADR : ADR-0007 (structure d'`apps/web`, session, routes), ADR-0008 (persistance locale), ADR-0003 amendé (fermeture de la façade, rappel d'abonné qui lève : levée de la dette D-006).

Ce document est un plan. Il ne décrit pas le code livré : `ARCHITECTURE.md` le fera, bloc après bloc. Rien de ce plan n'est commité à part lui-même et les trois ADR.

**Les deux scripts du dev sont essayés** : extraits de ce document par les commandes données plus bas, ils ont été lancés à la suite dans un clone du dépôt qui porte le même arbre non commité que le dépôt principal, hooks git actifs ; le script du bloc 0 l'a été aussi, seul, sur un gabarit tiré de `git archive HEAD` (`apps/.gitkeep` et `packages/.gitkeep` compris). Sorties exactes dans « Essais », essais S1 à S3.

## État de départ

Le code de F-002 existe déjà, non commité, dans l'arbre du dépôt principal, mêlé à celui de F-003 et écrit contre une version antérieure de la spec. Relevé du 2026-10-08 par `git ls-files -m -o --exclude-standard` : 73 chemins.

| Ensemble                                                                    | Chemins | Devenir                                                                |
| --------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `apps/web/`                                                                 | 56      | 38 pour F-002 (dont 10 mêlés à F-003), 18 pour F-003 seule             |
| `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml` (modifiés) | 3       | mêlés : le bloc 0 en écrit la version F-002 seule à partir de HEAD     |
| `packages/document/` : trois fichiers modifiés, cinq non suivis             | 8       | F-003 seule                                                            |
| `docs/decisions/0009-…`, `docs/decisions/F-003-conception.md`               | 2       | F-003 seule                                                            |
| `docs/decisions/0007-…`, `0008-…`, `F-002-conception.md`                    | 3       | commités avec ce plan                                                  |
| `ARCHITECTURE.md` (modifié)                                                 | 1       | version périmée, à ne pas reprendre : `ARCHITECTURE.md` repart de HEAD |

Ce plan ne récrit pas ce code. Il dit comment le mettre à l'abri sans rien perdre, quels fichiers chaque bloc reprend, lesquels sont à retoucher parce que la spec validée a changé (F-002-AC25 réécrit, AC27 à AC32), et ce qui reste à écrire.

## Approche

`apps/web` (`@notionlike/web`) est une application React 19 servie par Vite 8, sans bibliothèque d'état ni de routage. Cinq modules, dépendances à sens unique (ADR-0007) :

- `identifiants/` : une fonction pure, `estUuidCanonique`, seule définition de la forme d'un identifiant dans l'application ;
- `persistance/` enrobe `y-indexeddb` et porte ce qu'elle ne fait pas : nom des bases, contrôle de forme de chaque identifiant, identifiant de l'espace local, délai de 10 secondes, interception des échecs, validation de chaque écriture (ADR-0008) ;
- `espace/` tient la session : garde de contexte sécurisé, `Y.Doc`, persistance, façade de `@notionlike/document`. Elle est la seule abonnée de la façade, lui donne son récepteur d'exception, la ferme, et expose un état immuable ;
- `navigation/` lit et écrit le fragment de l'adresse, et refuse tout identifiant qui n'est pas un UUID canonique ;
- `interface/` rend cet état par `useSyncExternalStore` et appelle trois opérations de la façade.

`packages/document` reçoit deux retouches, et elles seules : la façade se ferme, et un rappel d'abonné qui lève n'interrompt plus la diffusion (amendement F-002 de l'ADR-0003).

L'essentiel des preuves est sous Vitest (jsdom, Testing Library, `fake-indexeddb`), parce que les tests de bout en bout ne sont lancés par aucun hook (dette D-003) ; un scénario Playwright couvre ce qui exige un vrai navigateur.

## Fichiers d'`apps/web` à la fin de F-002

```text
apps/web/
  package.json  vitest.config.ts  tsconfig.json  vite.config.ts  playwright.config.ts   (dev, bloc 0)
  index.html                       page hôte : <div id="racine">, script de src/main.tsx
  src/
    main.tsx                       entrée : démarre la session, monte <Application>
    styles.css                     mise en page sobre, CSS simple
    identifiants/
      uuid-canonique.ts            estUuidCanonique : longueur, puis forme
    persistance/
      index.ts                     interface du module (seul fichier importable du dehors)
      nom-de-base.ts               désignation -> nom de base, contrôle de chaque identifiant ; ErreurPersistance
      indexeddb.ts                 seul importateur de y-indexeddb : états, délai, sonde, garde, validation des écritures
      espace-local.ts              base notionlike:appareil, identifiant de l'espace local
    espace/
      session-espace.ts            demarrerSessionEspace, EtatSession, SessionEspace (fermer comprise)
    navigation/
      route.ts                     formes d'adresse (pur) : lireRoute, fragmentDe
      fragment.ts                  lireFragment, abonnerAuFragment, allerA (location.hash)
    interface/
      Application.tsx              aiguillage par phase, état d'écran, titre de l'onglet
      BarreLaterale.tsx            nav « Pages », « Nouvelle page », liste plate des pages
      RangeePage.tsx               une rangée : dépliage, lien, trois actions
      SaisieTitre.tsx              champ « Titre de la page » : Entrée, sortie du champ, Échap
      ZonePrincipale.tsx           invitation, titre de la page, « Page introuvable »
      pages.ts                     parcours itératifs de l'arborescence lue
      messages.ts                  textes français, message par code d'erreur, limite de titre
  test/
    preparation.ts                 IndexedDB simulé neuf par test, fragment remis à zéro
    aides-persistance.ts  aides-coquille.tsx
    *.test.ts, *.test.tsx          treize fichiers : voir « Attendu chiffré »
  e2e/
    aides.ts  arborescence.spec.ts scénarios Playwright
```

Le nom `src/persistance/indexeddb.ts` est fixé par le contrat `web-y-indexeddb-confinee`. Les autres fichiers internes d'un module peuvent être redécoupés par le producteur à l'intérieur du même dossier, à condition de le signaler ; les dossiers et les points d'entrée (`persistance/index.ts`, `identifiants/uuid-canonique.ts`, `demarrerSessionEspace`, `Application`) ne changent pas sans retour à la conception.

Textes et noms accessibles fixés ici : « Nouvelle page », « Sans titre », « Chargement… », « Page introuvable », « Titre de la page » ; par rangée, « Renommer « T » », « Ajouter une sous-page à « T » », « Mettre « T » à la corbeille », « Replier « T » », « Déplier « T » », où T est le titre affiché. Les phrases longues sont dans `messages.ts` ; les tests les retrouvent par rôle et par un mot stable (« enregistrées », « https », « 200 »).

## Mise à l'abri de l'arbre (dev, avant le bloc 0)

Pourquoi. Un agent n'écrit que dans le dépôt principal (le hook de périmètre refuse un autre worktree), et tant que le code de F-003 y est, les contrôles de F-002 ne peuvent pas y être verts : les contrats de F-002 seule refusent `src/edition/` et `src/page/`, et les tests de F-003 demandent des dépendances que le manifeste de F-002 seule n'a pas. L'arbre doit donc redevenir celui de HEAD, sans que rien ne soit perdu. Aujourd'hui ce travail n'existe que dans l'arbre.

Comment. Le dev commite l'arbre entier sur une branche d'archive, puis revient sur `F-002`. La branche `archive-arbre-2026-10-08` n'est jamais fusionnée (comme `planification-reunie`) : elle sert de réserve, dont chaque bloc reprend ses fichiers par `git show archive-arbre-2026-10-08:<chemin> > <chemin>`, et dont F-003 reprendra sa part. C'est aussi la première copie de ce travail hors de l'arbre.

À lancer à la racine du dépôt principal, sur la branche `F-002`, après le commit de ce plan et le gate de conception, `MEMORY/gates.log` commité :

```bash
sed -n '/^# F-002 ABRI DEBUT$/,/^# F-002 ABRI FIN$/p' docs/decisions/F-002-conception.md | zsh
```

```bash
# F-002 ABRI DEBUT
set -eu
ARCHIVE=archive-arbre-2026-10-08
test "$(git branch --show-current)" = F-002 || { echo "ARRET : la branche courante n'est pas F-002, rien n'est fait"; exit 1; }
if git rev-parse --verify --quiet "refs/heads/$ARCHIVE" >/dev/null; then echo "ARRET : la branche $ARCHIVE existe deja, rien n'est fait"; exit 1; fi
test -n "$(git status --porcelain)" || { echo "ARRET : l'arbre est deja celui de HEAD, rien a mettre a l'abri"; exit 1; }
tracabilite="$(git status --porcelain -- MEMORY specs PROJECT_LOG.md ROADMAP.md AGENTS.md .agents .githooks docs/decisions/F-002-conception.md)"
test -z "$tracabilite" || { echo "ARRET : a commiter sur F-002 avant la mise a l'abri, rien n'est fait :"; echo "$tracabilite"; exit 1; }
avant="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
git switch -q -c "$ARCHIVE"
git add -A
git commit -q -m "🗄️ archive de l'arbre de travail du 2026-10-08 : F-002 et F-003 non commités" --trailer "Agent: dev"
git switch -q F-002
echo "abri : $avant chemins dans $ARCHIVE ($(git rev-parse --short "$ARCHIVE")) ; chemins encore modifies ou non suivis dans l'arbre : $(git status --porcelain | wc -l | tr -d ' ')"
# F-002 ABRI FIN
```

- Le script s'arrête sur `ARRET` sans rien faire si la branche courante n'est pas `F-002`, si la branche d'archive existe, si l'arbre est déjà celui de HEAD, ou si un fichier de traçabilité, de spec, du socle ou ce plan porte une modification non commitée (ils partiraient dans l'archive et disparaîtraient de `F-002`).
- Attendu : une ligne `abri : 70 chemins dans archive-arbre-2026-10-08 (<hash>) ; chemins encore modifies ou non suivis dans l'arbre : 0`. Le compte est celui de l'arbre au moment du lancement : 73 chemins relevés, moins les trois documents commités avec ce plan. Après lui, `git status --short` est vide ; `apps/web/` ne contient plus que `node_modules` (ignoré).
- Le commit d'archive passe par les hooks comme tout commit : formatage, lint et secrets sur les fichiers archivés, périmètre du dev. Essais S1 et S3 : ils passent sur l'arbre du 2026-10-08. S'ils refusent (un fichier retouché depuis), le script s'arrête sur la branche d'archive, fichiers indexés, arbre intact : rien n'est perdu ; corriger ou revenir par `git switch F-002`, puis supprimer la branche d'archive vide.
- Ce que le dev peut préférer : une archive `tar` hors du dépôt. Elle ne passe par aucun hook, mais elle ne se relit pas par `git show` et ne survit pas à la perte du dossier où elle est posée ; ce plan ne l'a pas essayée.

## Plan par blocs

Un commit par bloc. Le dev fait la mise à l'abri et le bloc 0 ; `agent-frontend` fait les blocs 1 à 4, dans cet ordre. Chaque bloc livre son code et ses tests et laisse `pnpm exec prettier --check .`, `pnpm lint`, `pnpm typecheck`, `pnpm contrats` et `pnpm test` verts. Un bloc ne démarre que si l'attendu chiffré du précédent est constaté. `agent-architecte-conception` aligne `ARCHITECTURE.md` après chaque bloc (« `ARCHITECTURE.md`, bloc après bloc »).

**Règle d'atteinte, vraie de chaque bloc.** Tout fichier de `src/`, toute fonction exportée, tout membre d'interface, tout état et tout composant livré par un bloc est exercé, dans ce bloc, par au moins un test qui passe par le point d'entrée de son module : `src/index.ts` pour `packages/document`, `identifiants/uuid-canonique.ts`, `persistance/index.ts`, `demarrerSessionEspace` pour la session, `<Application session={…} />` pour l'interface et la navigation, `src/main.tsx` pour l'entrée. Aucun composant ni fonction factice, aucun corps vide, aucun membre en attente.

**Rien avant son premier appelant.** La navigation, l'interface et la session arrivent dans le même bloc : aucune n'a d'appelant sans les deux autres. `identifiants/` arrive avec son premier appelant, la persistance. La persistance (bloc 2) et la retouche de la façade (bloc 1) précèdent leur appelant de production, la session (bloc 3) ; d'ici là, elles sont atteintes par leurs tests à travers leur point d'entrée, et le test de couture des appelants de la façade existe dès le bloc 2.

**Pourquoi quatre blocs de code et non cinq.** Le plan précédent découpait l'interface en trois blocs (coquille, rangée, navigation). Le code est écrit : le redécouper obligerait le producteur à fabriquer deux états intermédiaires d'`Application.tsx` qui n'ont jamais tourné. Le bloc 3 reprend donc l'interface en une fois.

**Vérité sur les fichiers.** Chaque bloc liste les fichiers qu'il reprend de l'archive sans y toucher, ceux qu'il reprend et retouche, et ceux qu'il écrit. Un producteur qui doit toucher un autre fichier le fait si le fichier est dans son périmètre et le signale dans son message de fin, avec la raison ; s'il s'agit d'un fichier protégé ou partagé, il s'arrête et le demande. Aucun fichier de F-003 n'est repris (« Séparation de F-002 et de F-003 »).

| Bloc | Producteur       | Contenu                                                                 | Critères                                                                                                                                                                                                                       |
| ---- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| abri | dev              | arbre non commité archivé sur `archive-arbre-2026-10-08`, retour à HEAD | aucun (condition du reste)                                                                                                                                                                                                     |
| 0    | dev              | squelette d'`apps/web`, huit contrats, barrières ESLint, installation   | prépare AC18, AC19, AC22, AC25, AC26, AC27, AC32 (aucun alias dans les configurations)                                                                                                                                         |
| 1    | `agent-frontend` | `packages/document` : fermeture de la façade, rappel d'abonné qui lève  | AC29 et AC30 côté paquet ; AC31 (exports, signatures et tests de F-001 inchangés)                                                                                                                                              |
| 2    | `agent-frontend` | `identifiants/` et `persistance/` entiers ; coutures du workspace       | AC25, AC28 ; AC22 ; AC21 (manifestes, verrou, instance) ; aller-retour d'AC20 ; AC16 et AC24 au niveau du module ; preuve Vitest d'AC4 ; AC2 au niveau du module ; forme d'AC27 ; énumération d'AC31 ; AC32 hors construction  |
| 3    | `agent-frontend` | session, navigation, interface, entrée : la coquille entière            | AC1 à AC3, AC5 à AC15, AC17, AC18, AC26, AC27 ; AC16 et AC24 à l'écran ; énumération d'AC20 ; AC19 (statique) ; AC21 (document de la session) ; AC29 et AC30 côté application ; AC31 étendu à la session ; construction d'AC32 |
| 4    | `agent-frontend` | bout en bout                                                            | AC23 ; volets navigateur d'AC2, AC4, AC19 et AC21                                                                                                                                                                              |

Après le bloc 4 : la ligne « Lancer l'application » d'`AGENTS.md` (fichier protégé) est à renseigner par le dev (`pnpm --filter @notionlike/web dev`, puis `http://127.0.0.1:5173`), et la dette D-006 est à clore dans `PROJECT_LOG.md`.

### Fichiers de chaque bloc

« Repris » : copié de l'archive, à l'octet près. « Retouché » : repris, puis modifié comme la colonne le dit. « Écrit » : n'existe pas dans l'archive. Les chemins des blocs 2 à 4 sont relatifs à `apps/web/`.

**Bloc 1 — `packages/document`.** Rien n'est repris de l'archive : les fichiers de `packages/document` qui y figurent sont ceux de F-003.

| Fichier                                     | Origine  | Ce que le bloc y fait                                                                                                                                                                              |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/document/src/document-espace.ts`  | HEAD     | `fermer()` ; second paramètre facultatif de `creerDocumentEspace` et d'`ouvrirDocumentEspace` ; diffusion sous garde ; repli sur `console.error` ; `console` déclarée localement (ADR-0003 amendé) |
| `packages/document/test/fermeture.test.ts`  | écrit    | preuves d'AC29 et d'AC30 côté paquet (liste dans « Ce que chaque bloc réalise »)                                                                                                                   |
| les six autres fichiers de test, `aides.ts` | inchangé | aucun : ils restent verts sans retouche (224 tests), c'est la preuve d'AC31 pour les appelants de F-001                                                                                            |

`src/index.ts` ne change pas : aucun export n'est ajouté.

**Bloc 2 — `identifiants/` et `persistance/`.**

| Fichier                               | Origine  | Ce que le bloc y fait                                                                                                                                                                                             |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/identifiants/uuid-canonique.ts`  | écrit    | `estUuidCanonique` (ADR-0007)                                                                                                                                                                                     |
| `src/persistance/index.ts`            | repris   |                                                                                                                                                                                                                   |
| `src/persistance/indexeddb.ts`        | repris   |                                                                                                                                                                                                                   |
| `src/persistance/espace-local.ts`     | repris   | son contrôle de l'identifiant relu passe déjà par la fonction de nommage                                                                                                                                          |
| `src/persistance/nom-de-base.ts`      | retouché | contrôle de chaque identifiant par `estUuidCanonique` (l'archive ne contrôle que celui de l'espace) ; code `identifiant-invalide` ; message sans l'identifiant                                                    |
| `test/preparation.ts`                 | retouché | sans les quatre fonctions de mise en page ajoutées pour ProseMirror (F-003)                                                                                                                                       |
| `test/aides-persistance.ts`           | repris   | retouché seulement si une aide y ouvre une façade sans la fermer                                                                                                                                                  |
| `test/persistance-ouverture.test.ts`  | retouché | tests d'AC25 réécrits (identifiants de page et de table en UUID ; un identifiant de page avec `:` est refusé, sans base, celle de A inchangée) ; table des refus étendue aux trois identifiants ; façades fermées |
| `test/persistance-echecs.test.ts`     | retouché | façades fermées ; le test de l'identifiant d'espace illisible sur l'appareil cite AC28                                                                                                                            |
| `test/persistance-validation.test.ts` | retouché | l'identifiant de page `p1` devient un UUID                                                                                                                                                                        |
| `test/structure.test.ts`              | retouché | sans le groupe « dépendances d'édition » ni l'import d'`ouvrirDocumentPage` (F-003) ; dépendances d'exécution de F-002 seule ; façade fermée ; plus les preuves d'AC32                                            |
| `test/uuid-canonique.test.ts`         | écrit    | table de cas de la forme (AC27, AC28)                                                                                                                                                                             |
| `test/coutures.test.ts`               | écrit    | énumération des appelants de la façade dans le workspace (AC31) ; les autres coutures de ce fichier arrivent au bloc 3                                                                                            |

**Bloc 3 — la coquille.**

| Fichier                                                           | Origine  | Ce que le bloc y fait                                                                                                                                                             |
| ----------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `src/main.tsx`                                      | repris   |                                                                                                                                                                                   |
| `src/navigation/fragment.ts`                                      | repris   |                                                                                                                                                                                   |
| `src/navigation/route.ts`                                         | retouché | l'identifiant lu passe par `estUuidCanonique`, sans décodage ; forme `page-introuvable` sans la chaîne ; `fragmentDe` sans encodage (ADR-0007)                                    |
| `src/espace/session-espace.ts`                                    | retouché | récepteur donné à la façade ; `fermer()` ; abonnés prévenus sous garde ; façade fermée à l'entrée dans `version-non-prise-en-charge` ; sans `idEspace` dans l'état `pret` (F-003) |
| `src/interface/BarreLaterale.tsx`, `RangeePage.tsx`               | repris   |                                                                                                                                                                                   |
| `src/interface/SaisieTitre.tsx`, `pages.ts`                       | repris   |                                                                                                                                                                                   |
| `src/interface/Application.tsx`                                   | retouché | sans la session de page ni `useEtatDeLaPage` (F-003) ; l'avertissement ne dépend que de `etat.enregistre` ; forme de route `page-introuvable`                                     |
| `src/interface/ZonePrincipale.tsx`                                | retouché | sans l'éditeur ni `ContenuDePage` (F-003) : titre seul                                                                                                                            |
| `src/interface/messages.ts`                                       | retouché | sans les deux textes de version de page ni le message du code `version-invalide`, qui n'existe pas dans le paquet de F-002                                                        |
| `src/styles.css`                                                  | retouché | sans les règles `.edition`, `.barre-de-blocs`, `.ProseMirror` (F-003)                                                                                                             |
| `test/aides-coquille.tsx`                                         | retouché | chaque session démarrée et chaque façade ouverte par une aide est fermée en fin de test ; une aide unique pour activer une action de rangée (« Ce que F-004 remplacera »)         |
| `test/coquille.test.tsx`, `coquille-echecs.test.tsx`              | retouché | sessions fermées par l'aide                                                                                                                                                       |
| `test/barre-laterale.test.tsx`, `barre-laterale-erreurs.test.tsx` | retouché | actions de rangée par l'aide, sauf dans le test d'AC10 qui fixe les commandes natives                                                                                             |
| `test/navigation.test.tsx`                                        | retouché | cas d'AC13 et d'AC27 à l'écran : identifiant de forme refusée, rien de la chaîne dans la page ni dans l'onglet ; actions de rangée par l'aide                                     |
| `test/route.test.ts`                                              | retouché | table de cas d'AC27 ; les deux tests qui fixaient l'encodage et « quel qu'il soit » disparaissent                                                                                 |
| `test/coutures.test.ts`                                           | retouché | énumération d'AC20 et autres coutures reprises de l'archive, sans la part F-003 ni `version-invalide` ; énumération d'AC31 étendue à la session                                   |
| `test/session-fermeture.test.tsx`                                 | écrit    | AC29 et AC30 côté application                                                                                                                                                     |

**Bloc 4 — bout en bout.**

| Fichier                    | Origine  | Ce que le bloc y fait                                                      |
| -------------------------- | -------- | -------------------------------------------------------------------------- |
| `e2e/arborescence.spec.ts` | repris   | cinq scénarios                                                             |
| `e2e/aides.ts`             | retouché | le préfixe `notionlike:page:` sort de la liste des bases attendues (F-003) |

### Séparation de F-002 et de F-003

Fichiers de l'archive qu'aucun bloc de F-002 ne reprend : ils restent sur la branche d'archive pour F-003.

- `apps/web` (18) : `src/edition/` (`BarreDeBlocs.tsx`, `EditeurDePage.tsx`, `extensions.ts`, `index.ts`, `libelles.ts`), `src/page/session-page.ts`, `test/edition/` (six fichiers), `test/aides-page.tsx`, `test/page-affichage.test.tsx`, `test/page-echecs.test.tsx`, `test/page-session.test.ts`, `test/page-version.test.tsx`, `e2e/editeur.spec.ts` ;
- `packages/document` (8) : `src/document-page.ts`, `src/format-page.ts`, `test/document-page.test.ts`, `test/garde-version.test.ts`, `test/version-page-convergence.test.ts`, et la part de F-003 dans `src/erreurs.ts` (code `version-invalide`), `src/index.ts` (exports de page) et `test/structure.test.ts` ;
- `docs/decisions/0009-format-document-de-page.md`, `docs/decisions/F-003-conception.md` ;
- `ARCHITECTURE.md` de l'arbre : version périmée, reprise par personne.

Fichiers mêlés : ce que le commit de F-002 garde pour tenir debout seul. Les dix d'`apps/web` ont été séparés ainsi sur le gabarit, et l'ensemble passe les cinq contrôles, le bout en bout et la construction (essai G).

| Fichier mêlé                       | Ce que F-002 garde                                                                                                      | Ce qui reste à F-003                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`            | cinq dépendances d'exécution, onze de développement (texte du bloc 0)                                                   | dix paquets `@tiptap/*` et `y-protocols`                                                                                                                                     |
| `.dependency-cruiser.cjs`          | les sept contrats de HEAD et huit contrats `web-*` (texte du bloc 0)                                                    | `edition-confinee`, `web-edition-par-son-interface`, `web-edition-liste-blanche`, `web-page-liste-blanche`, et `page`, `edition` dans l'exception de `web-src-liste-blanche` |
| `eslint.config.mjs`                | constantes et trois blocs d'`apps/web/src` (texte du bloc 0)                                                            | `IMPORTS_DE_L_EDITION` et son bloc `no-restricted-imports`                                                                                                                   |
| `pnpm-lock.yaml`                   | régénéré par `pnpm install` au bloc 0                                                                                   | régénéré par le bloc 0 de F-003                                                                                                                                              |
| `src/interface/Application.tsx`    | tout, sauf l'import de `page/session-page.ts`, `useEtatDeLaPage` et ses trois constantes, `etatPage`, `pageEnregistree` | la session de page et son branchement                                                                                                                                        |
| `src/interface/ZonePrincipale.tsx` | les trois écrans (titre, « Page introuvable », invitation)                                                              | la propriété `etatPage`, `ContenuDePage`, l'import d'`EditeurDePage`                                                                                                         |
| `src/interface/messages.ts`        | tout, sauf deux constantes et une entrée de la table des messages                                                       | `TITRE_PAGE_VERSION_NON_PRISE_EN_CHARGE`, `EXPLICATION_PAGE_VERSION_NON_PRISE_EN_CHARGE`, message de `version-invalide`                                                      |
| `src/espace/session-espace.ts`     | tout, sauf `idEspace` dans l'état `pret`                                                                                | `idEspace` dans l'état `pret` (lu par la session de page)                                                                                                                    |
| `src/styles.css`                   | jusqu'à la règle `.ecran-plein` comprise                                                                                | le bloc « Éditeur de page »                                                                                                                                                  |
| `test/preparation.ts`              | l'appareil simulé neuf et le fragment remis à zéro                                                                      | les quatre fonctions de mise en page pour ProseMirror                                                                                                                        |
| `test/structure.test.ts`           | les groupes « une seule instance de yjs » et « frontières du module de persistance », liste de dépendances de F-002     | le groupe « dépendances d'édition », `ouvrirDocumentPage`, les paquets d'édition dans la liste                                                                               |
| `test/coutures.test.ts`            | AC20, AC22, AC21, AC14, AC15, sans `session-page.ts`, sans les fichiers d'édition, sans `version-invalide`              | le test de F-003-AC24 et AC27                                                                                                                                                |
| `e2e/aides.ts`                     | tout, avec le seul préfixe `notionlike:espace:`                                                                         | le préfixe `notionlike:page:`                                                                                                                                                |

Le fichier `src/interface/messages.ts` de l'archive ne compile pas contre le paquet de F-002 : sa table est typée par `CodeErreurDocument`, qui n'a pas `version-invalide` à HEAD. C'est le seul fichier mêlé dont la part F-003 casse la vérification des types sans import absent.

### Écarts entre le code de l'archive et la spec validée

Vérifiés dans le code, pas supposés. Chacun est rattaché au bloc qui le comble.

| Écart                                                                                                                                                                                                                                                       | Critère          | Bloc  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----- |
| `nom-de-base.ts` ne contrôle que l'identifiant d'espace ; un identifiant de page `page:avec:deux-points` ouvre une base. Deux tests le fixent (« même avec « : » », « qui imite un autre espace »), et les tests de validation utilisent l'identifiant `p1` | AC25, AC28       | 2     |
| aucune fonction unique de forme : l'expression régulière vit dans `nom-de-base.ts`, sans borne de longueur préalable                                                                                                                                        | AC27, AC28       | 2     |
| `route.ts` décode le fragment (`decodeURIComponent`) et accepte toute chaîne non vide comme identifiant de page ; elle est ensuite cherchée dans l'arborescence. `route.test.ts` fixe « relit l'identifiant qu'il a écrit, quel qu'il soit »                | AC27             | 3     |
| `document-espace.ts` (HEAD) : diffusion sans garde, aucune fermeture                                                                                                                                                                                        | AC29, AC30       | 1     |
| `session-espace.ts` : aucun récepteur, aucune `fermer()`, la façade n'est jamais fermée ; ses propres abonnés sont prévenus sans garde                                                                                                                      | AC29, AC30       | 3     |
| aucun test n'énumère les appelants de `creerDocumentEspace`, `ouvrirDocumentEspace` et `abonner` ; onze fichiers d'`apps/web` et de `packages/document` les appellent (essai X), aucun ne ferme de façade                                                   | AC31             | 2, 3  |
| aucun test ne fixe la liste des exports vus par le nom du paquet, l'absence d'alias, ni le refus d'un sous-chemin ; `build` n'est lancé par aucun contrôle                                                                                                  | AC32             | 2, 3  |
| aucun test ne cite F-002-AC27 à AC32 : `ac-couverture.sh F-002` échouerait                                                                                                                                                                                  | AC27 à AC32      | 1 à 3 |
| l'état `pret` porte `idEspace`, lu par la seule session de page                                                                                                                                                                                             | hors périmètre   | 3     |
| les tests atteignent les actions de rangée par leur nom à une soixantaine d'endroits                                                                                                                                                                        | F-004 (plus bas) | 3     |

Écarts entre le code de l'archive et le plan précédent, entérinés par les ADR mis à jour : liste plate à `aria-level` au lieu de listes imbriquées (ADR-0007) ; validation de chaque écriture par `commit()` et second champ interne de `y-indexeddb` (ADR-0008) ; cinq scénarios de bout en bout au lieu de quatre (le cinquième : titre validé puis rechargement immédiat).

## Ce que chaque bloc réalise

### Bloc 1 — levée de D-006 dans `packages/document`

Décision : amendement F-002 de l'ADR-0003. Interface à la fin du bloc : les exports de F-001, `DocumentEspace.fermer()` et le second paramètre facultatif des deux fonctions de création.

`test/fermeture.test.ts`, par `src/index.ts`, chaque test citant son critère :

- AC29 : trois abonnés dont le deuxième lève ; une opération locale ne lève pas, le premier et le troisième sont appelés une fois, dans l'ordre ; le récepteur reçoit l'exception, une fois ; même constat quand le changement vient de `Y.applyUpdate` ; deux abonnés fautifs : deux remises, dans l'ordre d'inscription ;
- AC29 : façade créée sans récepteur : ni l'opération ni `Y.applyUpdate` ne lèvent, les autres abonnés sont appelés, `console.error` (espionnée) reçoit l'exception ; récepteur qui lève : la diffusion continue, `console.error` reçoit son exception ;
- AC30 : après `fermer()`, une transaction qui change l'arborescence n'appelle aucun abonné et `lire()` rend la référence d'avant ; seconde fermeture sans effet ; `abonner` après fermeture n'inscrit rien ; ouvrir puis fermer 50 fois sur un même `Y.Doc` laisse le nombre d'écouteurs `afterTransaction` du départ ; deux façades sur un même `Y.Doc`, l'une fermée : l'autre notifie encore ; `creerDocumentEspace()` se ferme de la même façon.

Le nombre d'écouteurs se lit par `doc._observers.get("afterTransaction")?.size ?? 0` : `_observers` est un champ de la classe d'observable dont `Y.Doc` hérite, déclaré dans ses types (essai D : la lecture compile dans `packages/document` ; essai F : elle rend 0, 1, 0).

Constat : aucun test de F-001 ne fixait la remontée de l'exception d'un rappel (`abonnement.test.ts` n'a aucun rappel qui lève). Aucun test de F-001 n'est donc modifié.

### Bloc 2 — `identifiants/` et `persistance/`

- `uuid-canonique.ts` : `estUuidCanonique(valeur: string): boolean`, longueur comparée à 36 avant l'expression régulière. `test/uuid-canonique.test.ts` : table de cas — vide, plusieurs milliers de caractères, majuscules, `:`, `/`, `#`, `%` et séquences encodées, balisage HTML, segment en trop, espace avant, saut de ligne après, sans tirets, entre accolades ; et un UUID de `crypto.randomUUID()` accepté. Piège relevé à l'essai précédent : un identifiant de test sans lettre (`11111111-…`) ne change pas en majuscules ; le cas des majuscules prend un UUID qui contient des lettres.
- `nom-de-base.ts` : non exportée par `index.ts` ; les tests l'atteignent par `ouvrirPersistance` et `ouvrirEspaceLocal`, en énumérant les bases par `indexedDB.databases()`.
- Test d'AC25, dans `persistance-ouverture.test.ts` : contenu témoin sous `{ page, A, P }` ; `{ page, B, P }` lit un document vide ; deux bases énumérées, celle de A inchangée ; puis un identifiant de page qui contient `:` pour l'espace B : `ErreurPersistance`, aucune base de plus, celle de A inchangée. Table d'AC28 : pour chacun des trois identifiants (espace, page, table) et chaque forme refusée, refus sans base ; identifiant d'espace illisible relu sur l'appareil : persistance `coupee`, aucune base d'espace.
- Les désignations `page` et `table` n'ont pas d'appelant dans l'application avant F-003 et F-018 ; la spec les demande ici (H13 c) et elles sont atteintes par ces tests.
- `test/structure.test.ts`, preuves d'AC32, toutes essayées (essai X) : (1) `import * as paquet from "@notionlike/document"` rend exactement `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace` ; (2) les fichiers de configuration qui peuvent porter un alias sont énumérés par `import.meta.glob` en `?raw` et leur liste est fixée — `apps/web/vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, et à la racine `vitest.config.ts`, `tsconfig.base.json` — aucun ne contient `alias`, `"paths"` ni le nom du paquet ; (3) l'import dynamique d'un sous-chemin (`@notionlike/document/src/arbre.ts`) rejette. La vérification des types refuse le même sous-chemin (`TS2307`), ce que `pnpm typecheck` tient sans test dédié. Dans le test, le sous-chemin est assemblé à l'exécution et marqué `@vite-ignore` : écrit en clair, il ferait échouer le chargement du fichier de test et le contrat `web-document-par-ses-exports`.
- `test/coutures.test.ts`, AC31 : voir « Levée de D-006 ».
- AC21 : une seule version de `yjs` déclarée et résolue (manifestes par `import.meta.glob`, verrou par `?raw`) ; `creerDocumentEspace().doc instanceof Y.Doc` avec le `Y` d'`apps/web`.

### Bloc 3 — session, navigation, interface, entrée

- Session : quatre phases ; `operations` porte `creerPage`, `renommerPage`, `mettreALaCorbeille` ; récepteur, garde de ses abonnés et `fermer()` selon l'ADR-0007. `deplacerPage` n'entre pas dans `operations` (hors périmètre de F-002) : le type de l'état l'exclut.
- `test/session-fermeture.test.tsx` (essai F, sur prototype) : AC29 — un abonné de la session lève, puis une mise à jour est reçue par `Y.applyUpdate` : rien ne lève, `console.error` (espionnée) reçoit l'exception une fois, la page reçue est affichée, « Nouvelle page » fonctionne encore ; même constat quand le changement vient de la persistance (passage à `coupee`). AC30 — même session rendue et démontée cinq fois sous `StrictMode` : un écouteur `afterTransaction` ; après `fermer()`, zéro ; seconde fermeture sans effet ; après fermeture, une mise à jour reçue ne prévient aucun abonné ; entrée dans `version-non-prise-en-charge` : zéro écouteur.
- Route : `test/route.test.ts`, table d'AC27 par `lireRoute` (les cas de la table du bloc 2, placés après `#/page/`) : chacun rend la forme `page-introuvable`, sans champ qui porte la chaîne ; fragment vide, `#`, `#/`, `#/corbeille` : l'accueil ; `#/page/<uuid>` : la page. `test/navigation.test.tsx` : à l'écran, un fragment de forme refusée affiche « Page introuvable », ne sélectionne rien, laisse la barre latérale utilisable, et la chaîne n'apparaît ni dans le document rendu ni dans `document.title`.
- Pièges connus de la saisie, chacun avec son test (repris) : Entrée valide puis le champ disparaît, la sortie du champ qui s'ensuit ne valide pas une seconde fois ; Échap ferme le champ, la sortie du champ qui s'ensuit ne renomme rien ; un titre refusé laisse le champ ouvert avec le texte saisi.
- Erreur typée : `ErreurDocument` est rattrapée autour de chaque appel d'opération et traduite par `messages.ts` (une phrase par code, sans le code ni l'identifiant) ; toute autre exception n'est pas rattrapée.
- Mise à la corbeille de la page sélectionnée ou d'une de ses ancêtres : `allerA` l'accueil, après le succès de l'opération. Une disparition reçue par une mise à jour ne change pas l'adresse.
- `main.tsx` et `index.html` sont atteints par le test de `coquille.test.tsx` qui pose `<div id="racine">`, importe `src/main.tsx` et constate la coquille.
- `test/coutures.test.ts` : énumération d'AC20 (liste exacte des fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un test) ; seule la session importe `yjs` hors de la persistance ; limite 200 / 201 ; un message par code d'erreur.

### Bloc 4 — bout en bout

Cinq tests Playwright, un contexte de navigateur neuf par test : le scénario d'AC23 ; deux onglets ouverts ensemble au premier lancement (AC4) ; origines des requêtes et actions réseau coupé (AC19) ; console sans double import de Yjs ni erreur (AC21) ; titre validé puis rechargement immédiat (AC2). Essai G : `5 passed` sur le code de l'archive séparé de F-003.

## Attendu chiffré après chaque bloc

`pnpm test` garde `--passWithNoTests` : un projet vide ou non ramassé laisserait les hooks verts. Après chaque bloc, l'orchestrateur lance à la racine :

```bash
pnpm exec vitest list --filesOnly --project web; echo "code=$?"
pnpm exec vitest run; echo "code=$?"
pnpm contrats; echo "code=$?"
git diff --name-status HEAD~1 HEAD
```

Constats de l'essai S2 sur le bloc 0 : `vitest list --filesOnly --project web` n'imprime aucune ligne et finit en `code=0` ; `vitest run --project web` imprime `No test files found, exiting with code 1`. Une erreur ou un rejet non intercepté pendant l'exécution donne `Errors  1 error` et `code=1` même quand tous les tests passent (essais T0 et T1) : c'est le contrôle qui tient « ni erreur non interceptée ni rejet de promesse non géré » (AC16, AC26) pour toute la suite.

| Après le bloc | Lignes de `vitest list --filesOnly --project web` (ordre libre), chacune sous la forme `[web] apps/web/test/<nom>`                                                                                                | `vitest run`, `code=0`, sans ligne `Errors`                                      | `pnpm contrats`                                                        | `git diff --name-status HEAD~1 HEAD`                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0             | aucune                                                                                                                                                                                                            | `Test Files  6 passed (6)`, `Tests  224 passed (224)`                            | `no dependency violations found (25 modules, 43 dependencies cruised)` | cinq `A` sous `apps/web/`, `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml` : huit lignes        |
| 1             | aucune                                                                                                                                                                                                            | `Test Files  7 passed (7)` ; au moins 224 tests plus ceux de `fermeture.test.ts` | aucune violation                                                       | `M packages/document/src/document-espace.ts`, `A packages/document/test/fermeture.test.ts` : deux lignes, rien d'autre |
| 2             | six : `persistance-ouverture.test.ts`, `persistance-echecs.test.ts`, `persistance-validation.test.ts`, `structure.test.ts`, `uuid-canonique.test.ts`, `coutures.test.ts`                                          | `Test Files  13 passed (13)`                                                     | aucune violation                                                       | seulement des `A` sous `apps/web/src/identifiants/`, `apps/web/src/persistance/`, `apps/web/test/`                     |
| 3             | treize : les six précédentes, `coquille.test.tsx`, `coquille-echecs.test.tsx`, `barre-laterale.test.tsx`, `barre-laterale-erreurs.test.tsx`, `navigation.test.tsx`, `route.test.ts`, `session-fermeture.test.tsx` | `Test Files  20 passed (20)`                                                     | aucune violation                                                       | des `A` sous `apps/web/`, des `M` limités à `apps/web/test/` ; aucun fichier de `packages/` ni de la racine            |
| 4             | les treize mêmes                                                                                                                                                                                                  | `Test Files  20 passed (20)`                                                     | aucune violation                                                       | `A apps/web/e2e/aides.ts`, `A apps/web/e2e/arborescence.spec.ts`                                                       |

S'ajoutent, lancées à la main parce qu'aucun hook ne les lance :

- après chaque bloc : `pnpm typecheck; echo "code=$?"` (dette D-007), attendu `code=0` ;
- après le bloc 3 et après le bloc 4 : `pnpm --filter @notionlike/web build; echo "code=$?"`, attendu une ligne `✓ built in` et `code=0` (AC32 ; essai G : `✓ 73 modules transformed`, 319,66 kB) ;
- après le bloc 4 : `pnpm --filter @notionlike/web test:e2e; echo "code=$?"`, attendu `5 passed` et `code=0` (dette D-003) ; `.agents/checks/ac-couverture.sh F-002; echo "code=$?"`, attendu `code=0` : les 32 critères sont cités par un test.

Repère, sans valeur de seuil : le code de l'archive séparé de F-003, avant toute retouche, donne 104 tests dans onze fichiers pour le projet `web` (essai G). Les retouches en ajoutent ; un total inférieur à 104 après le bloc 3 est à expliquer dans le message de fin.

Règle : chaque fichier attendu est listé, le total de fichiers est celui du tableau, aucune ligne `Errors`. Un fichier de test en plus, né d'un découpage, s'ajoute à la liste et au total et est signalé ; il n'en retire aucun. Un fichier attendu absent, un total à zéro, un fichier inattendu dans `git diff --name-status` ou un code non nul : le bloc suivant ne démarre pas. Le nombre de tests par fichier n'est pas fixé ; chaque test cite son critère dans son nom (H9).

## Correspondance critère par critère

| Critère | Bloc    | Tenu par                                                                                                                                                     | Preuve                                                                                                                                                                                                                 |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1     | 3       | session (espace local créé), `Application` en phase `pret` sur un document vide                                                                              | `coquille.test.tsx` : base de l'espace créée, barre latérale sans page, « Nouvelle page », invitation                                                                                                                  |
| AC2     | 2, 3, 4 | `ouvrirEspaceLocal` relit le même identifiant et la même base ; chaque écriture validée                                                                      | `persistance-ouverture.test.ts`, `persistance-validation.test.ts` ; `coquille.test.tsx` (deux sessions successives : mêmes pages, titres, parents, ordre, corbeille absente) ; e2e                                     |
| AC3     | 3       | phase `chargement` tant que la persistance est en `relecture` ; la façade n'existe pas encore                                                                | `coquille.test.tsx` : état de chargement, aucun bouton ; fin sur succès, échec, échéance (`coquille-echecs.test.tsx`)                                                                                                  |
| AC4     | 2, 4    | une transaction pour l'identifiant de l'espace local ; fusion Yjs à la relecture                                                                             | `persistance-ouverture.test.ts` : deux ouvertures lancées ensemble, même identifiant, une page chacune, relues dans les deux ; e2e à deux onglets                                                                      |
| AC5     | 3       | `creerPage("", { parent })` ; parent déplié ; saisie ouverte ; `allerA`                                                                                      | `coquille.test.tsx` (racine), `barre-laterale.test.tsx` (sous-page, dépli, saisie), `navigation.test.tsx` (sélection)                                                                                                  |
| AC6     | 3       | `SaisieTitre` : Entrée et sortie du champ valident, Échap annule                                                                                             | `barre-laterale.test.tsx` ; zone principale et onglet : `navigation.test.tsx`                                                                                                                                          |
| AC7     | 3       | `mettreALaCorbeille` ; la lecture retire la descendance ; retour à l'accueil                                                                                 | `barre-laterale.test.tsx` ; `navigation.test.tsx`                                                                                                                                                                      |
| AC8     | 3       | pages repliées en état d'écran ; bouton absent sans sous-page                                                                                                | `barre-laterale.test.tsx` : l'état encodé du document est identique avant et après repli et dépli                                                                                                                      |
| AC9     | 3       | abonnement de la session à la façade, `useSyncExternalStore`                                                                                                 | `coquille.test.tsx` : `Y.applyUpdate(session.doc, …)` puis nouvelle page affichée                                                                                                                                      |
| AC10    | 3       | commandes natives dans l'ordre de tabulation, noms accessibles français                                                                                      | `barre-laterale.test.tsx` et `navigation.test.tsx` : chaque action par `tab` et `keyboard` seuls, chaque commande retrouvée par rôle et nom                                                                            |
| AC11    | 3       | lien `#/page/<id>`, `aria-current="page"`, titre dans la zone principale                                                                                     | `navigation.test.tsx`, `route.test.ts`                                                                                                                                                                                 |
| AC12    | 3       | route lue au premier rendu et sur `hashchange` ; ancêtres dépliés                                                                                            | `navigation.test.tsx` : ouverture avec fragment, fragment modifié, `history.back()` ; `route.test.ts`                                                                                                                  |
| AC13    | 3       | sélection déduite de la route et de l'arborescence                                                                                                           | `navigation.test.tsx` : identifiant absent, page à la corbeille ; barre latérale encore utilisable                                                                                                                     |
| AC14    | 3       | refus `titre-trop-long` de la façade, champ laissé ouvert                                                                                                    | `barre-laterale-erreurs.test.tsx` : message qui cite 200, texte conservé, titre inchangé ; couture 200 / 201 (`coutures.test.ts`)                                                                                      |
| AC15    | 3       | `ErreurDocument` rattrapée, message par code ; affichage dérivé de la lecture                                                                                | `barre-laterale-erreurs.test.tsx` : page mise à la corbeille par une mise à jour reçue pendant la saisie, puis validation ; `coutures.test.ts`                                                                         |
| AC16    | 2, 3    | parades 1 à 3 d'ADR-0008 ; `enregistre` faux ; avertissement `role="alert"`                                                                                  | `persistance-echecs.test.ts` (sans `indexedDB`, ouverture refusée de deux façons, lecture, écriture, annulation, fermeture anormale) ; `coquille-echecs.test.tsx` ; `vitest run` en `code=1` sur tout rejet            |
| AC17    | 3       | `lire()` sous `try` ; phase `version-non-prise-en-charge` ; persistance et façade fermées                                                                    | `coquille-echecs.test.tsx` : écran bloquant, aucun bouton, état relu de la base identique octet pour octet et aucun enregistrement non vide ajouté (« Points de la spec », 1)                                          |
| AC18    | 0, 3    | enfants texte de JSX, `document.title` ; ESLint interdit le HTML brut                                                                                        | `coquille.test.tsx` (barre latérale), `navigation.test.tsx` (zone principale, onglet) ; `pnpm lint`                                                                                                                    |
| AC19    | 0, 3, 4 | ESLint interdit `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` dans `apps/web/src` ; contrat `web-src-liste-blanche`                    | `pnpm lint`, `pnpm contrats` ; `coquille.test.tsx` (aucune adresse externe dans `index.html` ni dans les styles) ; e2e : origines des requêtes, actions réseau coupé                                                   |
| AC20    | 2, 3    | format V1 de `y-indexeddb`, façade de F-001                                                                                                                  | `persistance-ouverture.test.ts`, `persistance-validation.test.ts` : relecture à l'identique ; `coutures.test.ts` : liste exacte des fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un test |
| AC21    | 2, 3, 4 | une seule version de `yjs` au manifeste et au verrou                                                                                                         | `structure.test.ts` ; `coutures.test.ts` (`session.doc instanceof Y.Doc`) ; e2e : console                                                                                                                              |
| AC22    | 0, 2, 3 | contrats `web-y-indexeddb-confinee`, `web-document-par-ses-exports`, `web-persistance-par-son-interface` ; ESLint (`getMap` et consorts)                     | `pnpm contrats`, `pnpm lint` ; `structure.test.ts` (exports de `persistance/index.ts`) ; `coutures.test.ts`                                                                                                            |
| AC23    | 4       | `playwright.config.ts` lance Vite sur `127.0.0.1:5174`                                                                                                       | `e2e/arborescence.spec.ts`, lancement manuel (D-003)                                                                                                                                                                   |
| AC24    | 2, 3    | échéance de 10 secondes dans le module ; destruction de l'instance de la bibliothèque                                                                        | `persistance-echecs.test.ts`, horloge simulée : `relecture` à 9 999 ms, `coupee` à 10 000 ms, ouverture tardive sans effet ; `coquille-echecs.test.tsx`                                                                |
| AC25    | 0, 2    | `nom-de-base.ts`, seule à assembler un nom ; type `DesignationDocument` ; ESLint interdit `notionlike:` hors du module                                       | `persistance-ouverture.test.ts` : témoin sous A, vide sous B, deux bases, base de A inchangée ; identifiant de page avec `:` refusé sans base ; `pnpm lint`                                                            |
| AC26    | 0, 3    | garde en tête de `demarrerSessionEspace` ; ESLint interdit `Math.random`, `getRandomValues`, et `randomUUID` hors de `espace/`                               | `coquille-echecs.test.tsx` : fonction retirée, écran `role="alert"`, aucune base ; fonction présente et `isSecureContext` absent : premier lancement ; `pnpm lint`                                                     |
| AC27    | 2, 3    | `estUuidCanonique`, seule fonction de forme, longueur d'abord ; `lireRoute` ne décode ni ne garde la chaîne refusée ; contrat `web-navigation-liste-blanche` | `uuid-canonique.test.ts` et `route.test.ts` (table de cas) ; `navigation.test.tsx` (« Page introuvable », rien de la chaîne à l'écran ni dans l'onglet)                                                                |
| AC28    | 2       | `nom-de-base.ts` applique `estUuidCanonique` à chaque identifiant, y compris à celui relu sur l'appareil                                                     | `persistance-ouverture.test.ts` (table des trois identifiants, aucune base énumérée) ; `persistance-echecs.test.ts` (identifiant relu illisible)                                                                       |
| AC29    | 1, 3    | diffusion sous garde et récepteur (ADR-0003 amendé) ; récepteur et garde de la session (ADR-0007)                                                            | `packages/document/test/fermeture.test.ts` ; `session-fermeture.test.tsx` : l'application reçoit l'exception et reste utilisable                                                                                       |
| AC30    | 1, 3    | `DocumentEspace.fermer()` ; `SessionEspace.fermer()`                                                                                                         | `fermeture.test.ts` (50 ouvertures et fermetures, compte d'écouteurs) ; `session-fermeture.test.tsx` (cinq montages sous `StrictMode`, compte d'écouteurs)                                                             |
| AC31    | 1, 2, 3 | exports et signatures de F-001 inchangés ; tests de F-001 non modifiés                                                                                       | `git diff --name-status` du bloc 1 ; `coutures.test.ts` : énumération des appelants du workspace ; `structure.test.ts` (exports vus par le nom du paquet)                                                              |
| AC32    | 0, 2, 3 | aucun alias dans les configurations du bloc 0 ; lien de workspace `@notionlike/document`                                                                     | `structure.test.ts` (exports, configurations sans alias, sous-chemin refusé) ; `pnpm typecheck` ; `pnpm --filter @notionlike/web build`                                                                                |

## Levée de D-006

**Décision.** Amendement F-002 de l'ADR-0003, commité avec ce plan : `fermer()`, récepteur facultatif à la création, repli sur `console.error`. L'ADR-0007 dit ce que la session en fait.

**Test de couture des appelants (AC31)**, dans `apps/web/test/coutures.test.ts`, parce qu'`import.meta.glob` y est typé (`vite/client`) et pas dans `packages/document` (`types` vide). Il lit en `?raw` : `apps/web/src/**`, `apps/web/test/**`, `apps/web/e2e/**`, `packages/*/src/**`, `packages/*/test/**` (essai X : treize fichiers trouvés sur le gabarit). Il retient tout fichier qui contient un appel à `creerDocumentEspace(` ou à `ouvrirDocumentEspace(`, ou un appel à `abonner` d'une façade, hors `document-espace.ts` qui les définit, et compare leur liste, exacte et triée, à une table tenue dans le test :

| Sorte d'appelant                                                                                                     | Ce que la table exige                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| code de production (`apps/web/src/espace/session-espace.ts`, seul à ce jour)                                         | le test qui le couvre (`session-fermeture.test.tsx`) existe ; le fichier passe un récepteur à l'ouverture et appelle `fermer()` de la façade  |
| tests et aides écrits ou retouchés par F-002 (`apps/web/test/**`, `packages/document/test/fermeture.test.ts`)        | le fichier ferme ce qu'il ouvre : par une aide de `aides-*.ts` qui ferme en fin de test, ou par un appel à `fermer()` dans le fichier         |
| tests de F-001 (`abonnement.test.ts`, `aides.ts`, `convergence.test.ts`, `operations.test.ts`, `robustesse.test.ts`) | liste fermée, nommée « façades de test de F-001, non modifiables (AC31) » : le test échoue si un fichier s'y ajoute ou en sort sans y figurer |

Un appelant nouveau, dans n'importe quel paquet, fait échouer le test tant qu'il n'est pas inscrit avec sa sorte. La troisième ligne est une lecture de la spec, à trancher par le dev (« Points de la spec », 7).

**`ARCHITECTURE.md`, phrases à réviser après le bloc 1** (numéros de ligne de la version de HEAD) :

- l. 43 : « Façade `DocumentEspace`, sept membres » devient huit, avec `fermer()` ; les deux fonctions de création reçoivent leur second paramètre ;
- l. 47 et l. 97-98 : `abonner` et l'écouteur — la diffusion est sous garde, l'exception va au récepteur ou à `console.error` ;
- l. 103 : « Un rappel d'abonné qui lève n'est pas rattrapé… » est remplacée par le comportement livré ;
- l. 108 : « La façade ne retire jamais son écouteur… » est remplacée par la fermeture ;
- l. 114 : six fichiers de test deviennent sept ;
- l. 192, menaces : « un rappel d'abonné qui lève pendant `Y.applyUpdate` » sort de la liste des abus sans parade.

**Dette.** D-006 est close par le dev dans `PROJECT_LOG.md` à la livraison (spec, prérequis).

## `ARCHITECTURE.md`, bloc après bloc

Écrit par `agent-architecte-conception` à partir de la version de HEAD, après chaque commit de bloc, sur le code livré seulement.

| Après le bloc | Ce qui entre dans `ARCHITECTURE.md`                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0             | rien sur le code (aucun module) ; la liste des contrats en vigueur passe à quinze                                                                                                                                                                                                    |
| 1             | les six révisions de « Levée de D-006 »                                                                                                                                                                                                                                              |
| 2             | section `apps/web` : modules `identifiants/` et `persistance/`, leurs dépendances, flux d'enregistrement et de relecture ; l. 15 (« Aucun autre paquet ne l'importe… ») : le paquet est importé par son nom ; menaces : identifiant forgé dans un nom de base, espace relu illisible |
| 3             | modules `espace/`, `navigation/`, `interface/`, entrée ; flux d'une mise à jour reçue jusqu'à l'écran ; menaces : fragment d'adresse forgé ou géant, titre piégé, ouverture hors contexte sécurisé, exception d'un abonné                                                            |
| 4             | ce que le bout en bout couvre et ce qu'aucun hook ne lance (D-003)                                                                                                                                                                                                                   |

## Stratégie de test

- Vitest, projet `web`, environnement jsdom. `test/preparation.ts` donne à chaque test un `IDBFactory` neuf de `fake-indexeddb` et remet le fragment à zéro. La configuration restaure les espions et les globales simulées après chaque test (`restoreMocks`, `unstubGlobals`).
- Les tests de composants rendent `<Application session={demarrerSessionEspace()} />` sous `StrictMode` et agissent par `@testing-library/user-event` ; ils retrouvent les éléments par rôle et nom accessible, jamais par classe. Chaque session démarrée est fermée en fin de test par l'aide.
- Horloge simulée : `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })`. Simuler toute l'horloge figerait `fake-indexeddb`, qui s'ordonnance par `setImmediate`.
- Échecs d'IndexedDB : `indexedDB` retiré de `globalThis` ; `indexedDB.open` remplacé par une demande qui échoue, qui lève, ou qui ne répond jamais puis tard ; écriture et lecture en échec par une vraie erreur de contrainte de `fake-indexeddb`.
- Contexte non sécurisé : `vi.stubGlobal("crypto", {})` (essai T2).
- Exception d'un abonné : `vi.spyOn(console, "error")`, rendue muette dans le test.
- Playwright sur Chromium, serveur de développement de Vite lancé par `webServer` sur le port 5174 (5173 reste libre pour `pnpm dev`), `reuseExistingServer: false`.

Reste au bout en bout seulement, donc hors des hooks : AC23 ; le rechargement réel d'AC2 ; deux onglets réels (AC4) ; l'absence de requête vers une autre origine observée à l'exécution et les actions réseau coupé (AC19) ; la console du navigateur (AC21). La construction (AC32) et la vérification des types sont hors des hooks aussi.

## États passagers

| Lecture                       | Ce qui peut arriver                                                           | Réponse                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `indexedDB`                   | absent                                                                        | `coupee` au retour de l'appel ; bibliothèque jamais construite                                                          |
| ouverture d'une base          | refus, exception, aucune réponse, réponse après 10 secondes                   | sonde, échéance ; réponse tardive sans effet                                                                            |
| relecture                     | échec de lecture ; contenu partiel                                            | garde en capture ; la bibliothèque applique tout ce qui est stocké en une transaction, la façade n'est ouverte qu'après |
| identifiant de l'espace local | deux onglets ensemble ; base de l'appareil inutilisable ; valeur illisible    | une transaction ; candidat gardé en mémoire, persistance `coupee`, aucune base d'espace                                 |
| fragment de l'adresse         | vide, de forme inconnue, identifiant qui n'est pas un UUID canonique, géant   | accueil, ou « Page introuvable » sans rien garder de la chaîne                                                          |
| `lire()`                      | version non prise en charge, à l'ouverture ou plus tard                       | `try` dans la session, phase dédiée, persistance et façade fermées                                                      |
| arborescence                  | page absente puis revenue, filles à la racine entre-temps (entrée incomplète) | affichage dérivé au rendu, aucun effet correctif ; l'adresse n'est pas modifiée                                         |
| page sélectionnée             | absente, à la corbeille, jamais existante                                     | « Page introuvable », barre latérale utilisable                                                                         |
| saisie en cours               | page retirée ou mise à la corbeille pendant la saisie                         | l'opération lève, message en français, rien n'est perdu de la lecture                                                   |
| écriture                      | échec, quota, connexion fermée, rechargement immédiat                         | garde `error`, `abort`, `close` ; `coupee`, avertissement ; chaque écriture validée par `commit()`                      |
| abonné                        | lève pendant une diffusion                                                    | les autres sont prévenus ; l'exception va au récepteur, donc à la console d'erreur                                      |
| `crypto.randomUUID`           | absente                                                                       | écran d'explication, rien n'est créé                                                                                    |

## Règles de dépendances

Les sept contrats de HEAD sont conservés tels quels (`pas-de-cycle`, `domaine-pur`, `paquets-sans-apps`, `apps-isolees`, `document-sans-reseau-ni-base`, `document-yjs-seulement`, `document-coeur-pur`). Huit contrats sont ajoutés, tous en liste blanche ou en confinement, ce qui porte la liste à quinze :

| Contrat                             | Règle                                                                                                                                                             | Critère    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `web-y-indexeddb-confinee`          | dans `apps/web` (tests et bout en bout compris), seul `src/persistance/indexeddb.ts` importe `y-indexeddb`                                                        | AC22       |
| `web-document-par-ses-exports`      | `apps/web` (tests compris) n'atteint `packages/document` que par `src/index.ts`, y compris par un sous-chemin du nom du paquet                                    | AC22, AC32 |
| `web-persistance-par-son-interface` | hors du module, seul `src/persistance/index.ts` est importable (tests compris)                                                                                    | AC22       |
| `web-identifiants-pur`              | `src/identifiants/` n'importe que lui-même                                                                                                                        | AC27       |
| `web-persistance-liste-blanche`     | `src/persistance/` n'importe que lui-même, `src/identifiants/`, `yjs` et `y-indexeddb`                                                                            | ADR-0008   |
| `web-espace-liste-blanche`          | `src/espace/` n'importe que lui-même, `persistance/index.ts`, l'entrée de `@notionlike/document` et `yjs`                                                         | ADR-0007   |
| `web-navigation-liste-blanche`      | `src/navigation/` n'importe que lui-même et `src/identifiants/`                                                                                                   | AC27       |
| `web-src-liste-blanche`             | le reste de `src/` (interface, entrée, tout dossier à venir) n'importe que `src/` hors `persistance/`, l'entrée de `@notionlike/document`, `react` et `react-dom` | AC19, AC22 |

Une liste blanche refuse sans énumération tout le reste : autre paquet npm, dépendance de développement, module de Node, import non résolu. Chaque contrat est prouvé par une violation jetable sur le texte du bloc 0 (essai C, 18 cas). Par rapport au plan précédent : `web-identifiants-pur` est nouveau, `web-navigation-pure` devient `web-navigation-liste-blanche`, `web-persistance-liste-blanche` admet `identifiants/`.

Barrières ESLint ajoutées sur `apps/web/src/**` (chacune prouvée par une violation jetable, essai L) :

| Interdit                                                                                | Exception            | Critère        |
| --------------------------------------------------------------------------------------- | -------------------- | -------------- |
| globales `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` ; propriété `sendBeacon` | aucune               | AC19           |
| globale `indexedDB` (y compris `window.indexedDB`, `globalThis.indexedDB`)              | `src/persistance/**` | AC22, ADR-0008 |
| globales `localStorage`, `sessionStorage`                                               | aucune               | ADR-0008       |
| littéral ou gabarit contenant `notionlike:`                                             | `src/persistance/**` | AC25           |
| `Math.random`, `getRandomValues`                                                        | aucune               | AC26           |
| `randomUUID`                                                                            | `src/espace/**`      | AC26           |
| `pushState`, `replaceState`                                                             | aucune               | H4             |
| `innerHTML`, `outerHTML`, `insertAdjacentHTML`, attribut `dangerouslySetInnerHTML`      | aucune               | AC18           |
| `transact`, `getMap`, `getArray`, `getText`, `getXmlFragment`, `getXmlElement`          | aucune               | AC22, ADR-0007 |

Ces règles ne visent que `src/` : les tests écrivent dans un `Y.Doc` (version 2 pour AC17), lisent IndexedDB et `doc._observers` pour constater. `checkGlobalObject` ne voit `window.indexedDB` que si `window` est déclarée comme globale ; le bloc ESLint la déclare, avec `self`. `console.error` reste permis (`no-console` l'admet déjà à HEAD).

## Ce que F-004 remplacera

F-004 (brouillon, `specs/F-004.md`, F-004-AC24 à AC53) vient après F-003. Elle remplace les trois boutons d'une rangée par deux boutons et un menu « ⋯ » dont les entrées gardent les noms « Renommer », « Ajouter une sous-page », « Mettre à la corbeille » et doivent produire l'effet de F-002 « par la même fonction » (F-004-AC25 à AC27) ; elle ajoute des raccourcis, un tiroir sur petit écran, des jetons de style. F-002 ne réalise rien de cela. Elle s'interdit seulement quatre choses qui rendraient ce remplacement coûteux :

1. **Aucune logique d'opération dans un composant de rangée.** `RangeePage` reçoit ses six fonctions d'action en propriété (`ActionsBarre`, déjà ainsi dans l'archive) ; créer, renommer, mettre à la corbeille, gérer le focus et l'adresse restent dans `Application`. Le menu de F-004 appellera les mêmes fonctions.
2. **Une seule aide de test pour atteindre une action de rangée.** Les tests de F-002 ne cherchent pas « Renommer « T » » par rôle à chaque usage : ils passent par une fonction de `test/aides-coquille.tsx`, et de même dans `e2e/`. F-004 changera le chemin dans ces aides. Seul le test d'AC10, qui fixe que chaque commande est native et nommée, cite les rôles : F-004 le réécrira avec son critère.
3. **Aucun test ne lit une classe CSS, un texte visible de bouton ni la structure du DOM** d'une rangée : rôles et noms accessibles seulement. Les textes visibles « Renommer », « Sous-page », « Corbeille » des boutons ne sont fixés par aucun test ; F-004 les retire (F-004-AC25).
4. **Aucune règle de dépendance sur la forme de l'interface.** `interface/` reste un seul dossier sous `web-src-liste-blanche` ; F-004 y range ses composants, ou crée un dossier, sans toucher aux contrats de F-002.

La barre d'outils permanente que F-004 rend flottante appartient à F-003 : F-002 n'en livre aucune.

## Points de la spec à connaître

Aucun critère n'est jugé irréalisable. Neuf points où la lettre de la spec, le code de F-001 ou la bibliothèque obligent à préciser ; les points 7 à 9 demandent une décision du dev.

1. **AC17, « n'écrire aucune mise à jour dans IndexedDB ».** `y-indexeddb` écrit un enregistrement vide (deux octets) à chaque ouverture, avant de relire (essai E10). La lettre du critère n'est pas tenable avec cette bibliothèque. Ce qui est tenu et testé : l'état relu de la base est identique octet pour octet, aucun enregistrement non vide n'est ajouté, et la persistance est fermée dès le refus.
2. **AC16, rejets émis par la bibliothèque.** Tenu pour `indexedDB` absent, pour l'ouverture refusée (sonde) et pour une lecture ou une écriture en échec (garde en capture). Non couvert : une ouverture qui réussit pour la sonde puis échoue pour la bibliothèque dans l'instant qui suit.
3. **AC24, « ne plus rien lire ».** Après l'échéance, une ouverture tardive laisse la bibliothèque finir la lecture qu'elle avait lancée ; rien n'est appliqué au document ni écrit (essai E9).
4. **`creerDocumentEspace` n'est pas appelée par l'application** (ADR-0007). La clause d'AC21 sur le document qu'elle fournit est tenue par un test ; celle qui compte à l'exécution, par `session.doc instanceof Y.Doc`.
5. **La limite de 200 caractères n'est pas exportée par `@notionlike/document`** : `messages.ts` en garde une constante, tenue par un test de couture.
6. **Emplacement de l'identifiant de l'espace local** (H1 ne le dit pas) : la base `notionlike:appareil` (ADR-0008). Elle apparaît dans l'énumération des bases de l'appareil.
7. **AC31, deux exigences qui se heurtent.** Le critère demande que les tests de F-001 restent verts « sans modification » et que le test de couture échoue si un appelant, tests de `packages/*` compris, « ne ferme pas la façade qu'il ouvre ». Cinq fichiers de test de F-001 ouvrent des façades sans les fermer, et ne peuvent le faire qu'en étant modifiés. Ce plan ne tranche pas à la place du dev : il inscrit ces cinq fichiers dans une liste fermée et nommée du test de couture, et applique la règle de fermeture au code de production et à tout test écrit ou retouché par F-002. Leurs façades vivent sur des `Y.Doc` qui meurent avec le test. Si le dev veut la lettre, il faut autoriser la retouche des tests de F-001 (une aide commune qui ferme en fin de test) : c'est une modification de la spec.
8. **AC29, façade créée sans récepteur.** La spec veut l'exception « remise à l'appelant qui a créé la façade » ; un appelant qui n'a donné aucun récepteur ne peut la recevoir que par la pile (interdit par le même critère) ou par un canal commun. Ce plan retient `console.error`, qui n'est pas une globale du navigateur. L'autre lecture possible, écartée : relancer l'exception en fin de diffusion quand il n'y a pas de récepteur, ce qui laisserait `Y.applyUpdate` lever.
9. **AC30, « quand il ferme la session ».** Aucun écran de F-002 ne ferme une session : elle vit autant que l'onglet. `SessionEspace.fermer()` est livrée parce que le critère l'exige ; ses appelants sont les tests, et la façade est fermée en production à l'entrée dans `version-non-prise-en-charge`. Le premier écran à fermer une session sera celui du changement d'espace (F-014).

Sans décision à prendre : le prérequis « ajout d'`apps/*` aux projets du `vitest.config.ts` de la racine » est déjà en place à HEAD ; ce fichier et le `package.json` de la racine ne changent pas. `packages/document/package.json` non plus.

## Bloc 0 (dev)

Huit fichiers, pour F-002 seule : cinq créés, deux fichiers protégés modifiés, le verrou régénéré.

| Fichier                         | Nature           | Contenu                                                                                                             |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`         | nouveau, réservé | scripts `dev`, `build`, `test`, `test:e2e`, `lint`, `format`, `typecheck` ; cinq dépendances, onze de développement |
| `apps/web/vitest.config.ts`     | nouveau, protégé | projet `web`, jsdom, `test/**/*.test.{ts,tsx}`, fichier de préparation                                              |
| `apps/web/tsconfig.json`        | nouveau, partagé | DOM, `react-jsx`, types de `vite/client` ; aucun `paths`                                                            |
| `apps/web/vite.config.ts`       | nouveau, partagé | greffon React, serveur sur `127.0.0.1` seulement ; aucun `alias`                                                    |
| `apps/web/playwright.config.ts` | nouveau, protégé | Chromium, `webServer` sur le port 5174                                                                              |
| `.dependency-cruiser.cjs`       | modifié, protégé | huit contrats ajoutés en fin de liste                                                                               |
| `eslint.config.mjs`             | modifié, protégé | constantes et trois blocs pour `apps/web/src`                                                                       |
| `pnpm-lock.yaml`                | modifié, partagé | par `pnpm install`                                                                                                  |

Où le lancer : à la racine du dépôt principal, sur la branche `F-002`, **après la mise à l'abri**. Le script part des fichiers de HEAD : il refuse d'écrire si l'un des cinq fichiers à créer existe, si `apps/web/src`, `test`, `e2e` ou `index.html` existent, ou si `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml` ou `packages/` portent une modification non commitée. C'est ce qui sépare F-002 de F-003 pour les fichiers protégés : la version F-002 seule n'est pas extraite de l'arbre mêlé, elle est construite sur HEAD, et la part de F-003 reste entière sur la branche d'archive (essai S1 : les fichiers de l'archive sont identiques à ceux de l'arbre, à l'octet près).

```bash
sed -n '/^# F-002 BLOC 0 DEBUT$/,/^# F-002 BLOC 0 FIN$/p' docs/decisions/F-002-conception.md | zsh
```

Le script vérifie tout avant d'écrire : sur `ARRET`, rien n'est écrit ; relancé après un succès, il s'arrête sans rien écrire. Sa dernière ligne, `bloc 0 : code=0`, dit que l'installation et les cinq contrôles ont tous fini en code 0. Le dev commite alors les huit fichiers en un commit `Agent: dev`, `Feature: F-002`. Si un contrôle est rouge pour une raison étrangère au bloc 0, les fichiers sont écrits et l'installation est faite : il reste à relancer les contrôles, pas le script.

Le texte exact de chaque fichier est dans le script : les cinq fichiers créés sont les valeurs du dictionnaire `NOUVEAUX` (seule la version de `yjs` est lue dans `packages/document/package.json`, pour rester à la même version exacte) ; les fragments insérés sont `CONTRATS_AJOUTES`, `ESLINT_CONSTANTES` et `ESLINT_BLOCS`. Les repères d'insertion sont la fin de la liste `forbidden`, le début de l'appel `tseslint.config` et le bloc `**/*.cjs` ; la conception de F-008 a essayé la composition de son bloc 0 avec la version précédente de celui-ci, dans les deux ordres.

```bash
# F-002 BLOC 0 DEBUT
python3 - <<'PY' && pnpm install && pnpm exec prettier --check . && pnpm lint && pnpm typecheck && pnpm contrats && pnpm test; echo "bloc 0 : code=$?"
import json, pathlib, subprocess, sys

CONTRATS = ".dependency-cruiser.cjs"
ESLINT = "eslint.config.mjs"

NOUVEAUX = {
    "apps/web/package.json": '''{
  "name": "@notionlike/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@notionlike/document": "workspace:*",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "y-indexeddb": "9.0.12",
    "yjs": "VERSION_YJS"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.1",
    "vite": "8.3.2",
    "vitest": "^5.0.3"
  }
}
''',
    "apps/web/vitest.config.ts": '''import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/preparation.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
''',
    "apps/web/tsconfig.json": '''{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "jsx": "react-jsx",
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src", "test", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
''',
    "apps/web/vite.config.ts": '''import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const HOTE_LOCAL = "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  server: { host: HOTE_LOCAL, port: 5173, strictPort: true },
  preview: { host: HOTE_LOCAL, port: 4173, strictPort: true },
});
''',
    "apps/web/playwright.config.ts": '''import { defineConfig, devices } from "@playwright/test";

const ADRESSE = "http://127.0.0.1:5174";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: { baseURL: ADRESSE, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite --port 5174",
    url: ADRESSE,
    reuseExistingServer: false,
  },
});
''',
}

CONTRATS_AJOUTES = r'''    {
      name: "web-y-indexeddb-confinee",
      severity: "error",
      comment:
        "F-002-AC22 : dans apps/web (tests compris), seul src/persistance/indexeddb.ts importe y-indexeddb.",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/persistance/indexeddb\\.ts$" },
      to: { path: "(^|/)node_modules/y-indexeddb/" },
    },
    {
      name: "web-document-par-ses-exports",
      severity: "error",
      comment:
        "F-002-AC22 : apps/web (tests compris) n'atteint packages/document que par son point d'entrée.",
      from: { path: "^apps/web/" },
      to: {
        path: "^(packages|@notionlike)/document/",
        pathNot: "^packages/document/src/index\\.ts$",
      },
    },
    {
      name: "web-persistance-par-son-interface",
      severity: "error",
      comment:
        "F-002-AC22 : hors du module de persistance, seul son index.ts est importable (tests compris).",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/persistance/" },
      to: { path: "^apps/web/src/persistance/", pathNot: "^apps/web/src/persistance/index\\.ts$" },
    },
    {
      name: "web-identifiants-pur",
      severity: "error",
      comment:
        "F-002-AC27 : le contrôle de forme des identifiants n'importe que lui-même (ni paquet, ni le reste de l'application).",
      from: { path: "^apps/web/src/identifiants/" },
      to: { pathNot: "^apps/web/src/identifiants/" },
    },
    {
      name: "web-persistance-liste-blanche",
      severity: "error",
      comment:
        "ADR-0008 : le module de persistance n'importe que lui-même, le contrôle de forme des identifiants, yjs et y-indexeddb (ni React, ni façade, ni le reste de l'application).",
      from: { path: "^apps/web/src/persistance/" },
      to: {
        pathNot: [
          "^apps/web/src/persistance/",
          "^apps/web/src/identifiants/",
          "(^|/)node_modules/yjs/",
          "(^|/)node_modules/y-indexeddb/",
        ],
      },
    },
    {
      name: "web-espace-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : la session d'espace n'importe qu'elle-même, l'interface de la persistance, les exports de @notionlike/document et yjs (pas React).",
      from: { path: "^apps/web/src/espace/" },
      to: {
        pathNot: [
          "^apps/web/src/espace/",
          "^apps/web/src/persistance/index\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
        ],
      },
    },
    {
      name: "web-navigation-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : le module de navigation n'importe que lui-même et le contrôle de forme des identifiants.",
      from: { path: "^apps/web/src/navigation/" },
      to: { pathNot: ["^apps/web/src/navigation/", "^apps/web/src/identifiants/"] },
    },
    {
      name: "web-src-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : hors persistance et espace, le code d'apps/web n'importe que src/ (la persistance exceptée), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
      from: { path: "^apps/web/src/", pathNot: "^apps/web/src/(persistance|espace)/" },
      to: {
        pathNot: [
          "^apps/web/src/(?!persistance/)",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/(react|react-dom)/",
        ],
      },
    },
'''
REPERE_CONTRATS = "  ],\n  options: {"

ESLINT_CONSTANTES = r'''const GLOBALES_INTERDITES_WEB = [
  ["fetch", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["XMLHttpRequest", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["WebSocket", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["EventSource", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["localStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
  ["sessionStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
].map(([name, message]) => ({ name, message }));
const GLOBALE_INDEXEDDB = {
  name: "indexedDB",
  message: "F-002-AC22 : seul apps/web/src/persistance appelle IndexedDB.",
};
const PROPRIETES_INTERDITES_WEB = [
  ["random", "Math", "F-002-AC26 : aucun identifiant ni aléa hors de crypto.randomUUID."],
  ["getRandomValues", undefined, "F-002-AC26 : aucun générateur de secours."],
  ["pushState", undefined, "F-002 H4 : le fragment s'écrit par location.hash."],
  ["replaceState", undefined, "F-002 H4 : le fragment s'écrit par location.hash."],
  ["sendBeacon", undefined, "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["innerHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["outerHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["insertAdjacentHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["transact", undefined, "ADR-0007 : pas de transaction englobante, lire() y serait en retard."],
  ["getMap", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getArray", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getText", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getXmlFragment", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getXmlElement", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
].map(([property, object, message]) =>
  object === undefined ? { property, message } : { object, property, message },
);
const PROPRIETE_RANDOMUUID = {
  property: "randomUUID",
  message: "F-002-AC26 : crypto.randomUUID n'est lue que par apps/web/src/espace.",
};
const SYNTAXE_HTML_BRUT = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "F-002-AC18 : un titre s'affiche comme du texte.",
};
const SYNTAXES_NOM_DE_BASE = [
  "Literal[value=/notionlike:/]",
  "TemplateElement[value.raw=/notionlike:/]",
].map((selector) => ({
  selector,
  message: "F-002-AC25 : seul le module de persistance assemble un nom de base.",
}));

'''
REPERE_ESLINT_CONSTANTES = "export default tseslint.config("

ESLINT_BLOCS = r'''  {
    files: ["apps/web/src/**"],
    languageOptions: { globals: { window: "readonly", self: "readonly" } },
    rules: {
      "no-restricted-globals": [
        "error",
        { globals: [...GLOBALES_INTERDITES_WEB, GLOBALE_INDEXEDDB], checkGlobalObject: true },
      ],
      "no-restricted-properties": ["error", ...PROPRIETES_INTERDITES_WEB, PROPRIETE_RANDOMUUID],
      "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT, ...SYNTAXES_NOM_DE_BASE],
    },
  },
  {
    files: ["apps/web/src/persistance/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { globals: GLOBALES_INTERDITES_WEB, checkGlobalObject: true },
      ],
      "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT],
    },
  },
  {
    files: ["apps/web/src/espace/**"],
    rules: {
      "no-restricted-properties": ["error", ...PROPRIETES_INTERDITES_WEB],
    },
  },
'''
REPERE_ESLINT_BLOCS = '  {\n    files: ["**/*.cjs"],'

# (fichier, repere attendu une seule fois, texte insere juste avant lui)
INSERTIONS = (
    (CONTRATS, REPERE_CONTRATS, CONTRATS_AJOUTES),
    (ESLINT, REPERE_ESLINT_CONSTANTES, ESLINT_CONSTANTES),
    (ESLINT, REPERE_ESLINT_BLOCS, ESLINT_BLOCS),
)
DEJA_APPLIQUE = ((CONTRATS, '"web-'), (ESLINT, "GLOBALES_INTERDITES_WEB"))
RESTES_DE_L_ARBRE = ("apps/web/src", "apps/web/test", "apps/web/e2e", "apps/web/index.html")

# Tout est verifie avant la premiere ecriture : le script n'ecrit rien s'il doit s'arreter.
for chemin in ("apps/.gitkeep", "packages/document/package.json", "pnpm-workspace.yaml", CONTRATS, ESLINT):
    if not pathlib.Path(chemin).is_file():
        sys.exit(f"ARRET : {chemin} absent ; le script se lance a la racine du depot")
for chemin in (*NOUVEAUX, *RESTES_DE_L_ARBRE):
    if pathlib.Path(chemin).exists():
        sys.exit(f"ARRET : {chemin} existe deja, rien n'est ecrit ; l'arbre doit etre celui de HEAD (mise a l'abri faite)")
sales = subprocess.run(["git", "status", "--porcelain", "--", CONTRATS, ESLINT, "pnpm-lock.yaml", "packages"],
                       capture_output=True, text=True)
if sales.returncode != 0 or sales.stdout.strip():
    sys.exit("ARRET : fichier modifie ou non suivi, rien n'est ecrit ; l'arbre doit etre celui de HEAD (mise a l'abri faite) :\n"
             + sales.stdout + sales.stderr)
textes = {c: pathlib.Path(c).read_text(encoding="utf-8") for c in (CONTRATS, ESLINT)}
for chemin, marque in DEJA_APPLIQUE:
    if marque in textes[chemin]:
        sys.exit(f"ARRET : {chemin} porte deja les ajouts de F-002, rien n'est ecrit")
for chemin, repere, _ in INSERTIONS:
    if textes[chemin].count(repere) != 1:
        sys.exit(f"ARRET : repere trouve {textes[chemin].count(repere)} fois dans {chemin} (attendu : 1), rien n'est ecrit : {repere!r}")
version_yjs = json.loads(pathlib.Path("packages/document/package.json").read_text(encoding="utf-8"))["dependencies"]["yjs"]

for chemin, repere, ajout in INSERTIONS:
    textes[chemin] = textes[chemin].replace(repere, ajout + repere)
for chemin, texte in NOUVEAUX.items():
    pathlib.Path(chemin).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(chemin).write_text(texte.replace("VERSION_YJS", version_yjs), encoding="utf-8")
    print("cree    ", chemin)
for chemin, texte in textes.items():
    pathlib.Path(chemin).write_text(texte, encoding="utf-8")
    print("modifie ", chemin)
PY
# F-002 BLOC 0 FIN
```

- `apps/web/index.html` n'est ni protégé ni partagé : il est repris par le producteur au bloc 3. `apps/web/vitest.config.ts` nomme `test/preparation.ts`, repris au bloc 2 : tant qu'aucun test n'existe, le fichier manquant ne gêne pas (essais S2 et D : `pnpm test` vert après le bloc 0, et avec le prototype du bloc 1).
- Versions : celles de la spec (veille du 2026-10-08), toutes publiées depuis au moins 7 jours ; pnpm les a toutes acceptées à l'essai, `vite@8.3.2` comprise.
- Attendu : sept lignes `cree` ou `modifie`, puis `All matched files use Prettier code style!`, `no dependency violations found (25 modules, 43 dependencies cruised)`, `Test Files  6 passed (6)`, `Tests  224 passed (224)`, et enfin `bloc 0 : code=0`.

Commandes à part, hors du script :

```bash
# navigateur de Playwright (téléchargement hors du contrôle d'âge des paquets ; révision 1243 pour @playwright/test 1.63.0)
pnpm --filter @notionlike/web exec playwright install chromium
# après le bloc 3 : lancer l'application
pnpm --filter @notionlike/web dev        # http://127.0.0.1:5173
# après le bloc 4 : bout en bout (aucun hook ne le lance : D-003)
pnpm --filter @notionlike/web test:e2e
```

À décider par le dev, hors agent : ouvrir la dette D-003 ; brancher ou non `test:e2e` dans `.agents/outils.env` ; garder ou supprimer la branche d'archive une fois F-003 livrée.

Preuve des barrières, à rejouer si le dev le souhaite après le bloc 0 (chaque fichier jetable est supprimé après sa commande). `depcruise` sort avec le nombre d'erreurs pour code. Ces commandes ont été rejouées telles quelles dans le clone de l'essai S3, après le bloc 0 : codes 2, 1, 1, et l'arbre du bloc 0 retrouvé à la fin.

```bash
mkdir -p apps/web/src/interface apps/web/test
# 1. y-indexeddb hors de son fichier : attendu « error web-y-indexeddb-confinee » et « error web-src-liste-blanche », code=2
printf '%s\n' 'import { IndexeddbPersistence } from "y-indexeddb"; export const x = IndexeddbPersistence;' > apps/web/src/interface/jetable.ts
pnpm contrats; echo "code=$?"; rm apps/web/src/interface/jetable.ts
# 2. fichier interne de packages/document depuis un test : attendu « error web-document-par-ses-exports », code=1
printf '%s\n' 'import { lireArbre } from "../../../packages/document/src/arbre.ts"; export const x = lireArbre;' > apps/web/test/jetable.test.ts
pnpm contrats; echo "code=$?"; rm apps/web/test/jetable.test.ts
# 3. nom de base et réseau hors du module de persistance : attendu deux erreurs (no-restricted-syntax, no-restricted-globals), code=1
printf '%s\n' 'export const x = ["notionlike:page:x", typeof fetch];' > apps/web/src/interface/jetable.ts
pnpm lint; echo "code=$?"; rm apps/web/src/interface/jetable.ts
rmdir apps/web/src/interface apps/web/src apps/web/test
```

## Essais

Faits le 2026-10-08 dans le dossier temporaire de la session, hors du dépôt, Node 26.11.0, pnpm 12.10.1. Rien n'a été installé ni écrit dans le dépôt hors des quatre documents de cette conception. Deux lieux :

- **le clone** : `git clone` du dépôt principal, branche `F-002`, dans lequel les chemins modifiés ou non suivis de l'arbre ont été recopiés, `core.hooksPath` réglé sur `.githooks`, puis `pnpm install --frozen-lockfile --offline` ;
- **le gabarit** : `git archive HEAD` déplié dans un dossier vide (tous les fichiers suivis, `apps/.gitkeep`, `packages/.gitkeep`, `.agents/`, `.githooks/` compris), `git init`, un commit, `pnpm install --frozen-lockfile --offline`.

Les essais D, F, X et G portent sur des prototypes ou sur le code de l'archive recopié dans le gabarit. Ils ne sont pas le code de la feature : le producteur écrit ou reprend le sien.

### S1 — mise à l'abri, dans le clone, hooks actifs (première forme du script)

Clone portant les 73 chemins de l'arbre, les trois documents de cette conception compris, à l'état non suivi. Les hooks `pre-commit` (formatage, lint, secrets sur le contenu indexé) et `commit-msg` (trailers, périmètre) ont tourné sur le commit d'archive :

```text
Checking formatting...
All matched files use Prettier code style!
abri : 73 chemins dans archive-arbre-2026-10-08 (c82bcc9) ; chemins encore modifies ou non suivis dans l'arbre : 0
```

- branche courante après le script : `F-002` ; `git status --porcelain` vide ; `apps/web/` ne contient que `node_modules` ;
- `git diff --stat F-002 archive-arbre-2026-10-08` : `73 files changed, 10322 insertions(+), 15 deletions(-)` ;
- chacun des 73 fichiers, lu par `git show archive-arbre-2026-10-08:<chemin>`, comparé par `cmp` au fichier de l'arbre du dépôt principal : 73 comparés, 0 différent ;
- reprise d'un fichier : `git show archive-arbre-2026-10-08:apps/web/src/persistance/indexeddb.ts > apps/web/src/persistance/indexeddb.ts`, identique à l'original par `cmp`.

La garde sur les fichiers de traçabilité et sur ce plan a été ajoutée au script après ce passage ; la forme finale est rejouée en S3.

### S2 — script du bloc 0

Lancé deux fois : dans le clone, à la suite de S1 ; dans le gabarit. Sortie dans le gabarit (lignes vides, barre de progression, lignes de durée et avertissements `ExperimentalWarning: localStorage is not available` de Node 26 retirés ; ces avertissements existent à HEAD sans F-002) :

```text
cree     apps/web/package.json
cree     apps/web/vitest.config.ts
cree     apps/web/tsconfig.json
cree     apps/web/vite.config.ts
cree     apps/web/playwright.config.ts
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
Scope: all 3 workspace projects
✓ Lockfile passes supply-chain policies (verified 5h ago)
Packages: +66 -3
Progress: resolved 66, reused 195, downloaded 0, added 66, done
Done in 275ms using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
Scope: 2 of 3 workspace projects
$ tsc --noEmit -p tsconfig.json
$ tsc --noEmit -p tsconfig.json
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (25 modules, 43 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  6 passed (6)
      Tests  224 passed (224)
bloc 0 : code=0
```

- avant le script, sur le gabarit : `Test Files  6 passed (6)`, `Tests  224 passed (224)`, `no dependency violations found (19 modules, 39 dependencies cruised)` ;
- dans le clone : mêmes sept lignes, `Packages: -35` (les paquets d'édition de l'arbre mêlé sortent de `node_modules`), mêmes totaux, `bloc 0 : code=0` ; `git status --porcelain` : `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml`, `?? apps/web/` ;
- les huit fichiers du clone et du gabarit sont identiques, à l'octet près (`cmp`), verrou compris ;
- relance du script : `ARRET : apps/web/package.json existe deja, rien n'est ecrit ; l'arbre doit etre celui de HEAD (mise a l'abri faite)`, puis `bloc 0 : code=1` ;
- `.dependency-cruiser.cjs` : quinze règles ; `pnpm why yjs -r` : `Found 1 version of yjs` (13.6.33) ; le verrou résout `lib0@0.2.119`, `react@19.3.0`, `react-dom@19.3.0`, `y-indexeddb@9.0.12`, `vite@8.3.2`, `jsdom@30.1.1`, `fake-indexeddb@6.2.5`, `@playwright/test@1.63.0`, chacun en une version ;
- projet `web` sans test : `vitest list --filesOnly --project web` n'imprime rien, `code=0` ; `vitest run --project web` : `No test files found, exiting with code 1`.

### S3 — les deux scripts, dans leur forme finale, à la suite

Second clone, fait après l'écriture de ce document : les 74 chemins modifiés ou non suivis de l'arbre y sont recopiés (les 73 du relevé et l'ADR-0003 amendé), puis les quatre documents de cette conception y sont commités avec les trailers de l'agent, hooks actifs (`All matched files use Prettier code style!`, périmètre accepté). Restent 70 chemins. Les deux scripts sont alors extraits du document commité par les deux commandes `sed … | zsh` de ce plan, l'un après l'autre :

```text
Checking formatting...
All matched files use Prettier code style!
abri : 70 chemins dans archive-arbre-2026-10-08 (76482be) ; chemins encore modifies ou non suivis dans l'arbre : 0
```

```text
cree     apps/web/package.json
cree     apps/web/vitest.config.ts
cree     apps/web/tsconfig.json
cree     apps/web/vite.config.ts
cree     apps/web/playwright.config.ts
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
Packages: -35
All matched files use Prettier code style!
✔ no dependency violations found (25 modules, 43 dependencies cruised)
 Test Files  6 passed (6)
      Tests  224 passed (224)
bloc 0 : code=0
```

- entre les deux scripts : branche `F-002`, `git status --porcelain` vide, `apps/web/` réduit à `node_modules` ;
- après le second : `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml`, `?? apps/web/` ; les huit fichiers sont identiques, à l'octet près, à ceux de l'essai S2 ;
- gardes de la mise à l'abri, rejouées dans ce clone : relancée, `ARRET : la branche archive-arbre-2026-10-08 existe deja, rien n'est fait`, `code=1` ; branche d'archive supprimée et une ligne ajoutée à `MEMORY/gates.log`, `ARRET : a commiter sur F-002 avant la mise a l'abri, rien n'est fait :` suivi de ` M MEMORY/gates.log`, `code=1`, branche courante inchangée, aucune branche d'archive créée ;
- les textes des deux scripts extraits du document final sont identiques, par `cmp`, à ceux qui ont tourné.

### C — contrats, par violations jetables (gabarit, texte du bloc 0)

Un fichier jetable par cas, `depcruise` lancé, lignes `error <règle>` et code de sortie relevés, fichier supprimé ; à la fin, `no dependency violations found`. Les cas 17 et 18 demandent que `src/identifiants/uuid-canonique.ts` existe : ils ont été joués avec le prototype de l'essai G.

| Cas | Import jetable                                                      | Règle déclenchée                                    | Code |
| --- | ------------------------------------------------------------------- | --------------------------------------------------- | ---- |
| 1   | `react` depuis `src/identifiants/`                                  | `web-identifiants-pur`                              | 1    |
| 2   | `navigation/route.ts` depuis `src/identifiants/`                    | `web-identifiants-pur`                              | 1    |
| 3   | `espace/session-espace.ts` depuis `src/navigation/`                 | `web-navigation-liste-blanche`                      | 1    |
| 4   | `react` depuis `src/navigation/`                                    | `web-navigation-liste-blanche`                      | 1    |
| 5   | `navigation/route.ts` depuis `src/persistance/`                     | `web-persistance-liste-blanche`                     | 1    |
| 6   | `@notionlike/document` depuis `src/persistance/`                    | `web-persistance-liste-blanche`                     | 1    |
| 7   | `y-indexeddb` depuis `src/interface/`                               | `web-src-liste-blanche`, `web-y-indexeddb-confinee` | 2    |
| 8   | `packages/document/src/arbre.ts` par chemin relatif, depuis `test/` | `web-document-par-ses-exports`                      | 1    |
| 9   | `@notionlike/document/src/arbre.ts` depuis `test/`                  | `web-document-par-ses-exports`                      | 1    |
| 10  | `persistance/nom-de-base.ts` depuis `test/`                         | `web-persistance-par-son-interface`                 | 1    |
| 11  | `react` depuis `src/espace/`                                        | `web-espace-liste-blanche`                          | 1    |
| 12  | `yjs` depuis `src/interface/`                                       | `web-src-liste-blanche`                             | 1    |
| 13  | `persistance/index.ts` depuis `src/interface/`                      | `web-src-liste-blanche`                             | 1    |
| 14  | `node:fs` depuis `src/interface/`                                   | `web-src-liste-blanche`                             | 1    |
| 15  | `@testing-library/react` depuis un dossier neuf `src/nouveau/`      | `web-src-liste-blanche`                             | 1    |
| 16  | `y-indexeddb` depuis `test/`                                        | `web-y-indexeddb-confinee`                          | 1    |
| 17  | `identifiants/uuid-canonique.ts` depuis `src/espace/`               | `web-espace-liste-blanche`                          | 1    |
| 18  | `identifiants/uuid-canonique.ts` depuis `src/interface/`            | aucune : import permis                              | 0    |

Non rejoué ici : `apps-isolees` entre `apps/web` et un `apps/server` (contrat de HEAD, joué par le plan précédent).

### L — ESLint, par violations jetables (gabarit, texte du bloc 0)

Trois fichiers jetables, un par dossier, lancés un par un :

- `src/interface/jetable.tsx` : `27 problems (27 errors, 0 warnings)`, `code=1` — 9 `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `window.indexedDB`, `globalThis.fetch`), 15 `no-restricted-properties` (`Math.random`, `getRandomValues`, `randomUUID`, `pushState`, `replaceState`, `sendBeacon`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `transact`, `getMap`, `getArray`, `getText`, `getXmlFragment`, `getXmlElement`), 3 `no-restricted-syntax` (littéral et gabarit `notionlike:`, `dangerouslySetInnerHTML`) ;
- `src/persistance/jetable.ts` : `2 problems`, `code=1` — `randomUUID` et `fetch` refusés ; `indexedDB` et `notionlike:` admis ;
- `src/espace/jetable.ts` : `3 problems`, `code=1` — `indexedDB`, `notionlike:` et `Math.random` refusés ; `randomUUID` admis.

### G — le code de l'archive, séparé de F-003, sur le gabarit

Après le bloc 0 : les 33 fichiers de code et de test de F-002 recopiés de l'arbre (les cinq configurations viennent du bloc 0), les neuf fichiers mêlés parmi eux séparés comme le tableau de « Séparation » le dit, par suppressions et remplacements de lignes, sans code nouveau et sans aucune des retouches que la spec validée demande.

- `pnpm exec prettier --check .` : `All matched files use Prettier code style!` ; `pnpm lint` : aucune erreur ; `pnpm typecheck` : `code=0` ; `pnpm contrats` : `no dependency violations found (68 modules, 156 dependencies cruised)` ;
- `vitest list --filesOnly --project web` : onze fichiers ; projet `web` : 104 tests ; avec le prototype de l'essai D pour `packages/document` : `Test Files  18 passed (18)`, `Tests  330 passed (330)`, aucune ligne `Errors` ;
- `pnpm --filter @notionlike/web build` : `✓ 73 modules transformed`, `dist/assets/index-*.js 319.66 kB`, `✓ built`, `code=0` ; la chaîne « Yjs was already imported » figure une fois dans le paquet produit ;
- `pnpm --filter @notionlike/web test:e2e` : `5 passed (4.1s)`, `code=0` (Chromium de Playwright déjà en cache sur le poste, rien n'a été téléchargé).

Puis les retouches d'AC25, AC27 et AC28 en prototype (`uuid-canonique.ts`, `nom-de-base.ts`, `route.ts`) : `pnpm contrats` sans violation (69 modules, 158 dépendances), `pnpm typecheck` en `code=1` et 25 tests en échec dans `persistance-ouverture.test.ts`, `persistance-validation.test.ts` et `route.test.ts`. C'est la mesure des fichiers « retouchés » des blocs 2 et 3 : ces tests fixaient l'ancienne spec. Ce prototype a été défait avant les essais D, F et X.

### D — fermeture et rappel qui lève, dans `packages/document` (prototype sur le gabarit)

`document-espace.ts` modifié selon l'amendement de l'ADR-0003, un fichier de test de deux tests ajouté, aucun fichier de F-001 touché.

- `pnpm --filter @notionlike/document typecheck` : `code=0`, y compris la lecture de `doc._observers.get("afterTransaction")?.size` dans le test et `console` déclarée localement dans la source ; sans cette déclaration, `console.error` ne compile pas dans le paquet (essayé) ;
- `pnpm lint`, `pnpm exec prettier --check packages` : sans erreur ;
- `vitest run --project document` : `Test Files  7 passed (7)`, `Tests  226 passed (226)` : les 224 tests de F-001, inchangés, et les deux du prototype ;
- constaté par ces deux tests : trois abonnés dont le deuxième lève, appels `a` puis `c`, l'opération ne lève pas, le récepteur reçoit l'exception ; même chose par `Y.applyUpdate` ; 50 ouvertures et fermetures (chacune fermée deux fois) sur un même `Y.Doc` : écouteurs revenus au compte de départ.

Non essayé dans ce prototype : façade sans récepteur, récepteur qui lève, `abonner` après fermeture, deux façades dont une fermée.

### F — session : exception d'un abonné, fermeture (prototype sur le gabarit)

`session-espace.ts` modifié selon l'ADR-0007 (récepteur, garde des abonnés, `fermer()`), un fichier de deux tests.

- un abonné de la session lève, puis une mise à jour est reçue par `Y.applyUpdate` sous `StrictMode` : rien ne lève, `console.error` appelée une fois avec l'exception, la page reçue est affichée, « Nouvelle page » en crée une seconde ;
- même session rendue et démontée cinq fois sous `StrictMode`, puis fermée deux fois : écouteurs `afterTransaction` du document `[0, 1, 0]` (au démarrage, après les montages, après la fermeture) ;
- suite entière avec ces prototypes : `Test Files  19 passed (19)`, `Tests  332 passed (332)`, `pnpm typecheck` en `code=0`, `pnpm lint` sans erreur.

Non essayé : le chemin de la persistance (passage à `coupee` avec un abonné qui lève), plusieurs abonnés fautifs (`AggregateError`), la façade fermée à l'entrée dans `version-non-prise-en-charge`.

### X — exports, alias, sous-chemin, énumération des appelants (gabarit)

Un fichier de test jetable dans `apps/web/test/`, sur le code de l'essai G et le prototype de l'essai D :

- `import * as paquet from "@notionlike/document"`, clés triées : `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace` ;
- `import.meta.glob` en `?raw` sur les configurations : six fichiers (`../../../tsconfig.base.json`, `../../../vitest.config.ts`, `../playwright.config.ts`, `../tsconfig.json`, `../vite.config.ts`, `../vitest.config.ts`), aucun ne contient `alias`, `"paths"` ni `@notionlike/document` ;
- import dynamique de `@notionlike/document/src/arbre.ts`, chemin assemblé à l'exécution : rejet, `Error: "./src/arbre.ts" is not exported under the conditions ["node", "development", "import"] from package …/apps/web/node_modules/@notionlike/document` ;
- le même sous-chemin écrit dans un fichier de `test/` : `pnpm --filter @notionlike/web typecheck` rend `error TS2307: Cannot find module '@notionlike/document/src/arbre.ts' or its corresponding type declarations.` ;
- énumération des appelants par `import.meta.glob` en `?raw` sur `apps/web` et `packages/*` : treize fichiers contiennent `creerDocumentEspace(` ou `ouvrirDocumentEspace(` — `packages/document/src/document-espace.ts` (les définitions), `packages/document/test/abonnement.test.ts`, `aides.ts`, `convergence.test.ts`, `operations.test.ts`, `robustesse.test.ts`, le test du prototype D, `apps/web/src/espace/session-espace.ts`, `apps/web/test/aides-coquille.tsx`, `coutures.test.ts`, `persistance-echecs.test.ts`, `persistance-ouverture.test.ts`, `structure.test.ts`.

### Essais du plan précédent (E, R, T, B)

Les essais E, R, T et B qui suivent datent de la première écriture de ce plan, le même jour, sur des prototypes écrits contre la version antérieure de la spec, dans un gabarit copié du dépôt. Ils sont repris sans retouche parce que les ADR 0007 et 0008 les citent. Trois réserves : E2 et E3 décrivent le nommage d'alors (identifiant de page libre, contrôle du seul identifiant d'espace), que la spec validée refuse ; les totaux donnés à la fin de « R et T » et les quatre scénarios de « B » sont ceux des prototypes d'alors ; l'essai G ci-dessus les remplace pour le code de l'archive.

### E — module de persistance (Vitest, jsdom, `fake-indexeddb`)

`pnpm exec vitest run --project web` : `Tests  12 passed (12)`, aucune ligne `Errors`.

| Essai | Constat                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1    | document rempli par la façade (imbrication, renommage, déplacement, corbeille), fermé, relu dans un `Y.Doc` vierge : même `lire()`, même `encodeStateAsUpdate` octet pour octet ; une seule base, `notionlike:espace:<A>`                                         |
| E2    | témoin sous `{ page, A, "page:avec:deux-points" }`, même page pour B : document vide, bases `notionlike:page:<A>:page:avec:deux-points` et `notionlike:page:<B>:page:avec:deux-points`, enregistrements de A inchangés ; `notionlike:table:<A>:t` pour une table  |
| E3    | identifiant d'espace vide, court, en majuscules, suivi de `:page`, précédé d'une espace, suivi d'un saut de ligne, sans tirets, entre accolades : `ErreurPersistance` à chaque fois, aucune base                                                                  |
| E4    | sonde sur une base absente : la demande finit en `AbortError`, `indexedDB.databases()` reste vide                                                                                                                                                                 |
| E5    | `indexedDB` retiré : état `coupee` au retour de l'appel, pour `ouvrirPersistance` et `ouvrirEspaceLocal` ; création d'une page en mémoire ; aucun rejet                                                                                                           |
| E6    | `indexedDB.open` qui rend une demande en erreur, puis qui lève : `coupee`, aucune base, aucun rejet                                                                                                                                                               |
| E7    | écriture en échec (erreur de contrainte réelle) : `active` puis `coupee`, aucun rejet, plus aucun appel d'écriture ensuite, les trois pages lisibles en mémoire                                                                                                   |
| E8    | lecture en échec pendant la relecture : `coupee`, document vide, aucun rejet                                                                                                                                                                                      |
| E9    | horloge simulée, ouverture qui ne répond pas (celle de la sonde, puis celle de la bibliothèque) : `relecture` à 9 999 ms, `coupee` à 10 000 ms ; réponse tardive délivrée : la page créée en mémoire est seule lue, les enregistrements de la base sont inchangés |
| E10   | base d'un document en version 2 : tailles des enregistrements avant `[2, 26]`, après une ouverture trois enregistrements, le troisième étant `0,0` ; état relu identique octet pour octet                                                                         |
| E11   | deux `ouvrirEspaceLocal` lancés ensemble avec deux candidats : même `idEspace()`, une page chacun, relues toutes deux par deux ouvertures suivantes ; bases `notionlike:appareil` et `notionlike:espace:<id>`                                                     |
| E12   | `creerDocumentEspace().doc instanceof Y.Doc` avec le `Y` importé par le test d'`apps/web` ; aucun message « already imported »                                                                                                                                    |

Témoins, pour s'assurer que ces essais peuvent échouer :

- T0 : la bibliothèque seule, `indexedDB.open` qui lève : `Unhandled Rejection`, `SecurityError: refus`, `Tests  1 passed`, `Errors  1 error`, `code=1` ;
- garde retirée (sans `stopPropagation`) : E7 et E8 donnent deux `Unhandled Rejection … ConstraintError`, `code=1`.

### R et T — session et React (Vitest, jsdom, Testing Library)

`Tests  5 passed`, aucune ligne `Errors`. Le prototype de session exposait la façade entière dans l'état ; la forme retenue (`operations`, `doc`) est plus étroite et n'a pas été essayée telle quelle.

| Essai | Constat                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1    | sous `StrictMode` : « Chargement… » (`role="status"`), puis « Nouvelle page » ; clic : un lien « Sans titre » ; `Y.applyUpdate` d'une page `<b>venue d'ailleurs</b>` : affichée comme texte, aucun élément `b` ; clic sur le lien : fragment `#/page/<uuid>`, `aria-current="page"` ; `history.back()` : retour ; 8 rendus pour 4 changements, pas de boucle |
| R2    | `crypto.randomUUID` retirée, `isSecureContext` absent de `window` : écran `role="alert"`, aucune base ; la fonction est rendue ensuite                                                                                                                                                                                                                       |
| R3    | horloge simulée, ouverture sans réponse : « Chargement… » à 9 999 ms ; à 10 000 ms, avertissement `role="alert"` et bouton « Nouvelle page »                                                                                                                                                                                                                 |
| R4    | manifestes lus par `import.meta.glob` et verrou par `?raw` : `{"../package.json":"13.6.33","../../../packages/document/package.json":"13.6.33"}`, versions résolues `["13.6.33"]`                                                                                                                                                                            |
| R5    | clavier seul : `Tab` atteint « Nouvelle page », `Entrée` crée ; `Tab` atteint le lien, `Entrée` écrit le fragment                                                                                                                                                                                                                                            |
| T1    | gestionnaire de clic qui lève : `Errors  1 error`, `code=1`, bien que le test passe                                                                                                                                                                                                                                                                          |
| T2    | `vi.stubGlobal("crypto", {})` : phase `contexte-non-securise`, aucune base ; `crypto` est rendu au test suivant par `unstubGlobals`                                                                                                                                                                                                                          |

Avec ces prototypes : `pnpm typecheck` `code=0`, `pnpm contrats` `no dependency violations found (46 modules, 83 dependencies cruised)`, `pnpm test` `Test Files  9 passed (9)`, `Tests  239 passed (239)`, `vitest list --filesOnly --project web` : `[web] apps/web/test/clavier.test.tsx`, `[web] apps/web/test/coquille.test.tsx`, `[web] apps/web/test/persistance.test.ts`. `pnpm lint` ne signalait que les `console.log` du fichier d'essai de bout en bout.

### B — Vite et Chromium

Le poste a déjà Chromium de Playwright en cache (révision 1243, celle de `@playwright/test@1.63.0`) : rien n'a été téléchargé.

- `pnpm build` dans `apps/web` : `✓ 64 modules transformed`, `dist/assets/index-*.js 310.53 kB`. `@notionlike/document` est donc chargé par son nom depuis `apps/web`, en TypeScript source, par le serveur de développement (essais B), par l'empaqueteur et par Vitest. La chaîne « Yjs was already imported » n'apparaît qu'une fois dans le paquet produit : une seule copie de `yjs`.
- `pnpm test:e2e` sur les prototypes : `3 passed` (B1 à B3), `code=0` ; B4, lancé à part : `1 passed`.

| Essai | Constat                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1    | créer une page, recharger : la page est là, aucun avertissement ; bases `notionlike:appareil@1` et `notionlike:espace:<uuid>@1` ; réseau coupé : création, sélection (`#/page/<uuid>`), retour arrière ; second onglet : les deux pages ; console : messages de Vite et de React seulement ; origines des requêtes : `["http://127.0.0.1:5174"]` ; aucune erreur de page |
| B2    | deux onglets ouverts ensemble au premier lancement, une page chacun, rechargés : deux pages dans les deux, deux bases en tout (une seule base d'espace)                                                                                                                                                                                                                  |
| B3    | sonde dans Chromium sur une base absente : `AbortError`, base absente de `indexedDB.databases()`                                                                                                                                                                                                                                                                         |
| B4    | garde en capture dans Chromium, erreur de contrainte réelle : sans garde, `demande.onerror ConstraintError` ; avec garde sur la base, la demande ne reçoit rien (`capture sur la base`), la transaction se termine                                                                                                                                                       |

### Non essayé

- Le comportement d'un navigateur hors contexte sécurisé (absence réelle de `crypto.randomUUID` à une adresse `http` de réseau local) : sources documentaires de la veille seulement.
- Les retouches des blocs 2 et 3 dans leur forme finale : seuls les mécanismes l'ont été (essais D, F, X, et les trois fichiers du prototype de l'essai G) ; les tests retouchés ne sont pas écrits.
- L'aide de test unique pour les actions de rangée, et tout ce qui touche F-004.
- Un dépassement de quota réel : les écouteurs `abort` et `close` ont leurs tests dans l'archive, sur une simulation.
- Les deux scripts dans le dépôt principal lui-même (rien n'y est lancé ni installé) : le clone en reproduit l'arbre et les hooks.
- Le bloc 0 sur un arbre où le bloc 0 de F-008 serait déjà fusionné : essayé par la conception de F-008 sur la version précédente de ce bloc (sept contrats), pas sur celle-ci (huit).
- `vite preview` et le paquet produit servi : seul `vite build` l'a été.
- Une archive `tar` à la place de la branche d'archive.
