# F-001 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-001.md` (validée, commit `ccbcd25`)
ADR : ADR-0001 (découpage des documents), ADR-0002 (format et arbre déplaçable), ADR-0003 (interface et outillage)

Ce document est le plan de réalisation de F-001. Il ne décrit pas du code existant : `ARCHITECTURE.md` est aligné sur le code bloc après bloc (voir « Plan par blocs »).

Révision 1 du 2026-10-08, après le premier rejet du gate `agent-architecte` (empreinte `ba180a02ed89`) : barrière AC19 par ESLint, contrat `document-coeur-pur`, traçabilité de fast-check et des fichiers racine, instance unique de `yjs`, `ARCHITECTURE.md` à chaque bloc, sort des cinq contrats existants, extraits des fichiers racine et sorties d'essais cités ici.

Révision 2 du 2026-10-08, après le second rejet (conception du commit `c7a9aa6`) :

- l'ancien bloc 1 (rangs seuls) est fondu dans le bloc de création ; les blocs sont renumérotés de 0 à 4 ;
- la règle d'atteinte est reformulée pour être vraie de chaque bloc, et l'interface livrée est listée bloc par bloc, sans méthode factice ;
- `ouvrirDocumentEspace` a un test dans le bloc qui la livre ;
- la mise à la corbeille passe au bloc 1, pour que la lecture de la corbeille soit exercée dans le bloc qui l'écrit ;
- ADR-0002 : parent écrit par une réattribution de rangs, version non entière, ordre des racines de la corbeille, opération sans effet, consolidation précisée ;
- ADR-0003 : ordre des validations ;
- l'option `exclude` des contrats est corrigée : sa version précédente effaçait le vrai `yjs` du graphe (essai C) ;
- les essais sont refaits avec les vrais paquets, après un vrai `pnpm install` hors du dépôt ; la preuve à rejouer au bloc 0 est écrite avec ses sorties attendues.

Révision 3 du 2026-10-08, après le troisième rejet (conception du commit `16cf646`). Le gate ne demande aucune reprise du découpage ; trois défauts locaux et deux précisions sont corrigés :

- C1 : `document-yjs-seulement` est réécrite en liste blanche ; un import local qui sort de `src/` (vers `test/`, vers un autre paquet) échoue, et la seconde séquence du bloc 0 le prouve par une étape de plus ;
- C2 : le tri des sœurs par (rang, identifiant) est livré dès le bloc 1, avec deux tests par l'exemple sous F-001-AC5 ;
- C3 : chaque bloc a un attendu chiffré (fichiers de test listés et comptés depuis la racine), sans lequel le bloc suivant ne démarre pas ;
- la règle « parent absent → racine » passe du bloc 4 au bloc 3, pour qu'aucun état lu pendant la convergence ne soit indéfini ;
- ADR-0002 : « version absente = 1 » est une règle permanente du format ;
- une extraction pure hors de `document-espace.ts` entre dans `document-coeur-pur`.

## Approche

`packages/document` est un module pur : il transforme un `Y.Doc` en arborescence lue et des intentions (créer, renommer, déplacer, mettre à la corbeille) en écritures Yjs. Il ne fait aucune entrée-sortie.

- **Données** : une entrée par page dans une `Y.Map`, portant titre, place (parent et rang, écrits ensemble) et drapeau corbeille (ADR-0002).
- **Lecture** : fonction pure et totale de l'état du document. Elle ignore les entrées mal formées, ramène à la racine les pages sans parent valide, coupe chaque cycle à la page de plus petit identifiant, propage la corbeille aux descendantes et trie les sœurs par (rang, identifiant). La convergence entre répliques vient de là : même état Yjs, même lecture.
- **Écriture** : chaque opération valide sur l'arborescence lue, puis écrit dans une seule transaction ; un refus n'écrit rien.
- **Interface** : `creerDocumentEspace`, `ouvrirDocumentEspace`, une façade `DocumentEspace` de six méthodes, une classe `ErreurDocument` (ADR-0003). Le `Y.Doc` est le seul type Yjs exposé.

## Fichiers du paquet

Six fichiers dans `src/`, à plat ; sept dans `test/`.

| Fichier                         | Rôle                                                                                                                                 | Importe `yjs`           | Naît au bloc |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------ |
| `src/index.ts`                  | réexporte l'interface publique, rien d'autre                                                                                         | non                     | 1            |
| `src/erreurs.ts`                | `ErreurDocument`, `CodeErreurDocument`                                                                                               | non                     | 1            |
| `src/rang.ts`                   | rang entre deux bornes (bloc 1), suite de rangs croissants (bloc 3)                                                                  | non                     | 1            |
| `src/arbre.ts`                  | entrées valides vers arborescence : parents, cycles, corbeille, ordre                                                                | non                     | 1            |
| `src/format.ts`                 | noms des clés, version, lecture et validation d'une entrée brute                                                                     | oui                     | 1            |
| `src/document-espace.ts`        | `creerDocumentEspace`, `ouvrirDocumentEspace`, opérations, abonnement                                                                | oui                     | 1            |
| `test/aides.ts`                 | aide de test : graine et nombre d'exécutions fast-check (bloc 1), répliques et échange de mises à jour dans un ordre choisi (bloc 3) | oui, à partir du bloc 3 | 1            |
| `test/rang.test.ts`             | propriétés des rangs                                                                                                                 | non                     | 1            |
| `test/operations.test.ts`       | opérations locales et refus                                                                                                          | oui                     | 1            |
| `test/abonnement.test.ts`       | notifications                                                                                                                        | oui                     | 2            |
| `test/convergence.test.ts`      | convergence, par l'exemple et par propriétés ; parent absent en état intermédiaire                                                   | oui                     | 3            |
| `test/robustesse.test.ts`       | entrées mal formées, parents ignorés, version inconnue                                                                               | oui                     | 4            |
| `test/structure.test.ts`        | environnement de test sans DOM, dépendances du manifeste                                                                             | non                     | 4            |
| `package.json`, `tsconfig.json` | commités par le dev (textes plus bas)                                                                                                |                         | 0            |
| `vitest.config.ts`              | commité par le dev (texte plus bas)                                                                                                  |                         | 0            |

`src/index.ts` réexporte par nom depuis les autres fichiers de `src/` ; il n'importe pas `yjs` lui-même.

## Plan par blocs

Le bloc 0 est fait par le dev ; les blocs 1 à 4 sont chacun un commit d'`agent-frontend` (`Feature: F-001`), dans cet ordre. Chaque bloc livre son code et ses tests, et laisse `pnpm test`, `pnpm lint`, `pnpm contrats` et `pnpm typecheck` verts. Un bloc ne démarre que si l'attendu chiffré du bloc précédent est constaté (« Attendu chiffré après chaque bloc »).

**Règle d'atteinte, vraie de chaque bloc.** Tout fichier de `src/`, toute fonction, toute méthode de `DocumentEspace`, tout code d'erreur et tout export livré par un bloc est exercé, dans le commit de ce même bloc, par au moins un test qui passe par l'interface publique (`src/index.ts`). Un test qui importe directement un fichier interne (`test/rang.test.ts`) peut s'y ajouter ; il ne suffit jamais à justifier une fonction. Aucun bloc ne livre donc de code en avance sur son premier appelant. Le bloc 0 ne livre aucun code : ses barrières (ESLint, contrats) sont prouvées par la séquence « Vérification après le commit du bloc 0 ».

| Bloc | Contenu                                                                                                                                                                                                                                                                                                                                                   | Fichiers créés ou modifiés                                                                                                                                                  | Critères                                                                                          | `ARCHITECTURE.md`                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Squelette du paquet, configuration racine de Vitest, contrats de dépendances, règle ESLint des globales interdites, script `typecheck`, `pnpm install` (dev)                                                                                                                                                                                              | les huit fichiers de la section « Fichiers à commiter par le dev »                                                                                                          | prépare AC19 : les deux barrières (ESLint, contrats) sont actives avant la première ligne de code | oui : paquet `packages/document` (squelette sans code), sept contrats, règle ESLint, `pnpm typecheck`                                       |
| 1    | Créer, mettre à la corbeille, lire : document vide en version 1, ouverture d'un `Y.Doc`, création de page à une position (rang entre deux bornes), mise à la corbeille, arborescence et corbeille lues, sœurs triées par (rang, identifiant) ; refus de ces deux opérations (titre trop long, page ou parent absent ou à la corbeille, position invalide) | `src/erreurs.ts`, `src/rang.ts`, `src/format.ts`, `src/arbre.ts`, `src/document-espace.ts`, `src/index.ts`, `test/aides.ts`, `test/rang.test.ts`, `test/operations.test.ts` | AC1, AC2, AC5 ; AC14 et AC15 pour la création et la mise à la corbeille                           | oui : les six modules de `src/` et leurs dépendances, tels que livrés ; interface de trois méthodes                                         |
| 2    | Renommer, déplacer, s'abonner ; refus (cycle local, page absente ou à la corbeille, titre trop long) ; opération sans effet ; `lire()` rend la même référence tant que rien n'a changé                                                                                                                                                                    | `src/erreurs.ts`, `src/arbre.ts`, `src/document-espace.ts`, `test/operations.test.ts`, `test/abonnement.test.ts`                                                            | AC3, AC4, AC6, AC13 ; fin de AC14 et AC15 (renommage, déplacement)                                | oui : interface de six méthodes, abonnement                                                                                                 |
| 3    | Convergence : parent absent ramené à la racine, coupure des cycles à la lecture, consolidation avant déplacement, insertion entre rangs égaux par réattribution (suite de rangs croissants ajoutée à `rang.ts`, avec ses tests)                                                                                                                           | `src/rang.ts`, `src/arbre.ts`, `src/document-espace.ts`, `test/aides.ts`, `test/rang.test.ts`, `test/convergence.test.ts`                                                   | AC7, AC8, AC9, AC10, AC11, AC12 ; AC17 pour le parent absent                                      | oui : règles de lecture ajoutées (parent absent, cycles), réattribution et consolidation ; flux de synchronisation toujours absent du dépôt |
| 4    | Robustesse et structure : entrées mal formées ignorées, parent ignoré ramené à la racine par la règle du bloc 3, version inconnue refusée en lecture et en écriture ; preuve de l'environnement sans DOM et du manifeste                                                                                                                                  | `src/erreurs.ts`, `src/format.ts`, `src/document-espace.ts`, `test/robustesse.test.ts`, `test/structure.test.ts`                                                            | AC16, fin de AC17 (parent ignoré), AC18, AC19                                                     | oui : lecture tolérante et refus de version ; lignes des menaces que le code pare ; relecture finale de fidélité au diff livré              |

`ARCHITECTURE.md` est écrit par `agent-architecte-conception`, seul agent qui l'a dans son périmètre. Après chaque bloc, l'orchestrateur l'invoque avant de lancer le bloc suivant : un commit `Agent: agent-architecte-conception`, `Feature: F-001`, qui ne touche que `ARCHITECTURE.md` et décrit ce que le commit du bloc vient de livrer, pas davantage. La doc n'est donc jamais en retard de plus d'un commit sur le code. Jusqu'au commit du bloc 0, `ARCHITECTURE.md` reste tel quel : il décrit le dépôt actuel (aucun module, cinq contrats).

Entre le bloc 0 et le bloc 1, le champ `exports` du manifeste désigne `src/index.ts`, qui n'existe pas encore. Aucun paquet n'importe `@notionlike/document` dans F-001 : rien ne peut s'y heurter.

### Interface livrée bloc par bloc

`DocumentEspace`, `CodeErreurDocument` et `src/index.ts` n'exposent, à la fin de chaque bloc, que ce qui est réalisé et testé dans ce bloc ou les précédents. Aucune méthode factice : ni corps vide, ni `throw` « pas encore réalisé », ni `TODO`, ni membre optionnel en attente. L'interface de l'ADR-0003 est celle de la fin du bloc 4 ; elle croît ainsi :

| Fin du bloc | Exports de `src/index.ts`                                                                                                                                                  | Membres de `DocumentEspace`                      | Codes de `CodeErreurDocument`                                                     | Règles de lecture de l'ADR-0002 en vigueur dans `lire()`                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0           | aucun (`src/` n'existe pas)                                                                                                                                                |                                                  |                                                                                   |                                                                                                                                                                                            |
| 1           | types `IdPage`, `PageLue`, `Arborescence`, `Emplacement`, `CodeErreurDocument`, `DocumentEspace` ; valeurs `ErreurDocument`, `creerDocumentEspace`, `ouvrirDocumentEspace` | `doc`, `lire`, `creerPage`, `mettreALaCorbeille` | `page-introuvable`, `page-a-la-corbeille`, `titre-trop-long`, `position-invalide` | étape 5 (corbeille propagée, forêt de la corbeille) et étape 6 entière : tri par (rang, identifiant) des sœurs de l'arborescence, des sœurs de la corbeille et des racines de la corbeille |
| 2           | les mêmes neuf noms                                                                                                                                                        | ajoute `abonner`, `renommerPage`, `deplacerPage` | ajoute `deplacement-cyclique`                                                     | inchangées                                                                                                                                                                                 |
| 3           | les mêmes neuf noms                                                                                                                                                        | inchangés                                        | inchangés                                                                         | ajoute l'étape 3 pour le parent absent et l'étape 4 (cycles)                                                                                                                               |
| 4           | les mêmes neuf noms                                                                                                                                                        | inchangés                                        | ajoute `version-non-prise-en-charge`                                              | ajoute l'étape 1 (version) et l'étape 2 (entrées valides) ; l'étape 3 couvre dès lors le parent ignoré                                                                                     |

La liste des noms exportés est complète dès le bloc 1 : chacun y désigne une fonction appelée par les tests du bloc, ou le type d'un paramètre, d'un résultat ou d'une erreur de ces fonctions. Ce qui croît ensuite, c'est le contenu de deux types : les membres de `DocumentEspace` (dans `document-espace.ts`) et l'union `CodeErreurDocument` (dans `erreurs.ts`). `index.ts` réexporte par nom et ne change plus après le bloc 1. La dernière colonne n'est pas de l'interface au sens des types : elle dit quel ordre et quelle forme `lire()` garantit à la fin de chaque bloc. L'ordre de l'ADR-0002 (étape 6) est tenu dès le bloc 1 et ne change plus.

### Ce que chaque bloc réalise, et par quoi c'est atteint

Bloc 1 :

- `rang.ts` : le rang entre deux bornes, appelé par `creerPage` pour la première position, une position du milieu, la dernière et un parent sans enfant ; les quatre cas sont dans les tests de F-001-AC2. La suite de rangs croissants n'y est pas.
- `format.ts` : noms des clés, écriture de la version 1 (`creerDocumentEspace`), écriture et lecture d'une entrée. La lecture fait confiance aux entrées : seules les opérations du module en ont écrit. Ni validation ni contrôle de version à ce stade (bloc 4).
- `arbre.ts` : regroupement par parent, corbeille propagée aux descendantes et forêt de la corbeille (étape 5 de l'ADR-0002), tri par (rang, identifiant) des sœurs de l'arborescence, des sœurs de la corbeille et des racines de la corbeille (étape 6, entière dès ce bloc).
  - Le départage par identifiant est nécessaire dès ce bloc : une seule réplique suffit à produire deux sœurs de même rang. Le rang d'une création est calculé entre les sœurs lues, qui excluent la corbeille, et ce calcul est déterministe. Créer P, créer T sous P, mettre T à la corbeille, créer N sous P : N reçoit le rang de T. Mettre P à la corbeille : T et N sont sœurs sous P dans la corbeille, avec le même rang.
  - Même effet entre deux racines de la corbeille venues de parents différents : le premier enfant de chaque parent porte le même rang.
  - Dans l'arborescence hors corbeille, une seule réplique ne produit pas deux sœurs de même rang (chaque rang est calculé strictement entre ses voisines lues) : ce cas-là n'arrive qu'avec deux répliques, et son test est sous F-001-AC8 au bloc 3. Le code qui le tient est le même tri, livré ici.
  - Les deux séquences ci-dessus sont testées dans ce bloc, sous F-001-AC5, avec des identifiants fixés.
- `document-espace.ts` : `creerDocumentEspace`, `ouvrirDocumentEspace`, `lire` (recalculée à chaque appel), `creerPage`, `mettreALaCorbeille`, validations dans l'ordre de l'ADR-0003.
- `ouvrirDocumentEspace` est exercée dans ce bloc par un test de `test/operations.test.ts` : un `Y.Doc` vierge est ouvert, `lire()` rend `racines` et `corbeille` vides, une page y est créée, puis relue par `lire()` ; le même `Y.Doc`, ouvert par une seconde façade, rend la même page.

Bloc 2 :

- `document-espace.ts` : `renommerPage`, `deplacerPage`, `abonner` ; opération sans effet (ADR-0002, « Écriture ») ; `lire()` garde son résultat et rend la même référence tant qu'aucune transaction ne l'a changé.
- `arbre.ts` : test de descendance, appelé par `deplacerPage` pour refuser un cycle local.
- `erreurs.ts` : code `deplacement-cyclique`.

Bloc 3 :

- `arbre.ts` : parent effectif (étape 3) pour le parent absent, c'est-à-dire un `place.parent` qui ne désigne aucune entrée du document : la page est exposée à la racine. Coupure des cycles (étape 4), marque interne des pages exposées par coupure, lue par la consolidation. Le tri par (rang, identifiant) n'est pas touché : il date du bloc 1.
- `rang.ts` : suite de rangs croissants entre deux bornes, appelée par la réattribution.
- `document-espace.ts` : réattribution à l'insertion entre deux rangs égaux (création et déplacement), consolidation avant déplacement.
- `test/aides.ts` : répliques et échange de mises à jour dans un ordre choisi, appelés par `test/convergence.test.ts`.
- F-001-AC10, AC11 et AC12 n'ajoutent aucun code : la règle Yjs d'une clé de `Y.Map` et les règles de lecture du bloc 1 les tiennent déjà. Leurs tests arrivent ici parce qu'ils demandent deux répliques. Il en va de même de la première moitié de F-001-AC8 (deux créations à la même position, même ordre partout) : le tri du bloc 1 la tient, seule la réattribution est du code neuf.
- **Parent absent pendant la convergence : la règle est avancée ici, les générateurs ne sont pas bridés.** Dès ce bloc, `lire()` est recalculée à chaque mise à jour reçue, donc dans des états intermédiaires. L'un d'eux a un parent absent : A crée P ; B, qui a reçu P, crée C sous P ; une troisième réplique reçoit la mise à jour de B avant celle de A. Yjs applique cette mise à jour (elle ne dépend d'aucune écriture de A) : C est lisible, P ne l'est pas (essai L). Interdire ce cas aux générateurs aurait laissé le code sans règle devant un état que la synchronisation réelle produit. La règle de l'étape 3 est donc livrée au bloc 3, et testée dans ce bloc sous F-001-AC17. Aucun état lisible n'est indéfini à la fin d'aucun bloc :
  - blocs 1 et 2 : une seule réplique. Le parent d'une création ou d'un déplacement est validé avant l'écriture et aucune entrée n'est jamais supprimée : un parent enregistré désigne toujours une entrée. Le test d'abonnement du bloc 2 (F-001-AC6) applique par `Y.applyUpdate` toutes les mises à jour d'une autre réplique, dans l'ordre de leur émission : il ne fabrique ni parent absent ni cycle ;
  - bloc 3 : parent absent et cycles ont leur règle ; les entrées restent bien formées, qu'elles viennent des opérations du module ou d'un test qui écrit dans le `Y.Doc` pour fixer des identifiants ;
  - bloc 4 : entrées mal formées et version inconnue ont leur règle.
- **Point d'attention du gate : extraction hors de `document-espace.ts`.** Ce fichier porte opérations, validations, abonnement, réattribution et consolidation, sous une complexité plafonnée à 10 ; une extraction est probable à ce bloc. Si le fichier extrait est pur (ni `yjs`, ni `format.ts`, ni `document-espace.ts`, ni `index.ts`), il entre dans `document-coeur-pur` : son nom s'ajoute aux deux expressions de la règle (`(rang|arbre|erreurs|<nom>)`). `.dependency-cruiser.cjs` est protégé : `agent-frontend` le signale dans son message de fin, `agent-architecte-conception` donne le texte exact, le dev le commite avant le commit du bloc qui crée le fichier, et `ARCHITECTURE.md` cite le module au passage qui suit ce bloc. Un fichier extrait qui importe `yjs` reste hors du cœur ; `document-yjs-seulement` le couvre sans changement, comme tout fichier de `src/`.

Bloc 4 :

- `format.ts` : validation d'une entrée brute (étape 2), lecture de la version (étape 1).
- `arbre.ts` n'est pas modifié : il ne reçoit que les entrées retenues par `format.ts`, et la règle du bloc 3 ramène déjà à la racine une page dont le parent n'en fait pas partie. Le parent ignoré (étape 3, seconde moitié de F-001-AC17) est donc tenu par la validation de `format.ts`, et testé ici.
- `document-espace.ts` : refus de la lecture et de toute écriture sur une version inconnue ; l'entrée dans cet état et sa sortie notifient les abonnés.
- `erreurs.ts` : code `version-non-prise-en-charge`.
- `test/robustesse.test.ts` porte aussi un exemple de l'ordre des validations : version inconnue et titre trop long ensemble donnent `version-non-prise-en-charge` (sous F-001-AC18).

### Attendu chiffré après chaque bloc

`pnpm test` et la commande de test du socle gardent `--passWithNoTests` (fichiers protégés, non modifiés) : si `projects: ["packages/*"]` ne ramassait pas le paquet, les hooks resteraient verts avec zéro test pendant toute la feature. La preuve du contraire est donc exigée bloc par bloc, par deux commandes lancées à la racine par l'orchestrateur après le commit du bloc, sans `--passWithNoTests` :

```bash
pnpm exec vitest list --filesOnly; echo "code=$?"
pnpm exec vitest run; echo "code=$?"
```

- `vitest list --filesOnly` nomme chaque fichier de test par son chemin depuis la racine, précédé du nom du projet. `vitest run` seul ne les nomme pas quand tout passe : son rapporteur par défaut n'affiche que les totaux (essai K).
- `vitest run` sans `--passWithNoTests` finit en `code=1` quand aucun fichier de test n'est trouvé (essai K).

| Après le bloc | Lignes attendues de `vitest list --filesOnly` (ordre libre), `code=0`                                                                   | Ligne attendue de `vitest run`, `code=0` |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1             | `[document] packages/document/test/rang.test.ts`, `[document] packages/document/test/operations.test.ts`                                | `Test Files  2 passed (2)`               |
| 2             | les deux précédentes et `[document] packages/document/test/abonnement.test.ts`                                                          | `Test Files  3 passed (3)`               |
| 3             | les trois précédentes et `[document] packages/document/test/convergence.test.ts`                                                        | `Test Files  4 passed (4)`               |
| 4             | les quatre précédentes, `[document] packages/document/test/robustesse.test.ts` et `[document] packages/document/test/structure.test.ts` | `Test Files  6 passed (6)`               |

Règle, vraie de chaque bloc : le nombre de fichiers de test est supérieur à zéro, chaque fichier attendu est listé, et le total de `vitest run` est celui de la liste. L'orchestrateur consigne les deux sorties dans la trace de la feature (`MEMORY/features/F-001.md`). Un fichier attendu absent, un total à zéro, la ligne `No test files found` ou un code de sortie non nul : le bloc suivant ne démarre pas, et l'écart est remonté au dev (la configuration de Vitest est hors du périmètre des agents). Un fichier de test en plus, né d'une extraction au bloc 3, s'ajoute à la liste et au total ; il n'en retire aucun.

## Stratégie de test

Les tests passent par l'interface publique (`src/index.ts`). Deux exceptions : `test/rang.test.ts` importe `src/rang.ts` (algorithme pur, plus simple à éprouver seul, en plus des tests qui l'atteignent par l'interface), et certains tests écrivent directement dans les types partagés du `Y.Doc` pour fabriquer des états qu'aucune opération ne produit, ou pour fixer des identifiants. Ces derniers fixent le format de l'ADR-0002 : c'est voulu, le format est un contrat.

Les deux tests de rangs égaux du bloc 1 (sous F-001-AC5) fixent les identifiants autrement, pour que toute la séquence passe par l'interface publique : `crypto.randomUUID` est remplacé le temps du test par `vi.spyOn(crypto, "randomUUID")`, qui rend dans l'ordre les identifiants voulus, et rétabli après chaque test (`vi.restoreAllMocks()`). Le fichier de test déclare `crypto` localement, comme le module (`types` est vide). Essai K : le remplacement atteint l'appel fait dans `src/`, et `pnpm lint` comme `pnpm typecheck` passent. Les identifiants sont choisis à l'inverse de l'ordre de création : un tri par rang seul, qui garderait l'ordre d'écriture, fait échouer le test à coup sûr.

Chaque test cite son critère dans son nom (`F-001-AC7 …`), ce que `ac-couverture.sh` vérifie.

Les propriétés fast-check tournent avec une graine fixe et 300 exécutions (constantes dans `test/aides.ts`, dès le bloc 1). Générateurs de convergence (bloc 3) : une suite d'opérations (créer, renommer, déplacer, mettre à la corbeille, sur des pages tirées parmi celles qui existent) par réplique, deux ou trois répliques, puis un ordre de livraison des mises à jour tiré au hasard, doublons compris. Une opération refusée par une erreur typée est simplement passée. Les générateurs ne sont pas bridés pour éviter le parent absent : un ordre de livraison tiré au hasard entre trois répliques le produit en état intermédiaire, et la règle du bloc 3 le lit (voir « Bloc 3 »).

| Critère | Bloc | Par l'exemple                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Par propriété                                                                                                                                                                                                                                                                                         |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1     | 1    | document créé : `racines` et `corbeille` vides ; `meta.version` vaut 1 dans le `Y.Doc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                       |
| AC2     | 1    | création à la racine, sous une page, en position 0, au milieu, sans position ; identifiants distincts ; position hors bornes ou non entière refusée par `position-invalide`, zéro `update` ; `Y.Doc` vierge ouvert par `ouvrirDocumentEspace` : lu vide, page créée, page relue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | rang : pour tous `a < b`, `a < entre(a, b) < b`, et le résultat est un rang valide ; modèle : une suite de créations sur une réplique donne le même ordre qu'un modèle naïf en tableaux                                                                                                               |
| AC3     | 2    | renommage : titre changé, parent, position et descendance identiques ; même titre : zéro `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                       |
| AC4     | 2    | déplacement vers un autre parent, vers une autre position du même parent, avec descendance ; ordre des autres pages inchangé ; même emplacement : zéro `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | modèle : une suite de créations et de déplacements sur une réplique donne le même ordre qu'un modèle naïf en tableaux                                                                                                                                                                                 |
| AC5     | 1    | page et descendance absentes de `racines`, présentes dans `corbeille` sous leur page ; entrées toujours dans le `Y.Doc` ; seul le drapeau de la page visée est écrit ; **sœurs de même rang dans la corbeille**, identifiants fixés P = `…0001`, T = `…0003`, N = `…0002` : créer P, créer T sous P, corbeille T (`corbeille` = [T], `racines` = [P]), créer N sous P, corbeille P : `place.rang` de T et de N égaux dans le `Y.Doc`, `racines` vide, `corbeille` = [P] et enfants de P = [N, T], ordre des identifiants et non de la création ; **deux racines de corbeille venues de parents différents**, identifiants fixés A = `…0001`, B = `…0002`, X = `…0004`, Y = `…0003` : créer A, créer B, créer X sous A, créer Y sous B, corbeille X, corbeille Y : `place.rang` de X et de Y égaux, `racines` = [A, B] sans enfant, `corbeille` = [Y, X]. Les identifiants complets sont `00000000-0000-4000-8000-00000000000n` |                                                                                                                                                                                                                                                                                                       |
| AC6     | 2    | une notification par opération locale, une par mise à jour reçue (`Y.applyUpdate` appelé par le test), aucune après désabonnement, aucune pour une opération sans effet ou refusée, plusieurs abonnés ; `lire()` rend la même référence entre deux notifications                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                       |
| AC7     | 3    | deux répliques, opérations disjointes, échange dans les deux ordres                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | pour toute suite d'opérations et tout ordre de livraison : `lire()` ne lève après aucune mise à jour livrée, états intermédiaires compris ; à la fin, `lire()` identique sur toutes les répliques et chaque page créée apparaît exactement une fois (pas de perte, pas de doublon, donc pas de cycle) |
| AC8     | 3    | deux créations à la même position sous le même parent : deux pages, même ordre des deux côtés (tri du bloc 1, éprouvé ici entre deux répliques) ; puis insertion entre les deux (réattribution) ; à la racine, insertion devant une sœur de même rang exposée par coupure de cycle : son `place.parent` enregistré est inchangé dans le `Y.Doc`, son rang a changé, l'ordre lu est celui demandé sur les deux répliques (identifiants fixés par écriture directe)                                                                                                                                                                                                                                                                                                                                                                                                                                                              | suite de rangs : pour tous `a < b` et tout `n`, `n` rangs valides, strictement croissants, strictement entre `a` et `b`                                                                                                                                                                               |
| AC9     | 3    | A sous B contre B sous A : même lecture, A et B présentes avec leur descendance ; cycle de trois pages ; déplacement d'une descendante de la page coupée ensuite : la `place` de la page coupée devient `{ parent: null }` avec son rang inchangé (consolidation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | invariant « exactement une fois » de AC7                                                                                                                                                                                                                                                              |
| AC10    | 3    | deux renommages : même titre des deux côtés, égal à l'un des deux                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                       |
| AC11    | 3    | corbeille contre création sous la page ; corbeille contre déplacement sous la page : la fille est dans `corbeille`, son entrée reste dans le `Y.Doc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                                                       |
| AC12    | 3    | `Y.encodeStateAsUpdate` puis `Y.applyUpdate` sur un `Y.Doc` vierge ouvert par `ouvrirDocumentEspace` : même `lire()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | même égalité après toute suite d'opérations                                                                                                                                                                                                                                                           |
| AC13    | 2    | déplacement sous soi-même, sous une fille, sous une petite-fille : `deplacement-cyclique`, zéro `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                       |
| AC14    | 1, 2 | bloc 1, pour la création et la mise à la corbeille : identifiant absent, page à la corbeille, parent à la corbeille, descendante d'une page à la corbeille. Bloc 2 : les mêmes cas pour le renommage et le déplacement ; un cas à deux refus possibles suit l'ordre de l'ADR-0003. Partout : erreur typée, zéro `update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                       |
| AC15    | 1, 2 | titre de 201 caractères refusé à la création (bloc 1) et au renommage (bloc 2), zéro `update` ; 200 accepté ; vide accepté                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |                                                                                                                                                                                                                                                                                                       |
| AC16    | 4    | champ manquant, mauvais type, titre de 201 caractères, `place` qui n'est pas un objet simple, rang invalide, valeur qui n'est pas une `Y.Map` : entrée ignorée, autres pages exposées                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | pour toute valeur JSON arbitraire écrite dans `pages` ou dans une entrée : `lire()` ne lève pas et expose les pages valides                                                                                                                                                                           |
| AC17    | 3, 4 | bloc 3, parent absent (`test/convergence.test.ts`) : A crée P, B qui a reçu P crée C sous P, une troisième réplique reçoit la mise à jour de B seule : `lire()` ne lève pas et expose C à la racine, de la même façon sur une quatrième réplique dans le même état ; insertion devant une sœur de même rang exposée par parent absent : son `place.parent` enregistré est inchangé ; la mise à jour de A arrive ensuite : C rejoint P. Bloc 4, parent ignoré (`test/robustesse.test.ts`) : parent mal formé au sens de F-001-AC16 : page à la racine, même lecture sur une seconde réplique                                                                                                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                       |
| AC18    | 4    | `meta.version` valant `2`, `2.5`, `0`, `"1"`, `"2"`, `null` ou un objet : `lire()` et chaque écriture lèvent `version-non-prise-en-charge`, zéro `update`, état du `Y.Doc` inchangé ; clé `version` absente : lecture et écritures permises ; un abonné est notifié quand la version devient inconnue, et de nouveau quand elle redevient `1` ; version inconnue et titre trop long ensemble : `version-non-prise-en-charge`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                       |
| AC19    | 0, 4 | `pnpm lint` : règle `no-restricted-globals` sur `packages/document/src` (aucun usage de `window`, `document`, `navigator`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `indexedDB`, `localStorage`, `sessionStorage`, `process`, y compris par `globalThis.`) ; `pnpm contrats` : `document-yjs-seulement` et `document-coeur-pur` ; `pnpm typecheck` en seconde barrière (`lib` sans `DOM`, `types` vide) ; test de structure (bloc 4) : `dependencies` du manifeste réduit à `yjs`, et `"window" in globalThis` et `"document" in globalThis` faux sous Vitest (ce dernier point prouve l'environnement de test, pas l'absence d'usage : celle-ci est tenue par le lint)                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                       |

« Zéro `update` » se mesure en comptant les événements `update` du `Y.Doc` pendant l'appel.

Le test de réattribution d'une sœur exposée à la racine a deux parts, une par cause d'exposition, toutes deux au bloc 3 : la coupure de cycle (sous F-001-AC8) et le parent absent (sous F-001-AC17). Les deux règles de lecture naissent dans ce bloc, avec la réattribution elle-même.

F-001-AC17 est tenu en deux temps. Le parent absent est lu dès le bloc 3 (étape 3 dans `arbre.ts`). Le parent ignoré ne peut exister qu'au bloc 4, qui livre la validation des entrées : avant lui, aucune entrée n'est écartée.

## Règles de dépendances

Sort des cinq contrats en vigueur (texte actuel de `.dependency-cruiser.cjs` cité plus bas) : tous conservés, aucun modifié.

| Contrat existant               | Sort              | Portée dans F-001                                                                                                                                                                                                                              |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pas-de-cycle`                 | conservé tel quel | s'applique aux fichiers de `packages/document` dès le bloc 1                                                                                                                                                                                   |
| `domaine-pur`                  | conservé tel quel | sans objet : le paquet n'a pas de dossier `domain` (six fichiers à plat), la règle ne vise donc aucun de ses fichiers. La pureté du cœur du paquet est portée par `document-coeur-pur`, pas par elle. Elle reste pour les applications à venir |
| `paquets-sans-apps`            | conservé tel quel | s'applique à `packages/document` ; aucune application n'existe                                                                                                                                                                                 |
| `apps-isolees`                 | conservé tel quel | sans objet : aucune application dans F-001                                                                                                                                                                                                     |
| `document-sans-reseau-ni-base` | conservé tel quel | sans objet tant que `packages/db` et `packages/contrats` n'existent pas                                                                                                                                                                        |

Deux contrats ajoutés au bloc 0, ce qui porte la liste à sept :

- `document-yjs-seulement` — écrite en liste blanche : depuis `packages/document/src/`, seul un fichier de `packages/document/src/` ou du paquet `yjs` peut être importé. Tout le reste est une erreur, sans énumération : autre paquet npm, module intégré de Node, import non résolu, et fichier local hors de `src/` (`packages/document/test/`, un autre paquet du workspace atteint par chemin relatif). C'est ce dernier cas que la version précédente, écrite par types de dépendance, laissait passer : `format.ts → ../test/aides.ts → fast-check` mettait une dépendance de développement sur le chemin d'exécution sans violer aucun contrat (F-001-AC19, « `yjs` pour seule dépendance d'exécution directe »).
- `document-coeur-pur` — en liste blanche elle aussi : `src/rang.ts`, `src/arbre.ts` et `src/erreurs.ts` n'importent qu'eux-mêmes : ni paquet npm (donc pas `yjs`), ni module de Node, ni `format.ts`, ni `document-espace.ts`, ni `index.ts`. Le sens interne `index → document-espace → format, arbre, rang, erreurs` est ainsi contractualisé (ADR-0003, « Organisation interne »). Un fichier pur extrait de `document-espace.ts` au bloc 3 s'ajoute à cette règle (voir « Bloc 3 »).

Option modifiée : `exclude`, sur deux points.

- Elle ne masque plus `node_modules`. Aujourd'hui les paquets npm sont retirés du graphe avant l'évaluation des règles, si bien qu'aucune règle ne voit un import de paquet.
- Elle ne masque `dist` et `coverage` que dans un paquet ou une application du dépôt (`^(apps|packages)/[^/]+/(dist|coverage)/`), plus à n'importe quelle profondeur. Le point d'entrée du vrai `yjs` est `node_modules/.pnpm/yjs@13.6.33/node_modules/yjs/dist/src/index.d.ts` : un motif qui attrape tout dossier `dist` l'efface du graphe, et `document-coeur-pur` laisse alors passer `rang.ts → yjs` (essai C). La révision 1 de ce plan gardait ce motif et ne l'avait pas vu, ses essais portant sur un `yjs` factice sans dossier `dist`.

`doNotFollow` reste en place : chaque paquet importé apparaît comme une feuille (un seul module, sans dépendance), et rien n'est parcouru dans `node_modules` (essais A et H).

Hors dependency-cruiser, une règle ESLint tient la partie d'AC19 que les imports ne montrent pas (globales du DOM, du réseau et du stockage) : voir le fichier 7 du bloc 0.

## État actuel des fichiers racine

Le gate ne voit que le diff : les fichiers que le plan modifie ou dont il dépend sont recopiés ici tels qu'ils sont au commit `a05f4d1` (copie intégrale, faite par lecture du fichier le 2026-10-08). Ils n'ont pas changé depuis : `git diff a05f4d1 d9cea71` est vide sur ces quatre fichiers.

`.dependency-cruiser.cjs` :

```js
// Contrats de dépendances exécutables (ARCHITECTURE GATE, points 1 et 3). Fichier protégé :
// agent-architecte-conception propose les évolutions, le dev les commite.
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      severity: "error",
      comment: "Aucune dépendance cyclique.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domaine-pur",
      severity: "error",
      comment: "Le domaine ne dépend ni de l'infrastructure ni de l'interface.",
      from: { path: "/domain/" },
      to: { path: "/(infrastructure|adapters|ui|routes)/" },
    },
    {
      name: "paquets-sans-apps",
      severity: "error",
      comment: "Un paquet partagé ne dépend jamais d'une application.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-isolees",
      severity: "error",
      comment: "Le client et le serveur ne s'importent pas : ils passent par packages/.",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/([^/]+)/", pathNot: "^apps/$1/" },
    },
    {
      name: "document-sans-reseau-ni-base",
      severity: "error",
      comment: "Le modèle de document (CRDT) reste pur : ni base serveur ni contrats HTTP.",
      from: { path: "^packages/document/" },
      to: { path: "^packages/(db|contrats)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage|node_modules)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
```

`tsconfig.base.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`package.json` (racine) :

```json
{
  "name": "notionlike",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.10.1",
  "engines": {
    "node": ">=26"
  },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "format:check": "prettier --check --ignore-unknown .",
    "contrats": "depcruise --config .dependency-cruiser.cjs apps packages"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "dependency-cruiser": "^18.5.0",
    "eslint": "^10.11.0",
    "prettier": "^3.9.9",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.71.0",
    "vitest": "^5.0.3"
  }
}
```

`eslint.config.mjs` :

```js
// Règles objectives du CRAFT GATE : ce fichier est protégé (Agent: dev uniquement).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const COMPLEXITE_CYCLOMATIQUE_MAX = 10;
const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      ".agents/**",
      ".claude/**",
      ".githooks/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      complexity: ["error", COMPLEXITE_CYCLOMATIQUE_MAX],
      eqeqeq: ["error", "always"],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: NOMBRES_NON_MAGIQUES,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreDefaultValues: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.*", "**/*.spec.*", "**/test/**", "**/e2e/**", "**/*.config.*"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
```

Commandes du socle qui lisent ces fichiers (`.agents/outils.env`, fichier protégé, cité sans modification) :

```text
TEST_CMD="pnpm exec vitest run --passWithNoTests"
LINT_CMD="pnpm exec eslint --no-warn-ignored"
CONTRATS_CMD="pnpm exec depcruise --config .dependency-cruiser.cjs apps packages"
```

Aucune commande du socle ne lance `tsc`.

## Fichiers à commiter par le dev (bloc 0)

Fichiers protégés ou partagés, hors du périmètre des agents : huit fichiers, textes complets, conformes à Prettier (`printWidth` 100). Un seul commit `Agent: dev`, `Feature: F-001`, après `pnpm install`.

La spec validée liste quatre prérequis : les fichiers 1, 2, 3 et 8. La conception en ajoute quatre, tous à la racine (4 `vitest.config.ts`, 5 `.dependency-cruiser.cjs`, 6 `package.json`, 7 `eslint.config.mjs`), et une dépendance de développement, `fast-check@4.10.2`, proposée par `MEMORY/VEILLE.md` (« à faire valider par le dev ») et non citée par la spec. La spec n'est pas modifiée : c'est le commit `Agent: dev` du bloc 0 qui entérine ces ajouts en les introduisant (ADR-0003, « Contexte et problème »). Si le dev en refuse un, le bloc 0 n'est pas commité et la conception est reprise.

### 1. `packages/document/package.json` (nouveau)

```json
{
  "name": "@notionlike/document",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "yjs": "13.6.33"
  },
  "devDependencies": {
    "fast-check": "4.10.2",
    "vitest": "^5.0.3"
  }
}
```

`vitest` reprend la contrainte de la racine (aucune nouvelle version dans le verrou). `eslint`, `prettier` et `tsc` viennent des binaires de la racine du workspace.

### 2. `packages/document/vitest.config.ts` (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "document",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 3. `packages/document/tsconfig.json` (nouveau)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": [],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`lib` sans `DOM` et `types` vide : un usage du DOM ou d'un module Node ne compile pas. `resolveJsonModule` sert au test de structure, qui importe le manifeste.

### 4. `vitest.config.ts` à la racine (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
```

Sans lui, la commande de test du socle (`pnpm exec vitest run`, lancée à la racine) ignore la configuration du paquet. `apps/*` s'y ajoutera avec la première application.

Rien au bloc 0 ne prouve que `projects` ramasse le paquet : il n'y a encore aucun test, et la commande du socle passe avec zéro test. La preuve est l'attendu chiffré du bloc 1 (« Attendu chiffré après chaque bloc ») : deux fichiers listés et comptés depuis la racine, sans quoi le bloc 2 ne démarre pas.

### 5. `.dependency-cruiser.cjs` (modifié, fichier protégé)

Ajouter ces deux règles à la fin de `forbidden`, après `document-sans-reseau-ni-base` :

```js
    {
      name: "document-yjs-seulement",
      severity: "error",
      comment:
        "F-001-AC19 : depuis packages/document/src, seuls un fichier de packages/document/src et le paquet yjs sont importables.",
      from: { path: "^packages/document/src/" },
      to: { pathNot: ["^packages/document/src/", "(^|/)node_modules/yjs/"] },
    },
    {
      name: "document-coeur-pur",
      severity: "error",
      comment:
        "ADR-0003 : rang, arbre et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni document-espace).",
      from: { path: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
      to: { pathNot: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
    },
```

Les deux règles sont écrites en liste blanche : elles n'énumèrent pas ce qui est interdit.

- `document-yjs-seulement` n'autorise que deux destinations. `pathNot` reçoit une liste : une dépendance viole la règle quand son chemin résolu ne correspond à aucune des deux expressions.
  - `^packages/document/src/` : un fichier du paquet lui-même.
  - `(^|/)node_modules/yjs/` : le paquet `yjs`. Sous pnpm, le chemin résolu est `node_modules/.pnpm/yjs@13.6.33/node_modules/yjs/dist/src/index.d.ts` (essais B et H) : l'expression le reconnaît par son dernier segment `node_modules/yjs/`, quelle que soit la version dans le nom du dossier `.pnpm`. Elle ne reconnaît pas un paquet au nom voisin (`node_modules/y-indexeddb/`, `node_modules/yjs-orderedtree/`).
  - Un module intégré de Node se résout en `fs`, un import non résolu en son nom tel qu'écrit, un fichier de test en `packages/document/test/…` : aucun ne correspond, tous échouent (essais B et H).
- `document-coeur-pur` n'autorise que les trois fichiers du cœur entre eux, ce qui couvre d'un coup les paquets npm, les modules de Node, les imports non résolus et les autres fichiers du paquet.

Et dans `options`, remplacer

```js
    exclude: { path: "(^|/)(dist|coverage|node_modules)/" },
```

par

```js
    exclude: { path: "^(apps|packages)/[^/]+/(dist|coverage)/" },
```

Le motif ne vise plus que le `dist` et le `coverage` d'un paquet ou d'une application du dépôt (voir « Règles de dépendances » et l'essai C). La commande des contrats ne parcourt que `apps` et `packages` : un `dist` ou un `coverage` à la racine n'a pas besoin d'être masqué.

### 6. `package.json` à la racine (modifié, fichier partagé)

Ajouter dans `scripts`, après `contrats` (avec la virgule à la fin de la ligne `contrats`) :

```json
    "typecheck": "pnpm -r run typecheck"
```

`pnpm typecheck` est la seconde barrière d'AC19, pas la seule : aucun contrôle du socle ne la lance, elle n'est tenue que parce que ce plan l'exige d'`agent-frontend` à chaque bloc. La brancher dans `.agents/outils.env` reste du ressort du dev et n'est pas un prérequis de F-001, puisque la barrière déterministe est la règle ESLint du fichier 7.

### 7. `eslint.config.mjs` (modifié, fichier protégé)

`pnpm lint` et le contrôle de lint du socle (`LINT_CMD`, lancé par le hook `pre-commit`) lisent ce fichier : la règle est donc appliquée à chaque commit sans rien brancher de plus.

Ajouter cette constante après `NOMBRES_NON_MAGIQUES` :

```js
const GLOBALES_INTERDITES_DOCUMENT = [
  "window",
  "document",
  "navigator",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "process",
].map((name) => ({
  name,
  message: "F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage.",
}));
```

Et ce bloc dans la liste passée à `tseslint.config`, après le bloc des fichiers de test et avant celui des `**/*.cjs` :

```js
  {
    files: ["packages/document/src/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: GLOBALES_INTERDITES_DOCUMENT,
          checkGlobalObject: true,
        },
      ],
    },
  },
```

- La règle vise les globales, déclarées ou non : sans elle, `fetch` ou `localStorage` s'utilisent sans aucun import, ce que les contrats de dépendances ne voient pas.
- `checkGlobalObject` étend l'interdiction à `globalThis.fetch` et aux formes voisines.
- `crypto` n'est pas dans la liste : `crypto.randomUUID` est le seul accès à l'environnement dont le module a besoin (ADR-0003). Un paramètre nommé `document` n'est pas signalé (essai E).
- `process` et `EventSource` s'ajoutent à la liste minimale : accès à l'environnement Node et au réseau.
- Limite assumée : une globale absente de la liste (une API de navigateur future, par exemple) échappe à ESLint ; `pnpm typecheck` la refuse (`lib: ["ES2023"]`, `types: []`).
- `test/` n'est pas visé : les tests peuvent sonder l'environnement.

### 8. `pnpm-lock.yaml` (modifié, fichier partagé)

Produit par `pnpm install` à la racine après les fichiers 1 à 7. Attendu : `yjs@13.6.33`, `lib0` (transitive), `fast-check@4.10.2`, `pure-rand` (transitive). Une seule version de `yjs` doit y figurer : la clé `yjs@13.6.33` apparaît une fois dans `packages` et une fois dans `snapshots`, et aucune autre clé `yjs@` (constaté sur le gabarit, avec `lib0@0.2.119` et `pure-rand@8.4.2`).

### Sans changement

`pnpm-workspace.yaml` (le motif `packages/*` couvre déjà le paquet), `tsconfig.base.json`, `.prettierrc.json`.

## Une seule instance de `yjs` (à la charge de F-002)

Exposer `doc: Y.Doc` fait importer `yjs` par chaque consommateur. Si deux copies de `yjs` étaient chargées, une `Y.Map` créée par l'une ne serait pas une `Y.Map` pour l'autre, et la validation de l'ADR-0002 (« la valeur est une `Y.Map` ») écarterait toutes les pages sans erreur, puisque F-001-AC16 demande d'ignorer en silence (ADR-0003, « Conséquences »).

- Dans F-001, le risque n'existe pas : un seul manifeste du workspace déclare `yjs`, en version exacte (`13.6.33`), et aucun autre paquet ne l'importe. Rien n'est donc ajouté au bloc 0 : une version imposée à la racine ne contraindrait qu'un seul manifeste.
- Le moyen est à la charge de F-002, première feature qui ajoute un second manifeste et une bibliothèque (`y-indexeddb`) dépendant de `yjs` : version unique imposée à la racine par un catalogue pnpm (`catalog:` dans `pnpm-workspace.yaml`, fichier protégé, référencé par `"yjs": "catalog:"` dans chaque manifeste) ou, à défaut, par `overrides`. Non essayé ici ; la syntaxe exacte pour pnpm 12 est à vérifier par la veille de F-002.
- Le test de couture est à la charge de F-002 lui aussi : un `Y.Doc` construit par le consommateur avec son propre import de `yjs`, rempli par une façade de `@notionlike/document`, puis rouvert par `ouvrirDocumentEspace`, doit rendre les pages créées (liste non vide, mêmes titres). Avec deux instances, ce test échoue au lieu de rendre une arborescence vide en silence. S'y ajoute la vérification que le verrou ne contient qu'une entrée `yjs@`.
- Ces deux points ne peuvent pas être écrits par cette conception dans la spec de F-002 (hors périmètre) : ils sont remontés à l'orchestrateur pour `agent-planif`.

## Vérification après le commit du bloc 0

Deux séquences, lancées par l'orchestrateur après le commit du bloc 0 et avant le bloc 1 ; leurs sorties sont consignées dans la trace de la feature. Les sorties attendues ci-dessous sont celles de l'essai H, rejoué pour la révision 3.

Première séquence, sur le dépôt tel que commité :

```bash
pnpm install --frozen-lockfile
pnpm test        # aucun test encore : passe grâce à --passWithNoTests
pnpm contrats
pnpm lint
pnpm typecheck
```

Attendu : cinq codes de sortie à 0. `pnpm contrats` affiche `✔ no dependency violations found (2 modules, 1 dependencies cruised)` : les deux modules sont `packages/document/vitest.config.ts` et la feuille `vitest` qu'il importe. `pnpm test` affiche `No test files found, exiting with code 0` : cette séquence ne prouve donc pas que la configuration racine ramasse les tests du paquet. C'est l'attendu chiffré du bloc 1 qui le prouve.

Seconde séquence, preuve que les barrières mordent sur l'installation réelle. Elle écrit un fichier jetable dans `packages/document/src/` et, à l'étape 4, un second dans `packages/document/test/`, jamais commités et supprimés à chaque étape. Ces deux dossiers sont dans le périmètre d'`agent-frontend` : si le hook de périmètre refuse l'écriture à l'orchestrateur, la séquence est déléguée à `agent-frontend` avant tout code du bloc 1, ou faite par le dev.

```bash
mkdir -p packages/document/src   # le dossier n'existe pas encore au bloc 0
E=packages/document/src/essai.ts

# 1. un import de fast-check dans src/ fait échouer les contrats
printf 'import fc from "fast-check";\n\nexport const essai = fc;\n' > "$E"
pnpm contrats; echo "code=$?"

# 2. les modules parcourus : aucun fichier de node_modules n'est suivi
pnpm exec depcruise --config .dependency-cruiser.cjs --output-type json apps packages \
  | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{for(const m of JSON.parse(s).modules)console.log(m.dependencies.length,m.source)})'

# 3. un module intégré de Node fait échouer les contrats
printf 'import fs from "node:fs";\n\nexport const essai = fs;\n' > "$E"
pnpm contrats; echo "code=$?"

# 4. un import local qui sort de src/ (ici vers test/) fait échouer les contrats
mkdir -p packages/document/test   # le dossier n'existe pas encore au bloc 0
T=packages/document/test/essai-aide.ts
printf 'export const aide = 1;\n' > "$T"
printf 'import { aide } from "../test/essai-aide.ts";\n\nexport const essai = aide;\n' > "$E"
pnpm contrats; echo "code=$?"
rm "$T"
rmdir packages/document/test

# 5. une globale interdite fait échouer le lint
printf 'export const essai = fetch;\n' > "$E"
pnpm lint; echo "code=$?"
rm "$E"

# 6. yjs dans un fichier du cœur fait échouer les contrats (le vrai yjs est vu)
C=packages/document/src/rang.ts
printf 'import * as Y from "yjs";\n\nexport const essai = Y;\n' > "$C"
pnpm contrats; echo "code=$?"
rm "$C"
rmdir packages/document/src

git status --short packages/document   # attendu : aucune ligne
```

Attendu, étape par étape :

1. `code=1` et la ligne `error document-yjs-seulement: packages/document/src/essai.ts → node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/cjs/fast-check.d.ts`, puis `x 1 dependency violations (1 errors, 0 warnings). 4 modules, 2 dependencies cruised.`
2. Quatre lignes, et pas une de plus : `1 packages/document/src/essai.ts`, `0 node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/cjs/fast-check.d.ts`, `1 packages/document/vitest.config.ts`, `0 node_modules/.pnpm/vitest@…/node_modules/vitest/config.d.ts`. Le compte de modules inclut donc une feuille par paquet importé, et rien d'autre de `node_modules` : chaque ligne `node_modules/…` commence par `0` (aucune dépendance suivie), et aucune ligne ne commence par `packages/document/node_modules/` (les liens posés par pnpm dans le paquet ne sont pas parcourus comme des sources).
3. `code=1` et `error document-yjs-seulement: packages/document/src/essai.ts → fs`.
4. `code=1` et `error document-yjs-seulement: packages/document/src/essai.ts → packages/document/test/essai-aide.ts`, puis `x 1 dependency violations (1 errors, 0 warnings). 4 modules, 2 dependencies cruised.` Le fichier visé existe : c'est bien la sortie de `src/` qui est refusée, pas un import non résolu.
5. `code=1` et `error  Unexpected use of 'fetch'. F-001-AC19 : …  no-restricted-globals`.
6. `code=1` et `error document-coeur-pur: packages/document/src/rang.ts → node_modules/.pnpm/yjs@13.6.33/node_modules/yjs/dist/src/index.d.ts`, seule violation : `document-yjs-seulement` laisse passer `yjs`, comme voulu.

Si une étape ne donne pas ce résultat, le bloc 1 ne démarre pas : l'écart est remonté au dev, la configuration du bloc 0 étant hors du périmètre des agents.

## Essais

Ce qui suit est une déclaration de l'auteur de la conception, pas une preuve que le gate peut rejouer : la seconde séquence ci-dessus en rend l'essentiel reproductible au bloc 0.

Essais faits le 2026-10-08 sur des gabarits jetables hors du dépôt (`/tmp`), rien n'étant installé ni écrit dans le dépôt. Deux passes :

- révision 3, gabarit neuf (`/tmp/gabarit-f001.m8ZkeU`, supprimé ensuite), avec la règle `document-yjs-seulement` en liste blanche : essais A, B, H et J rejoués, K et L nouveaux. Leurs sorties ci-dessous sont celles de cette passe ;
- révision 2, gabarit précédent (`/tmp/gabarit-f001.iS3q66`) : essais C, D, E, F, G et I, non rejoués. Aucun ne dépend de `document-yjs-seulement` : ils portent sur l'option `exclude`, ESLint, TypeScript, Vitest et Yjs, dont les textes n'ont pas changé. La seconde moitié de l'essai C (le vrai `yjs` vu par `document-coeur-pur` avec le motif ancré) est rejouée par l'étape 6 de l'essai H.

Les deux gabarits sont construits de la même façon, décrite ci-dessous. Les sorties sont citées sans la ligne d'écho de pnpm, sans sa ligne `ELIFECYCLE` et, pour Vitest, sans les lignes d'heure, de durée et d'avertissement de Node :

- copies des fichiers racine du dépôt (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `tsconfig.base.json`, `.prettierrc.json`), modifiées exactement comme les fichiers 5, 6 et 7 ; fichiers 1 à 4 tels qu'écrits plus haut ;
- un vrai `pnpm install` (pnpm 12.10.1, Node 26.11.0) : il a résolu `yjs@13.6.33`, `lib0@0.2.119`, `fast-check@4.10.2` et `pure-rand@8.4.2`, et posé dans `packages/document/node_modules` trois liens (`yjs`, `fast-check`, `vitest`) vers `node_modules/.pnpm` ;
- outils installés : ESLint 10.11.0, dependency-cruiser 18.5.0, TypeScript 6.0.3, Vitest 5.0.3, Prettier 3.9.9 ;
- un squelette de six fichiers `src/` de quelques lignes aux noms du plan, avec les imports prévus (`index → document-espace, erreurs` ; `document-espace → format, arbre, rang, erreurs, yjs` ; `arbre → rang, erreurs` ; `format → yjs`), `test/aides.ts` et, selon la passe, un fichier de test (révision 2) ou deux, `test/rang.test.ts` et `test/operations.test.ts` (révision 3). Ce squelette n'est pas le code de F-001 : les essais prouvent l'outillage, pas les règles de l'ADR-0002.

**A. Contrats, état conforme au plan** (`pnpm contrats`, révision 3) :

```text
✔ no dependency violations found (14 modules, 18 dependencies cruised)

code=0
```

Les quatorze modules : six de `src/`, trois de `test/`, `vitest.config.ts`, et quatre feuilles sans dépendance (`yjs`, `fast-check`, `vitest`, `vitest/config`). `format.ts` et `document-espace.ts` importent `yjs` : la liste blanche le laisse passer.

**B. Contrats, violations volontaires** (révision 3, règle en liste blanche), en trois temps, le squelette étant remis en état entre chacun.

B1, l'exemple du rapport du gate : `src/format.ts` importe `../test/aides.ts`, qui existe.

```text
  error document-yjs-seulement: packages/document/src/format.ts → packages/document/test/aides.ts

x 1 dependency violations (1 errors, 0 warnings). 14 modules, 19 dependencies cruised.

code=1
```

B2, un autre paquet du workspace atteint par chemin relatif : `src/essai.ts` importe `../../autre/src/index.ts`, qui existe.

```text
  error document-yjs-seulement: packages/document/src/essai.ts → packages/autre/src/index.ts

x 1 dependency violations (1 errors, 0 warnings). 16 modules, 19 dependencies cruised.

code=1
```

B3, les violations de la révision 2 : `rang.ts` importe `yjs` et un type d'`erreurs.ts` ; `arbre.ts` importe `format.ts` ; `erreurs.ts` importe `node:fs`, `fast-check` et `paquet-absent` ; un fichier `essai.ts` importe `fast-check`. L'import de type entre fichiers du cœur n'est pas signalé, `arbre.ts → format.ts` ne l'est que par `document-coeur-pur` (les deux fichiers sont dans `src/`), `rang.ts → yjs` de même (`yjs` est permis à `src/`, pas au cœur) :

```text
  error document-yjs-seulement: packages/document/src/essai.ts → node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/cjs/fast-check.d.ts
  error document-yjs-seulement: packages/document/src/erreurs.ts → paquet-absent
  error document-yjs-seulement: packages/document/src/erreurs.ts → node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/cjs/fast-check.d.ts
  error document-yjs-seulement: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/rang.ts → node_modules/.pnpm/yjs@13.6.33/node_modules/yjs/dist/src/index.d.ts
  error document-coeur-pur: packages/document/src/erreurs.ts → paquet-absent
  error document-coeur-pur: packages/document/src/erreurs.ts → node_modules/.pnpm/fast-check@4.10.2/node_modules/fast-check/lib/cjs/fast-check.d.ts
  error document-coeur-pur: packages/document/src/erreurs.ts → fs
  error document-coeur-pur: packages/document/src/arbre.ts → packages/document/src/format.ts

x 9 dependency violations (9 errors, 0 warnings). 17 modules, 23 dependencies cruised.

code=9
```

Ce sont les neuf lignes que donnait la règle précédente sur les mêmes violations : la liste blanche ne perd aucun cas, elle ajoute B1 et B2. Non essayé : un autre paquet du workspace importé par son nom (`@notionlike/…`) plutôt que par chemin relatif ; aucun n'existe.

`pas-de-cycle` sur les fichiers du paquet n'a pas été réessayé dans cette révision (la révision 1 l'avait vu mordre sur des paquets factices).

**C. Le motif `exclude` de la révision 1 efface le vrai `yjs`.** Avec `exclude: { path: "(^|/)(dist|coverage)/" }`, sur le squelette nu du bloc 0 plus un `src/rang.ts` qui importe `yjs` :

```text
✔ no dependency violations found (3 modules, 1 dependencies cruised)

code=0
```

La seule dépendance vue est `vitest.config.ts → vitest` ; `rang.ts` apparaît sans aucune dépendance. Avec le motif ancré du fichier 5, même fichier :

```text
  error document-coeur-pur: packages/document/src/rang.ts → node_modules/.pnpm/yjs@13.6.33/node_modules/yjs/dist/src/index.d.ts

x 1 dependency violations (1 errors, 0 warnings). 4 modules, 2 dependencies cruised.

code=1
```

Avec ce motif ancré, des fichiers posés dans `packages/document/dist/` et `packages/document/coverage/` restent hors du graphe (même nombre de modules avec et sans eux).

**D. ESLint, usages interdits** : un fichier `packages/document/src/sale.ts` qui lit, ligne après ligne, `window`, `document.title`, `fetch(…)`, `indexedDB`, `localStorage`, `sessionStorage`, `new XMLHttpRequest()`, `new WebSocket(…)`, `navigator.onLine`, `globalThis.fetch`, `globalThis.localStorage`, `process.env`, `new EventSource(…)` (`pnpm lint` à la racine) :

```text
/private/tmp/gabarit-f001.iS3q66/packages/document/src/sale.ts
   2:18  error  Unexpected use of 'window'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage          no-restricted-globals
   3:18  error  Unexpected use of 'document'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage        no-restricted-globals
   4:18  error  Unexpected use of 'fetch'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage           no-restricted-globals
   5:18  error  Unexpected use of 'indexedDB'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
   6:18  error  Unexpected use of 'localStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage    no-restricted-globals
   7:18  error  Unexpected use of 'sessionStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage  no-restricted-globals
   8:22  error  Unexpected use of 'XMLHttpRequest'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage  no-restricted-globals
   9:22  error  Unexpected use of 'WebSocket'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
  10:18  error  Unexpected use of 'navigator'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage       no-restricted-globals
  11:29  error  Unexpected use of 'fetch'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage           no-restricted-globals
  12:29  error  Unexpected use of 'localStorage'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage    no-restricted-globals
  13:18  error  Unexpected use of 'process'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage         no-restricted-globals
  14:22  error  Unexpected use of 'EventSource'. F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage     no-restricted-globals

✖ 13 problems (13 errors, 0 warnings)

code=1
```

**E. ESLint et TypeScript, état conforme** : sans `sale.ts`, avec un fichier `src/` qui déclare localement `crypto`, appelle `crypto.randomUUID()` et prend un paramètre nommé `document`, et un test qui lit `"window" in globalThis` : `pnpm lint` et `pnpm typecheck` sans sortie, `code=0`, à la racine comme depuis le paquet.

**F. `pnpm typecheck`** avec le même `sale.ts` :

```text
src/sale.ts(2,18): error TS2304: Cannot find name 'window'.
src/sale.ts(3,18): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.
src/sale.ts(4,18): error TS2304: Cannot find name 'fetch'.
src/sale.ts(5,18): error TS2304: Cannot find name 'indexedDB'.
src/sale.ts(6,18): error TS2304: Cannot find name 'localStorage'.
src/sale.ts(7,18): error TS2304: Cannot find name 'sessionStorage'.
src/sale.ts(8,22): error TS2304: Cannot find name 'XMLHttpRequest'.
src/sale.ts(9,22): error TS2304: Cannot find name 'WebSocket'.
src/sale.ts(10,18): error TS2304: Cannot find name 'navigator'.
src/sale.ts(11,29): error TS7017: Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.
src/sale.ts(12,29): error TS7017: Element implicitly has an 'any' type because type 'typeof globalThis' has no index signature.
src/sale.ts(13,18): error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
src/sale.ts(14,22): error TS2304: Cannot find name 'EventSource'.
```

`test/` est dans `include` : la révision 1 avait vu qu'un test ne peut pas écrire `typeof window` (TS2304). Le test de structure écrit donc `"window" in globalThis` et `"document" in globalThis`, qui compilent et passent (essai G). Sans `sale.ts`, sur le squelette comme sur le paquet nu du bloc 0 : aucune sortie, `code=0`.

**G. Vitest** : un fichier de trois tests. Le premier ouvre un `Y.Doc` par le squelette, y crée une page, compte un seul événement `update`, encode l'état, l'applique à un `Y.Doc` vierge et relit la page. Le deuxième est une propriété fast-check à graine fixe et 300 exécutions, constantes importées de `test/aides.ts`. Le troisième importe le manifeste (`with { type: "json" }`), vérifie que `dependencies` ne contient que `yjs`, et que `"window" in globalThis` et `"document" in globalThis` sont faux. Depuis la racine (`pnpm test`, configuration 4) :

```text
 RUN  v5.0.3 /private/tmp/gabarit-f001.iS3q66

 Test Files  1 passed (1)
      Tests  3 passed (3)

code=0
```

Depuis `packages/document` (`pnpm test`, configuration 2) : même résultat. Sur le paquet nu du bloc 0, `pnpm test` à la racine finit en `code=0` sans aucun test.

**H. Séquences du bloc 0** (révision 3) : les deux séquences de « Vérification après le commit du bloc 0 », étape 4 comprise, ont été jouées mot pour mot sur le gabarit neuf, paquet nu (les trois fichiers du dev, ni `src/` ni `test/`), `pnpm install --frozen-lockfile` compris une fois le verrou produit. Elles ont donné les sorties écrites dans cette section. Sortie de l'étape 4, la nouvelle :

```text
  error document-yjs-seulement: packages/document/src/essai.ts → packages/document/test/essai-aide.ts

x 1 dependency violations (1 errors, 0 warnings). 4 modules, 2 dependencies cruised.

code=1
```

Deux écarts : le gabarit n'est pas le dépôt, ses hooks ne sont pas ceux du dépôt ; la dernière ligne de la séquence (`git status --short packages/document`) y a été remplacée par un `ls`, le gabarit n'étant pas un dépôt git (il ne restait que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts`).

**I. Paquet source et Yjs** :

- Node 26.11.0 charge `packages/document/src/index.ts` du squelette par son chemin de fichier, sans compilation, avec le vrai `yjs` ; les imports relatifs en `.ts` sont résolus.
- Dans un `Y.Doc` vierge, `doc.getMap("meta").has("version")` est faux.
- Une entrée écrite sur un `Y.Doc` puis reçue par `Y.applyUpdate` sur un autre est une `Y.Map` au sens d'`instanceof` ; sa valeur `place` revient comme un objet simple (prototype `Object.prototype`).
- Une valeur `undefined` écrite dans une `Y.Map` rend `has` vrai : « absente » et « présente mais `undefined` » se distinguent, ce que la règle de version de l'ADR-0002 utilise.
- Une transaction sans écriture n'émet aucun événement `update` ; une transaction de deux écritures en émet un seul.

**J. Format** (rejoué pour la révision 3, avec la règle en liste blanche) : `prettier --check --ignore-unknown` passe sur les fichiers 1 à 4 et sur les fichiers racine modifiés (5, 6 et 7). `prettier --write` (script `format`) n'a pas été lancé.

**K. Vitest depuis la racine, et identifiants fixés** (révision 3). Squelette avec deux fichiers de test : `test/rang.test.ts` (une propriété fast-check à graine fixe) et `test/operations.test.ts` (deux tests, dont un qui remplace `crypto.randomUUID` par `vi.spyOn` pour trois créations et vérifie que le squelette a reçu ces trois identifiants et les rend triés ; le second vérifie qu'après `vi.restoreAllMocks()` une création reçoit un autre identifiant). `pnpm lint` et `pnpm typecheck` : aucune sortie, `code=0`.

`pnpm exec vitest list --filesOnly` à la racine :

```text
[document] packages/document/test/operations.test.ts
[document] packages/document/test/rang.test.ts
code=0
```

`pnpm exec vitest run` à la racine :

```text
 RUN  v5.0.3 /private/tmp/gabarit-f001.m8ZkeU

 Test Files  2 passed (2)
      Tests  3 passed (3)

code=0
```

Le rapporteur par défaut ne nomme aucun fichier ; `--reporter=verbose` les nomme par leur chemin depuis le paquet (`✓ |document| test/rang.test.ts > …`). Le dossier `test/` une fois retiré, `pnpm exec vitest run` n'affiche que la ligne `RUN` et finit en `code=1`, là où `pnpm test` (`--passWithNoTests`) finit en `code=0` ; `pnpm exec vitest list --filesOnly` n'affiche alors rien et finit en `code=0`. C'est pourquoi l'attendu chiffré de chaque bloc demande les deux commandes.

**L. Parent absent en état intermédiaire** (révision 3), par un script Node de quelques lignes avec le vrai `yjs`, sans le module. Un `Y.Doc` A écrit une entrée P ; un `Y.Doc` B applique cette mise à jour puis écrit une entrée C dont le parent est P ; un `Y.Doc` vierge D applique la seule mise à jour de B, puis celle de A. Second cas : un seul `Y.Doc` écrit P puis C, et un `Y.Doc` vierge E reçoit la seconde mise à jour avant la première.

```text
1. D après la seule mise à jour de B : C | parent de C : P | P présent : false
1. D après la mise à jour de A : C,P
2. E après la seconde mise à jour seule : []
2. E après la première : [C,P]
```

Le parent absent est donc un état lisible dès que deux répliques émettent et qu'une troisième reçoit leurs mises à jour en désordre ; entre deux mises à jour d'un même émetteur, Yjs retient la seconde tant que la première manque.

Non essayé :

- aucune règle de l'ADR-0002 (rangs, tri par (rang, identifiant), réattribution, parent absent, cycles, consolidation, version) n'a été programmée ni exécutée : elles sont vérifiées par raisonnement, et leurs tests sont ceux du plan. En particulier, l'égalité des rangs de T et de N dans la séquence de F-001-AC5 est déduite de l'ADR-0002 (« Rangs » : calcul sans aléa ni horloge, entre les sœurs lues), pas observée ;
- les essais C, D, E, F, G et I n'ont pas été rejoués pour la révision 3 ;
- les séquences du bloc 0 et l'attendu chiffré des blocs sur le dépôt lui-même : ils ne peuvent l'être qu'après le commit du bloc 0 par le dev ;
- le comportement de Yjs quand un type racine (`meta`, `pages`) a été rempli autrement que comme une `Y.Map` ;
- l'import du paquet par son nom (`@notionlike/document`, champ `exports`) depuis un autre paquet, sous Node comme sous Vite ;
- les hooks du socle sur ces fichiers, et `ac-couverture.sh` sur les noms de tests ;
- le catalogue pnpm ou `overrides` pour l'instance unique de `yjs`, et tout essai à deux instances de `yjs`.

Les sorties d'essais de la révision 1 (paquets factices) ne sont plus citées : celles qui figurent ci-dessus viennent toutes d'une installation réelle.
