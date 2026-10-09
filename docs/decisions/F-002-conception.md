# F-002 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-002.md`, 32 critères (F-002-AC1 à AC32), H1 à H15. Validée par le dev au commit `3107639`, puis amendée par `agent-planif` au commit `3a1253a` (six critères réécrits, H15), et revalidée par le dev au commit `86542e8`, qui n'en change que le statut : elle est validée. Ce plan est écrit contre ce texte.
ADR : ADR-0007 (structure d'`apps/web`, session, routes), ADR-0008 (persistance locale), ADR-0003 amendé (fermeture de la façade, rappel d'abonné qui lève : levée de la dette D-006).

Ce document est un plan. Il ne décrit pas le code livré : `ARCHITECTURE.md` le fera, bloc après bloc. Rien de ce plan n'est commité à part lui-même et les trois ADR.

Révision 3 du 2026-10-09, après le bloc 2 (commit `7a51272`, `agent-frontend`). Constaté sur ce commit : `Test Files  13 passed (13)`, `Tests  536 passed (536)` (256 pour `document`, 280 pour `web`), les six fichiers attendus du projet `web`, `pnpm contrats` sans violation (47 modules, 100 dépendances), `pnpm typecheck` en code 0, seize `A` sous les trois dossiers attendus. Le découpage ne change pas. Écarts du producteur par rapport au plan, lus dans le code :

- **Deux aides de test hors de la liste du bloc 2 : entérinées.** `test/aides-identifiants.ts` porte la table des formes refusées, que le plan faisait déjà servir deux fois (bloc 2, puis « les cas de la table du bloc 2 » pour la route) : une seule table vaut mieux que deux copies. `test/aides-coutures.ts` porte l'appel d'`import.meta.glob` : appelé depuis `coutures.test.ts`, il ne rendrait pas ce fichier, qui doit pourtant se lire lui-même. L'exception « lecture comme texte » de « Règles de dépendances » vaut donc pour ces deux fichiers, `coutures.test.ts` restant le seul appelant de l'aide ; aucun contrôle ne le tient, c'est la relecture.
- **`fermerLesFacades()` rend le nombre de façades restées ouvertes, `preparation.ts` exige zéro et rend l'horloge réelle : entériné.** Même preuve que celle du plan (`facadesEncoreOuvertes()` à zéro), en un appel, et les documents ne sont plus suivis ensuite : un test ne paie pas pour le précédent. Un test de couture prouve qu'un écouteur resté après `fermer()` est compté.
- **`DELAI_RELECTURE_MS` et `CodeErreurPersistance` non exportés : entériné.** Aucun lecteur hors de leur fichier ; l'ADR-0008 ne les mettait pas dans l'interface.
- **Glob de la couture élargi à `{apps,packages}/*/{src,test,e2e}` ; import dynamique à argument calculé compté comme ouvrant : entérinés.** Les deux resserrent : toute application à venir est lue sans retouche, et un import que le texte ne permet pas de connaître doit être inscrit dans une sorte. Conséquence pour les blocs suivants : un fichier de test qui importe par un argument calculé devient un ouvrant à inscrire ; `importerEntree` importe donc `src/main.tsx` par un chemin littéral.
- **F-002-AC17 testé dès le bloc 2, au niveau du module : entériné.** `persistance-echecs.test.ts` ferme lui-même la persistance après le refus et constate l'enregistrement vide seul. Le test du bloc 3 (`coquille-echecs.test.tsx`) reste dû : c'est lui qui prouve que la session ferme la persistance.
- **Deux défauts de l'archive corrigés dans `espace-local.ts` : entérinés, conformes à l'ADR-0008.** Valeur nulle relue prise pour une absence (l'archive ouvrait la base du candidat sans l'inscrire) ; base de l'appareil sans son magasin (l'ouverture de la transaction levait hors de tout gestionnaire). L'ADR disait « s'il n'est pas une chaîne » et « inutilisable » sans nommer ces deux cas : il les nomme désormais, sans changement de décision. Le plan disait `indexeddb.ts` « repris » et il l'est ; `espace-local.ts` était déjà « retouché ».
- **`fermeture.test.ts` sans le contrôle strict d'`aides-facade.ts` : repris au bloc 3, dans `coutures.test.ts` seulement.** Le fichier du bloc 1 n'est pas modifié. Il passe les deux fonctions en valeur à `expect(…).toHaveLength(…)` et cite un des deux noms dans un titre de test ; rien ne refuse aujourd'hui qu'une fonction passée en valeur y soit appelée sous un autre nom, sur un `Y.Doc` que son `afterEach` ne suit pas. Le bloc 3 ajoute un test qui classe chaque occurrence des deux noms dans ce fichier : clause d'import, appel (un par nom, dans les deux aides), argument direct d'`expect(` suivi de `.toHaveLength(`, ou chaîne d'un titre ; toute autre occurrence fait échouer. Limite qui reste, déjà écrite dans « Levée de D-006 » : la couture ne peut pas exécuter ce fichier, la preuve par le compte y tourne dans le projet `document`.

Une seule instance de `yjs` (ADR-0003, à la charge de F-002) : le test existe, `structure.test.ts`, groupe « une seule instance de yjs » (F-002-AC21 : manifestes qui déclarent `yjs` énumérés, même version, une seule résolue par le verrou ; document de `creerDocumentEspace` instance du `Y.Doc` d'`apps/web`). La forme que l'ADR-0003 décrit (un `Y.Doc` du consommateur, des pages créées par la façade, relues par `ouvrirDocumentEspace`) est exercée par les tests de persistance qui passent par `ouvrirFacade(new Y.Doc())`, dont celui de F-002-AC20. L'autre moitié de la charge, imposer la version à la racine (catalogue pnpm ou `overrides`), n'est pas livrée : le bloc 0 ne l'a pas posée, et `pnpm-workspace.yaml` est un fichier du dev. Décision : la détection par le test suffit pour deux manifestes en version exacte ; l'ADR-0003 est à amender en ce sens par cette conception à l'alignement du bloc 3, ou le dev pose le catalogue. Reste au bloc 3 : `session.doc instanceof Y.Doc` dans `coutures.test.ts`.

Ajouts au plan du bloc 3, dans « Fichiers de chaque bloc », « Ce que chaque bloc réalise » et « Levée de D-006 » (marqués « révision 3 »).

Révision 2 du 2026-10-09, après le second passage du gate `agent-architecte` : `ARCHITECTURE GATE: PASS` sur la conception du commit `43dd505` (empreinte `b7e7c0b5a59c`), avec huit corrections non bloquantes. Cette révision en applique six, plus une consigne au producteur. Elle suit un PASS : le gate de conception n'est pas repassé, et c'est le gate de code qui jugera ces changements, sur le diff livré. Le découpage en blocs ne change pas. Ce qui change :

- **Statuts (correction 1).** La spec est revalidée (`86542e8`) : plus rien n'est « proposé » ni « en brouillon », dans ce plan comme dans les ADR 0003, 0007 et 0008.
- **Session de l'entrée (correction 2).** Le test qui importe `src/main.tsx` récupère la session que l'entrée démarre, la ferme et constate zéro écouteur ; aucune exemption ne s'ajoute à celle de F-002-AC31, et `main.tsx` ne reçoit ni export ni paramètre (« Levée de D-006 », bloc 3).
- **`demarrerSession()` (correction 3).** Les tests de composants rendent la session de l'aide, pas `demarrerSessionEspace()` (« Stratégie de test », ADR-0007).
- **Ouvrants énumérés par leurs imports (correction 4).** Un ouvrant est un fichier qui importe l'un des deux noms, renommage compris, ou le module entier ; plus un fichier où figure la forme de l'appel (« Levée de D-006 », bloc 2).
- **`notionlike:` (correction 5).** L'exception ESLint ne vaut plus pour tout `src/persistance/**` mais pour `nom-de-base.ts` et `espace-local.ts` : un bloc ESLint de plus dans le script du bloc 0 (cinq au lieu de quatre), rejoué (essai S2 bis).
- **Surface sans lecteur (correction 6).** `PersistanceEspaceLocal.idEspace()` sort de F-002 : aucun lecteur de production, aucun critère ; F-003 l'ajoutera avec son appelant. `SessionEspace.doc` reste, justifié par quatre critères et leurs tests (bloc 3, ADR-0007).
- **Lecture comme texte (correction 7).** « Règles de dépendances » dit que `coutures.test.ts` lit `packages/*/src` et `packages/*/test` en `?raw`, hors de vue de `web-document-par-ses-exports`, et pourquoi c'est admis.
- **Consigne au producteur.** Un test de `navigation.test.tsx` est instable sous charge : attente à corriger au bloc 3.

Hors de la main de cette conception : la correction 8 (extraits de `lecture-seule.sh` et de `journal-gate.sh`, nom du dossier de revue : socle, dev) et le complément des prérequis de la spec, qui n'annoncent ni les blocs ESLint ni les neuf contrats (`agent-planif`, puis revalidation).

Révision 1 du 2026-10-08, après le premier rejet du gate `agent-architecte` (conception du commit `d2e73f1`, empreinte `41ee62d52f4f`). Le découpage en blocs ne change pas. Ce qui change, et pourquoi :

- **Décisions qui étaient laissées au dev.** Le plan disait de trois points (AC29, AC30, AC31) qu'ils demandaient une décision, alors que l'ADR-0003 les tranchait sous le statut « accepté ». L'orchestrateur les a tranchés à la demande du dev et la spec les porte (H15) : la section « Points de la spec à connaître » ne contient plus aucune décision en attente. L'amendement de l'ADR-0003, et les parties des ADR 0007 et 0008 qui en dépendent, attendaient la revalidation de la spec par le dev ; elle est faite (« Statut des décisions », ci-dessous).
- **Un seul canal pour l'exception d'un abonné.** Le récepteur facultatif ajouté à `creerDocumentEspace` et à `ouvrirDocumentEspace` disparaît : il n'avait qu'un usage, identique au repli sur `console.error`, et donnait deux chemins de remise dans la session. Les deux fonctions gardent leurs signatures de F-001 ; la façade et la session signalent par `console.error`, chacune pour ses propres abonnés.
- **Fermeture spécifiée jusqu'au bout.** `fermer()` appelée depuis un rappel en cours de diffusion, `lire()` et `abonner` après fermeture, écriture refusée par le nouveau code `facade-fermee` : ADR-0003. Preuves ajoutées au bloc 1 et au bloc 3, mécanismes essayés (essais D et F).
- **Test de couture d'AC31 discriminant.** La fermeture est prouvée par le compte d'écouteurs du `Y.Doc`, plus par la présence du mot `fermer` ; le test ne cherche plus le mot `abonner`, que trois interfaces portent (« Levée de D-006 »).
- **AC16, AC17, AC24.** Les lectures que le plan retenait contre la lettre de la spec sont maintenant le texte des critères : le plan et l'ADR-0008 les citent comme critères, plus comme écarts.
- **Pureté outillée étendue.** `navigation/route.ts` et `persistance/nom-de-base.ts` reçoivent un contrat (`web-formes-pures`) et une règle ESLint sur les globales, comme `identifiants/` ; neuf contrats ajoutés au lieu de huit.
- **Surface nettoyée.** `interface/` n'importe plus `identifiants/` (aucun appelant : le contrat `web-src-liste-blanche` le refuse désormais) ; le bloc `preview` sort de `vite.config.ts` ; `vitest` est en version exacte dans `apps/web/package.json` ; le compte des chemins de l'arbre est refait (70).
- **Deux réponses au gate.** Un `import type` est vu par les contrats (« Règles de dépendances ») ; le texte du bloc 0 cesse de faire foi une fois commité (« Bloc 0 »).
- **Essais.** Le bloc 0, les contrats, les barrières ESLint et les prototypes de la façade, de la session et du test de couture sont rejoués sur un gabarit neuf tiré de `git archive HEAD` ; les sorties chiffrées sont celles de ces passages (« Essais »).

**Statut des décisions.** Tout est accepté. Le dev a revalidé `specs/F-002.md` au commit `86542e8` (`Agent: dev`), sans changer aucun des six critères amendés. Sont donc acceptés sans changement de texte : l'amendement F-002 de l'ADR-0003 ; dans l'ADR-0007, « Exception d'un abonné » et « Fermeture » ; dans l'ADR-0008, les trois conséquences qui citent AC16, AC17 et AC24. La règle 1 d'`AGENTS.md` est remplie pour les blocs 1 à 4, qui suivent le bloc 0.

**Les deux scripts du dev sont essayés** : extraits de ce document par les commandes données plus bas. Le script de mise à l'abri, inchangé depuis la première version de ce plan, a été lancé dans un clone du dépôt qui porte le même arbre non commité que le dépôt principal, hooks git actifs (essais S1 et S3). Le script du bloc 0, modifié par la révision 1, a été relancé sur un gabarit neuf tiré de `git archive HEAD` (`apps/.gitkeep` et `packages/.gitkeep` compris) et dans le clone de l'essai S3 (essai S2) ; modifié de nouveau par la révision 2 (exception ESLint sur `notionlike:`), il a été relancé sur un gabarit neuf tiré de `git archive HEAD` au commit `e041461` (essai S2 bis). Sorties exactes dans « Essais ».

## État de départ

Le code de F-002 existe déjà, non commité, dans l'arbre du dépôt principal, mêlé à celui de F-003 et écrit contre une version antérieure de la spec. Relevé du 2026-10-08 par `git ls-files -m -o --exclude-standard`, après le commit de la première version de ce plan : 70 chemins.

| Ensemble                                                                    | Chemins | Devenir                                                                |
| --------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `apps/web/`                                                                 | 56      | 38 pour F-002 (dont 10 mêlés à F-003), 18 pour F-003 seule             |
| `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml` (modifiés) | 3       | mêlés : le bloc 0 en écrit la version F-002 seule à partir de HEAD     |
| `packages/document/` : trois fichiers modifiés, cinq non suivis             | 8       | F-003 seule                                                            |
| `docs/decisions/0009-…`, `docs/decisions/F-003-conception.md`               | 2       | F-003 seule                                                            |
| `ARCHITECTURE.md` (modifié)                                                 | 1       | version périmée, à ne pas reprendre : `ARCHITECTURE.md` repart de HEAD |

Les quatre documents de cette conception (ce plan, les ADR 0003, 0007 et 0008) sont suivis et commités : ils ne comptent pas dans ce relevé.

Ce plan ne récrit pas ce code. Il dit comment le mettre à l'abri sans rien perdre, quels fichiers chaque bloc reprend, lesquels sont à retoucher parce que la spec a changé depuis (F-002-AC25 réécrit, AC27 à AC32, H15), et ce qui reste à écrire.

## Approche

`apps/web` (`@notionlike/web`) est une application React 19 servie par Vite 8, sans bibliothèque d'état ni de routage. Cinq modules, dépendances à sens unique (ADR-0007) :

- `identifiants/` : une fonction pure, `estUuidCanonique`, seule définition de la forme d'un identifiant dans l'application ;
- `persistance/` enrobe `y-indexeddb` et porte ce qu'elle ne fait pas : nom des bases, contrôle de forme de chaque identifiant, identifiant de l'espace local, délai de 10 secondes, interception des échecs, validation de chaque écriture (ADR-0008) ;
- `espace/` tient la session : garde de contexte sécurisé, `Y.Doc`, persistance, façade de `@notionlike/document`. Elle est la seule abonnée de la façade, la ferme, garde ses propres abonnés comme la façade garde les siens, et expose un état immuable ;
- `navigation/` lit et écrit le fragment de l'adresse, et refuse tout identifiant qui n'est pas un UUID canonique ;
- `interface/` rend cet état par `useSyncExternalStore` et appelle trois opérations de la façade.

Trois fichiers ne font que calculer et sont tenus purs par un contrat et par une règle ESLint : `identifiants/uuid-canonique.ts`, `navigation/route.ts`, `persistance/nom-de-base.ts`. Les entrées et sorties sont dans d'autres fichiers (`navigation/fragment.ts`, `persistance/indexeddb.ts`, `persistance/espace-local.ts`).

`packages/document` reçoit deux retouches, et elles seules : la façade se ferme (méthode `fermer()`, code d'erreur `facade-fermee` pour une écriture faite ensuite), et un rappel d'abonné qui lève n'interrompt plus la diffusion (amendement F-002 de l'ADR-0003). Aucune signature de F-001 ne change.

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
    preparation.ts                 IndexedDB simulé neuf par test, fragment remis à zéro ; en fin de test, façades fermées et comptées
    aides-facade.ts                seul fichier de test qui ouvre une façade ou démarre une session : suivi et compte d'écouteurs
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
- Attendu : une ligne `abri : 70 chemins dans archive-arbre-2026-10-08 (<hash>) ; chemins encore modifies ou non suivis dans l'arbre : 0`. Le compte est celui de l'arbre au moment du lancement : les 70 chemins du relevé. Après lui, `git status --short` est vide ; `apps/web/` ne contient plus que `node_modules` (ignoré).
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
| 0    | dev              | squelette d'`apps/web`, neuf contrats, barrières ESLint, installation   | prépare AC18, AC19, AC22, AC25, AC26, AC27, AC32 (aucun alias dans les configurations)                                                                                                                                         |
| 1    | `agent-frontend` | `packages/document` : fermeture de la façade, rappel d'abonné qui lève  | AC29 et AC30 côté paquet ; AC31 (exports, signatures et tests de F-001 inchangés)                                                                                                                                              |
| 2    | `agent-frontend` | `identifiants/` et `persistance/` entiers ; coutures du workspace       | AC25, AC28 ; AC22 ; AC21 (manifestes, verrou, instance) ; aller-retour d'AC20 ; AC16 et AC24 au niveau du module ; preuve Vitest d'AC4 ; AC2 au niveau du module ; forme d'AC27 ; énumération d'AC31 ; AC32 hors construction  |
| 3    | `agent-frontend` | session, navigation, interface, entrée : la coquille entière            | AC1 à AC3, AC5 à AC15, AC17, AC18, AC26, AC27 ; AC16 et AC24 à l'écran ; énumération d'AC20 ; AC19 (statique) ; AC21 (document de la session) ; AC29 et AC30 côté application ; AC31 étendu à la session ; construction d'AC32 |
| 4    | `agent-frontend` | bout en bout                                                            | AC23 ; volets navigateur d'AC2, AC4, AC19 et AC21                                                                                                                                                                              |

Après le bloc 4 : la ligne « Lancer l'application » d'`AGENTS.md` (fichier protégé) est à renseigner par le dev (`pnpm --filter @notionlike/web dev`, puis `http://127.0.0.1:5173`), et la dette D-006 est à clore dans `PROJECT_LOG.md`.

### Fichiers de chaque bloc

« Repris » : copié de l'archive, à l'octet près. « Retouché » : repris, puis modifié comme la colonne le dit. « Écrit » : n'existe pas dans l'archive. Les chemins des blocs 2 à 4 sont relatifs à `apps/web/`.

**Bloc 1 — `packages/document`.** Rien n'est repris de l'archive : les fichiers de `packages/document` qui y figurent sont ceux de F-003.

| Fichier                                     | Origine  | Ce que le bloc y fait                                                                                                                                             |
| ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/document/src/document-espace.ts`  | HEAD     | `fermer()` ; diffusion sous garde, signalée par `console.error` ; `console` déclarée localement ; écritures refusées après fermeture (ADR-0003, amendement F-002) |
| `packages/document/src/erreurs.ts`          | HEAD     | le code `facade-fermee` s'ajoute à l'union `CodeErreurDocument`, et rien d'autre                                                                                  |
| `packages/document/test/fermeture.test.ts`  | écrit    | preuves d'AC29 et d'AC30 côté paquet (liste dans « Ce que chaque bloc réalise »)                                                                                  |
| les six autres fichiers de test, `aides.ts` | inchangé | aucun : ils restent verts sans retouche (224 tests), c'est la preuve d'AC31 pour les appelants de F-001                                                           |

`src/index.ts` ne change pas : aucun export n'est ajouté, aucune signature ne change.

`erreurs.ts` et la part de F-003. Dans l'arbre d'aujourd'hui, `packages/document/src/erreurs.ts` porte une modification non commitée de F-003 (le code `version-invalide`), sur la même union. Le bloc 1 ne la commite pas, parce qu'il ne la voit pas : il vient après la mise à l'abri, qui ramène le fichier à sa version de HEAD et garde la part de F-003 sur la branche d'archive. Trois garde-fous :

- avant d'écrire, le producteur lance `git status --porcelain -- packages` et s'arrête si la sortie n'est pas vide (mise à l'abri non faite) ;
- le bloc ajoute une ligne à l'union de HEAD et commite par `git commit` sur les trois chemins nommés ; l'attendu chiffré du bloc 1 exige trois lignes dans `git diff --name-status`, et `git diff HEAD~1 HEAD -- packages/document/src/erreurs.ts` ne doit montrer que `facade-fermee` ;
- F-003 ne recopie pas `erreurs.ts` de l'archive : elle ajoute `version-invalide` à l'union livrée par F-002, qui porte déjà `facade-fermee`. Une recopie retirerait ce code, et le test de couture d'AC31 échouerait. Même règle pour `src/index.ts` et `test/structure.test.ts`, que F-002 ne touche pas.

**Bloc 2 — `identifiants/` et `persistance/`.**

| Fichier                               | Origine  | Ce que le bloc y fait                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/identifiants/uuid-canonique.ts`  | écrit    | `estUuidCanonique` (ADR-0007)                                                                                                                                                                                                                                                                                                 |
| `src/persistance/index.ts`            | retouché | sans l'export du type `PersistanceEspaceLocal`, qui disparaît                                                                                                                                                                                                                                                                 |     |
| `src/persistance/indexeddb.ts`        | repris   |                                                                                                                                                                                                                                                                                                                               |
| `src/persistance/espace-local.ts`     | retouché | sans `idEspace()` ni le type `PersistanceEspaceLocal` : `ouvrirEspaceLocal` rend une `Persistance` (aucun lecteur de production dans F-002, aucun critère ; F-003 l'ajoutera avec son appelant) ; son contrôle de l'identifiant relu passe déjà par la fonction de nommage                                                    |
| `src/persistance/nom-de-base.ts`      | retouché | contrôle de chaque identifiant par `estUuidCanonique` (l'archive ne contrôle que celui de l'espace) ; code `identifiant-invalide` ; message sans l'identifiant ; seul import : `identifiants/`                                                                                                                                |
| `test/preparation.ts`                 | retouché | sans les quatre fonctions de mise en page ajoutées pour ProseMirror (F-003) ; en fin de chaque test, ferme les façades suivies et exige que le compte d'écouteurs n'en voie plus aucune ouverte                                                                                                                               |
| `test/aides-facade.ts`                | écrit    | `ouvrirFacade`, `creerFacade` : relèvent le compte d'écouteurs du `Y.Doc` avant d'ouvrir, et suivent la façade ; `ecouteurs`, `facadesEncoreOuvertes`, `fermerLesFacades` (« Levée de D-006 »)                                                                                                                                |
| `test/aides-persistance.ts`           | repris   |                                                                                                                                                                                                                                                                                                                               |
| `test/persistance-ouverture.test.ts`  | retouché | tests d'AC25 réécrits (identifiants de page et de table en UUID ; un identifiant de page avec `:` est refusé, sans base, celle de A inchangée) ; table des refus étendue aux trois identifiants ; l'identifiant d'espace retenu se lit dans le nom de la base énumérée, plus par `idEspace()` ; façades par `aides-facade.ts` |
| `test/persistance-echecs.test.ts`     | retouché | façades par `aides-facade.ts` ; le test de l'identifiant d'espace illisible sur l'appareil cite AC28 ; les assertions sur `idEspace()` deviennent « aucune base d'espace énumérée »                                                                                                                                           |
| `test/persistance-validation.test.ts` | retouché | l'identifiant de page `p1` devient un UUID                                                                                                                                                                                                                                                                                    |
| `test/structure.test.ts`              | retouché | sans le groupe « dépendances d'édition » ni l'import d'`ouvrirDocumentPage` (F-003) ; dépendances d'exécution de F-002 seule ; façade par `aides-facade.ts` ; plus les preuves d'AC32                                                                                                                                         |
| `test/uuid-canonique.test.ts`         | écrit    | table de cas de la forme (AC27, AC28)                                                                                                                                                                                                                                                                                         |
| `test/coutures.test.ts`               | écrit    | couture des appelants de la façade (AC31), sans la ligne de la session ; les autres coutures de ce fichier arrivent au bloc 3                                                                                                                                                                                                 |

**Bloc 3 — la coquille.**

| Fichier                                                           | Origine  | Ce que le bloc y fait                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`, `src/main.tsx`                                      | repris   |                                                                                                                                                                                                                                      |
| `src/navigation/fragment.ts`                                      | repris   |                                                                                                                                                                                                                                      |
| `src/navigation/route.ts`                                         | retouché | l'identifiant lu passe par `estUuidCanonique`, sans décodage ; forme `page-introuvable` sans la chaîne ; `fragmentDe` sans encodage ; seul import : `identifiants/` (ADR-0007)                                                       |
| `src/espace/session-espace.ts`                                    | retouché | `fermer()` ; une seule fonction prévient les abonnés, sous garde, avec `console.error` ; façade fermée à l'entrée dans `version-non-prise-en-charge` ; rien n'est ouvert après fermeture ; sans `idEspace` dans l'état `pret`        |
| `src/interface/BarreLaterale.tsx`, `RangeePage.tsx`               | repris   |                                                                                                                                                                                                                                      |
| `src/interface/SaisieTitre.tsx`, `pages.ts`                       | repris   |                                                                                                                                                                                                                                      |
| `src/interface/Application.tsx`                                   | retouché | sans la session de page ni `useEtatDeLaPage` (F-003) ; l'avertissement ne dépend que de `etat.enregistre` ; forme de route `page-introuvable`                                                                                        |
| `src/interface/ZonePrincipale.tsx`                                | retouché | sans l'éditeur ni `ContenuDePage` (F-003) : titre seul                                                                                                                                                                               |
| `src/interface/messages.ts`                                       | retouché | sans les deux textes de version de page ni le message du code `version-invalide`, qui n'existe pas dans le paquet de F-002 ; un message pour `facade-fermee`                                                                         |
| `src/styles.css`                                                  | retouché | sans les règles `.edition`, `.barre-de-blocs`, `.ProseMirror` (F-003)                                                                                                                                                                |
| `test/aides-facade.ts`                                            | retouché | `demarrerSession` : démarre une session et la suit ; `importerEntree` : importe `src/main.tsx` (chemin littéral, révision 3) et suit la session que l'entrée démarre ; aucun autre fichier de test n'importe `demarrerSessionEspace` |
| `test/aides-coquille.tsx`                                         | retouché | sessions et façades par `aides-facade.ts` ; une aide unique pour activer une action de rangée (« Ce que F-004 remplacera »)                                                                                                          |
| `test/coquille.test.tsx`, `coquille-echecs.test.tsx`              | retouché | sessions par l'aide ; le test de l'entrée passe par `importerEntree`, ferme sa session et constate zéro écouteur                                                                                                                     |
| `test/barre-laterale.test.tsx`, `barre-laterale-erreurs.test.tsx` | retouché | actions de rangée par l'aide, sauf dans le test d'AC10 qui fixe les commandes natives                                                                                                                                                |
| `test/navigation.test.tsx`                                        | retouché | attentes du test d'AC12 après `history.back()` et `forward()` (consigne du bloc 3) ; cas d'AC13 et d'AC27 à l'écran : identifiant de forme refusée, rien de la chaîne dans la page ni dans l'onglet ; actions de rangée par l'aide   |
| `test/route.test.ts`                                              | retouché | table de cas d'AC27 ; les deux tests qui fixaient l'encodage et « quel qu'il soit » disparaissent                                                                                                                                    |
| `test/coutures.test.ts`                                           | retouché | énumération d'AC20 et autres coutures reprises de l'archive, sans la part F-003 ni `version-invalide` ; couture d'AC31 étendue à la session et aux modules qui lisent un code d'erreur                                               |
| `test/session-fermeture.test.tsx`                                 | écrit    | AC29 et AC30 côté application                                                                                                                                                                                                        |

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

Fichiers mêlés : ce que le commit de F-002 garde pour tenir debout seul. Les dix d'`apps/web` ont été séparés ainsi sur le gabarit, et l'ensemble passe les cinq contrôles, le bout en bout et la construction (essai G). La révision 2 en ajoute deux, `src/persistance/espace-local.ts` et `src/persistance/index.ts` (F-002 les garde sans `idEspace()` ni `PersistanceEspaceLocal`, qui restent à F-003), avec les assertions de `persistance-ouverture.test.ts` et de `persistance-echecs.test.ts` qui les lisaient ; cette séparation-là n'a pas été essayée.

| Fichier mêlé                       | Ce que F-002 garde                                                                                                      | Ce qui reste à F-003                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`            | cinq dépendances d'exécution, onze de développement (texte du bloc 0)                                                   | dix paquets `@tiptap/*` et `y-protocols`                                                                                                                                     |
| `.dependency-cruiser.cjs`          | les sept contrats de HEAD et neuf contrats `web-*` (texte du bloc 0)                                                    | `edition-confinee`, `web-edition-par-son-interface`, `web-edition-liste-blanche`, `web-page-liste-blanche`, et `page`, `edition` dans l'exception de `web-src-liste-blanche` |
| `eslint.config.mjs`                | constantes et cinq blocs d'`apps/web/src` (texte du bloc 0)                                                             | `IMPORTS_DE_L_EDITION` et son bloc `no-restricted-imports`                                                                                                                   |
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

### Écarts entre le code de l'archive et la spec

Vérifiés dans le code, pas supposés. Chacun est rattaché au bloc qui le comble.

| Écart                                                                                                                                                                                                                                                       | Critère          | Bloc  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----- |
| `nom-de-base.ts` ne contrôle que l'identifiant d'espace ; un identifiant de page `page:avec:deux-points` ouvre une base. Deux tests le fixent (« même avec « : » », « qui imite un autre espace »), et les tests de validation utilisent l'identifiant `p1` | AC25, AC28       | 2     |
| aucune fonction unique de forme : l'expression régulière vit dans `nom-de-base.ts`, sans borne de longueur préalable                                                                                                                                        | AC27, AC28       | 2     |
| `route.ts` décode le fragment (`decodeURIComponent`) et accepte toute chaîne non vide comme identifiant de page ; elle est ensuite cherchée dans l'arborescence. `route.test.ts` fixe « relit l'identifiant qu'il a écrit, quel qu'il soit »                | AC27             | 3     |
| `document-espace.ts` (HEAD) : diffusion sans garde, aucune fermeture                                                                                                                                                                                        | AC29, AC30       | 1     |
| `session-espace.ts` : aucune `fermer()`, la façade n'est jamais fermée ; ses propres abonnés sont prévenus sans garde                                                                                                                                       | AC29, AC30       | 3     |
| aucun test n'énumère les fichiers qui ouvrent une façade ni ne compte les écouteurs ; onze fichiers d'`apps/web` et de `packages/document` les appellent (essai X), aucun ne ferme de façade                                                                | AC31             | 2, 3  |
| aucun test ne fixe la liste des exports vus par le nom du paquet, l'absence d'alias, ni le refus d'un sous-chemin ; `build` n'est lancé par aucun contrôle                                                                                                  | AC32             | 2, 3  |
| `messages.ts` n'a pas de message pour `facade-fermee`, code que le bloc 1 ajoute                                                                                                                                                                            | AC15, AC31       | 3     |
| aucun test ne cite F-002-AC27 à AC32 : `ac-couverture.sh F-002` échouerait                                                                                                                                                                                  | AC27 à AC32      | 1 à 3 |
| l'état `pret` porte `idEspace`, lu par la seule session de page ; `PersistanceEspaceLocal.idEspace()` n'a alors plus de lecteur, sauf dix assertions de deux fichiers de test                                                                               | hors périmètre   | 2, 3  |
| les tests atteignent les actions de rangée par leur nom à une soixantaine d'endroits                                                                                                                                                                        | F-004 (plus bas) | 3     |

Écarts entre le code de l'archive et le plan précédent, entérinés par les ADR mis à jour : liste plate à `aria-level` au lieu de listes imbriquées (ADR-0007) ; validation de chaque écriture par `commit()` et second champ interne de `y-indexeddb` (ADR-0008) ; cinq scénarios de bout en bout au lieu de quatre (le cinquième : titre validé puis rechargement immédiat).

## Ce que chaque bloc réalise

### Bloc 1 — levée de D-006 dans `packages/document`

Décision : amendement F-002 de l'ADR-0003 (accepté). Interface à la fin du bloc : les exports et les signatures de F-001, `DocumentEspace.fermer()`, et le code `facade-fermee` dans `CodeErreurDocument`.

`test/fermeture.test.ts`, par `src/index.ts`, chaque test citant son critère. Les deux origines d'un changement, une opération locale et `Y.applyUpdate`, sont jouées par le même test paramétré partout où le critère les nomme :

- AC29 : quatre abonnés dont le deuxième et le quatrième lèvent ; le changement ne lève pas, le premier et le troisième sont appelés une fois, dans l'ordre ; `console.error` (espionnée, muette) reçoit les deux exceptions, une fois chacune, dans l'ordre des rappels ; pour chacune des deux origines ;
- AC29 : règles de diffusion de F-001 sous garde : un rappel qui désabonne le suivant, inscrit un nouvel abonné puis lève ; ni le désabonné ni le nouvel inscrit ne sont appelés pour ce changement ;
- AC30 : après `fermer()`, une mise à jour reçue n'appelle aucun abonné et `lire()` rend la même référence qu'avant ; seconde fermeture sans effet ; `abonner` après fermeture n'inscrit rien et sa fonction de désabonnement est sans effet ; zéro écouteur ;
- AC30 : chacune des quatre écritures sur une façade fermée est refusée par `facade-fermee`, y compris avec un titre trop long (le code de fermeture passe avant) ; aucune mise à jour émise, état encodé du `Y.Doc` inchangé ;
- AC30 : façade fermée sur un document de version non prise en charge : `lire()` garde le refus `version-non-prise-en-charge`, l'écriture donne `facade-fermee` ;
- AC30 : `fermer()` appelée depuis le deuxième de trois rappels : le troisième n'est pas appelé, rien ne lève, `console.error` n'est pas appelée, l'écouteur est retiré, `lire()` rend l'arborescence de la transaction en cours ; une seconde façade ouverte sur le même `Y.Doc` est notifiée de cette transaction et des suivantes ; pour chacune des deux origines ;
- AC30 : ouvrir puis fermer 50 fois sur un même `Y.Doc` laisse le nombre d'écouteurs `afterTransaction` du départ.

Le fichier n'ouvre de façade que par deux aides locales, `ouvrirSuivie` et `creerSuivie`, qui relèvent le compte d'écouteurs du `Y.Doc` avant l'ouverture ; son `afterEach` ferme tout ce qu'elles ont ouvert et exige, pour chaque `Y.Doc`, le compte du départ. C'est la preuve de fermeture d'AC31 pour ce fichier (« Levée de D-006 »).

Le nombre d'écouteurs se lit par `doc._observers.get("afterTransaction")?.size ?? 0` : `_observers` est un champ de la classe d'observable dont `Y.Doc` hérite, déclaré dans ses types (essai D : la lecture compile dans `packages/document`). `console` n'est typée ni dans la source ni dans les tests du paquet : le fichier de test la déclare localement, comme la source (essai D : sans cette déclaration, `tsc` rend `TS2584` sur l'espion).

Constat : aucun test de F-001 ne fixait la remontée de l'exception d'un rappel (`abonnement.test.ts` n'a aucun rappel qui lève), ni la liste des codes d'erreur (`structure.test.ts` ne lit que le manifeste). Aucun test de F-001 n'est donc modifié (essai D : les 224 passent).

### Bloc 2 — `identifiants/` et `persistance/`

- `uuid-canonique.ts` : `estUuidCanonique(valeur: string): boolean`, longueur comparée à 36 avant l'expression régulière. `test/uuid-canonique.test.ts` : table de cas — vide, plusieurs milliers de caractères, majuscules, `:`, `/`, `#`, `%` et séquences encodées, balisage HTML, segment en trop, espace avant, saut de ligne après, sans tirets, entre accolades ; et un UUID de `crypto.randomUUID()` accepté. Piège relevé à l'essai précédent : un identifiant de test sans lettre (`11111111-…`) ne change pas en majuscules ; le cas des majuscules prend un UUID qui contient des lettres.
- `ouvrirEspaceLocal(doc, idCandidat)` rend une `Persistance` : l'identifiant retenu n'est pas exposé (ADR-0008). Les tests d'AC2, d'AC4 et d'AC28 le constatent par ce qu'`indexedDB.databases()` énumère : une seule base `notionlike:espace:<id>` après deux ouvertures successives ou lancées ensemble, aucune quand l'identifiant relu est illisible.
- `nom-de-base.ts` : non exportée par `index.ts` ; les tests l'atteignent par `ouvrirPersistance` et `ouvrirEspaceLocal`, en énumérant les bases par `indexedDB.databases()`.
- Test d'AC25, dans `persistance-ouverture.test.ts` : contenu témoin sous `{ page, A, P }` ; `{ page, B, P }` lit un document vide ; deux bases énumérées, celle de A inchangée ; puis un identifiant de page qui contient `:` pour l'espace B : `ErreurPersistance`, aucune base de plus, celle de A inchangée. Table d'AC28 : pour chacun des trois identifiants (espace, page, table) et chaque forme refusée, refus sans base ; identifiant d'espace illisible relu sur l'appareil : persistance `coupee`, aucune base d'espace.
- Les désignations `page` et `table` n'ont pas d'appelant dans l'application avant F-003 et F-018 ; la spec les demande ici (H13 c) et elles sont atteintes par ces tests.
- `test/structure.test.ts`, preuves d'AC32, toutes essayées (essai X) : (1) `import * as paquet from "@notionlike/document"` rend exactement `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace` ; (2) les fichiers de configuration qui peuvent porter un alias sont énumérés par `import.meta.glob` en `?raw` et leur liste est fixée — `apps/web/vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, et à la racine `vitest.config.ts`, `tsconfig.base.json` — aucun ne contient `alias`, `"paths"` ni le nom du paquet ; (3) l'import dynamique d'un sous-chemin (`@notionlike/document/src/arbre.ts`) rejette. La vérification des types refuse le même sous-chemin (`TS2307`), ce que `pnpm typecheck` tient sans test dédié. Dans le test, le sous-chemin est assemblé à l'exécution et marqué `@vite-ignore` : écrit en clair, il ferait échouer le chargement du fichier de test et le contrat `web-document-par-ses-exports`.
- `test/aides-facade.ts`, `test/preparation.ts` et `test/coutures.test.ts`, AC31 : voir « Levée de D-006 ». Dès ce bloc, aucun fichier de `test/` autre que `aides-facade.ts` n'importe `creerDocumentEspace` ni `ouvrirDocumentEspace`, sous ce nom ou sous un autre.
- AC21 : une seule version de `yjs` déclarée et résolue (manifestes par `import.meta.glob`, verrou par `?raw`) ; le document d'une façade créée par `creerDocumentEspace` (par l'aide `creerFacade`) est un `Y.Doc` du `Y` d'`apps/web`.
- AC24, `persistance-echecs.test.ts` (tests de l'archive, repris) : horloge simulée, `relecture` à 9 999 ms, `coupee` à 10 000 ms ; la réponse de la base est délivrée après l'échéance, puis l'arborescence lue est celle tenue en mémoire avant cette réponse et les enregistrements de la base sont inchangés. AC16 : un test par cas nommé par le critère (`indexedDB` absent ; ouverture refusée par une exception, par une erreur ; lecture en échec, écriture en échec, transaction annulée, connexion fermée).

### Bloc 3 — session, navigation, interface, entrée

- Session : quatre phases ; `operations` porte `creerPage`, `renommerPage`, `mettreALaCorbeille` ; garde de ses abonnés, fermeture et entrée dans `version-non-prise-en-charge` selon l'ADR-0007. `deplacerPage` n'entre pas dans `operations` (hors périmètre de F-002) : le type de l'état l'exclut.
- `test/session-fermeture.test.tsx` (essai F, sur prototype), par `<Application>` et par `demarrerSession` :
  - AC29, changement du document : deux abonnés de la session dont le premier lève, puis une mise à jour reçue par `Y.applyUpdate` ; rien ne lève, `console.error` (espionnée) reçoit l'exception une fois, le second abonné est prévenu, la page reçue est affichée, « Nouvelle page » fonctionne encore ;
  - AC29, changement de la persistance : les mêmes abonnés inscrits pendant le chargement ; à la fin de la relecture, même constat, et le second abonné lit la phase `pret` ;
  - AC30 : même session rendue et démontée cinq fois sous `StrictMode` : un écouteur `afterTransaction` ; après `fermer()`, zéro ; seconde fermeture sans effet ; une mise à jour reçue ensuite ne prévient aucun abonné ;
  - AC30, la fermeture de production : une version non prise en charge reçue par `Y.applyUpdate` pendant que l'application est affichée ; rien ne lève, zéro écouteur, les abonnés de la session sont prévenus une fois et lisent la phase `version-non-prise-en-charge`, l'écran bloquant est affiché sans « Nouvelle page », `console.error` n'est pas appelée ;
  - AC30 : session fermée pendant le chargement ; la fin de la relecture n'ouvre aucune façade (zéro écouteur, phase inchangée).
- Route : `test/route.test.ts`, table d'AC27 par `lireRoute` (les cas de la table du bloc 2, placés après `#/page/`) : chacun rend la forme `page-introuvable`, sans champ qui porte la chaîne ; fragment vide, `#`, `#/`, `#/corbeille` : l'accueil ; `#/page/<uuid>` : la page. `test/navigation.test.tsx` : à l'écran, un fragment de forme refusée affiche « Page introuvable », ne sélectionne rien, laisse la barre latérale utilisable, et la chaîne n'apparaît ni dans le document rendu ni dans `document.title`.
- Pièges connus de la saisie, chacun avec son test (repris) : Entrée valide puis le champ disparaît, la sortie du champ qui s'ensuit ne valide pas une seconde fois ; Échap ferme le champ, la sortie du champ qui s'ensuit ne renomme rien ; un titre refusé laisse le champ ouvert avec le texte saisi.
- Erreur typée : `ErreurDocument` est rattrapée autour de chaque appel d'opération et traduite par `messages.ts` (une phrase par code, `facade-fermee` compris, sans le code ni l'identifiant) ; toute autre exception n'est pas rattrapée.
- Mise à la corbeille de la page sélectionnée ou d'une de ses ancêtres : `allerA` l'accueil, après le succès de l'opération. Une disparition reçue par une mise à jour ne change pas l'adresse.
- `main.tsx` et `index.html` sont atteints par le test de `coquille.test.tsx` qui pose `<div id="racine">`, importe l'entrée par `importerEntree()` de `aides-facade.ts`, constate la coquille, puis ferme la session de l'entrée et constate zéro écouteur (F-002-AC31 ; « Levée de D-006 »). `main.tsx` est repris sans retouche.
- `SessionEspace.doc` n'a pas de lecteur dans `src/` avant F-013 ; il est livré parce que quatre critères ne se prouvent que sur le document de la session, que `demarrerSessionEspace()` construit sans paramètre : F-002-AC9 (`coquille.test.tsx`, `Y.applyUpdate(session.doc, …)` puis la page affichée), F-002-AC29 et AC30 (`session-fermeture.test.tsx`, mise à jour reçue pendant qu'un abonné lève, version non prise en charge reçue), F-002-AC31 (`coutures.test.ts` et `demarrerSession` : compte des écouteurs de `session.doc` avant et après `fermer()`). `ARCHITECTURE.md` le dira après ce bloc, avec ces tests (ADR-0007).
- Consigne au producteur, `test/navigation.test.tsx`, test « F-002-AC12 fragment modifié, bouton précédent et suivant » : instable sous charge (constaté le 2026-10-09). Après `window.history.back()`, `liensCourants()` est lu juste après un `waitFor` qui ne porte que sur le titre, et rend `[]` : le titre et les liens ne sont pas rendus dans le même tour. La seconde assertion doit attendre elle aussi, ou les deux être dans le même `waitFor`. Même relecture pour toute assertion qui suit un `history.back()` ou un `history.forward()` dans ce fichier et dans les autres tests du projet `web` : `hashchange` est asynchrone, aucune lecture synchrone du DOM ne suit une navigation sans attente sur ce qu'elle lit. Le producteur relance le fichier plusieurs fois, machine chargée, avant de rendre le bloc.
- `test/coutures.test.ts` : énumération d'AC20 (liste exacte des fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un test) ; seule la session importe `yjs` hors de la persistance ; limite 200 / 201 ; un message par code d'erreur, les sept codes ; couture d'AC31 étendue (« Levée de D-006 »).
- Révision 3, ce qui reste à ajouter à `test/coutures.test.ts` tel que le bloc 2 l'a livré (quatre sortes, aucune couture hors d'AC31) :
  - AC31, sorte « production » : `apps/web/src/espace/session-espace.ts` inscrit comme cinquième sorte, avec son test exécuté (session démarrée, phase `pret`, un écouteur ; `fermer()`, zéro). L'assertion du bloc 2 « hors de ses deux fichiers de définition, aucun fichier de `src/` n'ouvre de façade » devient « aucun autre que la session » ; `main.tsx` seul importe `demarrerSessionEspace` dans `src/` ; `session-espace.ts` seul nomme `DocumentEspace` dans `src/` ;
  - AC31, lecteurs d'un code d'erreur : table des trois fichiers, et `messages.ts` porte une entrée `facade-fermee` dont le message est une phrase française sans le code (AC15) ;
  - AC31, `fermeture.test.ts` : classement de chaque occurrence des deux noms d'ouverture (import, un appel par nom, argument d'`expect(…).toHaveLength(`, titre de test), sans modifier ce fichier ;
  - AC14 : limite 200 / 201 entre `messages.ts` et la façade ;
  - AC15 : un message par code, les sept codes ;
  - AC20 : liste exacte des fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un test ;
  - AC21 : `session.doc instanceof Y.Doc` (le reste d'AC21 est tenu par `structure.test.ts` depuis le bloc 2) ;
  - AC22 : seule la session importe `yjs` hors de la persistance.
- Révision 3, `test/aides-facade.ts` : `demarrerSession` et `importerEntree` s'y ajoutent sans toucher aux deux aides d'ouverture ; les deux tests du bloc 2 sur ce fichier (deux appels d'ouverture, chaque nom à son import et à son appel seulement) restent verts sans retouche. `fermerLesFacades()` ferme aussi les sessions suivies et garde son compte.
- Révision 3, `test/route.test.ts` prend la table de `test/aides-identifiants.ts` ; aucune seconde table.
- AC17, `coquille-echecs.test.tsx` (test de l'archive, repris) : les enregistrements de la base sont relevés avant et après l'ouverture d'un document de version 2 ; aucun enregistrement non vide n'est ajouté, l'état relu est identique octet pour octet, la persistance est `fermee`.

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

| Après le bloc | Lignes de `vitest list --filesOnly --project web` (ordre libre), chacune sous la forme `[web] apps/web/test/<nom>`                                                                                                | `vitest run`, `code=0`, sans ligne `Errors`                                          | `pnpm contrats`                                                        | `git diff --name-status HEAD~1 HEAD`                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0             | aucune                                                                                                                                                                                                            | `Test Files  6 passed (6)`, `Tests  224 passed (224)`                                | `no dependency violations found (25 modules, 43 dependencies cruised)` | cinq `A` sous `apps/web/`, `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml` : huit lignes                                               |
| 1             | aucune                                                                                                                                                                                                            | `Test Files  7 passed (7)` ; les 224 tests de F-001 plus ceux de `fermeture.test.ts` | aucune violation                                                       | `M packages/document/src/document-espace.ts`, `M packages/document/src/erreurs.ts`, `A packages/document/test/fermeture.test.ts` : trois lignes, rien d'autre |
| 2             | six : `persistance-ouverture.test.ts`, `persistance-echecs.test.ts`, `persistance-validation.test.ts`, `structure.test.ts`, `uuid-canonique.test.ts`, `coutures.test.ts`                                          | `Test Files  13 passed (13)`                                                         | aucune violation                                                       | seulement des `A` sous `apps/web/src/identifiants/`, `apps/web/src/persistance/`, `apps/web/test/`                                                            |
| 3             | treize : les six précédentes, `coquille.test.tsx`, `coquille-echecs.test.tsx`, `barre-laterale.test.tsx`, `barre-laterale-erreurs.test.tsx`, `navigation.test.tsx`, `route.test.ts`, `session-fermeture.test.tsx` | `Test Files  20 passed (20)`                                                         | aucune violation                                                       | des `A` sous `apps/web/`, des `M` limités à `apps/web/test/` ; aucun fichier de `packages/` ni de la racine                                                   |
| 4             | les treize mêmes                                                                                                                                                                                                  | `Test Files  20 passed (20)`                                                         | aucune violation                                                       | `A apps/web/e2e/aides.ts`, `A apps/web/e2e/arborescence.spec.ts`                                                                                              |

S'ajoutent, lancées à la main parce qu'aucun hook ne les lance :

- après chaque bloc : `pnpm typecheck; echo "code=$?"` (dette D-007), attendu `code=0` ;
- après le bloc 3 et après le bloc 4 : `pnpm --filter @notionlike/web build; echo "code=$?"`, attendu une ligne `✓ built in` et `code=0` (AC32 ; essai G, gabarit de la révision 1 : `✓ 74 modules transformed`, 320,01 kB) ;
- après le bloc 4 : `pnpm --filter @notionlike/web test:e2e; echo "code=$?"`, attendu `5 passed` et `code=0` (dette D-003) ; `.agents/checks/ac-couverture.sh F-002; echo "code=$?"`, attendu `code=0` : les 32 critères sont cités par un test.

Repère, sans valeur de seuil : le code de l'archive séparé de F-003, avant toute retouche, donne 104 tests dans onze fichiers pour le projet `web` (essai G) ; le prototype du bloc 1 ajoute 9 tests aux 224 de F-001 (essai D). Les retouches en ajoutent ; un total inférieur à 104 après le bloc 3 est à expliquer dans le message de fin.

Règle : chaque fichier attendu est listé, le total de fichiers est celui du tableau, aucune ligne `Errors`. Un fichier de test en plus, né d'un découpage, s'ajoute à la liste et au total et est signalé ; il n'en retire aucun. Un fichier attendu absent, un total à zéro, un fichier inattendu dans `git diff --name-status` ou un code non nul : le bloc suivant ne démarre pas. Le nombre de tests par fichier n'est pas fixé ; chaque test cite son critère dans son nom (H9).

## Correspondance critère par critère

| Critère | Bloc    | Tenu par                                                                                                                                                                                                 | Preuve                                                                                                                                                                                                                                                                         |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1     | 3       | session (espace local créé), `Application` en phase `pret` sur un document vide                                                                                                                          | `coquille.test.tsx` : base de l'espace créée, barre latérale sans page, « Nouvelle page », invitation                                                                                                                                                                          |
| AC2     | 2, 3, 4 | `ouvrirEspaceLocal` relit le même identifiant et la même base ; chaque écriture validée                                                                                                                  | `persistance-ouverture.test.ts`, `persistance-validation.test.ts` ; `coquille.test.tsx` (deux sessions successives : mêmes pages, titres, parents, ordre, corbeille absente) ; e2e                                                                                             |
| AC3     | 3       | phase `chargement` tant que la persistance est en `relecture` ; la façade n'existe pas encore                                                                                                            | `coquille.test.tsx` : état de chargement, aucun bouton ; fin sur succès, échec, échéance (`coquille-echecs.test.tsx`)                                                                                                                                                          |
| AC4     | 2, 4    | une transaction pour l'identifiant de l'espace local ; fusion Yjs à la relecture                                                                                                                         | `persistance-ouverture.test.ts` : deux ouvertures lancées ensemble, même identifiant, une page chacune, relues dans les deux ; e2e à deux onglets                                                                                                                              |
| AC5     | 3       | `creerPage("", { parent })` ; parent déplié ; saisie ouverte ; `allerA`                                                                                                                                  | `coquille.test.tsx` (racine), `barre-laterale.test.tsx` (sous-page, dépli, saisie), `navigation.test.tsx` (sélection)                                                                                                                                                          |
| AC6     | 3       | `SaisieTitre` : Entrée et sortie du champ valident, Échap annule                                                                                                                                         | `barre-laterale.test.tsx` ; zone principale et onglet : `navigation.test.tsx`                                                                                                                                                                                                  |
| AC7     | 3       | `mettreALaCorbeille` ; la lecture retire la descendance ; retour à l'accueil                                                                                                                             | `barre-laterale.test.tsx` ; `navigation.test.tsx`                                                                                                                                                                                                                              |
| AC8     | 3       | pages repliées en état d'écran ; bouton absent sans sous-page                                                                                                                                            | `barre-laterale.test.tsx` : l'état encodé du document est identique avant et après repli et dépli                                                                                                                                                                              |
| AC9     | 3       | abonnement de la session à la façade, `useSyncExternalStore`                                                                                                                                             | `coquille.test.tsx` : `Y.applyUpdate(session.doc, …)` puis nouvelle page affichée                                                                                                                                                                                              |
| AC10    | 3       | commandes natives dans l'ordre de tabulation, noms accessibles français                                                                                                                                  | `barre-laterale.test.tsx` et `navigation.test.tsx` : chaque action par `tab` et `keyboard` seuls, chaque commande retrouvée par rôle et nom                                                                                                                                    |
| AC11    | 3       | lien `#/page/<id>`, `aria-current="page"`, titre dans la zone principale                                                                                                                                 | `navigation.test.tsx`, `route.test.ts`                                                                                                                                                                                                                                         |
| AC12    | 3       | route lue au premier rendu et sur `hashchange` ; ancêtres dépliés                                                                                                                                        | `navigation.test.tsx` : ouverture avec fragment, fragment modifié, `history.back()` (chaque assertion sous attente) ; `route.test.ts`                                                                                                                                          |
| AC13    | 3       | sélection déduite de la route et de l'arborescence                                                                                                                                                       | `navigation.test.tsx` : identifiant absent, page à la corbeille ; barre latérale encore utilisable                                                                                                                                                                             |
| AC14    | 3       | refus `titre-trop-long` de la façade, champ laissé ouvert                                                                                                                                                | `barre-laterale-erreurs.test.tsx` : message qui cite 200, texte conservé, titre inchangé ; couture 200 / 201 (`coutures.test.ts`)                                                                                                                                              |
| AC15    | 3       | `ErreurDocument` rattrapée, message par code, `facade-fermee` compris ; affichage dérivé de la lecture                                                                                                   | `barre-laterale-erreurs.test.tsx` : page mise à la corbeille par une mise à jour reçue pendant la saisie, puis validation ; `coutures.test.ts` : un message par code, modules qui lisent un code énumérés                                                                      |
| AC16    | 2, 3    | parades 1 à 3 d'ADR-0008, une par cas du critère ; `enregistre` faux ; avertissement `role="alert"` ; limite acceptée par le critère : la fenêtre entre la sonde et la bibliothèque, rendue à l'échéance | `persistance-echecs.test.ts` : un test par cas (sans `indexedDB` ; ouverture refusée par une exception, par une erreur ; lecture, écriture, transaction annulée, connexion fermée) ; `coquille-echecs.test.tsx` ; `vitest run` en `code=1` sur tout rejet                      |
| AC17    | 2, 3    | `lire()` sous `try` ; phase `version-non-prise-en-charge` ; façade et persistance fermées dès le refus ; l'enregistrement vide de la bibliothèque est admis par le critère                               | `persistance-echecs.test.ts` (module, révision 3) ; `coquille-echecs.test.tsx` : écran bloquant, aucun bouton, enregistrements relevés avant et après, aucun enregistrement non vide ajouté, état relu identique octet pour octet                                              |
| AC18    | 0, 3    | enfants texte de JSX, `document.title` ; ESLint interdit le HTML brut                                                                                                                                    | `coquille.test.tsx` (barre latérale), `navigation.test.tsx` (zone principale, onglet) ; `pnpm lint`                                                                                                                                                                            |
| AC19    | 0, 3, 4 | ESLint interdit `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` dans `apps/web/src` ; contrat `web-src-liste-blanche`                                                                | `pnpm lint`, `pnpm contrats` ; `coquille.test.tsx` (aucune adresse externe dans `index.html` ni dans les styles) ; e2e : origines des requêtes, actions réseau coupé                                                                                                           |
| AC20    | 2, 3    | format V1 de `y-indexeddb`, façade de F-001                                                                                                                                                              | `persistance-ouverture.test.ts`, `persistance-validation.test.ts` : relecture à l'identique ; `coutures.test.ts` : liste exacte des fichiers de `src/` qui importent `@notionlike/document`, chacun rattaché à un test                                                         |
| AC21    | 2, 3, 4 | une seule version de `yjs` au manifeste et au verrou                                                                                                                                                     | `structure.test.ts` ; `coutures.test.ts` (`session.doc instanceof Y.Doc`) ; e2e : console                                                                                                                                                                                      |
| AC22    | 0, 2, 3 | contrats `web-y-indexeddb-confinee`, `web-document-par-ses-exports`, `web-persistance-par-son-interface` ; ESLint (`getMap` et consorts)                                                                 | `pnpm contrats`, `pnpm lint` ; `structure.test.ts` (exports de `persistance/index.ts`) ; `coutures.test.ts`                                                                                                                                                                    |
| AC23    | 4       | `playwright.config.ts` lance Vite sur `127.0.0.1:5174`                                                                                                                                                   | `e2e/arborescence.spec.ts`, lancement manuel (D-003)                                                                                                                                                                                                                           |
| AC24    | 2, 3    | échéance de 10 secondes dans le module ; destruction de l'instance de la bibliothèque, qui peut finir sa lecture (admis par le critère) sans rien appliquer ni écrire                                    | `persistance-echecs.test.ts`, horloge simulée : `relecture` à 9 999 ms, `coupee` à 10 000 ms, réponse délivrée après l'échéance, arborescence en mémoire et enregistrements inchangés ; `coquille-echecs.test.tsx`                                                             |
| AC25    | 0, 2    | `nom-de-base.ts`, seule à assembler un nom, fichier pur (`web-formes-pures`) ; type `DesignationDocument` ; ESLint interdit `notionlike:` hors de `nom-de-base.ts` et d'`espace-local.ts`                | `persistance-ouverture.test.ts` : témoin sous A, vide sous B, deux bases, base de A inchangée ; identifiant de page avec `:` refusé sans base ; `pnpm lint`, `pnpm contrats`                                                                                                   |
| AC26    | 0, 3    | garde en tête de `demarrerSessionEspace` ; ESLint interdit `Math.random`, `getRandomValues`, et `randomUUID` hors de `espace/`                                                                           | `coquille-echecs.test.tsx` : fonction retirée, écran `role="alert"`, aucune base ; fonction présente et `isSecureContext` absent : premier lancement ; `pnpm lint`                                                                                                             |
| AC27    | 0, 2, 3 | `estUuidCanonique`, seule fonction de forme, longueur d'abord ; `lireRoute` ne décode ni ne garde la chaîne refusée ; contrats `web-navigation-liste-blanche` et `web-formes-pures`                      | `uuid-canonique.test.ts` et `route.test.ts` (table de cas) ; `navigation.test.tsx` (« Page introuvable », rien de la chaîne à l'écran ni dans l'onglet)                                                                                                                        |
| AC28    | 2       | `nom-de-base.ts` applique `estUuidCanonique` à chaque identifiant, y compris à celui relu sur l'appareil                                                                                                 | `persistance-ouverture.test.ts` (table des trois identifiants, aucune base énumérée) ; `persistance-echecs.test.ts` (identifiant relu illisible)                                                                                                                               |
| AC29    | 1, 3    | diffusion sous garde et `console.error`, seul canal (ADR-0003, amendement) ; même garde pour les abonnés de la session, une seule fonction (ADR-0007)                                                    | `packages/document/test/fermeture.test.ts` (deux origines, ordre, nombre, une fois par rappel fautif) ; `session-fermeture.test.tsx` : changement du document, changement de la persistance, application utilisable                                                            |
| AC30    | 1, 3    | `DocumentEspace.fermer()`, code `facade-fermee` ; `SessionEspace.fermer()` ; façade fermée à l'entrée dans `version-non-prise-en-charge`, seule fermeture de production                                  | `fermeture.test.ts` (après fermeture, écritures refusées, fermeture depuis un rappel pour les deux origines, 50 ouvertures et fermetures) ; `session-fermeture.test.tsx` (cinq montages sous `StrictMode`, version reçue par `Y.applyUpdate`, fermeture pendant le chargement) |
| AC31    | 1, 2, 3 | exports et signatures de F-001 inchangés ; fichiers de test de F-001 non modifiés ; toute façade de test ouverte par une aide suivie                                                                     | `git diff --name-status` du bloc 1 ; `coutures.test.ts` : ouvrants énumérés, liste fermée de F-001, fermeture par le compte d'écouteurs, modules qui lisent un code ; `preparation.ts` : compte en fin de chaque test ; `structure.test.ts` (exports vus par le nom du paquet) |
| AC32    | 0, 2, 3 | aucun alias dans les configurations du bloc 0 ; lien de workspace `@notionlike/document`                                                                                                                 | `structure.test.ts` (exports, configurations sans alias, sous-chemin refusé) ; `pnpm typecheck` ; `pnpm --filter @notionlike/web build`                                                                                                                                        |

## Levée de D-006

**Décision.** Amendement F-002 de l'ADR-0003 (accepté), commité avec ce plan : `fermer()`, code `facade-fermee`, diffusion sous garde signalée par `console.error`, aucun paramètre ajouté. L'ADR-0007 dit ce que la session en fait.

**Ce que le changement de contrat touche, et le test qui énumère chaque sorte d'appelant** (grille du gate, point 9). Tout est dans `apps/web/test/coutures.test.ts`, parce qu'`import.meta.glob` y est typé (`vite/client`) et pas dans `packages/document` (`types` vide). Le test lit en `?raw` : `apps/web/src/**`, `apps/web/test/**`, `apps/web/e2e/**`, `packages/*/src/**`, `packages/*/test/**`.

| Ce qui change                                               | Appelants touchés                                        | Preuve                                              |
| ----------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| une façade ouverte doit être fermée (`fermer()`)            | tout fichier qui ouvre une façade                        | énumération des ouvrants, fermeture par le compte   |
| un rappel d'abonné qui lève ne remonte plus                 | tout abonné d'une façade : dans `src/`, la session seule | « la session seule tient une façade », plus AC29    |
| `CodeErreurDocument` reçoit `facade-fermee`                 | tout module qui lit un code d'erreur du document         | énumération des lecteurs de code, message exigé     |
| signatures de `creerDocumentEspace`, `ouvrirDocumentEspace` | aucune ne change                                         | les fichiers de test de F-001 passent sans retouche |

**Qui ouvre une façade.** L'énumération porte sur les imports, pas sur la forme de l'appel : pour ouvrir une façade, un fichier doit d'abord faire entrer l'une des deux fonctions, et c'est ce que le test relève. Il extrait de chaque fichier lu ses déclarations `import … from`, `export … from` et ses `import()` dynamiques. Un fichier est un ouvrant dans deux cas : (a) l'une de ces déclarations nomme `creerDocumentEspace` ou `ouvrirDocumentEspace`, suivi ou non de `as <autre nom>` : un import renommé, un réexport et une fonction passée ensuite en valeur sont donc vus ; (b) il prend en entier (`* as`, `export *`, `import()` dynamique) `@notionlike/document` ou l'un des deux fichiers de la sorte « définition ». Le fichier qui définit les deux fonctions est le seul ouvrant sans import. La liste des ouvrants, exacte et triée, est comparée à cinq sortes tenues dans le test ; un fichier de plus ou de moins, dans n'importe quel paquet, fait échouer le test tant qu'il n'est pas inscrit dans sa sorte.

| Sorte                                                                                                                                                                                   | Ce que le test exige                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| définition : `packages/document/src/document-espace.ts`, et `packages/document/src/index.ts` qui les réexporte                                                                          | rien : le premier définit les deux fonctions, le second est l'entrée du paquet                                                                                                                                                                                                                                                                             |
| production : `apps/web/src/espace/session-espace.ts`, seul à ce jour (ligne ajoutée au bloc 3)                                                                                          | le test l'exécute : session démarrée, attente de la phase `pret`, un écouteur ; `session.fermer()`, zéro écouteur, qui est le compte d'un `Y.Doc` neuf relevé dans le même test                                                                                                                                                                            |
| aides suivies : `apps/web/test/aides-facade.ts`, `packages/document/test/fermeture.test.ts`                                                                                             | chacun contient exactement deux appels d'ouverture, ceux de ses deux aides, et n'exporte aucune des deux fonctions ; aucun autre fichier de `apps/web/test` ni d'`apps/web/e2e` n'est un ouvrant ni n'importe `demarrerSessionEspace` : ils passent par `aides-facade.ts`. Dans `src/`, `main.tsx` est le seul fichier qui importe `demarrerSessionEspace` |
| import entier sans ouverture : `apps/web/test/structure.test.ts` (`import * as paquet`, preuve des exports d'AC32)                                                                      | le nom donné au module ne figure dans le fichier qu'à son import et comme argument d'`Object.keys(…)` : le module entier n'y sert qu'à lister ses exports                                                                                                                                                                                                  |
| « façades de test de F-001, non modifiables (AC31) » : `abonnement.test.ts`, `aides.ts`, `convergence.test.ts`, `operations.test.ts`, `robustesse.test.ts` de `packages/document/test/` | liste fermée et nommée : chaque fichier existe, importe encore l'un des deux noms et ne contient aucun appel `.fermer(` ; sinon le test échoue et la liste est à reprendre (F-002-AC31, H15)                                                                                                                                                               |

**La fermeture est prouvée par le compte d'écouteurs, pas par le texte.** Le compte se lit par `doc._observers.get("afterTransaction")?.size ?? 0`. Une façade y ajoute un écouteur à l'ouverture et l'en retire à la fermeture ; ni la session ni la persistance n'en posent sur cet événement (`y-indexeddb` écoute `update` et `destroy`).

- `aides-facade.ts` relève le compte du `Y.Doc` avant chaque ouverture et garde ce départ avec le moyen de fermer (la façade, ou la session qui la porte). `preparation.ts`, chargé avant chaque fichier de test du projet `web`, ferme en fin de chaque test tout ce que les aides ont ouvert, puis exige que `facadesEncoreOuvertes()` rende zéro : aucun `Y.Doc` suivi ne garde plus d'écouteurs qu'à son départ. Un test n'a donc pas à penser à fermer, et une fermeture qui ne retirerait pas l'écouteur fait échouer tous les tests qui ouvrent une façade (essai F : `doc.off` retiré du prototype, 69 tests en échec dans 11 fichiers).
- `fermeture.test.ts` fait de même dans son propre `afterEach`, avec ses deux aides locales : le projet `document` n'a pas de fichier de préparation, et `apps/web` ne peut pas importer un fichier de test du paquet (contrat `web-document-par-ses-exports`). Le test de couture ne peut pas exécuter ce fichier ; il vérifie qu'il n'ouvre que par ses deux aides, et la preuve par le compte tourne dans le projet `document`.
- La session créée par `main.tsx` quand un test importe l'entrée est suivie comme les autres : aucune exemption ne s'ajoute à la liste fermée de F-001, la seule que F-002-AC31 admet. `main.tsx` n'exporte rien et sa session est une constante de module ; le test ne la récupère donc pas par l'interface de production, qui reste celle de l'archive (aucun export, aucun paramètre, aucun registre). `aides-facade.ts` porte `importerEntree()` : elle pose un espion (`vi.spyOn`) sur l'export `demarrerSessionEspace` du module de la session, importe `src/main.tsx` par `import()`, exige que l'espion ait vu exactement un démarrage, inscrit la session rendue parmi les sessions suivies et la rend. Le test de `coquille.test.tsx` constate la coquille et un écouteur sur `session.doc`, appelle `session.fermer()` et constate zéro écouteur ; le compte de fin de test de `preparation.ts` s'y applique aussi. Essayé sur un prototype (essai S2 bis) : l'espion voit l'appel fait par l'entrée. Limite : un module n'est évalué qu'une fois par fichier de test, donc un seul test importe l'entrée.

**La façade n'est pas confondue avec la session ni avec la persistance.** Trois objets portent `abonner` et `fermer`. Le test ne cherche aucun de ces deux mots : un appelant de l'`abonner` d'une façade est un fichier qui tient une façade, et le test énumère ceux qui en tiennent une.

- Dans `apps/web/src`, tenir une façade entière oblige à l'ouvrir ou à nommer son type : le test exige que `session-espace.ts` soit le seul fichier de `src/` où figure le mot `DocumentEspace` seul (ni `creerDocumentEspace` ni `ouvrirDocumentEspace`). Les composants reçoivent `Pick<DocumentEspace, …>` par le type de l'état, déclaré dans ce fichier, qui ne porte ni `abonner` ni `fermer`.
- Dans les tests, toute façade vient d'une aide suivie ou de la liste fermée de F-001.
- Un test exécuté prouve la distinction : une façade et une persistance ouvertes sur le même `Y.Doc` ; `persistance.fermer()` ; `facadesEncoreOuvertes()` rend encore un ; `facade.fermer()` ; zéro. La fermeture de la persistance ne vaut donc pas fermeture de la façade, et une façade laissée ouverte est vue (essai F).

**Qui lit un code d'erreur.** Le test énumère les fichiers de `src/` du workspace, hors `packages/document`, qui nomment `CodeErreurDocument` ou lisent le champ `code` d'une erreur, et compare leur liste à une table : `interface/messages.ts` (traduit chaque code), `interface/Application.tsx` (passe le code à `messages.ts`), `espace/session-espace.ts` (ne lit que `version-non-prise-en-charge`). Il exige que `messages.ts`, seul traducteur, porte une entrée `facade-fermee`, et que son message soit une phrase française sans le code (F-002-AC15).

**Par bloc.** Bloc 2 (livré, `7a51272`) : `aides-facade.ts`, l'`afterEach` de `preparation.ts`, l'énumération des ouvrants par leurs imports sans la ligne de production, la liste fermée, le test « persistance et façade ». Bloc 3 : la ligne de production et son test exécuté, `demarrerSession`, `importerEntree`, « la session seule tient une façade », les lecteurs de code, et le classement des occurrences des deux noms dans `fermeture.test.ts` (révision 3). Mécanisme essayé sur le gabarit dans sa forme de la révision 1, où l'ouvrant était reconnu à la forme de l'appel (essai F : sept tests de couture, verts ; rouges quand une clé de la table est fausse) ; l'extraction des imports de la révision 2 n'a pas été essayée, la récupération de la session de l'entrée l'a été sur un prototype (essai S2 bis).

**`ARCHITECTURE.md`, phrases de la version de HEAD à réviser après le bloc 1** (citées par leur début, les numéros de ligne n'étant pas stables) :

- « Façade `DocumentEspace`, sept membres » devient huit, avec `fermer()` ; les deux fonctions de création ne changent pas ;
- ligne du tableau des fichiers pour `erreurs.ts` et liste « ordre des validations » : `facade-fermee`, contrôlé en premier ;
- « `abonner(rappel)` : inscrit un rappel… » et « À chaque fin de transaction… » : la diffusion est sous garde, l'exception va à `console.error` ; rien n'est inscrit après fermeture ;
- « Un rappel d'abonné qui lève n'est pas rattrapé… » est remplacée par le comportement livré ;
- « La façade ne retire jamais son écouteur… » est remplacée par la fermeture, fermeture pendant la diffusion comprise ;
- « Six fichiers de test dans `test/` » deviennent sept ;
- menaces : « un rappel d'abonné qui lève pendant `Y.applyUpdate` » sort de la liste des abus sans parade.

**Dette.** D-006 est close par le dev dans `PROJECT_LOG.md` à la livraison (spec, prérequis).

## `ARCHITECTURE.md`, bloc après bloc

Écrit par `agent-architecte-conception` à partir de la version de HEAD, après chaque commit de bloc, sur le code livré seulement.

| Après le bloc | Ce qui entre dans `ARCHITECTURE.md`                                                                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0             | rien sur le code (aucun module) ; la liste des contrats en vigueur passe à seize, et les règles ESLint d'`apps/web/src` y entrent                                                                                                                                                                                             |
| 1             | les sept révisions de « Levée de D-006 »                                                                                                                                                                                                                                                                                      |
| 2             | section `apps/web` : modules `identifiants/` et `persistance/`, leurs dépendances, flux d'enregistrement et de relecture ; l. 15 (« Aucun autre paquet ne l'importe… ») : le paquet est importé par son nom ; menaces : identifiant forgé dans un nom de base, espace relu illisible                                          |
| 3             | modules `espace/`, `navigation/`, `interface/`, entrée ; `SessionEspace.doc`, sans lecteur de production, avec les critères et les tests qui le justifient ; flux d'une mise à jour reçue jusqu'à l'écran ; menaces : fragment d'adresse forgé ou géant, titre piégé, ouverture hors contexte sécurisé, exception d'un abonné |
| 4             | ce que le bout en bout couvre et ce qu'aucun hook ne lance (D-003)                                                                                                                                                                                                                                                            |

## Stratégie de test

- Vitest, projet `web`, environnement jsdom. `test/preparation.ts` donne à chaque test un `IDBFactory` neuf de `fake-indexeddb` et remet le fragment à zéro. La configuration restaure les espions et les globales simulées après chaque test (`restoreMocks`, `unstubGlobals`).
- Les tests de composants rendent `<Application session={demarrerSession()} />` sous `StrictMode`, `demarrerSession` étant l'aide de `test/aides-facade.ts` (aucun test n'importe `demarrerSessionEspace`), et agissent par `@testing-library/user-event` ; ils retrouvent les éléments par rôle et nom accessible, jamais par classe. Chaque session démarrée, celle de l'entrée comprise, est suivie par `aides-facade.ts` et fermée en fin de test.
- Horloge simulée : `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })`. Simuler toute l'horloge figerait `fake-indexeddb`, qui s'ordonnance par `setImmediate`.
- Échecs d'IndexedDB : `indexedDB` retiré de `globalThis` ; `indexedDB.open` remplacé par une demande qui échoue, qui lève, ou qui ne répond jamais puis tard ; écriture et lecture en échec par une vraie erreur de contrainte de `fake-indexeddb`.
- Contexte non sécurisé : `vi.stubGlobal("crypto", {})` (essai T2).
- Exception d'un abonné : `vi.spyOn(console, "error")`, rendue muette dans le test.
- Façades et sessions : ouvertes par `test/aides-facade.ts` seulement (`ouvrirFacade`, `creerFacade`, `demarrerSession`, `importerEntree`) ; `preparation.ts` les ferme en fin de test et exige le compte d'écouteurs du départ (« Levée de D-006 »).
- Playwright sur Chromium, serveur de développement de Vite lancé par `webServer` sur le port 5174 (5173 reste libre pour `pnpm dev`), `reuseExistingServer: false`.

Reste au bout en bout seulement, donc hors des hooks : AC23 ; le rechargement réel d'AC2 ; deux onglets réels (AC4) ; l'absence de requête vers une autre origine observée à l'exécution et les actions réseau coupé (AC19) ; la console du navigateur (AC21). La construction (AC32) et la vérification des types sont hors des hooks aussi.

## États passagers

| Lecture                       | Ce qui peut arriver                                                           | Réponse                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `indexedDB`                   | absent                                                                        | `coupee` au retour de l'appel ; bibliothèque jamais construite                                                          |
| ouverture d'une base          | refus, exception, aucune réponse, réponse après 10 secondes                   | sonde, échéance ; réponse tardive sans effet                                                                            |
| relecture                     | échec de lecture ; contenu partiel                                            | garde en capture ; la bibliothèque applique tout ce qui est stocké en une transaction, la façade n'est ouverte qu'après |
| identifiant de l'espace local | deux onglets ensemble ; base de l'appareil inutilisable ; valeur illisible    | une transaction ; persistance `coupee`, document en mémoire, aucune base d'espace                                       |
| fragment de l'adresse         | vide, de forme inconnue, identifiant qui n'est pas un UUID canonique, géant   | accueil, ou « Page introuvable » sans rien garder de la chaîne                                                          |
| `lire()`                      | version non prise en charge, à l'ouverture ou plus tard                       | `try` dans la session, phase dédiée, façade et persistance fermées, y compris depuis le rappel de la façade             |
| arborescence                  | page absente puis revenue, filles à la racine entre-temps (entrée incomplète) | affichage dérivé au rendu, aucun effet correctif ; l'adresse n'est pas modifiée                                         |
| page sélectionnée             | absente, à la corbeille, jamais existante                                     | « Page introuvable », barre latérale utilisable                                                                         |
| saisie en cours               | page retirée ou mise à la corbeille pendant la saisie                         | l'opération lève, message en français, rien n'est perdu de la lecture                                                   |
| écriture                      | échec, quota, connexion fermée, rechargement immédiat                         | garde `error`, `abort`, `close` ; `coupee`, avertissement ; chaque écriture validée par `commit()`                      |
| abonné                        | lève pendant une diffusion                                                    | les autres sont prévenus ; l'exception est signalée par `console.error`, une fois                                       |
| `crypto.randomUUID`           | absente                                                                       | écran d'explication, rien n'est créé                                                                                    |

## Règles de dépendances

Les sept contrats de HEAD sont conservés tels quels (`pas-de-cycle`, `domaine-pur`, `paquets-sans-apps`, `apps-isolees`, `document-sans-reseau-ni-base`, `document-yjs-seulement`, `document-coeur-pur`). Neuf contrats sont ajoutés, tous en liste blanche ou en confinement, ce qui porte la liste à seize :

| Contrat                             | Règle                                                                                                                                                                                | Critère    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `web-y-indexeddb-confinee`          | dans `apps/web` (tests et bout en bout compris), seul `src/persistance/indexeddb.ts` importe `y-indexeddb`                                                                           | AC22       |
| `web-document-par-ses-exports`      | `apps/web` (tests compris) n'atteint `packages/document` que par `src/index.ts`, y compris par un sous-chemin du nom du paquet                                                       | AC22, AC32 |
| `web-persistance-par-son-interface` | hors du module, seul `src/persistance/index.ts` est importable (tests compris)                                                                                                       | AC22       |
| `web-identifiants-pur`              | `src/identifiants/` n'importe que lui-même                                                                                                                                           | AC27       |
| `web-persistance-liste-blanche`     | `src/persistance/` n'importe que lui-même, `src/identifiants/`, `yjs` et `y-indexeddb`                                                                                               | ADR-0008   |
| `web-espace-liste-blanche`          | `src/espace/` n'importe que lui-même, `persistance/index.ts`, l'entrée de `@notionlike/document` et `yjs`                                                                            | ADR-0007   |
| `web-navigation-liste-blanche`      | `src/navigation/` n'importe que lui-même et `src/identifiants/`                                                                                                                      | AC27       |
| `web-formes-pures`                  | `src/navigation/route.ts` et `src/persistance/nom-de-base.ts` n'importent que `src/identifiants/` : ni un fichier de leur propre module, ni aucun paquet                             | AC25, AC27 |
| `web-src-liste-blanche`             | le reste de `src/` (interface, entrée, tout dossier à venir) n'importe que `src/` hors `persistance/` et `identifiants/`, l'entrée de `@notionlike/document`, `react` et `react-dom` | AC19, AC22 |

Une liste blanche refuse sans énumération tout le reste : autre paquet npm, dépendance de développement, module de Node, import non résolu. Chaque contrat est prouvé par une violation jetable sur le texte du bloc 0 (essai C, 25 cas). Par rapport à la première version de ce plan : `web-formes-pures` est nouveau ; `web-src-liste-blanche` ne s'applique plus à `navigation/` ni à `identifiants/`, qui ont leur propre liste, et refuse `identifiants/` comme cible, de sorte qu'`interface/` ne peut plus l'importer.

**Un `import type` est vu par les contrats.** L'option `tsPreCompilationDeps: true` de `.dependency-cruiser.cjs`, en place à HEAD et non modifiée par le bloc 0, fait analyser les imports avant que TypeScript n'efface ceux qui ne portent que des types. Essayé (essai C) : `import type * as Y from "yjs"` dans `src/interface/` déclenche `web-src-liste-blanche` (cas 23), dans `nom-de-base.ts` il déclenche `web-formes-pures` (cas 22), et un `import type` de `persistance/nom-de-base.ts` depuis `src/interface/` déclenche `web-persistance-par-son-interface` et `web-src-liste-blanche` (cas 24).

**Ce que les contrats ne voient pas : la lecture comme texte.** `apps/web/test/coutures.test.ts` lit par `import.meta.glob` en `?raw` des fichiers internes d'autres paquets : `packages/*/src/**` et `packages/*/test/**` (« Levée de D-006 »), en plus d'`apps/web`. `web-document-par-ses-exports` ne le voit pas : le motif d'un `import.meta.glob` n'est pas un import pour `dependency-cruiser`, qui ne suit que les imports écrits. C'est une exception nommée, admise pour trois raisons :

- ce qui est lu est une chaîne : aucun module de `packages/document` n'est évalué, aucun symbole interne n'entre dans `apps/web`, et le test n'en tire que des noms de fichiers et des déclarations d'import ; rien de ce que le contrat protège (dépendre d'un fichier interne du paquet) n'est atteint ;
- F-002-AC31 demande que la couture énumère tous les appelants, tests de `packages/*` compris, et `import.meta.glob` n'est typé que dans `apps/web` (`vite/client`) : le test ne peut pas vivre dans `packages/document` ;
- l'exception est bornée à ce fichier : `structure.test.ts` lit de même des manifestes, le verrou et des configurations (AC21, AC32), jamais un fichier de `src/` ou de `test/` d'un autre paquet. Un autre test qui lirait ainsi l'intérieur d'un paquet repasse par la conception ; aucun contrôle ne le refuse, c'est la relecture qui le tient.

Barrières ESLint ajoutées sur `apps/web/src/**` (chacune prouvée par une violation jetable, essai L) :

| Interdit                                                                                                                                                                                                              | Exception                                                   | Critère            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| globales `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` ; propriété `sendBeacon`                                                                                                                               | aucune                                                      | AC19               |
| globale `indexedDB` (y compris `window.indexedDB`, `globalThis.indexedDB`)                                                                                                                                            | `src/persistance/**`                                        | AC22, ADR-0008     |
| globales `localStorage`, `sessionStorage`                                                                                                                                                                             | aucune                                                      | ADR-0008           |
| littéral ou gabarit contenant `notionlike:`                                                                                                                                                                           | `persistance/nom-de-base.ts`, `persistance/espace-local.ts` | AC25               |
| `Math.random`, `getRandomValues`                                                                                                                                                                                      | aucune                                                      | AC26               |
| `randomUUID`                                                                                                                                                                                                          | `src/espace/**`                                             | AC26               |
| globales `window`, `self`, `globalThis`, `document`, `location`, `history`, `navigator`, `crypto`, `indexedDB`, dans les trois fichiers purs (`identifiants/**`, `navigation/route.ts`, `persistance/nom-de-base.ts`) | aucune                                                      | ADR-0007, ADR-0008 |
| `pushState`, `replaceState`                                                                                                                                                                                           | aucune                                                      | H4                 |
| `innerHTML`, `outerHTML`, `insertAdjacentHTML`, attribut `dangerouslySetInnerHTML`                                                                                                                                    | aucune                                                      | AC18               |
| `transact`, `getMap`, `getArray`, `getText`, `getXmlFragment`, `getXmlElement`                                                                                                                                        | aucune                                                      | AC22, ADR-0007     |

La dernière ligne est la barrière de pureté des trois fichiers de calcul : un bloc ESLint placé après les autres, qui y remplace la règle des globales par la liste la plus large. `nom-de-base.ts` garde le droit d'écrire `notionlike:`, qu'il tient du bloc propre à `nom-de-base.ts` et à `espace-local.ts`, et perd celui de nommer `indexedDB` (essais L et S2 bis). Les autres fichiers de `persistance/` nomment `indexedDB` mais n'écrivent pas `notionlike:` : l'unicité de la fonction de nommage à l'intérieur du module (F-002-AC25, AC28) ne tient plus à la relecture. `espace-local.ts` garde l'exception pour une seule constante, le nom de la base de l'appareil, qui n'est pas une base de document (ADR-0008).

Ces règles ne visent que `src/` : les tests écrivent dans un `Y.Doc` (version 2 pour AC17), lisent IndexedDB et `doc._observers` pour constater. `checkGlobalObject` ne voit `window.indexedDB` que si `window` est déclarée comme globale ; le bloc ESLint la déclare, avec `self`. `console.error` reste permis (`no-console` l'admet déjà à HEAD).

## Ce que F-004 remplacera

F-004 (brouillon, `specs/F-004.md`, F-004-AC24 à AC53) vient après F-003. Elle remplace les trois boutons d'une rangée par deux boutons et un menu « ⋯ » dont les entrées gardent les noms « Renommer », « Ajouter une sous-page », « Mettre à la corbeille » et doivent produire l'effet de F-002 « par la même fonction » (F-004-AC25 à AC27) ; elle ajoute des raccourcis, un tiroir sur petit écran, des jetons de style. F-002 ne réalise rien de cela. Elle s'interdit seulement quatre choses qui rendraient ce remplacement coûteux :

1. **Aucune logique d'opération dans un composant de rangée.** `RangeePage` reçoit ses six fonctions d'action en propriété (`ActionsBarre`, déjà ainsi dans l'archive) ; créer, renommer, mettre à la corbeille, gérer le focus et l'adresse restent dans `Application`. Le menu de F-004 appellera les mêmes fonctions.
2. **Une seule aide de test pour atteindre une action de rangée.** Les tests de F-002 ne cherchent pas « Renommer « T » » par rôle à chaque usage : ils passent par une fonction de `test/aides-coquille.tsx`, et de même dans `e2e/`. F-004 changera le chemin dans ces aides. Seul le test d'AC10, qui fixe que chaque commande est native et nommée, cite les rôles : F-004 le réécrira avec son critère.
3. **Aucun test ne lit une classe CSS, un texte visible de bouton ni la structure du DOM** d'une rangée : rôles et noms accessibles seulement. Les textes visibles « Renommer », « Sous-page », « Corbeille » des boutons ne sont fixés par aucun test ; F-004 les retire (F-004-AC25).
4. **Aucune règle de dépendance sur la forme de l'interface.** `interface/` reste un seul dossier sous `web-src-liste-blanche` ; F-004 y range ses composants, ou crée un dossier, sans toucher aux contrats de F-002.

La barre d'outils permanente que F-004 rend flottante appartient à F-003 : F-002 n'en livre aucune.

## Points de la spec à connaître

Aucun critère n'est jugé irréalisable, et aucun point n'attend plus de décision : les six critères que la première version de ce plan lisait contre leur lettre ont été réécrits (H15, commit `3a1253a`), et ce plan les applique tels qu'ils sont. Ce qui suit dit seulement où chacun est tenu.

1. **AC17** admet l'enregistrement vide de deux octets que `y-indexeddb` écrit à chaque ouverture, et exige : persistance fermée dès le refus, aucun enregistrement non vide ajouté, état relu identique octet pour octet, enregistrements relevés avant et après (essai E10 ; test de l'archive repris au bloc 3).
2. **AC16** nomme trois cas, chacun avec son test, et accepte une limite : une ouverture qui réussit pour la sonde du module puis échoue aussitôt pour la bibliothèque. Aucun test ne la couvre ; l'échéance d'AC24 rend la main (ADR-0008).
3. **AC24** admet que la bibliothèque finisse la lecture lancée avant l'échéance, et exige qu'une réponse tardive ne change ni l'arborescence ni la base (essai E9 ; tests de l'archive repris au bloc 2).
4. **AC29** fixe le canal : `console.error`, une fois par rappel fautif, sans paramètre ajouté ; la session garde ses abonnés de la même façon (ADR-0003, ADR-0007).
5. **AC30** fixe `fermer()`, la fermeture depuis un rappel, la lecture et `abonner` après fermeture, le code `facade-fermee`, et admet que la seule fermeture de production soit l'entrée dans « version non prise en charge » : `SessionEspace.fermer()` est livrée pour F-014 et atteinte par les tests.
6. **AC31** exempte de fermeture cinq fichiers de test de F-001 par une liste fermée, exige la preuve par le compte d'écouteurs et l'énumération des modules qui traduisent un code (« Levée de D-006 »).

Trois précisions qui ne touchent aucun critère :

- **`creerDocumentEspace` n'est pas appelée par l'application** (ADR-0007). La clause d'AC21 sur le document qu'elle fournit est tenue par un test ; celle qui compte à l'exécution, par `session.doc instanceof Y.Doc`.
- **La limite de 200 caractères n'est pas exportée par `@notionlike/document`** : `messages.ts` en garde une constante, tenue par un test de couture.
- **Emplacement de l'identifiant de l'espace local** (H1 ne le dit pas) : la base `notionlike:appareil` (ADR-0008). Elle apparaît dans l'énumération des bases de l'appareil.

Le prérequis « ajout d'`apps/*` aux projets du `vitest.config.ts` de la racine » est déjà en place à HEAD ; ce fichier et le `package.json` de la racine ne changent pas. `packages/document/package.json` non plus.

## Bloc 0 (dev)

Huit fichiers, pour F-002 seule : cinq créés, deux fichiers protégés modifiés, le verrou régénéré.

| Fichier                         | Nature           | Contenu                                                                                                             |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`         | nouveau, réservé | scripts `dev`, `build`, `test`, `test:e2e`, `lint`, `format`, `typecheck` ; cinq dépendances, onze de développement |
| `apps/web/vitest.config.ts`     | nouveau, protégé | projet `web`, jsdom, `test/**/*.test.{ts,tsx}`, fichier de préparation                                              |
| `apps/web/tsconfig.json`        | nouveau, partagé | DOM, `react-jsx`, types de `vite/client` ; aucun `paths`                                                            |
| `apps/web/vite.config.ts`       | nouveau, partagé | greffon React, serveur de développement sur `127.0.0.1` seulement ; aucun `alias`, aucun bloc `preview`             |
| `apps/web/playwright.config.ts` | nouveau, protégé | Chromium, `webServer` sur le port 5174                                                                              |
| `.dependency-cruiser.cjs`       | modifié, protégé | neuf contrats ajoutés en fin de liste                                                                               |
| `eslint.config.mjs`             | modifié, protégé | constantes et cinq blocs pour `apps/web/src`                                                                        |
| `pnpm-lock.yaml`                | modifié, partagé | par `pnpm install`                                                                                                  |

Où le lancer : à la racine du dépôt principal, sur la branche `F-002`, **après la mise à l'abri**. Le script part des fichiers de HEAD : il refuse d'écrire si l'un des cinq fichiers à créer existe, si `apps/web/src`, `test`, `e2e` ou `index.html` existent, ou si `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml` ou `packages/` portent une modification non commitée. C'est ce qui sépare F-002 de F-003 pour les fichiers protégés : la version F-002 seule n'est pas extraite de l'arbre mêlé, elle est construite sur HEAD, et la part de F-003 reste entière sur la branche d'archive (essai S1 : les fichiers de l'archive sont identiques à ceux de l'arbre, à l'octet près).

```bash
sed -n '/^# F-002 BLOC 0 DEBUT$/,/^# F-002 BLOC 0 FIN$/p' docs/decisions/F-002-conception.md | zsh
```

Le script vérifie tout avant d'écrire : sur `ARRET`, rien n'est écrit ; relancé après un succès, il s'arrête sans rien écrire. Sa dernière ligne, `bloc 0 : code=0`, dit que l'installation et les cinq contrôles ont tous fini en code 0. Le dev commite alors les huit fichiers en un commit `Agent: dev`, `Feature: F-002`. Si un contrôle est rouge pour une raison étrangère au bloc 0, les fichiers sont écrits et l'installation est faite : il reste à relancer les contrôles, pas le script.

Le texte exact de chaque fichier est dans le script : les cinq fichiers créés sont les valeurs du dictionnaire `NOUVEAUX` (seule la version de `yjs` est lue dans `packages/document/package.json`, pour rester à la même version exacte) ; les fragments insérés sont `CONTRATS_AJOUTES`, `ESLINT_CONSTANTES` et `ESLINT_BLOCS`. Les repères d'insertion sont la fin de la liste `forbidden`, le début de l'appel `tseslint.config` et le bloc `**/*.cjs` ; la conception de F-008 a essayé la composition de son bloc 0 avec une version antérieure de celui-ci (sept contrats), dans les deux ordres ; elle ne l'a pas été avec celle-ci.

**Ce texte cesse de faire foi une fois commité.** Le script sert une fois. Dès que le dev a commité le bloc 0, la référence des huit fichiers est le dépôt : `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/playwright.config.ts`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml`, et leur histoire par `git log`. Ce plan n'est pas tenu à jour de leurs évolutions (F-003 y ajoutera ses contrats et ses dépendances) ; `ARCHITECTURE.md`, section « Configuration racine », décrit les contrats et les règles ESLint en vigueur, à partir du bloc 0. Le script lui-même refuse de tourner une seconde fois.

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
    "vitest": "5.0.3"
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
      name: "web-formes-pures",
      severity: "error",
      comment:
        "ADR-0007, ADR-0008 : la forme des routes et le nom des bases sont des calculs purs ; ces deux fichiers n'importent que le contrôle de forme des identifiants (ni leur propre module, ni aucun paquet).",
      from: { path: "^apps/web/src/(navigation/route|persistance/nom-de-base)\\.ts$" },
      to: { pathNot: "^apps/web/src/identifiants/" },
    },
    {
      name: "web-src-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : hors persistance, espace, navigation et identifiants, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
      from: {
        path: "^apps/web/src/",
        pathNot: "^apps/web/src/(persistance|espace|navigation|identifiants)/",
      },
      to: {
        pathNot: [
          "^apps/web/src/(?!(persistance|identifiants)/)",
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
const GLOBALES_D_ENTREE_SORTIE_WEB = [
  "window",
  "self",
  "globalThis",
  "document",
  "location",
  "history",
  "navigator",
  "crypto",
].map((name) => ({
  name,
  message: "ADR-0007, ADR-0008 : ce fichier est un calcul pur, sans DOM, adresse ni stockage.",
}));
const FICHIERS_PURS_WEB = [
  "apps/web/src/identifiants/**",
  "apps/web/src/navigation/route.ts",
  "apps/web/src/persistance/nom-de-base.ts",
];
const FICHIERS_NOM_DE_BASE_WEB = [
  "apps/web/src/persistance/nom-de-base.ts",
  "apps/web/src/persistance/espace-local.ts",
];
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
  message: "F-002-AC25 : seuls nom-de-base.ts et espace-local.ts écrivent un nom de base.",
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
    },
  },
  {
    files: FICHIERS_NOM_DE_BASE_WEB,
    rules: {
      "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT],
    },
  },
  {
    files: ["apps/web/src/espace/**"],
    rules: {
      "no-restricted-properties": ["error", ...PROPRIETES_INTERDITES_WEB],
    },
  },
  {
    files: FICHIERS_PURS_WEB,
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: [...GLOBALES_INTERDITES_WEB, GLOBALE_INDEXEDDB, ...GLOBALES_D_ENTREE_SORTIE_WEB],
          checkGlobalObject: true,
        },
      ],
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
- Versions : celles de la spec (veille du 2026-10-08), toutes exactes, toutes publiées depuis au moins 7 jours ; pnpm les a toutes acceptées à l'essai, `vite@8.3.2` comprise. `vitest` est en `5.0.3` exact, la version que la spec fixe ; le manifeste de la racine le demande en `^5.0.3` (`git show HEAD:package.json`) et le verrou résout `5.0.3` pour les deux (essai S2 : une seule entrée `vitest@5.0.3`).
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

Preuve des barrières, à rejouer si le dev le souhaite après le bloc 0 (chaque fichier jetable est supprimé après sa commande). `depcruise` sort avec le nombre d'erreurs pour code. Ces commandes ont été rejouées telles quelles dans le clone de l'essai S3, après le bloc 0 de cette révision : codes 2, 1, 1, puis 2 et 1, et l'arbre du bloc 0 retrouvé à la fin. La cinquième, ajoutée par la révision 2, a été jouée sur le gabarit de la révision 2 : code 1 (essai S2 bis).

```bash
mkdir -p apps/web/src/interface apps/web/src/navigation apps/web/test
# 1. y-indexeddb hors de son fichier : attendu « error web-y-indexeddb-confinee » et « error web-src-liste-blanche », code=2
printf '%s\n' 'import { IndexeddbPersistence } from "y-indexeddb"; export const x = IndexeddbPersistence;' > apps/web/src/interface/jetable.ts
pnpm contrats; echo "code=$?"; rm apps/web/src/interface/jetable.ts
# 2. fichier interne de packages/document depuis un test : attendu « error web-document-par-ses-exports », code=1
printf '%s\n' 'import { lireArbre } from "../../../packages/document/src/arbre.ts"; export const x = lireArbre;' > apps/web/test/jetable.test.ts
pnpm contrats; echo "code=$?"; rm apps/web/test/jetable.test.ts
# 3. nom de base et réseau hors du module de persistance : attendu deux erreurs (no-restricted-syntax, no-restricted-globals), code=1
printf '%s\n' 'export const x = ["notionlike:page:x", typeof fetch];' > apps/web/src/interface/jetable.ts
pnpm lint; echo "code=$?"; rm apps/web/src/interface/jetable.ts
# 4. fichier pur qui importe un paquet et lit l'adresse : attendu « error web-formes-pures » et « error web-navigation-liste-blanche », code=2 ; puis une erreur no-restricted-globals, code=1
printf '%s\n' 'import { useState } from "react"; export const x = [useState, location.hash];' > apps/web/src/navigation/route.ts
pnpm contrats; echo "code=$?"; pnpm lint; echo "code=$?"; rm apps/web/src/navigation/route.ts
# 5. nom de base dans un autre fichier du module de persistance : attendu une erreur no-restricted-syntax, code=1
mkdir -p apps/web/src/persistance
printf '%s\n' 'export const x = "notionlike:appareil";' > apps/web/src/persistance/index.ts
pnpm lint; echo "code=$?"; rm apps/web/src/persistance/index.ts; rmdir apps/web/src/persistance
rmdir apps/web/src/interface apps/web/src/navigation apps/web/src apps/web/test
```

## Essais

Faits le 2026-10-08 dans le dossier temporaire de la session, hors du dépôt, Node 26.11.0, pnpm 12.10.1. Rien n'a été installé ni écrit dans le dépôt hors des quatre documents de cette conception. Trois lieux :

- **le clone** : `git clone` du dépôt principal, branche `F-002`, dans lequel les chemins modifiés ou non suivis de l'arbre ont été recopiés, `core.hooksPath` réglé sur `.githooks`, puis `pnpm install --frozen-lockfile --offline` ;
- **le gabarit de la première version** de ce plan : `git archive HEAD` du commit d'alors, déplié dans un dossier vide ;
- **le gabarit de la révision 1** : `git archive HEAD` du commit `dc82732`, déplié dans un dossier vide (tous les fichiers suivis, `apps/.gitkeep`, `packages/.gitkeep`, `.agents/`, `.githooks/` compris), `git init`, un commit, `pnpm install --frozen-lockfile --offline`. Avant tout ajout : `no dependency violations found (19 modules, 39 dependencies cruised)`.

- **le gabarit de la révision 2** : `git archive HEAD` du commit `e041461`, déplié dans un dossier vide (`apps/.gitkeep` et `packages/.gitkeep` compris), `git init`, un commit, `pnpm install --frozen-lockfile --offline`. Avant tout ajout : `no dependency violations found (19 modules, 39 dependencies cruised)`. Essai du 2026-10-09 (S2 bis).

Rejoués par la révision 1, sur son gabarit : S2 (bloc 0), C (contrats), L (ESLint), D (façade), F (session et test de couture), les mesures de G. Non rejoués, parce que rien de ce qu'ils éprouvent n'a changé : S1, la mise à l'abri de S3, X, et les essais E, R, T, B du plan précédent.

Les essais D, F, X et G portent sur des prototypes ou sur le code de l'archive recopié dans un gabarit. Ils ne sont pas le code de la feature : le producteur écrit ou reprend le sien.

### S1 — mise à l'abri, dans le clone, hooks actifs (première forme du script)

Essai de la première version de ce plan, non rejoué. Clone portant les 73 chemins que l'arbre comptait alors, trois documents de cette conception compris, à l'état non suivi (ils sont commités depuis : l'arbre en compte 70). Les hooks `pre-commit` (formatage, lint, secrets sur le contenu indexé) et `commit-msg` (trailers, périmètre) ont tourné sur le commit d'archive :

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

### S2 — script du bloc 0 (révision 1)

Extrait de ce document par la commande `sed … | zsh` donnée plus haut, et lancé sur le gabarit de la révision 1. Sortie (lignes vides, barre de progression, lignes de durée et avertissements `ExperimentalWarning: localStorage is not available` de Node 26 retirés ; ces avertissements existent à HEAD sans F-002) :

```text
cree     apps/web/package.json
cree     apps/web/vitest.config.ts
cree     apps/web/tsconfig.json
cree     apps/web/vite.config.ts
cree     apps/web/playwright.config.ts
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
Scope: all 3 workspace projects
✓ Lockfile passes supply-chain policies (verified 6h ago)
Packages: +66 -3
Progress: resolved 66, reused 195, downloaded 0, added 66, done
Done in 212ms using pnpm v12.10.1
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

- un premier passage a fini en `bloc 0 : code=1` : Prettier refusait la mise en forme d'un tableau du bloc ESLint ajouté par cette révision. Le texte a été corrigé dans ce document, le gabarit ramené à son commit de départ, et le script relancé : c'est la sortie ci-dessus ;
- `git status --porcelain` après le script : `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml`, `?? apps/web/` ;
- `.dependency-cruiser.cjs` : seize règles ; `pnpm why yjs -r` : `Found 1 version of yjs` ; `apps/web/package.json` porte `"vitest": "5.0.3"` ; le verrou a deux demandes (`^5.0.3` à la racine, `5.0.3` pour `apps/web`) et une seule version résolue, `vitest@5.0.3` ;
- même script dans le clone de l'essai S3, ramené à l'arbre de HEAD (l'état que laisse la mise à l'abri) : mêmes sept lignes, mêmes totaux, `bloc 0 : code=0` ; les huit fichiers du clone et du gabarit sont identiques, à l'octet près (`cmp`), verrou compris ;
- relance du script dans le clone : `ARRET : apps/web/package.json existe deja, rien n'est ecrit ; l'arbre doit etre celui de HEAD (mise a l'abri faite)`, puis `bloc 0 : code=1` ;
- le texte du script extrait du document final est identique, par `cmp`, à celui qui a tourné ;
- projet `web` sans test (constat de la première version, non rejoué) : `vitest list --filesOnly --project web` n'imprime rien, `code=0` ; `vitest run --project web` : `No test files found, exiting with code 1`.

### S2 bis — script du bloc 0 (révision 2), exception `notionlike:`, session de l'entrée

Le 2026-10-09, sur le gabarit de la révision 2. Script extrait de ce document par la commande `sed … | zsh`. Sortie (mêmes lignes retirées qu'en S2) :

```text
cree     apps/web/package.json
cree     apps/web/vitest.config.ts
cree     apps/web/tsconfig.json
cree     apps/web/vite.config.ts
cree     apps/web/playwright.config.ts
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
Scope: all 3 workspace projects
✓ Lockfile passes supply-chain policies (verified 15h ago)
Packages: +66 -3
Progress: resolved 66, reused 194, downloaded 1, added 66, done
Done in 588ms using pnpm v12.10.1
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

- `git status --porcelain` après le script : `M .dependency-cruiser.cjs`, `M eslint.config.mjs`, `M pnpm-lock.yaml`, `?? apps/web/` ;
- le texte du script extrait du document commité est identique, par `cmp`, à celui qui a tourné ;
- violations jetables, chacune supprimée ensuite :
  - `src/persistance/indexeddb.ts` avec un littéral `notionlike:`, un gabarit `notionlike:` et `typeof indexedDB` : `pnpm lint` en `code=1`, `2 problems (2 errors, 0 warnings)`, deux `no-restricted-syntax` (« F-002-AC25 : seuls nom-de-base.ts et espace-local.ts écrivent un nom de base ») ; `indexedDB` n'est pas signalé ;
  - `src/persistance/index.ts` avec `"notionlike:appareil"` (commande 5 des preuves) : `1 problem (1 error, 0 warnings)`, `code=1` ;
  - `src/persistance/nom-de-base.ts` et `src/persistance/espace-local.ts` avec le même littéral et le même gabarit : aucune erreur, `code=0` ;
  - `src/persistance/nom-de-base.ts` avec `typeof indexedDB` : une erreur `no-restricted-globals` (la pureté tient) ; `dangerouslySetInnerHTML` dans un fichier `espace-local.tsx` : une erreur `no-restricted-syntax` (le HTML brut reste interdit dans les fichiers exemptés) ;
- session de l'entrée, prototype de trois fichiers posé sur ce gabarit après le bloc 0 (un `session-espace.ts` et un `main.tsx` réduits, sans export ; `importerEntree` dans `test/aides-facade.ts`, par `vi.spyOn` sur l'export du module de la session puis `import()` de l'entrée) : l'espion voit un démarrage, le test récupère la session et la ferme, `Tests  1 passed (1)`, `pnpm typecheck` et ESLint sans erreur, `pnpm contrats` sans violation. Le prototype n'ouvre ni façade ni `Y.Doc` : le compte d'écouteurs sur la vraie session n'a pas été rejoué.

Non rejoués par la révision 2 : les essais C, L, D, F, G et X, qui portent sur le texte de la révision 1 ; seule la ligne de L sur `src/persistance/jetable.ts` (« `notionlike:` admis ») ne vaut plus, remplacée par les cas ci-dessus.

### S3 — les deux scripts à la suite (première version de ce plan)

La mise à l'abri n'a pas changé depuis : son texte extrait de ce document est identique, par `cmp`, à celui qui a tourné ici. Le bloc 0 qui a tourné ici est celui de la première version (huit contrats) ; celui de cette révision a été relancé dans ce même clone (essai S2).

Second clone, fait après l'écriture de la première version de ce document : les 74 chemins modifiés ou non suivis de l'arbre y sont recopiés (les 73 du relevé et l'ADR-0003 amendé), puis les quatre documents de cette conception y sont commités avec les trailers de l'agent, hooks actifs (`All matched files use Prettier code style!`, périmètre accepté). Restent 70 chemins. Les deux scripts sont alors extraits du document commité par les deux commandes `sed … | zsh` de ce plan, l'un après l'autre :

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

### C — contrats, par violations jetables (gabarit de la révision 1, texte du bloc 0)

Sur le gabarit après le bloc 0, avec le code de l'essai G et trois prototypes (`identifiants/uuid-canonique.ts`, `route.ts` et `nom-de-base.ts` qui l'importent). Un cas à la fois : un fichier jetable, ou une ligne ajoutée en tête de `route.ts`, `nom-de-base.ts` ou `fragment.ts` pour les cas 19 à 22 et 25 ; `depcruise` lancé, règles en erreur et code de sortie relevés (le code est le nombre d'erreurs), fichier supprimé ou rétabli. À la fin : `no dependency violations found (71 modules, 173 dependencies cruised)`.

| Cas | Import jetable                                                        | Règle déclenchée                                             | Code |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | `react` depuis `src/identifiants/`                                    | `web-identifiants-pur`                                       | 1    |
| 2   | `navigation/route.ts` depuis `src/identifiants/`                      | `web-identifiants-pur`                                       | 1    |
| 3   | `espace/session-espace.ts` depuis `src/navigation/`                   | `web-navigation-liste-blanche`                               | 1    |
| 4   | `react` depuis `src/navigation/`                                      | `web-navigation-liste-blanche`                               | 1    |
| 5   | `navigation/route.ts` depuis `src/persistance/`                       | `web-persistance-liste-blanche`                              | 1    |
| 6   | `@notionlike/document` depuis `src/persistance/`                      | `web-persistance-liste-blanche`                              | 1    |
| 7   | `y-indexeddb` depuis `src/interface/`                                 | `web-src-liste-blanche`, `web-y-indexeddb-confinee`          | 2    |
| 8   | `packages/document/src/arbre.ts` par chemin relatif, depuis `test/`   | `web-document-par-ses-exports`                               | 1    |
| 9   | `@notionlike/document/src/arbre.ts` depuis `test/`                    | `web-document-par-ses-exports`                               | 1    |
| 10  | `persistance/nom-de-base.ts` depuis `test/`                           | `web-persistance-par-son-interface`                          | 1    |
| 11  | `react` depuis `src/espace/`                                          | `web-espace-liste-blanche`                                   | 1    |
| 12  | `yjs` depuis `src/interface/`                                         | `web-src-liste-blanche`                                      | 1    |
| 13  | `persistance/index.ts` depuis `src/interface/`                        | `web-src-liste-blanche`                                      | 1    |
| 14  | `node:fs` depuis `src/interface/`                                     | `web-src-liste-blanche`                                      | 1    |
| 15  | `@testing-library/react` depuis un dossier neuf `src/nouveau/`        | `web-src-liste-blanche`                                      | 1    |
| 16  | `y-indexeddb` depuis `test/`                                          | `web-y-indexeddb-confinee`                                   | 1    |
| 17  | `identifiants/uuid-canonique.ts` depuis `src/espace/`                 | `web-espace-liste-blanche`                                   | 1    |
| 18  | `identifiants/uuid-canonique.ts` depuis `src/interface/`              | `web-src-liste-blanche` (permis dans la version d'avant)     | 1    |
| 19  | `navigation/fragment.ts` depuis `navigation/route.ts`                 | `web-formes-pures`, `pas-de-cycle`                           | 2    |
| 20  | `react` depuis `navigation/route.ts`                                  | `web-formes-pures`, `web-navigation-liste-blanche`           | 2    |
| 21  | `persistance/indexeddb.ts` depuis `persistance/nom-de-base.ts`        | `web-formes-pures`, `pas-de-cycle`                           | 2    |
| 22  | `import type` de `yjs` depuis `persistance/nom-de-base.ts`            | `web-formes-pures`                                           | 1    |
| 23  | `import type` de `yjs` depuis `src/interface/`                        | `web-src-liste-blanche`                                      | 1    |
| 24  | `import type` de `persistance/nom-de-base.ts` depuis `src/interface/` | `web-persistance-par-son-interface`, `web-src-liste-blanche` | 2    |
| 25  | `identifiants/uuid-canonique.ts` depuis `navigation/fragment.ts`      | aucune : import permis                                       | 0    |

Dans les cas 19 et 21, `pas-de-cycle` se déclenche aussi parce que `fragment.ts` et `indexeddb.ts` importent déjà le fichier modifié. Non rejoué ici : `apps-isolees` entre `apps/web` et un `apps/server` (contrat de HEAD, joué par le plan précédent).

### L — ESLint, par violations jetables (gabarit de la révision 1, texte du bloc 0)

Trois fichiers jetables, un par dossier, puis une ligne ajoutée à la fin de quatre fichiers existants, lancés un par un :

- `src/interface/jetable.tsx` : `27 problems (27 errors, 0 warnings)`, `code=1` — 9 `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `window.indexedDB`, `globalThis.fetch`), 15 `no-restricted-properties` (`Math.random`, `getRandomValues`, `randomUUID`, `pushState`, `replaceState`, `sendBeacon`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `transact`, `getMap`, `getArray`, `getText`, `getXmlFragment`, `getXmlElement`), 3 `no-restricted-syntax` (littéral et gabarit `notionlike:`, `dangerouslySetInnerHTML`) ;
- `src/persistance/jetable.ts` : `2 problems`, `code=1` — `randomUUID` et `fetch` refusés ; `indexedDB` et `notionlike:` admis ;
- `src/espace/jetable.ts` : `3 problems`, `code=1` — `indexedDB`, `notionlike:` et `Math.random` refusés ; `randomUUID` admis ;
- pureté : la ligne `[location.hash, window.location, globalThis.indexedDB, document.title, history.length, navigator.userAgent, typeof crypto, self.name, indexedDB, localStorage, fetch]` ajoutée à `navigation/route.ts`, à `persistance/nom-de-base.ts`, à `identifiants/uuid-canonique.ts` : `13 problems (13 errors, 0 warnings)`, `code=1` à chaque fois, tous `no-restricted-globals` (les onze noms, `window.location` et `globalThis.indexedDB` comptant chacun pour deux) ; dans `nom-de-base.ts`, un gabarit `notionlike:` ajouté avec elle n'est pas signalé ;
- témoin : `[location.hash, window.location, history.length]` ajoutée à `navigation/fragment.ts`, qui n'est pas un fichier pur : aucune erreur, `code=0`.

### G — le code de l'archive, séparé de F-003, sur le gabarit

Après le bloc 0 : les 33 fichiers de code et de test de F-002 recopiés de l'arbre (les cinq configurations viennent du bloc 0), les neuf fichiers mêlés parmi eux séparés comme le tableau de « Séparation » le dit, par suppressions et remplacements de lignes, sans code nouveau et sans aucune des retouches que la spec validée demande.

- `pnpm exec prettier --check .` : `All matched files use Prettier code style!` ; `pnpm lint` : aucune erreur ; `pnpm typecheck` : `code=0` ; `pnpm contrats` : `no dependency violations found (68 modules, 156 dependencies cruised)` ;
- `vitest list --filesOnly --project web` : onze fichiers ; projet `web` : 104 tests ; avec le prototype de l'essai D pour `packages/document` : `Test Files  18 passed (18)`, `Tests  330 passed (330)`, aucune ligne `Errors` ;
- `pnpm --filter @notionlike/web build` : `✓ 73 modules transformed`, `dist/assets/index-*.js 319.66 kB`, `✓ built`, `code=0` ; la chaîne « Yjs was already imported » figure une fois dans le paquet produit ;
- `pnpm --filter @notionlike/web test:e2e` : `5 passed (4.1s)`, `code=0` (Chromium de Playwright déjà en cache sur le poste, rien n'a été téléchargé).

Ces mesures sont celles du gabarit de la première version. Sur le gabarit de la révision 1, avec les prototypes des essais D et F : `pnpm --filter @notionlike/web build` rend `✓ 74 modules transformed`, `dist/assets/index-*.js 320.01 kB`, `✓ built`, la chaîne « Yjs was already imported » une fois ; `pnpm --filter @notionlike/web test:e2e` rend `5 passed (4.0s)`.

Puis les retouches d'AC25, AC27 et AC28 en prototype (`uuid-canonique.ts`, `nom-de-base.ts`, `route.ts`), sur le gabarit de la révision 1 et après les essais D et F : `pnpm contrats` sans violation (71 modules, 173 dépendances), `pnpm typecheck` sans erreur, et 15 tests en échec dans `persistance-ouverture.test.ts` (3), `persistance-validation.test.ts` (9) et `route.test.ts` (3). C'est la mesure des fichiers « retouchés » des blocs 2 et 3 : ces tests fixaient l'ancienne spec. Les essais C et L ont tourné sur cet état.

### D — fermeture et rappel qui lève, dans `packages/document` (prototype, gabarit de la révision 1)

`document-espace.ts` et `erreurs.ts` modifiés selon l'amendement de l'ADR-0003 (aucun paramètre ajouté, `console.error`, `fermer()`, `facade-fermee`), un fichier `test/fermeture.test.ts` de sept cas dont le premier et le sixième sont joués pour les deux origines, soit neuf tests ; aucun fichier de F-001 touché.

- `vitest run --project document` : `Test Files  7 passed (7)`, `Tests  233 passed (233)` : les 224 tests de F-001, inchangés, et les neuf du prototype ;
- `pnpm --filter @notionlike/document typecheck` : sans erreur, y compris la lecture de `doc._observers.get("afterTransaction")?.size`. Premier passage en échec : `test/fermeture.test.ts: error TS2584: Cannot find name 'console'` sur `vi.spyOn(console, "error")` ; `console` déclarée localement dans le test, comme dans la source, et l'erreur disparaît ;
- `pnpm lint`, `pnpm exec prettier --check packages` : sans erreur ;
- constaté par ces neuf tests : quatre abonnés dont le deuxième et le quatrième lèvent, appels `a` puis `c`, rien ne lève, `console.error` reçoit les deux exceptions dans l'ordre ; un rappel qui désabonne le suivant, inscrit un abonné et lève : un seul appel ; après fermeture, aucune notification, `lire()` rend la même référence, `abonner` n'inscrit rien, zéro écouteur ; les quatre écritures et un titre de 201 caractères refusés par `facade-fermee`, aucune mise à jour émise, état encodé inchangé ; façade fermée sur un document de version 2 : lecture `version-non-prise-en-charge`, écriture `facade-fermee` ; `fermer()` depuis le deuxième de trois rappels : appels `a`, `b ferme`, puis le rappel d'une autre façade du même `Y.Doc`, jamais `c`, rien ne lève, `console.error` non appelée, un écouteur restant (celui de l'autre façade), qui notifie encore à la transaction suivante ; 50 ouvertures et fermetures : compte du départ ;
- l'`afterEach` du fichier ferme les façades suivies et retrouve le compte du départ sur chaque `Y.Doc`, à chaque test.

Non essayé dans ce prototype : une façade fermée par le rappel d'une autre façade du même `Y.Doc`.

### F — session et test de couture (prototypes, gabarit de la révision 1)

Sur le code de l'essai G recopié dans le gabarit après le prototype D. `session-espace.ts` modifié selon l'ADR-0007 (une seule fonction qui prévient sous garde, `fermer()`, façade fermée à l'entrée dans `version-non-prise-en-charge`, rien d'ouvert après fermeture) ; un message `facade-fermee` dans `messages.ts` ; `test/aides-facade.ts` écrit ; l'`afterEach` de compte ajouté à `test/preparation.ts` ; les cinq fichiers de test qui ouvraient une façade ou démarraient une session passent par les aides ; `test/session-fermeture.test.tsx` (cinq tests) ; sept tests de couture ajoutés à `test/coutures.test.ts`.

- suite entière : `Test Files  19 passed (19)`, `Tests  349 passed (349)`, aucune ligne `Errors`, `code=0` ; projet `web` : douze fichiers, 116 tests (les 104 de l'essai G, cinq, sept) ; `pnpm typecheck` sans erreur, `pnpm lint` sans erreur, `prettier --check .` propre, `pnpm contrats` : `no dependency violations found (70 modules, 171 dependencies cruised)` ;
- session, AC29 : un abonné lève, un second suit ; une mise à jour reçue par `Y.applyUpdate` sous `StrictMode` ne lève pas, `console.error` reçoit l'exception une fois, le second est prévenu, la page reçue est affichée, « Nouvelle page » en crée une autre ; mêmes abonnés inscrits pendant le chargement : à la fin de la relecture, une exception signalée, le second lit `pret` ;
- session, AC30 : cinq montages et démontages sous `StrictMode`, puis deux fermetures : écouteurs `[0, 1, 0]`, et une mise à jour reçue ensuite ne prévient personne ; version 2 reçue par `Y.applyUpdate` sur l'application affichée : rien ne lève, écouteurs de 1 à 0, un seul appel des abonnés, qui lisent `version-non-prise-en-charge`, écran `role="alert"`, plus de bouton « Nouvelle page », `console.error` non appelée ; session fermée pendant le chargement : zéro écouteur une fois IndexedDB au repos, phase `chargement` ;
- couture, AC31 : neuf ouvrants énumérés sur plus de quarante fichiers lus (la définition, la session, les deux aides suivies, les cinq fichiers de F-001) ; deux appels d'ouverture dans chaque aide suivie, `demarrerSessionEspace(` dans le seul `aides-facade.ts` côté tests ; les cinq fichiers de F-001 ouvrent une façade et n'ont aucun `.fermer(` ; session démarrée puis fermée : `[0, 1, 0]` ; façade et persistance sur un même `Y.Doc`, persistance fermée : une façade encore ouverte, puis zéro après `facade.fermer()` ; `DocumentEspace` nommé dans le seul `session-espace.ts` ; trois lecteurs de code (`session-espace.ts`, `Application.tsx`, `messages.ts`), message `facade-fermee` présent ;
- témoins, pour s'assurer que ces preuves peuvent échouer : avec des clés fausses dans la table (`../test/aides-facade.ts` au lieu de `./aides-facade.ts`), deux tests de couture en échec ; avec `doc.off` retiré de `fermer()` dans le prototype D, `Test Files  11 failed | 8 passed (19)`, `Tests  69 failed | 280 passed (349)` : le compte de fin de test voit la façade restée ouverte.

Non essayé : plusieurs abonnés fautifs de la session dans une même diffusion ; un passage à `coupee` après la phase `pret` avec un abonné qui lève (le changement de persistance essayé est la fin de la relecture) ; la répartition de ces tests entre le bloc 2 et le bloc 3 (le prototype les porte tous ensemble).

### X — exports, alias, sous-chemin, énumération des appelants (gabarit)

Essai de la première version de ce plan, non rejoué ; l'énumération des appelants est remplacée par celle de l'essai F. Un fichier de test jetable dans `apps/web/test/`, sur le code de l'essai G et le prototype D d'alors :

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
- Les retouches des blocs 2 et 3 dans leur forme finale : seuls les mécanismes l'ont été (essais D, F, X, et les trois fichiers du prototype de l'essai G) ; les tests retouchés d'AC25, AC27 et AC28 ne sont pas écrits.
- La limite acceptée d'AC16 (ouverture qui réussit pour la sonde puis échoue pour la bibliothèque) : aucun essai, aucun test.
- Les changements de la révision 2 hors du bloc 0 : l'énumération des ouvrants par extraction des imports ; `ouvrirEspaceLocal` sans `idEspace()` et les assertions de test réécrites sur le nom de la base ; `importerEntree` sur la vraie entrée, avec le compte d'écouteurs.
- L'aide de test unique pour les actions de rangée, et tout ce qui touche F-004.
- Un dépassement de quota réel : les écouteurs `abort` et `close` ont leurs tests dans l'archive, sur une simulation.
- Les deux scripts dans le dépôt principal lui-même (rien n'y est lancé ni installé) : le clone en reproduit l'arbre et les hooks.
- Le bloc 0 sur un arbre où le bloc 0 de F-008 serait déjà fusionné : essayé par la conception de F-008 sur une version antérieure de ce bloc (sept contrats), pas sur celle-ci (neuf).
- La mise à l'abri suivie du bloc 0 de cette révision dans un clone neuf, d'une traite : le bloc 0 a été relancé dans le clone de l'essai S3 ramené à l'arbre de HEAD, pas après une mise à l'abri refaite.
- Le paquet produit servi : seul `vite build` l'a été ; aucune configuration de `vite preview` n'est livrée.
- Une archive `tar` à la place de la branche d'archive.
