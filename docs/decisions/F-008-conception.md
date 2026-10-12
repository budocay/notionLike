# F-008 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-09 (première écriture : 2026-10-08)
Spec : `specs/F-008.md`, **validée** par le dev sur cette ligne (commit `651991f`, `Agent: dev`) : 24 critères (F-008-AC1 à AC24), 15 hypothèses (H1 à H15)
ADR : ADR-0004 (paquets, enveloppe d'erreur, application), ADR-0005 (base, migrations, tests embarqués), ADR-0006 (exécution, conteneurs), tous trois « accepté »

Ce document est le plan de réalisation de F-008, écrit avant le code. Il ne décrit pas le code livré : celui-ci l'est par `ARCHITECTURE.md` et par les trois ADR, réalignés le 2026-10-12. Le plan est gardé tel qu'il a été suivi ; ce qui a été livré autrement est relevé dans la section qui suit, et les phrases du plan que le code contredit portent la mention « livré autrement ».

- **État de référence.** Branche `F-008-socle`, commit `651991f`. Ce qui est dit ici des fichiers du dépôt est lu à ce commit (`git show HEAD:<chemin>`). F-001 (`packages/document`) et F-002 (`apps/web`) y sont ; il n'y a aucun code serveur.
- **Écart relevé le 2026-10-09 : la branche n'est pas à jour de `main`.** `F-008-socle` part du commit `5084631` ; `main` (`c1df7d8`) a 46 commits de plus, dont F-004 entière (Tailwind dans `apps/web`, trois contrats de dépendances, la règle ESLint des 50 lignes). À HEAD, `.dependency-cruiser.cjs` porte donc seize règles, et non les dix-neuf de `main`. Le script du bloc 0 est écrit pour les deux états et a été joué sur les deux (« Essais », U et V) ; l'ordre conseillé est de fusionner `main` dans `F-008-socle` avant le bloc 0 (« Composition avec `main` »). Ce choix revient à l'orchestrateur et au dev.
- **Mode rapide** (décision du dev du 2026-10-09, pour toutes les features) : pas de gate de conception avant le code ; les gates de fin jugent. Les règles que ce mode impose aux producteurs sont dans « Mode rapide : règles de réalisation ».
- `ARCHITECTURE.md` n'est pas modifié par cette conception, ni après chaque bloc : il est aligné une seule fois, après le dernier commit de code et avant la revue.
- Les trois ADR sont « accepté » : la spec validée entérine leurs choix (H1 à H15) et renvoie elle-même à l'ADR-0006 pour H10, H15 et les constats du script de fumée. Ils sont reposés ici sans changement de décision.
- Historique. Ce plan a été écrit le 2026-10-08 sur la branche `F-008`, avant tout code, repris plusieurs fois ce jour-là, et commité sur la branche d'archive `planification-reunie` (commit `a246106`, état de référence `2e8a651` : F-001 seule, sept contrats, pas d'`apps/web`). La spec de cette archive et celle de HEAD sont identiques (`git diff planification-reunie HEAD -- specs/F-008.md` ne rend rien).
- Révision du 2026-10-09 : le plan est reposé sur `F-008-socle` et recalé. Ce qui change :
  - l'état relevé des fichiers racine (seize contrats à HEAD, dix-neuf sur `main` ; `apps/web` présente ; 777 tests à HEAD, 1 078 sur `main`) ;
  - le script du bloc 0 : `@types/node@26.6.4` (éligible depuis le 2026-10-08 à 22 h 39 UTC, installée à l'essai) ; `pino` reste en `10.3.1` (`10.4.0` refusée par pnpm le 2026-10-09 à 13 h 52 UTC) ; deux fichiers de plus, dans `packages/document` (`tsconfig.src.json` créé, script `typecheck` complété), pour que le bloc 0 n'affaiblisse pas la barrière de types de F-001-AC19 ; seize fichiers au lieu de quatorze ;
  - la séquence des barrières : une douzième étape, pour cette barrière de types ;
  - le plan : mode rapide, `ARCHITECTURE.md` aligné une fois, règles de réalisation, parallélisme dit bloc par bloc ;
  - « Composition avec F-002 » devient « Composition avec `main` » : F-002 est dans HEAD, il reste F-004 ;
  - les essais U à W, du 2026-10-09, qui fondent le bloc 0. Les essais A à T sont gardés comme historique, avec leur date : aucun n'a été rejoué, sauf mention.
- Aucun critère, aucun fichier des blocs 1 à 6, aucune interface figée ne change.

## Livré autrement que ce plan

Relevé du 2026-10-12 sur `0fd735e`, dernier commit de code ou de configuration de F-008. Tout ce que le plan dit et qui n'est pas listé ici a été livré comme écrit, à la connaissance de ce relevé : les fichiers, les exports, les contrats et les fichiers d'infrastructure ont été relus un à un ; les essais A à W ne l'ont pas été.

| Sujet                          | Ce que le plan disait                                                                 | Ce qui est livré                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec                           | 24 critères (AC1 à AC24), validée `651991f`                                           | 26 critères : F-008-AC25 (écoute impossible) et AC26 (arrêt en échec) ajoutés, AC7 et AC17 précisés, au commit `cdab8cc`, revalidée `486b48e`                                                               |
| Fichiers d'`apps/server/src`   | six, `main.ts` écoutant les signaux et fixant le code de sortie                       | sept : `service.ts` (`servir({ configuration, base, processus })`) écoute `SIGTERM` et sort par le processus reçu ; `main.ts` reste le seul à toucher `process` (ADR-0004)                                  |
| `creerJournal`                 | flux facultatif, sortie standard par défaut                                           | flux obligatoire : `servir` lui passe la sortie standard du processus reçu                                                                                                                                  |
| Écoute impossible              | non traitée                                                                           | `demarrerServeur` rejette ; `servir` ferme la base, écrit une phrase fixe et sort en code 1 (F-008-AC25)                                                                                                    |
| Fin sur `SIGTERM`              | « puis code de sortie 0 », sans dire par quoi                                         | `exit(0)` explicite après la fermeture de la base ; un arrêt qui rejette donne une phrase fixe et le code 1, sans l'objet d'erreur (F-008-AC7, AC26, ADR-0006)                                              |
| `Base.fermer()`                | ferme la réserve                                                                      | idempotente, et coupe les requêtes en vol (ADR-0005)                                                                                                                                                        |
| `demarrerFauxPostgres`         | un argument ; `FauxPostgres` à quatre membres                                         | second argument `{ neFermeJamais }` ; `FauxPostgres` porte aussi `messagesRecus` (ADR-0005)                                                                                                                 |
| Fichiers de `packages/db/test` | ceux du tableau « Fichiers »                                                          | deux de plus : `faux-postgres.test.ts` (le faux serveur et la couture de ses appelants) et `fichiers-du-workspace.ts` (lecture des sources pour les tests de couture)                                       |
| Fichiers d'`apps/server/test`  | ceux du tableau « Fichiers »                                                          | trois de plus : `coutures.test.ts` (F-008-AC23, AC25, AC26), `service.test.ts` et `essai/main-fermeture-en-echec.ts`, entrée d'essai de F-008-AC26                                                          |
| Contrats de dépendances        | quatre règles                                                                         | six : `infra-a-part` et `serveur-tests-par-les-entrees-de-db` ajoutées au commit `0fd735e` ; vingt-cinq règles au total                                                                                     |
| Image Node                     | `node:26.10.0-alpine3.24`, à relire le jour du bloc                                   | `node:26.11.1-alpine3.24`, empreinte relue le 2026-10-09                                                                                                                                                    |
| `NODE_ENV` sous Compose        | vient de l'image seule ; le fichier d'exemple du serveur porte `NODE_ENV=development` | fixée à `production` dans `serveur.environment`, qui l'emporte sur le fichier chargé ; laissée en commentaire dans `apps/server/.env.example` ; le fichier Compose fixe donc quatre variables, et non trois |
| Nom du projet Compose          | non fixé                                                                              | `name: notionlike` ; la fumée tourne sous `notionlike-fumee`                                                                                                                                                |
| `infra/fumee.sh`               | à écrire au bloc 6, lancé par le dev                                                  | écrit ; onze constats ; lancé le 2026-10-12 par l'orchestrateur sur la pile réelle du poste, deux fois, `FUMEE: OK (constats 1 à 11)` (`MEMORY/features/F-008.md`)                                          |
| Tests d'`infra/`               | trois fichiers de test                                                                | trois fichiers de test et quatre fichiers de règles sous `infra/tests/regles/` ; les règles du script de fumée sont appliquées par `compose.test.ts`                                                        |
| Test d'une autre feature       | aucun fichier d'`apps/web` touché                                                     | `apps/web/test/coutures.test.ts` (F-002-AC31) retouché au commit `11f32bf`, exception nommée par la spec : l'énumération des lecteurs d'un code se borne aux paquets qui importent `@notionlike/document`   |
| Dettes                         | D-002 proposée                                                                        | D-002 inscrite ; D-011 ouverte (sonde hors délai qui garde sa connexion empruntée)                                                                                                                          |

## Approche

Trois paquets, chacun avec une seule raison de changer :

- `packages/contrats` : ce que le client et le serveur se disent. Schémas `zod`, codes d'erreur, chemins. Aucune fonction dans F-008 : H2 n'y admet que des fonctions pures que le client et le serveur doivent appliquer à l'identique, et la première arrive avec F-012.
- `packages/db` : ce qui parle à PostgreSQL. Accès Drizzle, sonde bornée par le code, commande de migration.
- `apps/server` : ce qui parle HTTP. Une fonction compose l'application à partir d'une configuration validée, d'une `Base` et d'un journal ; un fichier porte le processus.

Trois idées tiennent le reste :

- **L'application reçoit ses dépendances.** La production lui donne une `Base` construite avec `pg` ; les tests, une `Base` construite avec PGlite par un fichier d'aide de `packages/db/test/`. Aucun fichier de `src/` ne connaît PGlite (ADR-0005).
- **Le code tourne tel qu'il est écrit.** Node 26 exécute le TypeScript sans compilation, sur le poste, dans les tests et dans l'image (ADR-0006).
- **Chaque frontière est un contrôle.** Les imports permis à chaque paquet sont une liste blanche de `.dependency-cruiser.cjs` ; ce que les imports ne montrent pas est tenu par ESLint ou par un test (« Barrières et contrôles qui les tiennent »).

## Traçabilité : spec, veille, conception

| Élément                                                                                                                                                                                                                                                           | Origine                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les 24 critères F-008-AC1 à AC24 ; les hypothèses H1 à H9 et H11 à H14                                                                                                                                                                                            | spec, consignées sans être rouvertes (ADR-0004 à 0006)                                                                                                                                                                                                                                                                                |
| H2 (frontière de `packages/contrats`)                                                                                                                                                                                                                             | spec, retouchée avant sa validation (commit `68d1679`) : des fonctions pures partagées y sont admises, la règle de dépendances de F-008-AC23 est inchangée. F-008 n'en livre aucune ; `contrats-zod-seulement` et la règle ESLint tiennent la frontière que H2 garde                                                                  |
| H6 (état du dossier de migrations réel)                                                                                                                                                                                                                           | laissée à la conception par la spec ; tranchée par l'ADR-0005                                                                                                                                                                                                                                                                         |
| H10 (mode d'exécution, forme du Dockerfile)                                                                                                                                                                                                                       | tranchée par l'ADR-0006 ; la spec l'écrit telle quelle depuis le commit `2d9e14d` (exécution native par Node 26, variante Alpine, `npm` retiré, `USER node`), la forme exacte du Dockerfile restant à la conception tant que F-008-AC19 à AC21 tiennent                                                                               |
| H15 (risque accepté sur l'image `postgres:18.6`)                                                                                                                                                                                                                  | ADR-0006, « Conséquences » ; reprise par la spec avec le même décompte (84 constats, 2 CRITICAL et 82 HIGH)                                                                                                                                                                                                                           |
| Neuf fichiers de squelette (trois paquets : `package.json`, `vitest.config.ts`, `tsconfig.json`), `package.json` racine, `pnpm-lock.yaml`, `.dependency-cruiser.cjs`                                                                                              | prérequis de la spec                                                                                                                                                                                                                                                                                                                  |
| Versions `express@5.2.1`, `helmet@8.3.0`, `zod@4.6.5`, `drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`, `@types/express@5.0.6`, `yaml@2.9.1`                                                                                  | veille du 2026-10-08, reprises par la spec                                                                                                                                                                                                                                                                                            |
| `pino@10.3.1`, `@types/node@26.6.4`                                                                                                                                                                                                                               | règle de la spec (dernière version publiée depuis au moins 7 jours le jour de l'installation ; pour `@types/node`, dans la majeure 26) ; registre relu et installation essayée le 2026-10-09 à 13 h 30 UTC : `@types/node@26.6.4` s'installe, `pino@10.4.0` est refusée par pnpm jusqu'au 2026-10-09 à 18 h 18 UTC (« Bloc 0 (dev) ») |
| Écarts de PGlite, migrateur Drizzle en une transaction, `statement_timeout` non appliqué                                                                                                                                                                          | veille, repris par la spec (H5, H13)                                                                                                                                                                                                                                                                                                  |
| Étiquettes et contenu de l'image Node 26 (`corepack` absent, root par défaut), volume de PostgreSQL 18 sur `/var/lib/postgresql`, syntaxes de Compose, version minimale 2.24.0, failles des images                                                                | veille des conteneurs du 2026-10-08, rejouée par cette conception (« Essais », J à L) ; reprise depuis par la spec (H1, H10, H15, F-008-AC20, prérequis du poste)                                                                                                                                                                     |
| Variante Alpine de l'image Node, `npm` retiré de l'image finale, `USER node` explicite ; `pg_isready` sur l'adresse TCP ; variables facultatives `PORT_PUBLIE_BASE` et `PORT_PUBLIE_SERVEUR` ; lancement par `up -d --wait` et constats 1 à 10 du script de fumée | conception (ADR-0006), après essai ; repris par la spec au commit `2d9e14d` (H10, H11, H12, F-008-AC19, AC20) : ce ne sont plus des ajouts                                                                                                                                                                                            |
| `drizzle-kit` n'est pas installé                                                                                                                                                                                                                                  | spec (H9 : il entre avec F-009, qui le porte dans ses prérequis, son hypothèse H19) ; ADR-0005                                                                                                                                                                                                                                        |
| **Ajouts de la conception, hors des prérequis de la spec**                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                       |
| `vitest.config.ts` à la racine                                                                                                                                                                                                                                    | la spec demande la garantie (« `pnpm exec vitest run` à la racine exécute les tests des trois paquets et d'`infra/tests/` ») sans nommer le fichier                                                                                                                                                                                   |
| `eslint.config.mjs` : globales de Node interdites dans `packages/contrats/src`                                                                                                                                                                                    | conception (F-008-AC23)                                                                                                                                                                                                                                                                                                               |
| `.dependency-cruiser.cjs` : quatre règles en liste blanche au lieu des trois règles de la spec (l'option `exclude` est déjà corrigée par le bloc 0 de F-001)                                                                                                      | conception ; les quatre règles couvrent les trois demandées et vont plus loin                                                                                                                                                                                                                                                         |
| Script racine `typecheck`                                                                                                                                                                                                                                         | déjà en place à HEAD (bloc 0 de F-001) : rien à ajouter                                                                                                                                                                                                                                                                               |
| `packages/document/tsconfig.src.json` et seconde passe de `tsc` dans le script `typecheck` de `packages/document`                                                                                                                                                 | conception : sans elle, le bloc 0 ferait accepter à `tsc` les globales de Node dans `packages/document/src` (F-001-AC19, barrière hors du socle, dette D-007)                                                                                                                                                                         |
| Scripts `migrer` (`packages/db`) et `demarrer` (`apps/server`), entrée `./essai` du manifeste de `packages/db`                                                                                                                                                    | conception (ADR-0005, ADR-0006)                                                                                                                                                                                                                                                                                                       |
| Noms `URL_BASE_DONNEES` et `POSTGRES_PASSWORD`, valeur factice `factice-a-remplacer`, limite de 100 000 octets, délai d'arrêt de 8 000 ms                                                                                                                         | conception ; la spec fixe les comportements, pas ces noms ni ces valeurs                                                                                                                                                                                                                                                              |
| Faux serveur PostgreSQL de test                                                                                                                                                                                                                                   | conception (ADR-0005)                                                                                                                                                                                                                                                                                                                 |

Tout ce qui figure sous « Ajouts » n'est validé par personne tant que le dev ne l'a pas commité : c'est le commit `Agent: dev` du bloc 0, qui introduit ces fichiers, qui les entérine. Si le dev en refuse un, le bloc 0 n'est pas commité et la conception est reprise. Il ne reste aucun écart à la liste des prérequis de la spec : elle ne liste plus `drizzle-kit`.

## Fichiers

| Fichier                                                                                                                              | Rôle                                                                     | Producteur      | Naît au bloc |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------- | ------------ |
| les seize fichiers de « Bloc 0 (dev) » : dix créés, six modifiés                                                                     | squelettes, configuration des contrôles                                  | dev             | 0            |
| `packages/contrats/src/erreurs.ts`, `src/sante.ts`, `src/index.ts`                                                                   | ADR-0004                                                                 | `agent-backend` | 1            |
| `packages/contrats/test/erreurs.test.ts`, `test/sante.test.ts`, `test/structure.test.ts`                                             | enveloppe et codes ; réponses et chemins ; manifeste                     | `agent-backend` | 1            |
| `packages/db/src/erreurs.ts`, `src/sonde.ts`, `src/acces.ts`, `src/index.ts`                                                         | ADR-0005                                                                 | `agent-bdd`     | 2            |
| `packages/db/test/essai.ts`, `test/base-embarquee.ts`, `test/faux-postgres.ts`                                                       | aides de test publiées par `@notionlike/db/essai`                        | `agent-bdd`     | 2            |
| `packages/db/test/acces.test.ts`, `test/structure.test.ts`                                                                           | accès, sonde, erreurs ; manifeste                                        | `agent-bdd`     | 2            |
| `packages/db/src/migration.ts`, `src/migrer.ts`                                                                                      | migrations et leur commande                                              | `agent-bdd`     | 3            |
| `packages/db/migrations/meta/_journal.json`                                                                                          | dossier de migrations réel, sans migration                               | `agent-bdd`     | 3            |
| `packages/db/test/migrations-essai/{premier-lancement,lancement-defaillant,lancement-corrige}/`                                      | jeux d'essai au format Drizzle (`meta/_journal.json` et fichiers SQL)    | `agent-bdd`     | 3            |
| `packages/db/test/migration.test.ts`, `test/commande.test.ts`                                                                        | migrations sur la base embarquée ; commande lancée par un vrai processus | `agent-bdd`     | 3            |
| `apps/server/src/configuration.ts`, `src/journal.ts`, `src/enveloppe.ts`, `src/application.ts`, `src/serveur.ts`                     | ADR-0004                                                                 | `agent-backend` | 4            |
| `apps/server/test/aides.ts`                                                                                                          | lance l'application sur un port libre avec un journal capturé            | `agent-backend` | 4            |
| `apps/server/test/sante.test.ts`, `erreurs.test.ts`, `en-tetes.test.ts`, `journal.test.ts`, `configuration.test.ts`, `arret.test.ts` | tests HTTP et tests de la configuration                                  | `agent-backend` | 4            |
| `apps/server/src/main.ts`, `apps/server/.env.example`                                                                                | processus (ADR-0006), fichier d'exemple                                  | `agent-backend` | 5            |
| `apps/server/test/processus.test.ts`                                                                                                 | processus réel : refus de démarrer, `SIGTERM`, fichier d'exemple         | `agent-backend` | 5            |
| `infra/docker-compose.yml`, `infra/Dockerfile`, `.dockerignore`, `infra/.env.example`, `infra/fumee.sh`                              | ADR-0006                                                                 | `agent-devops`  | 6            |
| `infra/tests/compose.test.ts`, `infra/tests/dockerfile.test.ts`, `infra/tests/exemples.test.ts`                                      | tests statiques (H12)                                                    | `agent-devops`  | 6            |

Chaque fichier est dans le périmètre de son producteur : `packages/contrats/**` et `apps/server/**` pour `agent-backend`, `packages/db/**` pour `agent-bdd`, `infra/**`, `Dockerfile*` et `.dockerignore` pour `agent-devops`.

## Plan par blocs

Le bloc 0 est fait par le dev, par le script de « Bloc 0 (dev) » ; les blocs 1 à 6 sont chacun un commit d'un producteur (`Feature: F-008`). L'ordre des numéros est celui de l'attendu chiffré ; les commits suivent l'ordre partiel de « Parallélisme et interfaces figées » ; l'écriture, elle, peut se faire en parallèle (« Parallélisme et interfaces figées »). Tout se fait dans un arbre propre de la branche de la feature (un worktree), jamais dans un arbre qui porte le travail non commité d'une autre feature. Chaque bloc livre ses tests et son code, les tests d'abord (« Mode rapide : règles de réalisation »), et laisse `pnpm test`, `pnpm lint`, `pnpm contrats` et `pnpm typecheck` verts. Un bloc n'est déclaré fini que si son attendu chiffré est constaté (« Attendu chiffré après chaque bloc »).

**Règle d'atteinte, vraie de chaque bloc.** Tout fichier de `src/`, toute fonction, tout export, toute route, tout code d'erreur, toute variable de configuration et toute commande livrés par un bloc sont exercés, dans le commit de ce même bloc, par au moins un test qui passe par un point d'entrée public. Un module peut naître un bloc avant son premier appelant de production : `contrats` (bloc 1) et `db` (blocs 2 et 3) ne sont importés par le serveur qu'au bloc 4, et les fonctions du serveur livrées au bloc 4 ne sont appelées par `main.ts` qu'au bloc 5. Il naît alors avec les tests qui l'exercent par son point d'entrée public, et rien n'y est livré qui ne soit pas exercé. Le bloc 0 ne livre aucun code : ses barrières sont prouvées par « Vérification des barrières après le bloc 0 ».

Points d'entrée publics :

- `packages/contrats` : `src/index.ts` ;
- `packages/db` : `src/index.ts`, l'entrée de test `test/essai.ts`, et la commande `src/migrer.ts` lancée par un processus ;
- `apps/server` : la surface HTTP de l'application construite par `creerApplication` et servie par `demarrerServeur` sur un port libre, interrogée par `fetch` ; `lireConfiguration` et `creerJournal`, qui construisent ses arguments ; le processus `src/main.ts`.

Une exception, nommée : `packages/db/test/migration.test.ts` importe `src/migration.ts` pour appeler `lancerMigration` sur la base embarquée, parce que la commande, elle, ne sait ouvrir que le pilote `pg`. La commande est exercée dans le même bloc par `test/commande.test.ts`, par un vrai processus.

| Bloc | Producteur      | Contenu                                                                                                                                                                                                                             | Critères                                                                                                 |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0    | dev             | Squelettes des trois paquets, projet `infra` de la configuration racine de Vitest, quatre contrats de dépendances, règle ESLint, `@types/node` et `yaml` à la racine, seconde passe de `tsc` de `packages/document`, `pnpm install` | prépare AC18 et AC23 : les barrières sont actives avant la première ligne de code                        |
| 1    | `agent-backend` | `packages/contrats` entier : enveloppe d'erreur, cinq codes, réponses et chemins de `/sante` et `/pret`                                                                                                                             | AC22 (schémas, liste, convention), AC23 (part de `contrats`)                                             |
| 2    | `agent-bdd`     | `packages/db`, accès : `ouvrirBase`, sonde bornée, erreurs typées, fermeture ; base embarquée et faux serveur PostgreSQL de test                                                                                                    | AC17, AC18 (part de `db`), AC23 (part de `db`) ; part d'AC3 tenue par le pilote                          |
| 3    | `agent-bdd`     | `packages/db`, migrations : `lancerMigration`, commande `migrer.ts`, dossier réel sans migration, jeux d'essai                                                                                                                      | AC15, AC16 ; fin d'AC17 (commande vers un port fermé)                                                    |
| 4    | `agent-backend` | `apps/server`, HTTP : configuration validée, journal, enveloppe, application, écoute et arrêt                                                                                                                                       | AC1 à AC6, AC8 à AC11, AC18 (part du serveur), AC22 (réponses validées) ; AC7, AC12 et AC14 par fonction |
| 5    | `agent-backend` | `apps/server`, processus : `main.ts`, `SIGTERM`, refus de démarrer, `apps/server/.env.example`                                                                                                                                      | fin d'AC7, AC12 et AC14 (par le processus) ; AC13 (fichier d'exemple du serveur)                         |
| 6    | `agent-devops`  | Infrastructure : fichier Compose, Dockerfile, `.dockerignore`, `infra/.env.example`, tests statiques, script de fumée                                                                                                               | AC13, AC19, AC20, AC21, AC24 ; fin d'AC14 (fichiers d'exemple)                                           |

`ARCHITECTURE.md` est écrit par `agent-architecte-conception`, seul agent qui l'a dans son périmètre, **une seule fois** : après le dernier commit de code ou de configuration de la feature et avant le dossier de revue. Il décrit alors le code réellement présent au dernier commit, jamais ce plan : chaque paquet reçoit un sous-titre dans `## Modules réels et dépendances`, et `### Configuration racine`, `### Contrats de dépendances`, `## Flux de synchronisation` et `## Menaces du produit` sont complétés. Aucun bloc n'attend cet alignement, et aucun producteur ne touche au fichier.

Après le bloc 6, le dev lance `infra/fumee.sh` une fois Docker démarré : c'est la seule preuve de la part dynamique de F-008-AC19 (H12). Le 2026-10-09, le démon Docker du poste ne répondait pas (`docker info` : client 29.8.2, `Cannot connect to the Docker daemon`) : il est à démarrer par le dev avant cette preuve.

Entre le bloc 0 et le bloc qui crée chaque `src/index.ts`, le champ `exports` des manifestes désigne un fichier qui n'existe pas encore. Rien ne s'y heurte : `apps/server` n'importe les deux paquets qu'au bloc 4.

### Mode rapide : règles de réalisation

Il n'y a pas de gate de conception : les gates de fin jugent le diff entier, et une faute trouvée là coûte une passe de revue complète. Les revues de F-002 et de F-004 ont demandé chacune trois passages ; ce qui suit vient de leurs constats. Chaque producteur l'applique à chacun de ses blocs.

1. **Test d'abord.** Le test est écrit et vu rouge avant le code qui le fait passer. Un test qui n'a jamais été rouge ne prouve rien.
2. **Un témoin jetable par critère de comportement.** Pour chaque critère de comportement d'un bloc, le producteur casse le code une fois (condition inversée, ligne retirée), constate que le test du critère devient rouge, puis rétablit le code. Le témoin n'est pas commité ; le producteur dit dans son message de fin, critère par critère, ce qu'il a cassé et quel test l'a vu.
3. **Chaque contrôle statique avec son cas fautif.** Un test qui lit un fichier (manifeste, fichier Compose, Dockerfile, fichier d'exemple) passe sa vérification à une fonction, et cette fonction est appelée aussi sur un texte fautif écrit dans le test, qu'elle doit refuser. Un contrôle qui ne peut pas échouer n'est pas livré. Les contrats et la règle ESLint du bloc 0 ont leurs cas fautifs dans « Vérification des barrières après le bloc 0 ».
4. **Test de couture pour tout contrat changé.** Un gate ne voit que le diff. Un bloc qui change une valeur par défaut, une signature ou un contrat déjà livré (par un bloc précédent ou par une autre feature) porte un test qui énumère les appelants et exerce chacun. Ce plan est construit pour qu'il n'y en ait qu'un cas : au bloc 3, `Pilote` gagne `appliquerMigrations` et `BaseEmbarquee` gagne `pilote`. Leurs appelants à cet instant sont tous dans `packages/db` (`src/acces.ts` et `test/base-embarquee.ts`, qui réalisent `Pilote` ; `test/acces.test.ts` et `test/migration.test.ts`, qui appellent `ouvrirBaseEmbarquee`) : `test/acces.test.ts` passe inchangé après le bloc 3, et `test/migration.test.ts` exerce les deux réalisations. Tout autre changement d'une interface figée demande d'abord l'accord de l'orchestrateur, puis ce test. La liste des appelants se lit dans le graphe (`pnpm exec depcruise --config .dependency-cruiser.cjs --output-type json apps packages`), pas par une recherche de texte.
5. **Rien de livré avant son premier appelant.** Ni fonction, ni export, ni paramètre, ni option, ni variable de configuration, ni fichier « pour plus tard ». La « Règle d'atteinte » plus haut dit comment un module né un bloc avant son appelant de production reste dans cette règle : tout ce qu'il livre est exercé, dans le même commit, par un test qui passe par son entrée publique.
6. **Un nom par chose.** Un type ou une aide de `test/` ne porte pas le nom d'un type de `src/`.
7. **Preuves hors des hooks.** Les hooks ne lancent ni `tsc`, ni Docker, ni l'exécution native des deux points d'entrée hors de Vitest. Ces preuves sont relevées sur le **dernier commit de code** de la feature, avec son hash, et versées dans `MEMORY/features/F-008.md` par l'orchestrateur : sortie de `pnpm typecheck` ; les deux commandes de « Attendu chiffré après chaque bloc » ; sortie d'`infra/fumee.sh` (Docker démarré par le dev). Une preuve relevée sur un commit antérieur est à refaire.
8. **Ordre de fin, strict.** Dernier commit de code ou de configuration ; preuves hors des hooks sur ce commit ; alignement unique d'`ARCHITECTURE.md` ; `dossier-revue.sh` et gates. Après l'alignement, aucun commit de code ni de configuration : une correction demandée par la revue rouvre la séquence entière (code, preuves, alignement, dossier de revue), parce que l'empreinte change.
9. **Aucune dépendance ajoutée par un agent, aucun `pnpm install`.** Le bloc 0 a tout posé. Un agent à qui il manque un paquet ou un script de manifeste s'arrête et le demande.

### Parallélisme et interfaces figées

Trois agents, trois périmètres disjoints, relus dans `.agents/perimetres/` : `agent-backend` (`apps/server/**`, `packages/contrats/**`), `agent-bdd` (`packages/db/**`), `agent-devops` (`infra/**`, `.dockerignore`, `Dockerfile*`, `docker-compose*.yml`, `deploy/**`). Chaque fichier du tableau « Fichiers » est dans le périmètre de son producteur, et aucun n'est écrit par deux agents. Aucun agent ne touche un fichier racine, sauf `.dockerignore` (`agent-devops`). Aucun n'écrit dans `apps/web/` ni dans `packages/document/`.

Ce qui peut se faire en même temps, bloc par bloc :

| Bloc | Agent           | Dossiers écrits                                                   | Strictement après                                                                                                       | En même temps que |
| ---- | --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 0    | dev             | fichiers racine, squelettes, deux fichiers de `packages/document` | rien : il est seul et premier ; ses barrières sont vérifiées avant tout agent                                           | aucun             |
| 1    | `agent-backend` | `packages/contrats/`                                              | 0                                                                                                                       | 2, 3, 6           |
| 2    | `agent-bdd`     | `packages/db/`                                                    | 0                                                                                                                       | 1, 6              |
| 3    | `agent-bdd`     | `packages/db/` (retouche des fichiers du bloc 2)                  | 2 : même agent, mêmes fichiers                                                                                          | 1, 4, 5, 6        |
| 4    | `agent-backend` | `apps/server/`                                                    | 1 (même agent) et 2 (le serveur importe `@notionlike/db` et `@notionlike/db/essai`)                                     | 3, 6              |
| 5    | `agent-backend` | `apps/server/`                                                    | 4 : même agent, mêmes dossiers                                                                                          | 3, 6              |
| 6    | `agent-devops`  | `infra/`, `.dockerignore`                                         | 0 pour l'écriture ; 5 pour le commit (`infra/tests/exemples.test.ts` lit `apps/server/.env.example`, commité au bloc 5) | 1 à 5             |

- **Trois vagues.** Après le bloc 0 : les blocs 1, 2 et 6 ensemble. Dès que 1 et 2 sont commités : les blocs 3 et 4 ensemble. Puis le bloc 5 ; le bloc 6 est commité en dernier. Lancés l'un après l'autre dans l'ordre des numéros, les blocs donnent les mêmes commits.
- **Strictement séquentiels** : 0 avant tout ; 2 puis 3 ; 1 puis 4 puis 5 ; 2 avant 4 ; 5 avant le commit de 6. Tout le reste est libre.
- **Commits dans un arbre partagé.** Chaque agent n'indexe et ne commite que ses chemins, nommés un par un (`git add <chemins>`, `git commit <chemins>`), jamais `git add -A` ni `git commit -a`. Le hook de pré-commit ne lance que le formatage, le lint et la recherche de secrets sur les fichiers commités : il ne dépend pas des fichiers en cours d'écriture d'un autre agent. Un `index.lock` rencontré se réessaie.
- **Machine chargée.** Trois lancements de Vitest en même temps peuvent faire échouer le démarrage des processus de test (`Failed to start forks worker`, `Timeout waiting for worker to respond` : constaté le 2026-10-09, « Essais », U). Ce n'est pas un échec de test : relancer seul avant de conclure. Les quatre attentes en temps réel du plan (« Stratégie de test ») ont des bornes larges pour cette raison.

| File            | Blocs, dans l'ordre | Ce qu'elle attend d'une autre file                                                                                                                      | Ce qu'elle vérifie seule, sans attendre                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `agent-backend` | 1, puis 4, puis 5   | pour exécuter et typer les blocs 4 et 5 : le bloc 2 d'`agent-bdd` (`@notionlike/db` et `@notionlike/db/essai`). Rien pour le bloc 1                     | le bloc 1 en entier ; l'écriture des blocs 4 et 5 contre les signatures figées                      |
| `agent-bdd`     | 2, puis 3           | rien                                                                                                                                                    | les blocs 2 et 3 en entier                                                                          |
| `agent-devops`  | 6                   | pour `infra/tests/exemples.test.ts` : `apps/server/.env.example` (`agent-backend`) ; pour `infra/fumee.sh`, lancé par le dev à la fin : les blocs 1 à 5 | `compose.test.ts`, `dockerfile.test.ts`, et les cas d'`exemples.test.ts` qui ne lisent que `infra/` |

- **Chemin critique : le bloc 2.** `agent-bdd` le finit avant d'ouvrir le bloc 3, et le déclare fini dès que `--project db` passe ses deux fichiers ; `agent-backend` peut alors exécuter les tests du bloc 4. Le bloc 3 ne retient personne : ni le serveur ni ses tests n'importent `src/migration.ts`, et le `pilote` rendu par `ouvrirBaseEmbarquee` ne sert qu'aux tests de `packages/db`.
- **`apps/server/.env.example` est écrit en premier**, par `agent-backend`, avant le bloc 1, au texte figé plus bas : `agent-devops` n'attend alors rien d'autre pour ses tests statiques. Le fichier reste rattaché au bloc 5, dont le test le relit.
- **Contrôles pendant l'écriture.** Les contrôles globaux (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `prettier --check .`) peuvent être rouges à cause d'un fichier qu'un autre agent est en train d'écrire. Chaque agent juge son travail sur son périmètre : `pnpm exec vitest run --project <le sien>`, `pnpm exec eslint --no-warn-ignored <ses dossiers>`, `pnpm exec prettier --check <ses dossiers>`, `pnpm --filter @notionlike/<son paquet> typecheck` (pour `infra/`, pas de `tsc`), et `pnpm contrats`, dont chaque ligne de violation nomme le fichier fautif. `tsc` sur `apps/server` suit les imports jusque dans `packages/db/src` : une erreur qui y est située appartient à `agent-bdd`. L'orchestrateur passe les contrôles globaux quand les trois files sont finies.
- **Écart avec la première version du plan** : elle enchaînait les six blocs ; l'ordre des numéros ne vaut plus que pour le tableau cumulatif. Les commits suivent l'ordre partiel du tableau ci-dessus.

Les interfaces qui relient les files sont figées ici. Un agent qui veut en changer une s'arrête et le demande : l'autre file code déjà contre elle.

**1. `@notionlike/contrats`**, vu par `apps/server` (même agent ; figé pour `apps/web`, qui l'importera plus tard). Neuf noms, réexportés par `src/index.ts` :

```ts
export const CODES_ERREUR: readonly [
  "requete-invalide",
  "ressource-introuvable",
  "corps-trop-grand",
  "base-indisponible",
  "erreur-interne",
];
export type CodeErreur = (typeof CODES_ERREUR)[number];
export type EnveloppeErreur = { code: CodeErreur; message: string; idRequete: string };
export type ReponseSante = { etat: "ok" };
export type ReponsePret = { etat: "pret" };
export const CHEMINS: { readonly sante: "/sante"; readonly pret: "/pret" };
export const schemaEnveloppeErreur: z.ZodType<EnveloppeErreur>; // objet strict, chaînes non vides
export const schemaReponseSante: z.ZodType<ReponseSante>; // objet strict
export const schemaReponsePret: z.ZodType<ReponsePret>; // objet strict
```

Les trois types sont déduits des schémas (`z.infer`) ; écrits par `z.strictObject`, `z.enum(CODES_ERREUR)` et `z.literal`, ils ont exactement cette forme (essai P, types seuls).

**2. `@notionlike/db`** (`packages/db/src/index.ts`, bloc 2), vu par `apps/server/src` :

```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface Base {
  readonly db: PgDatabase<PgQueryResultHKT, Record<string, never>>;
  sonder(): Promise<void>;
  fermer(): Promise<void>;
}
export type CodeErreurBase = "url-de-connexion-invalide" | "base-injoignable" | "sonde-hors-delai";
export class ErreurBase extends Error {
  readonly code: CodeErreurBase;
}
export function ouvrirBase(url: string): Base;
```

- Le serveur ne se sert que de `ouvrirBase(configuration.urlBaseDonnees)`, de `base.sonder()`, de `base.fermer()`, de `erreur instanceof ErreurBase` et de `erreur.code`. Il ne construit jamais d'`ErreurBase` : son constructeur n'est pas figé.
- `ouvrirBase` est synchrone, n'ouvre aucune connexion, et ne lève que `ErreurBase` `url-de-connexion-invalide`. `sonder()` ne rejette qu'avec une `ErreurBase` (`base-injoignable` ou `sonde-hors-delai`), au plus tard 2 000 ms après l'appel, à la tolérance des minuteries près.
- Les tests du serveur qui veulent une `Base` défaillante (F-008-AC1, AC8) écrivent un objet littéral `{ db, sonder, fermer }` en reprenant le `db` d'une base embarquée : `Base` est une interface, pas une classe.

**3. `@notionlike/db/essai`** (`packages/db/test/essai.ts`, bloc 2), vu par `apps/server/test` :

```ts
import type { Base } from "../src/index.ts";

export interface BaseEmbarquee {
  readonly base: Base; // le bloc 3 ajoute `readonly pilote`, que le serveur ne lit pas
}
export interface FauxPostgres {
  readonly url: string;
  seTaire(): void;
  couper(): void;
  arreter(): Promise<void>;
}
export function ouvrirBaseEmbarquee(): Promise<BaseEmbarquee>;
export function demarrerFauxPostgres(motDePasse: string): Promise<FauxPostgres>;
export function portFerme(): Promise<number>;
```

- Les trois fonctions sont asynchrones : PGlite et l'ouverture d'un port le sont (tranché ici ; la première version du plan ne le disait pas).
- `url` est une URL `postgres://` vers `127.0.0.1`, que `ouvrirBase` accepte telle quelle, et dont le mot de passe est `motDePasse` sans encodage (le test en choisit un sans caractère à encoder).
- Tant que le faux serveur répond, `sonder()` aboutit. Après `seTaire()`, `sonder()` rejette `sonde-hors-delai` entre 1,9 et 3 secondes. `couper()` ferme les connexions ouvertes sans arrêter l'écoute : la sonde suivante aboutit. `arreter()` ferme tout.
- `portFerme()` rend un port de `127.0.0.1` sur lequel rien n'écoute : `ouvrirBase` vers ce port donne une `Base` dont `sonder()` rejette `base-injoignable`.
- Une base embarquée par appel, jamais partagée ; l'appelant appelle `base.fermer()`.

**4. Processus et configuration**, vus par `infra/` (`agent-devops`) :

| Point figé                    | Valeur                                                                                                                                                                                                                                                           | Tenu par                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Commande du serveur           | `node apps/server/src/main.ts`, depuis la racine du workspace ; ne lit que `process.env`                                                                                                                                                                         | `agent-backend`, bloc 5 |
| Commande de migration         | `node packages/db/src/migrer.ts`, depuis la racine du workspace ; ne lit que `URL_BASE_DONNEES`                                                                                                                                                                  | `agent-bdd`, bloc 3     |
| Dossier de migrations         | `packages/db/migrations/`, trouvé par `migration.ts` à partir de son propre emplacement (`import.meta`), jamais du dossier courant                                                                                                                               | `agent-bdd`, bloc 3     |
| Variables lues par le serveur | `NODE_ENV`, `HOTE`, `PORT`, `URL_BASE_DONNEES`, `ORIGINES_AUTORISEES` (règles et défauts : ADR-0004)                                                                                                                                                             | `agent-backend`, bloc 4 |
| Codes de sortie               | serveur : 1 sur configuration invalide, 0 après `SIGTERM` en moins de 10 secondes ; migration : 0 ou 1                                                                                                                                                           | blocs 3 et 5            |
| Sonde de l'image              | `GET http://127.0.0.1:3000/sante` répond 200 sans toucher à la base ; `GET /pret` répond 200 ou 503                                                                                                                                                              | `agent-backend`, bloc 4 |
| Fixé par Compose, `serveur`   | `HOTE=0.0.0.0`, `PORT=3000`, `URL_BASE_DONNEES=postgres://notionlike:${POSTGRES_PASSWORD:?…}@base:5432/notionlike` ; `env_file` `../apps/server/.env`, obligatoire ; `NODE_ENV=production` vient de l'image (livré autrement : le fichier Compose la fixe aussi) | `agent-devops`          |
| Fixé par Compose, `migration` | la même `URL_BASE_DONNEES`, rien d'autre                                                                                                                                                                                                                         | `agent-devops`          |
| Lu par Compose (`infra/.env`) | `POSTGRES_PASSWORD`, obligatoire, sans valeur par défaut ; `PORT_PUBLIE_BASE` (défaut 5432) et `PORT_PUBLIE_SERVEUR` (défaut 3000), facultatives                                                                                                                 | `agent-devops`          |
| Contenu de l'image            | manifestes de la racine et des trois paquets, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, les trois `src/`, `packages/db/migrations/` ; ni `packages/document` ni `apps/web`, que le verrou connaît pourtant (essai V)                                              | `agent-devops`          |

Fichiers d'exemple, lus comme du texte par les tests des deux files. La valeur d'une clé est ce qui suit le premier `=` de sa ligne, sans guillemets ; chaque valeur factice est précédée d'une ligne de commentaire qui contient le mot « factice ».

```text
# apps/server/.env.example (agent-backend) : cette ligne, à l'identique
URL_BASE_DONNEES=postgres://notionlike:factice-a-remplacer@127.0.0.1:5432/notionlike

# infra/.env.example (agent-devops) : cette ligne, à l'identique
POSTGRES_PASSWORD=factice-a-remplacer
```

`apps/server/.env.example` porte aussi `HOTE=127.0.0.1`, `PORT=3000` et `ORIGINES_AUTORISEES=` (vide). `NODE_ENV` y est laissée en commentaire (`# NODE_ENV=development`) : le plan la donnait fixée à `development`, ce qui, le fichier étant chargé en entier par Compose, aurait défait le mode de production de l'image ; livré autrement, voir « Livré autrement que ce plan ». Le port 5432 de l'exemple est le défaut de `PORT_PUBLIE_BASE` : qui change l'un dans son `infra/.env` change l'autre dans son `apps/server/.env`.

### Acquis du plan, à ne pas redécouvrir

Chaque point a coûté un essai (« Essais », lettre entre parenthèses) ; le producteur l'applique tel quel.

| Acquis                                                                                                                                                                                                                               | Pour qui                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| La réserve de connexions `pg` porte un écouteur `error`, qui ignore l'erreur : sans lui, une connexion inactive coupée arrête le processus ; l'objet d'erreur porte le mot de passe en clair, il n'est ni journalisé ni transmis (D) | `agent-bdd`                  |
| Le délai de sonde (2 000 ms) est imposé par le code, par une course avec une minuterie ; aucun `statement_timeout`. Le délai de connexion de la réserve vaut la même constante (D)                                                   | `agent-bdd`                  |
| La sonde muette se prouve avec un faux serveur PostgreSQL de test et le vrai pilote `pg` (une soixantaine de lignes), pas avec PGlite : `pg_sleep` y bloque la boucle d'événements et la minuterie ne part pas (D)                   | `agent-bdd`                  |
| PGlite entre par la couture `Pilote`, depuis `packages/db/test/` ; aucun fichier de `src/` ne l'importe (`db-liste-blanche` le refuse), il reste en dépendance de développement (D, R)                                               | `agent-bdd`                  |
| Les messages d'erreur de Drizzle portent la requête et ses paramètres : jamais d'objet d'erreur sur une sortie, seulement des phrases fixes et les messages de la chaîne des `cause` (D)                                             | `agent-bdd`, `agent-backend` |
| À l'arrêt, fermer les connexions inactives de façon répétée, sans quoi `arreter()` attend le délai de maintien de connexion de Node, 5 secondes (C)                                                                                  | `agent-backend`              |
| Imports relatifs avec l'extension `.ts`, syntaxe effaçable seulement : Node exécute les sources ; un fichier `.ts` sous `node_modules` est refusé, d'où l'installation du workspace en place dans l'image (G)                        | tous                         |
| PostgreSQL 18 : le volume nommé se monte sur `/var/lib/postgresql`, `PGDATA` non redéfini ; sur `/var/lib/postgresql/data`, le conteneur sort en code 1 (L)                                                                          | `agent-devops`               |
| Image `node:26.<mineure>.<correctif>-alpine3.<version>` épinglée par empreinte, `npm` et `npx` retirés de l'étape finale (leurs dépendances portent les seules failles HIGH), `corepack` absent, `USER node` explicite (J)           | `agent-devops`               |
| Contrôle de santé de la base : `pg_isready -h 127.0.0.1 -U notionlike -d notionlike` ; sans `-h`, la socket répond pendant l'initialisation d'un volume vide et la migration part trop tôt (L)                                       | `agent-devops`               |
| Lancement par `docker compose up -d --wait`, jamais `--abort-on-container-exit`, qui arrête la pile dès que `migration` finit, même en code 0 (K)                                                                                    | `agent-devops`               |
| Ports publiés sur `127.0.0.1`, port du poste réglable (`PORT_PUBLIE_BASE`, `PORT_PUBLIE_SERVEUR`) : le 5432 du poste du dev est pris par une autre base, que ni le script de fumée ni un agent ne touche (K)                         | `agent-devops`               |
| Toute valeur YAML qui contient `${POSTGRES_PASSWORD:?message}` est quotée en entier, sans quoi le fichier ne se charge pas (K)                                                                                                       | `agent-devops`               |

### Interface livrée à la fin de chaque bloc

Rien n'est livré en attente : ni corps vide, ni `throw` « pas encore réalisé », ni `TODO`, ni membre optionnel.

| Fin du bloc | `@notionlike/contrats`                                                                                                                                                       | `@notionlike/db` (`src/index.ts`)                                                                      | `@notionlike/db/essai`                                                                                               | `apps/server`                                                                                                                                                                                                              | Commandes et infrastructure                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0           | aucun (`src/` n'existe pas)                                                                                                                                                  | aucun                                                                                                  | aucun                                                                                                                | aucun                                                                                                                                                                                                                      | aucune                                                                                |
| 1           | valeurs `CODES_ERREUR`, `schemaEnveloppeErreur`, `CHEMINS`, `schemaReponseSante`, `schemaReponsePret` ; types `CodeErreur`, `EnveloppeErreur`, `ReponseSante`, `ReponsePret` | aucun                                                                                                  | aucun                                                                                                                | aucun                                                                                                                                                                                                                      | aucune                                                                                |
| 2           | inchangé                                                                                                                                                                     | `ouvrirBase`, `ErreurBase` ; types `Base` (`db`, `sonder`, `fermer`) et `CodeErreurBase` (trois codes) | `ouvrirBaseEmbarquee` (rend `{ base }`), `demarrerFauxPostgres`, `portFerme` ; types `BaseEmbarquee`, `FauxPostgres` | aucun                                                                                                                                                                                                                      | aucune                                                                                |
| 3           | inchangé                                                                                                                                                                     | inchangé ; en interne, `Pilote` gagne `appliquerMigrations`                                            | `ouvrirBaseEmbarquee` rend `{ base, pilote }`                                                                        | aucun                                                                                                                                                                                                                      | `node packages/db/src/migrer.ts` ; `packages/db/migrations/`                          |
| 4           | inchangé                                                                                                                                                                     | inchangé                                                                                               | inchangé                                                                                                             | `lireConfiguration`, `ErreurConfiguration`, `MOT_DE_PASSE_FACTICE`, `creerJournal`, `creerApplication`, `demarrerServeur` ; routes `GET /sante` et `GET /pret` ; les cinq codes émis ; les cinq variables de configuration | aucune de plus                                                                        |
| 5           | inchangé                                                                                                                                                                     | inchangé                                                                                               | inchangé                                                                                                             | inchangé                                                                                                                                                                                                                   | `node apps/server/src/main.ts` ; `apps/server/.env.example`                           |
| 6           | inchangé                                                                                                                                                                     | inchangé                                                                                               | inchangé                                                                                                             | inchangé                                                                                                                                                                                                                   | `docker compose up` depuis `infra/` ; image ; `infra/.env.example` ; `infra/fumee.sh` |

Au bloc 2, `Pilote` n'a que `db` et `fermer` : `appliquerMigrations` arrive au bloc 3, avec son premier appelant. De même `ouvrirBaseEmbarquee` ne rend `pilote` qu'au bloc 3, où un test s'en sert.

### Ce que chaque bloc réalise, et par quoi c'est atteint

Bloc 1 (`packages/contrats`) :

- Les neuf exports sont appelés par les trois fichiers de test, par `src/index.ts`.
- `test/erreurs.test.ts` : l'enveloppe valide passe ; un champ manquant, un champ en trop, un `message` ou un `idRequete` vide sont refusés ; chaque élément de `CODES_ERREUR` suit `^[a-z0-9]+(-[a-z0-9]+)*$` ; la liste contient exactement les cinq codes de la spec ; `requete_invalide` (tiret bas) est refusé, comme une majuscule, un accent, un tiret en tête, en fin ou doublé.
- `test/sante.test.ts` : `{ etat: "ok" }` et `{ etat: "pret" }` passent, chacun est refusé par le schéma de l'autre, un champ en trop est refusé ; `CHEMINS` vaut `/sante` et `/pret`.
- `test/structure.test.ts` : le manifeste a `zod` pour seule clé de `dependencies`.
- Le chargement du paquet par Node sans compilation n'est prouvé qu'au bloc 5, quand `main.ts` l'importe dans un vrai processus. D'ici là, `pnpm typecheck` (exigé à chaque bloc) signale une syntaxe non effaçable ; ce n'est pas un contrôle du socle.

Bloc 2 (`packages/db`, accès) :

- `test/acces.test.ts`, par `src/index.ts` et `test/essai.ts` :
  - base embarquée : `sonder()` aboutit ; `db.execute` rend la ligne d'un `select` ; deux bases embarquées ouvertes dans le même fichier ne voient pas les tables l'une de l'autre (F-008-AC18) ;
  - pilote `pg` vers `portFerme()` : `sonder()` lève `ErreurBase` `base-injoignable`, dont le message ne contient ni l'URL ni le mot de passe ;
  - URL invalide : `ouvrirBase` lève `url-de-connexion-invalide`, sans `cause` ;
  - faux serveur muet : `sonder()` lève `sonde-hors-delai` entre 1,9 et 3 secondes ;
  - faux serveur dont les connexions sont coupées après une première sonde : aucune exception non interceptée, la sonde suivante aboutit (écouteur `error` de la réserve) ;
  - `fermer()` est appelée à la fin de chaque cas : la base embarquée et la réserve `pg` se ferment sans erreur.
- `test/structure.test.ts` : `dependencies` du manifeste réduit à `drizzle-orm` et `pg` ; `@electric-sql/pglite` n'apparaît que dans `devDependencies`.

Bloc 3 (`packages/db`, migrations) :

- `test/migration.test.ts`, sur une base embarquée, avec les trois jeux d'essai :
  - dossier réel (`DOSSIER_MIGRATIONS`) : code 0, table de suivi créée, zéro ligne, aucune table dans `public` ;
  - `premier-lancement` (une migration) : code 0, la table existe, une ligne de suivi ; relance : code 0, toujours une ligne (F-008-AC15) ;
  - `lancement-defaillant` (la même, une deuxième valide, une troisième en échec) : code 1, la table de la deuxième n'existe pas, toujours une ligne de suivi, la table du premier lancement est intacte ; les lignes écrites nomment l'échec ;
  - `lancement-corrige` (la troisième corrigée) : code 0, les trois tables existent, trois lignes de suivi (F-008-AC16).
- `test/commande.test.ts`, par un processus `node src/migrer.ts` :
  - sans `URL_BASE_DONNEES` : code 1, la sortie d'erreur nomme la variable ;
  - URL invalide : code 1, la sortie ne contient pas l'URL ;
  - port fermé : code 1, la sortie ne contient ni l'URL ni le mot de passe (fin de F-008-AC17) ;
  - faux serveur PostgreSQL : code 0. C'est le seul passage de `pnpm test` par le migrateur du pilote `pg`.
- `packages/db/migrations/meta/_journal.json` est lu par le premier cas de chaque fichier de test.

Bloc 4 (`apps/server`, HTTP) : voir « Correspondance critère par critère ». `test/aides.ts` construit l'application par `lireConfiguration` (avec `PORT=0`), `creerJournal` (flux capturé), `creerApplication` et `demarrerServeur`, à qui il passe `configuration.hote` et `configuration.port`, et rend l'URL, le texte du journal et `arreter`. Les quatre champs de la `Configuration` sont ainsi lus dans ce bloc, sauf `urlBaseDonnees` : elle est validée et comparée par `test/configuration.test.ts` ici, et lue par `main.ts` au bloc 5. Chaque fichier de test qui a besoin d'une base ouvre la sienne par `ouvrirBaseEmbarquee()`.

Bloc 5 (`apps/server`, processus) : `test/processus.test.ts` lance `node src/main.ts` avec un environnement choisi, lit ses deux sorties et son code de sortie.

Bloc 6 (infrastructure) : les trois fichiers de `infra/tests/` lisent le fichier Compose (bibliothèque `yaml`), le Dockerfile, `.dockerignore` et les deux fichiers d'exemple comme du texte. Ils n'appellent pas Docker.

- `infra/tests/compose.test.ts` : le fichier se charge (un message `${…:?…}` non quoté qui contient « : » ferait échouer la lecture) ; image de `base` ; cible du volume nommé égale à `/var/lib/postgresql` (et non `/var/lib/postgresql/data`), `PGDATA` absent de l'environnement de `base` ; commande du contrôle de santé de `base` qui contient `pg_isready`, `-h 127.0.0.1`, `-U notionlike` et `-d notionlike` ; ports ; dépendances entre services ; `env_file` et clés d'`environment` du serveur ; les services `migration` et `serveur` ont la même section `build`.
- `infra/tests/dockerfile.test.ts` : chaque `FROM` ; une seule référence d'image pour toutes les étapes ; la version de pnpm installée est celle du champ `packageManager` du `package.json` racine ; aucune ligne ne contient `corepack` ; l'étape finale retire `/usr/local/lib/node_modules/npm` ; dernier `USER` égal à `node` ; `HEALTHCHECK` présent ; `CMD` en forme tableau ; `.dockerignore`.
- `infra/tests/exemples.test.ts` : valeurs factices marquées, égalité des deux mots de passe factices.
- `infra/fumee.sh` : les constats 1 à 10 de l'ADR-0006, puis son nettoyage (point 11). Prérequis du poste, écrits en tête du script et dans `infra/.env.example` : Docker avec Compose 2.24.0 ou plus récent, `trivy`, `curl`.
- Le jour du bloc, `agent-devops` relit au registre l'étiquette Node 26 Alpine la plus récente qui se tire et les deux empreintes, et les écrit ; il ne recopie pas celles de la veille.

### Attendu chiffré après chaque bloc

`pnpm test` et la commande de test du socle gardent `--passWithNoTests` (fichiers protégés, non modifiés) : si la configuration racine de Vitest ne ramassait pas un projet, les hooks resteraient verts avec zéro test. La preuve du contraire est exigée bloc par bloc, par deux commandes lancées à la racine par l'orchestrateur après le commit du bloc, sans `--passWithNoTests` :

```bash
pnpm exec vitest list --filesOnly --project contrats --project db --project server --project infra; echo "code=$?"
pnpm exec vitest run --project contrats --project db --project server --project infra; echo "code=$?"
```

Les quatre `--project` rendent l'attendu indépendant des projets `document` (sept fichiers de test) et `web` (quatorze à HEAD, vingt-cinq sur `main`) : leurs fichiers ne sont ni listés ni comptés ici. La ligne 0 du tableau a été constatée le 2026-10-09 après le script du bloc 0 (essai V). Les lignes 1 à 6 reposent sur l'essai A du 2026-10-08, fait sans `packages/document`, et sur ce filtre.

Sans filtre, `pnpm test` doit garder au moins les tests d'avant le bloc 0 : 21 fichiers et 777 tests à HEAD, 32 fichiers et 1 078 tests sur `main` (essais U et V).

En écriture parallèle, chaque agent constate d'abord son propre projet (`--project contrats`, `--project db`, `--project server`, `--project infra`). Le tableau reste cumulatif dans l'ordre des numéros : quand un bloc est fini avant un bloc de numéro inférieur, les lignes de ce dernier manquent encore et le total est diminué d'autant.

| Après le bloc | Lignes attendues de `vitest list --filesOnly` (ordre libre), `code=0`                                                                                                                                                                                                                                 | Ligne attendue de `vitest run`, `code=0` |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 0             | aucune ligne ; `vitest run` finit en `code=1` avec `No test files found, exiting with code 1`                                                                                                                                                                                                         | sans objet                               |
| 1             | `[contrats] packages/contrats/test/erreurs.test.ts`, `[contrats] packages/contrats/test/sante.test.ts`, `[contrats] packages/contrats/test/structure.test.ts`                                                                                                                                         | `Test Files  3 passed (3)`               |
| 2             | les trois précédentes, `[db] packages/db/test/acces.test.ts`, `[db] packages/db/test/structure.test.ts`                                                                                                                                                                                               | `Test Files  5 passed (5)`               |
| 3             | les cinq précédentes, `[db] packages/db/test/migration.test.ts`, `[db] packages/db/test/commande.test.ts`                                                                                                                                                                                             | `Test Files  7 passed (7)`               |
| 4             | les sept précédentes, `[server] apps/server/test/sante.test.ts`, `[server] apps/server/test/erreurs.test.ts`, `[server] apps/server/test/en-tetes.test.ts`, `[server] apps/server/test/journal.test.ts`, `[server] apps/server/test/configuration.test.ts`, `[server] apps/server/test/arret.test.ts` | `Test Files  13 passed (13)`             |
| 5             | les treize précédentes, `[server] apps/server/test/processus.test.ts`                                                                                                                                                                                                                                 | `Test Files  14 passed (14)`             |
| 6             | les quatorze précédentes, `[infra] infra/tests/compose.test.ts`, `[infra] infra/tests/dockerfile.test.ts`, `[infra] infra/tests/exemples.test.ts`                                                                                                                                                     | `Test Files  17 passed (17)`             |

Règle, vraie de chaque bloc : chaque fichier attendu est listé, et le total de `vitest run` est celui de la liste. L'orchestrateur consigne les deux sorties dans la trace de la feature (`MEMORY/features/F-008.md`). Un fichier attendu absent, la ligne `No test files found` après le bloc 1 ou un code de sortie non nul : le bloc suivant ne démarre pas, et l'écart est remonté au dev (la configuration de Vitest est hors du périmètre des agents). Un fichier de test en plus, né d'un découpage, s'ajoute à la liste et au total ; il n'en retire aucun.

## Stratégie de test

- Aucun test ne demande Docker ni base externe (F-008-AC18). Les ports sont demandés au système (port 0) ; rien n'est écrit sur disque.
- Chaque test cite son critère dans son nom (`F-008-AC3 …`), ce que `ac-couverture.sh` vérifie. Les 24 identifiants sont cités ; F-008-AC19 l'est par `infra/tests/compose.test.ts`.
- Chaque réponse du serveur lue par un test de F-008-AC1 à AC8 est validée par le schéma de `@notionlike/contrats` qui lui correspond (F-008-AC22).
- Quatre attentes en temps réel, toutes bornées : la sonde muette du bloc 2 (2 secondes), `GET /pret` sur le faux serveur muet et l'arrêt pendant une requête au bloc 4 (2 secondes chacun), le processus du bloc 5. Ces tests fixent leur propre délai maximal, au-dessus des 5 secondes par défaut de Vitest.
- Les tests de processus lancent `node` par `spawn` avec un tableau d'arguments, jamais par une ligne de commande (règle `commande-shell-non-litterale` de `.semgrep.yml`).
- Test de couture des appelants : la spec le dit sans objet (« Hors périmètre »), l'enveloppe d'erreur, la configuration et l'accès à la base naissant ici, sans appelant antérieur. Le plan en garde un cas, au bloc 3 (« Mode rapide : règles de réalisation », point 4). Le bloc 0 change deux choses déjà livrées, toutes deux de configuration : la liste `projects` de Vitest, dont les projets `document` et `web` restent ramassés avec les mêmes fichiers et les mêmes tests avant et après (essais U et V) ; le script `typecheck` de `packages/document`, dont le seul appelant est `pnpm -r run typecheck` à la racine (essai W).

### Correspondance critère par critère

| Critère | Bloc    | Fichier de test                                                                                     | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1     | 4       | `apps/server/test/sante.test.ts`                                                                    | `GET /sante` : 200, corps validé par `schemaReponseSante`, avec une `Base` dont `sonder` et `fermer` lèvent (la base n'est pas interrogée)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC2     | 4       | `apps/server/test/sante.test.ts`                                                                    | `GET /pret` sur la base embarquée du fichier : 200 en moins de 2 secondes, corps validé par `schemaReponsePret`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC3     | 2, 4, 6 | `packages/db/test/acces.test.ts`, `apps/server/test/sante.test.ts`                                  | bloc 4 : pilote `pg` vers un port fermé : 503 `base-indisponible`, puis `GET /sante` 200 ; faux serveur muet : 503 entre 1,9 et 3 secondes, `GET /sante` 200 pendant et après. Bloc 2 : sonde bornée et connexion inactive coupée (même fichier que F-008-AC17). Bloc 6 : script de fumée sur la pile réelle                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AC4     | 4       | `apps/server/test/en-tetes.test.ts`                                                                 | `X-Request-Id` présent sur 200, 404, 400, 413, 500 et 503 ; différent d'un `X-Request-Id` envoyé par le client ; différent entre deux requêtes ; égal à `idRequete` dans chaque enveloppe ; une connexion qui envoie autre chose que du HTTP est fermée sans réponse                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| AC5     | 4       | `apps/server/test/erreurs.test.ts`                                                                  | `GET /inconnu`, `POST /sante`, `DELETE /pret`, `OPTIONS /sante`, `GET /sante/`, `GET /SANTE` : 404 `ressource-introuvable`, enveloppe validée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AC6     | 4       | `apps/server/test/erreurs.test.ts`                                                                  | corps JSON tronqué : 400 `requete-invalide` ; corps JSON qui n'est ni objet ni tableau : 400 ; objet JSON de 100 000 octets vers un chemin inconnu : 404 (lu, non refusé) ; objet de 100 001 octets : 413 `corps-trop-grand`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AC7     | 4, 5    | `apps/server/test/arret.test.ts`, `apps/server/test/processus.test.ts`                              | bloc 4 : `arreter()` appelée pendant un `GET /pret` en attente (faux serveur muet) : la requête reçoit sa réponse, une nouvelle connexion est refusée, `arreter()` finit moins d'une seconde après la réponse ; une requête à moitié envoyée est coupée après `delaiArretMs`. Bloc 5 : `SIGTERM` après un `GET /pret` réussi sur le faux serveur : code 0 en moins de 5 secondes, lignes d'arrêt dans le journal                                                                                                                                                                                                                                                                                                                            |
| AC8     | 4       | `apps/server/test/erreurs.test.ts`                                                                  | `Base` dont `sonder` lève une erreur ordinaire au message piégé (requête SQL, chemin, nom de table) et à propriété en plus : 500 `erreur-interne`, corps sans aucun de ces textes ; le journal a une ligne de même `idRequete` avec le message et la pile ; la propriété en plus n'y est pas                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AC9     | 4       | `apps/server/test/en-tetes.test.ts`                                                                 | sur 200, 404 et 500 : `X-Content-Type-Options: nosniff`, `Content-Security-Policy` qui contient `default-src 'none'` et `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, pas de `X-Powered-By` ; ni en-tête ni corps ne contient « Express », `process.version` ou « PostgreSQL »                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC10    | 4       | `apps/server/test/en-tetes.test.ts`, `apps/server/test/configuration.test.ts`                       | liste vide et origine quelconque : ni `Access-Control-Allow-Origin` ni `Access-Control-Allow-Credentials` ; liste d'une origine : absents pour une autre origine, présents pour celle-là ; `ORIGINES_AUTORISEES=*` : `lireConfiguration` refuse en nommant la variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC11    | 4       | `apps/server/test/journal.test.ts`                                                                  | chaque ligne capturée est du JSON ; la ligne de requête porte `idRequete`, `methode`, `chemin`, `statut`, `dureeMs` ; `GET /sante?jeton=…` donne `chemin` `/sante` ; après des requêtes portant `Cookie`, `Authorization` et un corps marqués, puis un 503 et un 500, le journal ne contient aucun marqueur, ni le mot de passe, ni l'URL de la base. Aucune route de F-008 n'émet `Set-Cookie`                                                                                                                                                                                                                                                                                                                                             |
| AC12    | 4, 5    | `apps/server/test/configuration.test.ts`, `apps/server/test/processus.test.ts`                      | bloc 4 : `URL_BASE_DONNEES` absente, `PORT` non entier, `NODE_ENV` inconnu, origine mal formée : `ErreurConfiguration` qui nomme chaque variable fautive, message sans aucune valeur. Bloc 5 : le processus finit avec le code 1, la sortie d'erreur nomme la variable sans sa valeur, la sortie standard n'a pas de ligne `ecoute`                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC13    | 5, 6    | `apps/server/test/processus.test.ts`, `infra/tests/compose.test.ts`, `infra/tests/exemples.test.ts` | bloc 6 : le fichier Compose se charge ; chaque usage de `POSTGRES_PASSWORD` y a la forme `${POSTGRES_PASSWORD:?…}`, dans une valeur quotée en entier, aucune forme à valeur par défaut ; `infra/.env.example` ne porte que la valeur factice, marquée par un commentaire. Bloc 5 : même contrôle pour `apps/server/.env.example`. `secrets.sh` : contrôle du socle sur la plage de la feature. L'échec de `docker compose config` sans la variable est constaté à l'essai (« Essais », H et K), pas par un test                                                                                                                                                                                                                             |
| AC14    | 4, 5, 6 | `configuration.test.ts`, `processus.test.ts`, `infra/tests/exemples.test.ts`                        | bloc 4 : `production` et mot de passe factice : refus qui nomme `URL_BASE_DONNEES` ; `development` : accepté ; `production` et autre mot de passe : accepté. Bloc 5 : même refus par le processus ; le mot de passe de l'URL d'`apps/server/.env.example` est `MOT_DE_PASSE_FACTICE`. Bloc 6 : `POSTGRES_PASSWORD` d'`infra/.env.example` est égal au mot de passe de l'URL d'`apps/server/.env.example`                                                                                                                                                                                                                                                                                                                                    |
| AC15    | 3       | `packages/db/test/migration.test.ts`                                                                | voir « Bloc 3 » : dossier réel, premier lancement, relance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC16    | 3       | `packages/db/test/migration.test.ts`                                                                | voir « Bloc 3 » : lancement en échec annulé en entier, lancement précédent intact, relance corrigée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC17    | 2, 3    | `packages/db/test/acces.test.ts`, `packages/db/test/commande.test.ts`                               | voir « Bloc 2 » et « Bloc 3 »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AC18    | 2, 4    | `packages/db/test/acces.test.ts`, `apps/server/test/sante.test.ts`                                  | deux bases embarquées indépendantes ; chaque fichier ouvre la sienne ; aucun test n'appelle Docker ni une adresse hors de `127.0.0.1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC19    | 6       | `infra/tests/compose.test.ts`, `infra/fumee.sh`                                                     | statique : `serveur` dépend de `base` (`service_healthy`) et de `migration` (`service_completed_successfully`), `migration` dépend de `base` (`service_healthy`). Dynamique : les constats 1 à 8 du script de fumée (ADR-0006), lancé par le dev par `up -d --wait`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC20    | 6       | `infra/tests/compose.test.ts`, `infra/tests/dockerfile.test.ts`                                     | image `postgres:18.6@sha256:` suivie de 64 caractères hexadécimaux ; chaque `FROM` du Dockerfile en `node:26.<mineure>.<correctif>-alpine3.<version>@sha256:` suivi de 64 caractères hexadécimaux, la même référence à chaque étape ; chaque port publié commence par `127.0.0.1:` ; volume nommé déclaré, monté sur `/var/lib/postgresql` ; contrôle de santé de `base` (`pg_isready -h 127.0.0.1 -U notionlike -d notionlike`) et du serveur (`HEALTHCHECK`) ; dernier `USER` égal à `node` ; l'étape finale retire `npm` ; `.dockerignore` commence par `*`. `CONTENEURS` : contrôle du socle, qui lit le verrou et les secrets du dépôt, pas les images (ADR-0006, « Conséquences ») ; image du serveur : constat 10 du script de fumée |
| AC21    | 6       | `infra/tests/compose.test.ts`, `infra/fumee.sh`                                                     | statique : `serveur.depends_on.migration.condition` vaut `service_completed_successfully` ; `migration` n'a pas de politique de redémarrage. Dynamique : constat 9 du script de fumée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC22    | 1, 4    | `packages/contrats/test/erreurs.test.ts`, `sante.test.ts` ; tests du bloc 4                         | voir « Bloc 1 » ; au bloc 4, validation de chaque réponse par les schémas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AC23    | 0, 1, 2 | `packages/contrats/test/structure.test.ts`, `packages/db/test/structure.test.ts`                    | bloc 0 : les quatre contrats et la règle ESLint, prouvés par « Vérification des barrières après le bloc 0 ». Blocs 1 et 2 : manifestes. À chaque bloc : `pnpm contrats` et `pnpm lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC24    | 6       | `infra/tests/compose.test.ts`                                                                       | `serveur.env_file` a une seule entrée, de chemin `../apps/server/.env` et sans `required: false` ; les clés de `serveur.environment` sont exactement `HOTE`, `PORT` et `URL_BASE_DONNEES`. L'échec de `docker compose config` sans le fichier est constaté à l'essai (« Essais », H et K)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Règles de dépendances

Sort des seize contrats en vigueur à HEAD (dix-neuf sur `main`, avec les trois de F-004) : tous conservés, aucun modifié.

| Contrat existant                                                | Portée dans F-008                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pas-de-cycle`                                                  | s'applique aux fichiers des trois paquets dès le bloc 1                                  |
| `domaine-pur`                                                   | sans objet : aucun des trois paquets n'a de dossier `domain`                             |
| `paquets-sans-apps`                                             | s'applique à `packages/db` et `packages/contrats`                                        |
| `apps-isolees`                                                  | prend effet avec F-008 : `apps/web` existe, le client et le serveur ne s'importent pas   |
| `document-sans-reseau-ni-base`                                  | prend effet : `packages/db` et `packages/contrats` existent                              |
| `document-yjs-seulement`, `document-coeur-pur`                  | visent `packages/document/src`, que F-008 ne touche pas                                  |
| les neuf règles `web-*` de F-002 (douze sur `main`, avec F-004) | partent toutes d'`apps/web/`, que F-008 ne touche pas : sans effet sur les trois paquets |

Quatre contrats ajoutés au bloc 0, tous en liste blanche : ils nomment ce qui est permis, tout le reste échoue sans énumération (autre paquet npm, fichier d'un autre paquet du workspace, fichier de `test/`, import non résolu).

| Contrat                  | Depuis                                   | Seules destinations permises                                                                                                                           | Demandes de la spec couvertes                                                                                                  |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `contrats-zod-seulement` | `packages/contrats/src/`                 | `packages/contrats/src/`, paquet `zod`                                                                                                                 | `contrats` sans `db`, sans `document`, sans Express, sans module intégré de Node ; `zod` seule dépendance d'exécution          |
| `db-liste-blanche`       | `packages/db/src/`                       | `packages/db/src/`, paquets `drizzle-orm` et `pg`, modules intégrés de Node                                                                            | `db` sans `contrats` ni Express ; PGlite hors du code de production                                                            |
| `serveur-liste-blanche`  | `apps/server/src/`                       | `apps/server/src/`, `packages/db/src/index.ts`, `packages/contrats/src/index.ts`, paquets `express`, `helmet`, `pino`, `zod`, modules intégrés de Node | ajout de la conception : entrée publique seule ; ni PGlite, ni `pg`, ni `drizzle-orm`, ni `src/migration.ts` depuis le serveur |
| `db-reserve-au-serveur`  | tout sauf `packages/db` et `apps/server` | n'importe quoi sauf un fichier de `packages/db/`                                                                                                       | `db` réservé au serveur ; `apps/web` ne dépend pas de `db`                                                                     |

Les fichiers de `test/` ne sont pas visés par les trois premières règles : `apps/server/test/` importe `packages/db/test/essai.ts`, ce que `db-reserve-au-serveur` permet.

Option `exclude` : elle vaut déjà `^(apps|packages)/[^/]+/(dist|coverage)/` (bloc 0 de F-001). Elle ne masque plus `node_modules` : les paquets npm sont dans le graphe, sans quoi aucune liste blanche ne verrait un import de `pg`, de PGlite ou d'`express`. Vérifié pour les paquets visés ici (« Essais », B, du 2026-10-08 ; l'étape 2 des barrières le rejoue pour `zod`) : `zod` se résout en `node_modules/.pnpm/zod@4.6.5/node_modules/zod/index.d.cts`, `express` en `…/node_modules/express/index.js`, `pg` en `…/node_modules/pg/esm/index.mjs`, `drizzle-orm` en `…/node_modules/drizzle-orm/index.d.ts`, PGlite en `…/node_modules/@electric-sql/pglite/dist/index.d.ts` ; le motif ancré n'en masque aucun.

Hors dependency-cruiser : la règle ESLint `no-restricted-globals` sur `packages/contrats/src` (bloc 0).

## Barrières et contrôles qui les tiennent

| Barrière promise                                                                                                                                | Contrôle du socle qui la tient                                                                                 | Ce qui n'est pas tenu par le socle                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contrats` importable dans un navigateur (AC23)                                                                                                 | `pnpm contrats` (`contrats-zod-seulement`) ; `pnpm lint` (globales de Node) ; `pnpm test` (manifeste)          | `pnpm typecheck`, hors du socle, refuse `window` et `document` (`lib` sans `DOM`) mais pas une API de Node : les types de Vite, atteints par `vitest.config.ts` et par les tests, amènent ceux de Node malgré `types` vide (essai T). Une globale de Node absente de la liste d'ESLint n'est retenue par rien |
| `db` sans `contrats` ni Express, réservé au serveur (AC23)                                                                                      | `pnpm contrats` (`db-liste-blanche`, `db-reserve-au-serveur`)                                                  |                                                                                                                                                                                                                                                                                                               |
| PGlite jamais dans le code de production (H5)                                                                                                   | `pnpm contrats` (`db-liste-blanche`, `serveur-liste-blanche`) ; `pnpm test` (manifeste de `db`)                |                                                                                                                                                                                                                                                                                                               |
| Le serveur n'applique aucune migration (H7)                                                                                                     | `pnpm contrats` (`serveur-liste-blanche` interdit `src/migration.ts`) ; `Base` n'a pas de méthode de migration |                                                                                                                                                                                                                                                                                                               |
| Le code s'exécute sans compilation (H10)                                                                                                        | `pnpm test` : les deux points d'entrée sont lancés par un vrai processus `node`                                | entre le bloc 1 et le bloc 5, `contrats` n'est chargé nativement par aucun test                                                                                                                                                                                                                               |
| Aucun secret dans le journal ni dans les erreurs (AC8, AC11, AC17)                                                                              | `pnpm test`                                                                                                    |                                                                                                                                                                                                                                                                                                               |
| Aucun secret dans git (AC13)                                                                                                                    | `secrets.sh` (gitleaks) à chaque commit et sur la plage ; `pnpm test` (fichiers d'exemple, fichier Compose)    |                                                                                                                                                                                                                                                                                                               |
| Forme du fichier Compose et du Dockerfile (AC20, AC21, AC24)                                                                                    | `pnpm test` (`infra/tests/`)                                                                                   | `CONTENEURS` (`trivy fs`) ne lit ni le Dockerfile ni le fichier Compose ni les images                                                                                                                                                                                                                         |
| Aucune faille HIGH ou CRITICAL connue dans l'image du serveur                                                                                   | aucun                                                                                                          | constat 10 d'`infra/fumee.sh` (`trivy image`), lancé à la main ; dépend de la base de failles du jour                                                                                                                                                                                                         |
| Failles connues de l'image `postgres:18.6`                                                                                                      | aucun                                                                                                          | risque accepté (ADR-0006) ; image épinglée, relue à chaque mise à jour                                                                                                                                                                                                                                        |
| La pile démarre, résiste à l'arrêt de la base, sert PostgreSQL 18.6 (AC19) ; une migration en échec bloque le serveur sur la pile réelle (AC21) | aucun                                                                                                          | `infra/fumee.sh`, lancé à la main par le dev (H12, dette D-002 proposée)                                                                                                                                                                                                                                      |
| `packages/document/src` sans types de Node (F-001-AC19, part des types)                                                                         | aucun                                                                                                          | `pnpm typecheck` : seconde passe `tsc -p tsconfig.src.json`, posée par le bloc 0 (étape 12 des barrières) ; hors du socle (D-007)                                                                                                                                                                             |
| Types corrects                                                                                                                                  | aucun                                                                                                          | `pnpm typecheck`, exigé par ce plan à chaque bloc et relevé sur le dernier commit de code ; aucune barrière de F-008 ne repose sur lui seul                                                                                                                                                                   |

## État des fichiers racine à HEAD

Relevé par `git show HEAD:<chemin>` le 2026-10-09, au commit `651991f` de `F-008-socle`, et comparé à `main` (`c1df7d8`) par `git diff HEAD main`. Le script du bloc 0 ne recopie pas ces fichiers : il y pose sept remplacements exacts, et s'arrête sans rien écrire si l'un des repères n'est pas trouvé une fois et une seule. Les sept repères sont présents une fois dans les deux états.

| Fichier                              | État relevé à HEAD                                                                                                                                                                                         | Ce que `main` a de plus                                                                                                | Repère du script                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `.dependency-cruiser.cjs`            | seize contrats (sept de F-001, neuf `web-*` de F-002) ; `document-sans-reseau-ni-base` est le cinquième ; `exclude` vaut `^(apps\|packages)/[^/]+/(dist\|coverage)/` (les paquets npm sont dans le graphe) | trois contrats de F-004, à la fin de `forbidden` : dix-neuf                                                            | l'ouverture de la règle `document-sans-reseau-ni-base` : les quatre règles sont insérées juste avant                              |
| `eslint.config.mjs`                  | constantes de F-001 et de F-002 avant `export default tseslint.config(` ; blocs d'`apps/web` ; le bloc des `**/*.cjs` est le dernier de la liste                                                           | un bloc `max-lines-per-function` (50 lignes) pour `apps/web/src/**`, au milieu de la liste                             | la ligne `const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];` (constante juste après) ; la fin du bloc des `**/*.cjs` (bloc juste après) |
| `vitest.config.ts`                   | `projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"]`, sans projet `infra`                                                                                                                | rien                                                                                                                   | cette ligne, remplacée par la liste à trois entrées                                                                               |
| `package.json` racine                | script `typecheck` présent (`pnpm -r run typecheck`) ; ni `@types/node` ni `yaml`                                                                                                                          | rien                                                                                                                   | la ligne `"@eslint/js"` (suivie de `@types/node`) ; la dernière ligne de `devDependencies` (suivie de `yaml`)                     |
| `packages/document/package.json`     | script `typecheck` : `tsc --noEmit -p tsconfig.json`                                                                                                                                                       | rien                                                                                                                   | cette ligne, complétée par la seconde passe                                                                                       |
| `packages/document/tsconfig.json`    | `lib` `ES2023`, `types` vide, `include` : `src`, `test`, `vitest.config.ts`                                                                                                                                | rien                                                                                                                   | non modifié : `tsconfig.src.json` l'étend                                                                                         |
| `pnpm-lock.yaml`                     | trois importateurs : la racine, `packages/document`, `apps/web`                                                                                                                                            | Tailwind, `dependency-cruiser` et `eslint` dans l'importateur `apps/web`                                               | aucun : régénéré par `pnpm install`                                                                                               |
| `apps/web/package.json`              | dépendances de F-002                                                                                                                                                                                       | `tailwindcss`, `@tailwindcss/vite`, `dependency-cruiser`, `eslint` en `devDependencies` ; script `preuve:construction` | non modifié                                                                                                                       |
| `pnpm-workspace.yaml`                | `apps/*`, `packages/*`, `minimumReleaseAge: 10080` : couvre les trois nouveaux paquets                                                                                                                     | rien                                                                                                                   | non modifié (présence vérifiée)                                                                                                   |
| `tsconfig.base.json`                 | inchangé depuis la génération (`strict`, `verbatimModuleSyntax`, `moduleResolution: Bundler`)                                                                                                              | rien                                                                                                                   | non modifié (présence vérifiée)                                                                                                   |
| `apps/.gitkeep`, `packages/.gitkeep` | présents (fichiers protégés)                                                                                                                                                                               | rien                                                                                                                   | non modifiés ; les motifs de projets de Vitest visent des fichiers `vitest.config.ts`, pas des dossiers                           |
| `ARCHITECTURE.md`                    | décrit `packages/document`, `apps/web` (F-002), la configuration racine et les seize contrats                                                                                                              | F-004                                                                                                                  | non modifié par le bloc 0 ni par cette conception                                                                                 |
| `specs/F-008.md`                     | validée (commit `651991f`)                                                                                                                                                                                 | absente de `main` dans cet état (validée sur la branche seulement)                                                     | sans objet                                                                                                                        |

Contrôles relevés avant le bloc 0, sur un gabarit tiré de chaque état (essais U et V) : `prettier --check .`, `pnpm lint`, `pnpm typecheck` en code 0 ; `pnpm contrats` : 76 modules et 203 dépendances à HEAD, 146 et 395 sur `main` ; `pnpm test` : 21 fichiers et 777 tests à HEAD, 32 fichiers et 1 078 tests sur `main`.

Commandes du socle qui lisent ces fichiers (`.agents/outils.env`, fichier protégé, cité sans modification) :

```text
TEST_CMD="pnpm exec vitest run --passWithNoTests"
LINT_CMD="pnpm exec eslint --no-warn-ignored"
CONTRATS_CMD="pnpm exec depcruise --config .dependency-cruiser.cjs apps packages"
CONTENEURS_CMD="trivy fs --exit-code 1 --severity HIGH,CRITICAL ."
SCA_CMD="pnpm audit --audit-level high"
```

Aucune commande du socle ne lance `tsc`. `CONTRATS_CMD` ne parcourt que `apps` et `packages` : `infra/` est hors des contrats de dépendances. Aucun hook git ne lance les contrats : ils ne tournent que par `controles.sh`, donc par le dossier de revue, ou à la main (`ARCHITECTURE.md`, « Ce que les contrôles lancent »).

## Bloc 0 (dev)

Fichiers protégés ou partagés, hors du périmètre des agents. Le script en crée dix et en modifie six :

- créés : `package.json`, `vitest.config.ts` et `tsconfig.json` de `packages/contrats`, de `packages/db` et d'`apps/server` ; `packages/document/tsconfig.src.json` (partagé) ;
- modifiés : `.dependency-cruiser.cjs` (protégé : quatre contrats), `eslint.config.mjs` (protégé : une constante, un bloc), `vitest.config.ts` racine (protégé : projet `infra`), `package.json` racine (partagé : `@types/node`, `yaml`), `packages/document/package.json` (partagé, clé `scripts.typecheck` réservée au dev : seconde passe de `tsc`), `pnpm-lock.yaml` (partagé : par `pnpm install`).

Il ne lit ni n'écrit aucun fichier d'`apps/web/`, ni aucun fichier de `src/` ou de `test/` de `packages/document/`.

Versions : celles de la veille du 2026-10-08, épinglées exactement, relues au registre npm le 2026-10-09 à 13 h 30 UTC et installées à l'essai ce jour-là (essais U et V). Toutes sont publiées depuis plus de 7 jours (`pg@8.23.1`, la plus récente de la liste fixe, date du 2026-09-30). Pour `pino` et `@types/node`, la spec demande la dernière version publiée depuis au moins 7 jours le jour de l'installation ; les deux premières lignes de constantes du script les portent :

| Paquet        | Valeur du script, installée à l'essai          | Ce que la règle de la spec désigne                                                               |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@types/node` | `26.6.4` (publiée le 2026-10-01 à 22 h 39 UTC) | `26.6.4` : la dernière de la majeure 26 au registre, éligible depuis le 2026-10-08 à 22 h 39 UTC |
| `pino`        | `10.3.1`                                       | `10.3.1` jusqu'au 2026-10-09 à 18 h 18 UTC, puis `10.4.0`                                        |

`pino@10.4.0` a été essayée le 2026-10-09 à 13 h 52 UTC : pnpm la refuse (`ERR_PNPM_NO_MATURE_MATCHING_VERSION`, « within the minimumReleaseAge cutoff »). Si le dev lance le script après 18 h 18 UTC le 2026-10-09, il choisit : changer la constante `PINO` avant de lancer (version non essayée ici ; les cinq contrôles de la fin du script disent si elle tient), ou garder `10.3.1`, essayée, et le dire dans son commit. Deux versions plus récentes que celles de la spec restent hors du plan : `drizzle-orm@0.45.4`, publiée le 2026-10-08, refusée par pnpm jusqu'au 2026-10-15 ; `express@5.3.0`, publiée le 2026-10-09. Le plan garde `0.45.3` et `5.2.1`, que la spec nomme.

Où le lancer : à la racine du worktree de la feature (`F-008-socle`), arbre propre, après `pnpm install --frozen-lockfile`, et de préférence après y avoir fusionné `main` (« Composition avec `main` »). Le script refuse d'écrire si l'un des six fichiers qu'il modifie porte une modification non commitée.

```bash
sed -n '/^# F-008 BLOC 0 DEBUT$/,/^# F-008 BLOC 0 FIN$/p' docs/decisions/F-008-conception.md | zsh
```

Le script vérifie tout avant d'écrire : sur `ARRET`, rien n'est écrit ; relancé après un succès, il s'arrête sans rien écrire. Sa dernière ligne, `bloc 0 : code=0`, dit que l'installation et les cinq contrôles (`prettier --check .`, `pnpm lint`, `pnpm typecheck`, `pnpm contrats`, `pnpm test`) ont tous fini en code 0. Le dev commite alors les seize fichiers en un commit `Agent: dev`, `Feature: F-008` :

```bash
git add .dependency-cruiser.cjs eslint.config.mjs vitest.config.ts package.json pnpm-lock.yaml \
  packages/contrats/package.json packages/contrats/vitest.config.ts packages/contrats/tsconfig.json \
  packages/db/package.json packages/db/vitest.config.ts packages/db/tsconfig.json \
  apps/server/package.json apps/server/vitest.config.ts apps/server/tsconfig.json \
  packages/document/package.json packages/document/tsconfig.src.json
```

Si un contrôle est rouge pour une raison étrangère au bloc 0 (machine chargée, « Essais », U), les seize fichiers sont écrits et l'installation est faite : il reste à relancer les contrôles, pas le script.

Le texte exact de chaque fichier est dans le script : les dix fichiers créés sont les valeurs du dictionnaire `NOUVEAUX` (les accolades y sont doublées, forme d'écriture de Python), les fragments insérés sont `CONTRATS_AJOUTES`, `ESLINT_CONSTANTE`, `ESLINT_BLOC`, `VITEST_APRES` et les trois derniers remplacements. Tous passent `prettier --check` (essais U et V).

```bash
# F-008 BLOC 0 DEBUT
python3 - <<'PY' && pnpm install && pnpm exec prettier --check . && pnpm lint && pnpm typecheck && pnpm contrats && pnpm test; echo "bloc 0 : code=$?"
import pathlib, subprocess, sys

CONTRATS = ".dependency-cruiser.cjs"
ESLINT = "eslint.config.mjs"
VITEST = "vitest.config.ts"
RACINE = "package.json"
DOCUMENT = "packages/document/package.json"

# Regle de la spec : derniere version publiee depuis au moins 7 jours le jour de l'installation.
PINO = "10.3.1"        # 10.4.0 a partir du 2026-10-09 a 18 h 18 UTC
TYPES_NODE = "26.6.4"  # publiee le 2026-10-01 a 22 h 39 UTC
ZOD = "4.6.5"
SCRIPTS = '''    "test": "vitest run",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json"'''


def config_vitest(nom):
    return f'''import {{ defineConfig }} from "vitest/config";

export default defineConfig({{
  test: {{
    name: "{nom}",
    environment: "node",
    include: ["test/**/*.test.ts"],
  }},
}});
'''


def tsconfig(types):
    return f'''{{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {{
    "lib": ["ES2023"],
    "types": [{types}],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true
  }},
  "include": ["src", "test", "vitest.config.ts"]
}}
'''


NOUVEAUX = {
    "packages/contrats/package.json": f'''{{
  "name": "@notionlike/contrats",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {{
    ".": "./src/index.ts"
  }},
  "scripts": {{
{SCRIPTS}
  }},
  "dependencies": {{
    "zod": "{ZOD}"
  }},
  "devDependencies": {{
    "vitest": "^5.0.3"
  }}
}}
''',
    "packages/contrats/vitest.config.ts": config_vitest("contrats"),
    "packages/contrats/tsconfig.json": tsconfig(""),
    "packages/db/package.json": f'''{{
  "name": "@notionlike/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {{
    ".": "./src/index.ts",
    "./essai": "./test/essai.ts"
  }},
  "scripts": {{
{SCRIPTS},
    "migrer": "node --env-file=../../apps/server/.env src/migrer.ts"
  }},
  "dependencies": {{
    "drizzle-orm": "0.45.3",
    "pg": "8.23.1"
  }},
  "devDependencies": {{
    "@electric-sql/pglite": "0.5.8",
    "@types/node": "{TYPES_NODE}",
    "@types/pg": "8.23.1",
    "vitest": "^5.0.3"
  }}
}}
''',
    "packages/db/vitest.config.ts": config_vitest("db"),
    "packages/db/tsconfig.json": tsconfig('"node"'),
    "apps/server/package.json": f'''{{
  "name": "@notionlike/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {{
{SCRIPTS},
    "demarrer": "node --env-file=.env src/main.ts"
  }},
  "dependencies": {{
    "@notionlike/contrats": "workspace:*",
    "@notionlike/db": "workspace:*",
    "express": "5.2.1",
    "helmet": "8.3.0",
    "pino": "{PINO}",
    "zod": "{ZOD}"
  }},
  "devDependencies": {{
    "@types/express": "5.0.6",
    "@types/node": "{TYPES_NODE}",
    "vitest": "^5.0.3"
  }}
}}
''',
    "apps/server/vitest.config.ts": config_vitest("server"),
    "apps/server/tsconfig.json": tsconfig('"node"'),
    "packages/document/tsconfig.src.json": '''{
  "extends": "./tsconfig.json",
  "include": ["src"]
}
''',
}

CONTRATS_AJOUTES = r'''    {
      name: "contrats-zod-seulement",
      severity: "error",
      comment:
        "F-008-AC23 : depuis packages/contrats/src, seuls un fichier de packages/contrats/src et le paquet zod sont importables.",
      from: { path: "^packages/contrats/src/" },
      to: { pathNot: ["^packages/contrats/src/", "(^|/)node_modules/zod/"] },
    },
    {
      name: "db-liste-blanche",
      severity: "error",
      comment:
        "F-008-AC23 : depuis packages/db/src, seuls packages/db/src, drizzle-orm, pg et les modules intégrés de Node sont importables.",
      from: { path: "^packages/db/src/" },
      to: {
        pathNot: ["^packages/db/src/", "(^|/)node_modules/(drizzle-orm|pg)/"],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "serveur-liste-blanche",
      severity: "error",
      comment:
        "ADR-0004 : depuis apps/server/src, seuls apps/server/src, l'entrée publique de db et de contrats, express, helmet, pino, zod et les modules intégrés de Node sont importables.",
      from: { path: "^apps/server/src/" },
      to: {
        pathNot: [
          "^apps/server/src/",
          "^packages/(db|contrats)/src/index\\.ts$",
          "(^|/)node_modules/(express|helmet|pino|zod)/",
        ],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "db-reserve-au-serveur",
      severity: "error",
      comment: "F-008-AC23 : seuls packages/db et apps/server importent packages/db.",
      from: { pathNot: "^(packages/db|apps/server)/" },
      to: { path: "^packages/db/" },
    },
'''
REPERE_CONTRATS = '    {\n      name: "document-sans-reseau-ni-base",\n'

ESLINT_CONSTANTE = '''const GLOBALES_INTERDITES_CONTRATS = [
  "process",
  "Buffer",
  "global",
  "require",
  "module",
  "__dirname",
  "__filename",
  "setImmediate",
  "clearImmediate",
].map((name) => ({
  name,
  message: "F-008-AC23 : packages/contrats/src reste importable dans un navigateur.",
}));
'''
REPERE_ESLINT_DEBUT = "const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];\n"
ESLINT_BLOC = '''  {
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
'''
REPERE_ESLINT_FIN = '    rules: { "@typescript-eslint/no-require-imports": "off" },\n  },\n'

VITEST_AVANT = '    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],\n'
VITEST_APRES = '''    projects: [
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      {
        test: {
          name: "infra",
          environment: "node",
          include: ["infra/tests/**/*.test.ts"],
        },
      },
    ],
'''

# (fichier, texte attendu une seule fois, texte qui le remplace)
REMPLACEMENTS = (
    (CONTRATS, REPERE_CONTRATS, CONTRATS_AJOUTES + REPERE_CONTRATS),
    (ESLINT, REPERE_ESLINT_DEBUT, REPERE_ESLINT_DEBUT + ESLINT_CONSTANTE),
    (ESLINT, REPERE_ESLINT_FIN + ");\n", REPERE_ESLINT_FIN + ESLINT_BLOC + ");\n"),
    (VITEST, VITEST_AVANT, VITEST_APRES),
    (RACINE, '    "@eslint/js": "^10.0.1",\n',
     f'    "@eslint/js": "^10.0.1",\n    "@types/node": "{TYPES_NODE}",\n'),
    (RACINE, '    "vitest": "^5.0.3"\n  }\n}\n', '    "vitest": "^5.0.3",\n    "yaml": "2.9.1"\n  }\n}\n'),
    (DOCUMENT, '    "typecheck": "tsc --noEmit -p tsconfig.json"\n',
     '    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.src.json"\n'),
)
DEJA_APPLIQUE = ((CONTRATS, "contrats-zod-seulement"), (ESLINT, "GLOBALES_INTERDITES_CONTRATS"),
                 (VITEST, '"infra"'), (RACINE, '"yaml"'), (DOCUMENT, "tsconfig.src.json"))
MODIFIES = (CONTRATS, ESLINT, VITEST, RACINE, DOCUMENT)

# Tout est verifie avant la premiere ecriture : le script n'ecrit rien s'il doit s'arreter.
for chemin in (*MODIFIES, "pnpm-workspace.yaml", "tsconfig.base.json"):
    if not pathlib.Path(chemin).is_file():
        sys.exit(f"ARRET : {chemin} absent ; le script se lance a la racine du depot")
sales = subprocess.run(["git", "status", "--porcelain", "--", *MODIFIES, "pnpm-lock.yaml"],
                       capture_output=True, text=True)
if sales.returncode != 0 or sales.stdout.strip():
    sys.exit("ARRET : fichier a modifier deja modifie et non commite, rien n'est ecrit ; lancer dans un arbre propre :\n"
             + sales.stdout + sales.stderr)
textes = {c: pathlib.Path(c).read_text(encoding="utf-8") for c in MODIFIES}
for chemin in NOUVEAUX:
    if pathlib.Path(chemin).exists():
        sys.exit(f"ARRET : {chemin} existe deja, rien n'est ecrit")
for chemin, marque in DEJA_APPLIQUE:
    if marque in textes[chemin]:
        sys.exit(f"ARRET : {chemin} porte deja les ajouts de F-008, rien n'est ecrit")
for chemin, attendu, _ in REMPLACEMENTS:
    if textes[chemin].count(attendu) != 1:
        sys.exit(f"ARRET : repere trouve {textes[chemin].count(attendu)} fois dans {chemin} (attendu : 1), rien n'est ecrit : {attendu!r}")

for chemin, attendu, remplacant in REMPLACEMENTS:
    textes[chemin] = textes[chemin].replace(attendu, remplacant)
for chemin, texte in NOUVEAUX.items():
    pathlib.Path(chemin).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(chemin).write_text(texte, encoding="utf-8")
    print("cree    ", chemin)
for chemin, texte in textes.items():
    pathlib.Path(chemin).write_text(texte, encoding="utf-8")
    print("modifie ", chemin)
PY
# F-008 BLOC 0 FIN
```

### Ce que le script écrit, et pourquoi

- **Manifestes.** Chacun porte les quatre scripts exigés (`test`, `lint`, `format`, `typecheck`). `packages/db` a en plus `migrer` et l'entrée `./essai` (ADR-0005) ; `apps/server` a `demarrer` (ADR-0006). `drizzle-kit` n'y figure pas (H9 : F-009 le porte).
- **`tsconfig.json`.** `packages/contrats` : `lib` sans `DOM`, `types` vide, comme `packages/document` ; `window` et `document` n'y compilent pas. Les API de Node, elles, y compilent : voir « ESLint » ci-dessous. `packages/db` et `apps/server` : `types: ["node"]`. `resolveJsonModule` sert aux tests de structure, qui importent le manifeste.
- **`vitest.config.ts` racine.** `infra/` n'est pas un paquet du workspace : son projet est décrit dans la configuration racine, sans fichier à lui. Ses tests trouvent `yaml` et les types de Node à la racine. Le projet `document` reste ramassé par le premier motif, inchangé ; le second ramasse `web` comme avant, et `server`.
- **Contrats.** Quatre règles en liste blanche, insérées avant `document-sans-reseau-ni-base` (vingt règles au total à HEAD, vingt-trois sur `main`). `pathNot` reçoit une liste : une dépendance viole la règle quand son chemin résolu ne correspond à aucune des expressions. `dependencyTypesNot: ["core"]` s'y ajoute : la violation demande aussi que la dépendance ne soit pas un module intégré de Node ; `contrats-zod-seulement` n'a pas cette ligne, un module intégré y est une violation. Un paquet npm est reconnu par son dernier segment `node_modules/<nom>/` : `node_modules/pg/` ne reconnaît ni `pg-pool` ni `pg-protocol`. Un paquet du workspace importé par son nom se résout en son chemin réel : `@notionlike/db` en `packages/db/src/index.ts`, `@notionlike/db/essai` en `packages/db/test/essai.ts`.
- **ESLint.** La constante est insérée après `NOMBRES_NON_MAGIQUES`, le bloc après celui des `**/*.cjs`. `checkGlobalObject` étend l'interdiction à `globalThis.process` et aux formes voisines. Les règles `no-restricted-globals` de F-001, de F-002 et de F-008 visent des dossiers différents : elles ne se remplacent pas l'une l'autre.
- **Types de Node et `packages/document` (F-001-AC19).** Dès qu'un paquet du workspace installe `@types/node` (`packages/db` et `apps/server` en ont besoin), `tsc` accepte `process`, `Buffer` et `setImmediate` dans tout paquet dont le `tsconfig.json` compile `vitest.config.ts` ou des tests avec `src` : ces fichiers atteignent les types de Vite, qui référencent ceux de Node, et `types` vide n'y peut rien (essai T du 2026-10-08, confirmé par l'essai W). Avant le bloc 0, `packages/document` refuse ces trois noms (code 2) ; sans précaution, il les accepterait après. Le bloc 0 garde donc le refus, par deux fichiers de `packages/document` :
  - `tsconfig.src.json`, créé : il étend `tsconfig.json` et réduit `include` à `["src"]`. `src/` n'importe ni Vitest ni Vite : les types de Node n'y entrent pas.
  - `package.json`, script `typecheck` : `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.src.json`. La première passe vérifie tout comme avant ; la seconde refuse une globale de Node ou du DOM dans `src/`.

  Constaté après le bloc 0 (essai W, étape 12 des barrières) : `[process.env, Buffer, setImmediate]` dans `packages/document/src` passe la première passe (code 0) et échoue à la seconde (code 2, `TS2591` deux fois et `TS2304`). La barrière reste hors du socle, comme avant (dette D-007, que ce plan ne lève pas) : ESLint, dans le socle, refuse toujours `process` dans `packages/document/src`.

- **Limite pour `packages/contrats`.** La même seconde passe n'y est pas posée : au bloc 0 le paquet n'a pas de `src/`, et `tsc` échoue sur un `include` sans fichier (`TS18003`) ; le script `typecheck` d'un manifeste étant réservé au dev, elle ne peut pas arriver avec le bloc 1. `tsc` accepte donc les globales de Node dans `packages/contrats/src` (essai W). F-008-AC23 n'en dépend pas : il est tenu par `contrats-zod-seulement` (aucun import d'un module de Node), par la liste d'ESLint (les neuf globales propres à Node) et par le test du manifeste. Une globale de Node absente de cette liste n'est retenue par rien. Ajouter la seconde passe à `packages/contrats` après le bloc 1 est une option du dev, avec D-007.
- **`package.json` racine.** `@types/node` et `yaml` en dépendances de développement, pour les tests statiques d'`infra/tests/` (prérequis de la spec). `pnpm typecheck` ne couvre pas `infra/tests/` : ces tests sont lus par ESLint et exécutés par Vitest, pas vérifiés par `tsc`.
- **Verrou.** Attendu après `pnpm install` : `express@5.2.1`, `helmet@8.3.0`, `pino@10.3.1`, `drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`, `@types/express@5.0.6`, `@types/node@26.6.4`, `yaml@2.9.1`, et une seule version de `zod` (constaté, essais U et V). Si pnpm refuse une version pour son âge, ne rien forcer et le signaler (spec).

Sans changement : `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc.json`, `.prettierignore`, `.gitignore` (`.env` y est déjà, à toute profondeur), `.agents/outils.env`, `apps/.gitkeep`, `packages/.gitkeep`, tout `apps/web/`, et, dans `packages/document/`, tout sauf les deux fichiers nommés plus haut.

Entre le bloc 0 et le bloc qui crée chaque `src/index.ts`, le champ `exports` des manifestes désigne un fichier qui n'existe pas encore. Rien ne s'y heurte : `apps/server` n'importe les deux paquets qu'au bloc 4.

À la charge du dev s'il le souhaite, hors de ce plan : écrire dans `AGENTS.md` (fichier protégé) les commandes de lancement, `docker compose up -d --wait` depuis `infra/` et `pnpm --filter @notionlike/server demarrer`.

Sur le poste, pour le bloc 6 et le script de fumée : Docker avec Compose 2.24.0 ou plus récent, `curl` et `trivy` (le poste a Compose 5.5.1 et trivy 0.75.0 ; aucune version plus ancienne n'a été essayée). Le 2026-10-09, le démon Docker n'était pas démarré. Le port 5432 du poste est pris par une autre base : `PORT_PUBLIE_BASE` est à régler dans `infra/.env`.

### Composition avec `main`

F-002 est dans HEAD. Ce qui manque à `F-008-socle`, ce sont les 46 commits de `main` venus après son point de départ (`5084631`), dont F-004. Ils touchent trois des fichiers du bloc 0, à d'autres endroits que lui :

| Fichier                   | Ce que `main` y pose (F-004)                                           | Ce que F-008 y pose                                                             |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `.dependency-cruiser.cjs` | trois règles, à la fin de `forbidden`                                  | quatre règles, avant la cinquième                                               |
| `eslint.config.mjs`       | un bloc `max-lines-per-function`, au milieu de la liste                | une constante après `NOMBRES_NON_MAGIQUES` ; un bloc après celui des `**/*.cjs` |
| `pnpm-lock.yaml`          | Tailwind, `dependency-cruiser`, `eslint` dans l'importateur `apps/web` | trois importateurs et leurs dépendances, `@types/node` et `yaml` à la racine    |

Les deux ordres ont été joués le 2026-10-09 (essais U et V) et donnent les mêmes fichiers, à l'octet près, verrou compris :

| Ordre                      | Ce qui est fait                                                                                                                          | Résultat constaté                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` d'abord (conseillé) | `main` est fusionnée dans `F-008-socle`, puis le script est lancé tel quel                                                               | les sept repères sont trouvés une fois chacun ; `bloc 0 : code=0` ; vingt-trois règles ; 147 modules et 398 dépendances ; 32 fichiers et 1 078 tests ; les douze barrières mordent                                                                                                      |
| bloc 0 d'abord             | le script sur HEAD (`bloc 0 : code=0`, vingt règles, 79 modules et 206 dépendances, 21 fichiers et 777 tests), puis `main` est fusionnée | `git merge` fusionne seul `.dependency-cruiser.cjs` et `eslint.config.mjs` ; un seul conflit, `pnpm-lock.yaml` (9 marques), que `pnpm install` résout (`Merge conflict detected in pnpm-lock.yaml and successfully merged`) ; les sept fichiers sont identiques à ceux de l'autre ordre |

- « `main` d'abord » est conseillé : aucune fusion ne touche alors au verrou, et les blocs sont écrits contre la règle des 50 lignes et les contrats de F-004 déjà présents. La fusion elle-même n'a pas été jouée dans le dépôt : l'essai V part de l'arbre de `main` auquel `specs/F-008.md` de HEAD est ajoutée, ce que cette fusion doit donner (le seul commit propre à la branche est la validation de la spec).
- Le verrou ne se fusionne jamais à la main : dans les deux ordres, c'est `pnpm install` qui l'écrit.
- Les règles ne se gênent pas. Les règles `web-*` partent toutes d'`apps/web/`. Des quatre règles de F-008, seule `db-reserve-au-serveur` part d'`apps/web` : elle lui interdit `packages/db`, ce que F-008-AC23 demande. `apps-isolees` prend effet dès que les deux applications existent.
- Côté ESLint, aucun bloc de F-002 ni de F-004 ne vise les fichiers des trois paquets : la règle des 50 lignes ne vaut que pour `apps/web/src/**`.
- Effet de F-008 sur `apps/web` et `packages/document`, par le verrou : `vite` et `vitest` ont `@types/node` et `yaml` pour pairs facultatifs, que pnpm leur résout dès qu'ils sont dans le workspace ; leurs entrées du verrou passent de `vitest@5.0.3(jsdom@30.1.1)(vite@8.3.2)` à `vitest@5.0.3(@types/node@26.6.4)(jsdom@30.1.1)(vite@8.3.2(@types/node@26.6.4)(yaml@2.9.1))`, aux mêmes versions de `vite` et de `vitest`. Les types de Node deviennent visibles de `tsc` dans ces deux paquets ; la seconde passe de `packages/document` les en tient hors de `src/`. `apps/web` compile avec les types de Vite depuis F-002 (`types: ["vite/client"]`) : rien n'y change. Leurs tests sont les mêmes, en nombre et en résultat, avant comme après.
- Les tests d'`apps/web` qui lisent la configuration racine (`structure.test.ts`, `structure-interface.test.ts`, `demonstration.test.tsx`, `coutures-f004.test.tsx` sur `main`) passent après le bloc 0, sans retouche : ils parcourent tous les manifestes du workspace et relisent `eslint.config.mjs` et le graphe de dependency-cruiser.
- Importer `@notionlike/contrats` depuis `apps/web` (F-010) demandera d'élargir sa liste blanche `web-src-liste-blanche`.

## Vérification des barrières après le bloc 0

Preuve que les barrières mordent sur l'installation réelle, à lancer une fois après le script et avant le bloc 1. Elle écrit des fichiers jetables dans `packages/contrats`, `packages/db`, `apps/server` et `packages/document/src`, supprimés au fil des étapes. Ces dossiers relèvent de trois producteurs : le dev la lance lui-même, après avoir commité le bloc 0 et avant de lancer les agents.

```bash
mkdir -p packages/contrats/src packages/contrats/test packages/db/src packages/db/test apps/server/src
C=packages/contrats/src/essai.ts
D=packages/db/src/essai.ts
S=apps/server/src/essai.ts

# 1. contrats : un module intégré de Node fait échouer les contrats
printf 'import fs from "node:fs";\n\nexport const essai = fs;\n' > "$C"
pnpm contrats; echo "code=$?"

# 2. contrats : zod est vu et permis ; aucun fichier de node_modules n'est suivi
printf 'import { z } from "zod";\n\nexport const essai = z;\n' > "$C"
pnpm contrats; echo "code=$?"
pnpm exec depcruise --config .dependency-cruiser.cjs --output-type json apps packages \
  | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{for(const m of JSON.parse(s).modules)console.log(m.dependencies.length,m.source)})' \
  | grep -E 'contrats/src/|/zod/'

# 3. contrats : une globale de Node fait échouer le lint
printf 'export const essai = process.env;\n' > "$C"
pnpm exec eslint --no-warn-ignored packages/contrats; echo "code=$?"
rm "$C"

# 4. db : PGlite dans src/ fait échouer les contrats
printf 'import { PGlite } from "@electric-sql/pglite";\n\nexport const essai = PGlite;\n' > "$D"
pnpm contrats; echo "code=$?"

# 5. db : un import qui sort de src/ (ici vers test/) fait échouer les contrats
printf 'export const aide = 1;\n' > packages/db/test/essai-aide.ts
printf 'import { aide } from "../test/essai-aide.ts";\n\nexport const essai = aide;\n' > "$D"
pnpm contrats; echo "code=$?"
rm packages/db/test/essai-aide.ts

# 6. db : drizzle-orm, pg et un module intégré de Node sont permis
printf 'import fs from "node:fs";\nimport { sql } from "drizzle-orm";\nimport pg from "pg";\n\nexport const essai = [fs, sql, pg];\n' > "$D"
pnpm contrats; echo "code=$?"
rm "$D"

# 7. serveur : l'entrée publique de db et de contrats est permise, par le nom du paquet
printf 'export const publique = 1;\n' > packages/db/src/index.ts
printf 'export const publique = 1;\n' > packages/contrats/src/index.ts
printf 'import { publique as a } from "@notionlike/db";\nimport { publique as b } from "@notionlike/contrats";\nimport express from "express";\n\nexport const essai = [a, b, express];\n' > "$S"
pnpm contrats; echo "code=$?"

# 8. serveur : un fichier interne de db fait échouer les contrats
printf 'export const interne = 1;\n' > packages/db/src/acces.ts
printf 'import { interne } from "../../../packages/db/src/acces.ts";\n\nexport const essai = interne;\n' > "$S"
pnpm contrats; echo "code=$?"
rm packages/db/src/acces.ts

# 9. serveur : les aides de test de db (base embarquée) font échouer les contrats depuis src/
printf 'export const aide = 1;\n' > packages/db/test/essai.ts
printf 'import { aide } from "@notionlike/db/essai";\n\nexport const essai = aide;\n' > "$S"
pnpm contrats; echo "code=$?"
rm packages/db/test/essai.ts

# 10. serveur : un paquet hors liste (yaml, installé à la racine) fait échouer les contrats
printf 'import { parse } from "yaml";\n\nexport const essai = parse;\n' > "$S"
pnpm contrats; echo "code=$?"
rm "$S"

# 11. hors du serveur, importer packages/db fait échouer les contrats
T=packages/contrats/test/essai.ts
printf 'import { publique } from "../../db/src/index.ts";\n\nexport const essai = publique;\n' > "$T"
pnpm contrats; echo "code=$?"
rm "$T" packages/db/src/index.ts packages/contrats/src/index.ts

# 12. document : une globale de Node dans src/ fait échouer la vérification des types (F-001-AC19, seconde passe de tsc)
N=packages/document/src/essai-node.ts
printf 'export const essai = [process.env, Buffer, setImmediate];\n' > "$N"
pnpm --filter @notionlike/document typecheck; echo "code=$?"
rm "$N"
pnpm --filter @notionlike/document typecheck; echo "code=$?"

rmdir packages/contrats/src packages/contrats/test packages/db/src packages/db/test apps/server/src
ls packages/contrats packages/db apps/server   # attendu : node_modules, package.json, tsconfig.json, vitest.config.ts
git status --short packages/document           # attendu : rien (après le commit du bloc 0)
```

Attendu, étape par étape (essai W, joué le 2026-10-09 sur les deux gabarits) ; les comptes de modules de `pnpm contrats` ne sont pas donnés, ils diffèrent entre HEAD et `main` :

1. `code=1` et `error contrats-zod-seulement: packages/contrats/src/essai.ts → fs`.
2. `code=0`, puis deux lignes : `1 packages/contrats/src/essai.ts` et `0 node_modules/.pnpm/zod@4.6.5/node_modules/zod/index.d.cts`. `zod` est donc dans le graphe, et rien n'y est suivi.
3. `code=1` et `error  Unexpected use of 'process'. F-008-AC23 : packages/contrats/src reste importable dans un navigateur  no-restricted-globals`. L'étape ne lance ESLint que sur `packages/contrats`, pour ne pas dépendre de l'état d'un autre paquet.
4. `code=1` et `error db-liste-blanche: packages/db/src/essai.ts → node_modules/.pnpm/@electric-sql+pglite@0.5.8/node_modules/@electric-sql/pglite/dist/index.d.ts`.
5. `code=1` et `error db-liste-blanche: packages/db/src/essai.ts → packages/db/test/essai-aide.ts`.
6. `code=0` et `✔ no dependency violations found`.
7. `code=0` et `✔ no dependency violations found`.
8. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → packages/db/src/acces.ts`.
9. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → packages/db/test/essai.ts`.
10. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.d.ts`.
11. `code=1` et `error db-reserve-au-serveur: packages/contrats/test/essai.ts → packages/db/src/index.ts`, seule violation.
12. `code=1` et trois erreurs sur `src/essai-node.ts` : `TS2591: Cannot find name 'process'`, `TS2591: Cannot find name 'Buffer'`, `TS2304: Cannot find name 'setImmediate'` ; puis, le fichier retiré, `code=0`.

Chaque étape en échec des contrats affiche une seule violation : aucune autre règle ne mord à sa place. Les deux dernières lignes de la séquence n'affichent que les quatre entrées de chaque paquet, puis rien. Si une étape ne donne pas ce résultat, le bloc 1 ne démarre pas : l'écart est remonté au dev.

## Ce que F-008 laisse aux features suivantes

- F-009 : ajouter `better-auth` et `@better-auth/*` à `serveur-liste-blanche` (fichier protégé), en plus de la règle que sa spec demande déjà ; installer `drizzle-kit` (sa spec le porte désormais dans ses prérequis) ; typer le schéma de `Base["db"]` ; insérer l'authentification entre les étapes 5 et 6 de `creerApplication` ; ne pas journaliser telle quelle une erreur de requête Drizzle (son message porte les paramètres) ; formater les fichiers `meta/*.json` générés.
- F-009 ou F-010 : requêtes de pré-vérification CORS.
- `apps/web`, première feature qui appelle le serveur (F-010) : importer `@notionlike/contrats` demandera d'ajouter `packages/contrats/src/index.ts` aux listes blanches d'`apps/web` (`web-src-liste-blanche`, fichier protégé). `db-reserve-au-serveur` et `apps-isolees` lui interdisent déjà `packages/db` et `apps/server`.
- F-012 : première fonction pure de `packages/contrats` (nommage des documents, H2). `contrats-zod-seulement` et la règle ESLint s'y appliquent telles quelles.
- Dev, dette D-007 : la vérification des types reste hors des contrôles du socle. Le bloc 0 garde le refus des types de Node dans `packages/document/src` par une seconde passe de `tsc` ; `packages/contrats` n'a pas cette passe (« Limite pour `packages/contrats` »).
- Dev et `agent-veille` : relire l'étiquette et l'empreinte de l'image Node quand la 26 passe en LTS (2026-10-28) ; refaire `trivy image` sur les deux images à chaque changement d'empreinte ; l'image `postgres:18.6-alpine`, non analysée, si le risque accepté sur l'image Debian devait être rouvert.
- `agent-planif` : les retouches de la spec F-008 que cette conception demandait sont faites (commit `2d9e14d`), et la spec est validée depuis (commit `38b5c5f`) ; cette conception n'a pas modifié la spec. Ce qui a changé : F-008-AC19 (lancement par `up -d --wait`, constats 1 à 8 de l'ADR-0006, constats 9 et 10 rattachés à AC21 et AC20) ; F-008-AC20 (variante Alpine par étiquette complète, volume sur `/var/lib/postgresql`, `pg_isready` sur l'adresse TCP, `USER node`, `npm` retiré, portée exacte du contrôle `CONTENEURS`, `trivy image` sur l'image du serveur par le script de fumée) ; H1 (point de montage du volume) ; H5 (ce que les essais J à L prouvent et ne prouvent pas) ; H9 (`drizzle-kit` reporté à F-009 et retiré des prérequis de `packages/db`) ; H10 (tranchée par l'ADR-0006) ; H11 (ports du poste réglables) ; H12 (forme du script de fumée, preuves des constats 9 et 10) ; H15, nouvelle (risque accepté sur `postgres:18.6`, décompte de l'ADR-0006) ; prérequis du poste (« Compose 2.24.0 ou plus récent », `curl`, `trivy`).
- `agent-planif` : la dette D-002 est confirmée par ce plan (« Barrières et contrôles ») ; le plan de F-001 devait remplacer son fichier 4 (`projects: ["packages/*"]`, « Essais », A) : c'est fait par sa révision 4 (branche `F-001`, commit `38a5117`), il n'y a plus rien à demander.

## Essais

Ce qui suit est une déclaration de l'auteur de la conception, pas une preuve que le gate peut rejouer : « Vérification des barrières après le bloc 0 » en rend l'essentiel reproductible.

**Les essais U à W, du 2026-10-09, fondent le bloc 0 de cette révision ; ils sont décrits à la fin de la section. Les essais A à T datent du 2026-10-08 et n'ont pas été rejoués le 2026-10-09**, sauf ce que U à W en reprennent : leur état de référence (F-001 seule, sept contrats, `@types/node@26.6.3`) n'est plus celui du dépôt, et leurs chiffres ne valent que pour lui. Ils restent la source de ce que le plan dit des bibliothèques, de la base et des conteneurs. Docker n'a pas été lancé le 2026-10-09 : le démon ne répondait pas.

Les essais A à L datent de l'écriture sur la branche `F-008`, avant tout code : l'arbre n'avait alors ni `packages/document` ni `apps/web`, et les fichiers racine étaient ceux de la génération. Ils valent pour les bibliothèques, la base et les conteneurs, que les reprises ne touchent pas. Les essais N à Q, du 2026-10-08, portent sur une copie de l'arbre principal, où F-002 et F-003 étaient codées sans être commitées : c'est l'ordre « F-002 d'abord », avec une forme précédente du script. Les essais R à T, du 2026-10-08 aussi, portent sur un gabarit tiré du commit `2e8a651` de `planification-reunie` et sur la forme du script de ce jour-là (quatorze fichiers, `@types/node@26.6.3`).

Dans les essais A à L, les numéros de fichier renvoient à la liste de la première version du plan : 1 à 9, les trois squelettes (`package.json`, `vitest.config.ts`, `tsconfig.json` de `contrats`, de `db` puis de `server`) ; 10, le `vitest.config.ts` racine ; 11, `.dependency-cruiser.cjs` ; 12, `eslint.config.mjs` ; 13, le `package.json` racine ; 14, le verrou. Leurs textes sont ceux que le script du bloc 0 écrit aujourd'hui.

Essais faits le 2026-10-08 sur des gabarits jetables hors du dépôt (`/tmp/gabarit-f008*`, puis `/tmp/essai-f008-archi` pour J à L), supprimés ensuite ; rien n'a été installé ni écrit dans le dépôt. Environnement : macOS (arm64), Node 26.11.0, pnpm 12.10.1, ESLint 10.11.0, dependency-cruiser 18.5.0, TypeScript 6.0.3, Vitest 5.0.3, Prettier 3.9.9, Docker Engine 29.8.2, Docker Compose 5.5.1, trivy 0.75.0.

- Gabarit complet : copies des fichiers racine du dépôt (`.gitkeep` d'`apps/` et de `packages/` compris), modifiées comme les fichiers 11, 12 et 13 ; fichiers 1 à 10 tels qu'écrits ; un vrai `pnpm install`.
- Dans ce gabarit, un squelette d'une quinzaine de fichiers aux noms du plan, écrit pour l'essai : les trois fichiers de `contrats`, les six de `db`, les aides de test, et un serveur de cinq fichiers (l'enveloppe y était dans `application.ts`). Ce squelette n'est pas le code de F-008 : il prouve l'outillage et les comportements des bibliothèques, pas la réalisation. `pnpm typecheck` y passait ; `pnpm lint` y signalait quatre nombres magiques, non corrigés.
- Gabarit nu : les quatorze fichiers du bloc 0 et rien d'autre, installé par `pnpm install --frozen-lockfile`.

Les sorties sont citées sans la ligne d'écho de pnpm, sans sa ligne `ELIFECYCLE` et sans les lignes d'heure et de durée de Vitest.

**A. Vitest, configuration racine.** Avec `projects: ["packages/*"]` et le fichier `packages/.gitkeep` du dépôt. Cette forme était celle du fichier 4 du bloc 0 de F-001 au moment de l'essai ; la révision 4 de son plan l'a remplacée (commit `38a5117`), et l'essai reste vrai pour l'ancienne forme seulement :

```text
 Startup Error
Error: The projects glob matched a file "packages/.gitkeep", but it should also either start with "vitest.config"/"vite.config" or match the pattern "(vitest|vite).*.config.*".
```

Avec le fichier 10, sur le gabarit complet (un fichier d'essai dans `infra/tests/`, un dans `apps/server/test/`) :

```text
[infra] infra/tests/essai.test.ts
[contrats] packages/contrats/test/enveloppe.test.ts
[server] apps/server/test/sante.test.ts
[db] packages/db/test/acces.test.ts
[db] packages/db/test/commande.test.ts
[db] packages/db/test/migration.test.ts
code=0
```

```text
 Test Files  6 passed (6)
      Tests  15 passed (15)
code=0
```

Sur le gabarit nu, `pnpm exec vitest run --project contrats --project db --project server --project infra` affiche `No test files found, exiting with code 1` et `projects: contrats, db, server, infra` ; la même commande `list --filesOnly` n'affiche rien et finit en `code=0`. Le test d'`infra/tests/` importait `yaml` et `node:fs` depuis la racine et lisait un fichier Compose.

**B. Contrats, état conforme** (gabarit complet, `pnpm contrats`) :

```text
✔ no dependency violations found (46 modules, 79 dependencies cruised)
code=0
```

Arêtes relevées par la sortie JSON, entre autres : `apps/server/src/application.ts → packages/db/src/index.ts` et `→ packages/contrats/src/index.ts` (imports par le nom du paquet), `→ crypto` (type `core`), `→ node_modules/.pnpm/…/node_modules/express/index.js`, `→ …/helmet/index.mjs` ; `apps/server/src/journal.ts → …/pino/pino.js` ; `packages/db/src/acces.ts → …/drizzle-orm/index.d.ts`, `→ …/drizzle-orm/node-postgres/migrator.d.ts`, `→ …/pg/esm/index.mjs` ; `apps/server/test/… → packages/db/test/essai.ts` (import de `@notionlike/db/essai`).

**C. Bibliothèques, comportements constatés** par des tests d'exploration sur le squelette (vrai serveur sur un port libre, `fetch`) :

- En-têtes de `GET /sante` : `content-security-policy: default-src 'none';frame-ancestors 'none'`, `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, pas de `x-powered-by`, `x-request-id` de 36 caractères différent de celui envoyé ; `helmet` pose aussi `strict-transport-security`, `x-frame-options`, `cross-origin-opener-policy`, `cross-origin-resource-policy`, entre autres.
- Avec le routage strict et sensible à la casse : `GET /sante` 200, `GET /sante?x=1` 200, `GET /sante/` 404, `GET /SANTE` 404, `GET //sante` 404. `OPTIONS /sante`, `POST /sante` et `DELETE /pret` : 404 avec l'enveloppe. `HEAD /sante` : 200.
- Corps : JSON tronqué 400 `requete-invalide` ; objet JSON de 100 000 octets vers un chemin inconnu 404 ; objet de 100 001 octets 413 `corps-trop-grand` ; chaîne JSON seule 400 ; corps vide 404 ; jeu de caractères inconnu 400 ; corps `text/plain` de 300 000 octets 404 (non lu).
- Origine listée : `access-control-allow-origin` égal à l'origine, `access-control-allow-credentials: true`, `vary: Origin` ; origine non listée : aucun des deux premiers.
- Erreur non prévue : 500 avec `{"code":"erreur-interne","message":"Une erreur interne est survenue.","idRequete":"…"}` ; ligne de journal de même `idRequete`, avec message et pile ; une propriété ajoutée à l'erreur n'y figure pas.
- Journal : `{"niveau":"info","time":"…","idRequete":"…","methode":"GET","chemin":"/inconnu","statut":404,"dureeMs":0,"message":"requete"}` pour `GET /inconnu?x=1` ; aucune valeur de `Cookie`, d'`Authorization` ni de corps.
- Arrêt pendant un `GET /pret` en attente : la requête reçoit 503 après 2 009 ms, une nouvelle connexion est refusée (`ECONNREFUSED`), `arreter()` finit à 2 023 ms. Sans fermeture répétée des connexions inactives pendant l'arrêt, `arreter()` ne finissait qu'à 5 009 ms (délai de maintien de connexion de Node). Requête à moitié envoyée : coupée après le délai (503 ms pour un délai de 500).
- Processus `node apps/server/src/main.ts`, lancé par un test : sans variable, code 1 et `Configuration invalide : URL_BASE_DONNEES` ; `PORT=abc` et `ORIGINES_AUTORISEES=*`, code 1 et `Configuration invalide : PORT, ORIGINES_AUTORISEES` ; `production` et mot de passe factice, code 1 ; sinon ligne `ecoute`, `GET /pret` 503 (port fermé), puis `SIGTERM` : code 0 en 12 ms, sortie d'erreur vide (aucun avertissement de Node sur l'exécution du TypeScript).

**D. Base, comportements constatés** :

- Migrateur de `drizzle-orm@0.45.3` sur PGlite 0.5.8 : dossier à `entries` vide, table de suivi créée et zéro ligne ; une migration, une ligne ; relance, une ligne ; lot de trois dont la troisième recrée une table existante, échec, la table de la deuxième absente et toujours une ligne ; lot corrigé, trois lignes. Messages de la chaîne d'erreurs : `Failed query: create table essai_un (id integer primary key);\n\nparams: ` puis `relation "essai_un" already exists`.
- PGlite et `pg_sleep` : une sonde lancée pendant un `pg_sleep(3)` a abouti après 3 004 ms au lieu d'échouer à 2 000 ms. La boucle d'événements est bloquée ; d'où le faux serveur.
- Faux serveur PostgreSQL (61 lignes) et vrai pilote `pg@8.23.1` : sonde 2 002 ms puis `sonde-hors-delai` quand il se tait ; `ouvrirBase` vers un port fermé : `base-injoignable`, causes `Failed query: select 1\nparams: ` puis `connect ECONNREFUSED 127.0.0.1:<port>`, aucune ne contenant le mot de passe.
- Connexions coupées par le faux serveur : avec l'écouteur `error` sur la réserve, la sonde suivante aboutit ; sans lui, `Uncaught Exception: Error: Connection terminated unexpectedly`, dont l'objet d'erreur porte `client: { …, password: 's3cret-de-test', … }`.
- Commande `node packages/db/src/migrer.ts` par un vrai processus : contre le faux serveur, code 0 et aucune sortie ; port fermé, code 1 et une sortie sans mot de passe (la phrase fixe, puis `Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` et `connect ECONNREFUSED 127.0.0.1:<port>`) ; URL invalide, code 1 et `L'URL de connexion à la base est invalide.` ; sans variable, code 1.
- Types : un accès Drizzle `node-postgres` et un accès Drizzle `pglite` sont tous deux acceptés par le type `PgDatabase<PgQueryResultHKT, Record<string, never>>` (`pnpm typecheck`, code 0).

**E. Séquences du bloc 0** (historique) : les deux séquences de vérification de la première version de ce plan (installation et contrôles, puis barrières) ont été jouées mot pour mot sur le gabarit nu, sans `packages/document` ni `apps/web`. Elles sont rejouées par les essais N et O (copie de l'arbre principal), puis R et S (gabarit tiré de HEAD). Deux écarts : le gabarit n'est pas un dépôt git (la dernière ligne a été remplacée par un `ls`, qui ne montrait plus que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts` dans chaque paquet), et ses hooks ne sont pas ceux du dépôt.

**F. Fusion avec le bloc 0 de F-001** (historique : le bloc 0 de F-001 est dans HEAD, il n'y a plus rien à fusionner avec lui ; pour F-002, voir l'essai S) : dans un dépôt git jetable, une branche portant les fichiers 4, 5, 6 et 7 du plan de F-001 et une autre les fichiers 10 à 13 d'ici, à partir des fichiers racine actuels. Le fichier 4 était alors dans son ancienne forme, `projects: ["packages/*"]` (révision 3 du plan de F-001). `git merge` :

```text
Auto-merging .dependency-cruiser.cjs
Auto-merging eslint.config.mjs
Auto-merging package.json
Auto-merging vitest.config.ts
CONFLICT (add/add): Merge conflict in vitest.config.ts
```

Les fichiers fusionnés portent onze règles et les deux constantes ; `pnpm contrats` et ESLint les chargent sans erreur sur le gabarit complet, et `prettier --check` passe.

Cet essai n'a pas été rejoué avec le fichier 4 de la révision 4 de F-001. Pour `.dependency-cruiser.cjs`, `eslint.config.mjs` et `package.json`, il reste celui qui vaut : la révision 4 n'a pas retouché ses fichiers 5, 6 et 7 (le diff du commit `38a5117` ne porte sur aucune ligne de ces trois sections). Pour `vitest.config.ts`, le résultat avec la nouvelle forme n'est pas de cet essai : il vient de l'essai M du plan de F-001 (M6), qui a fusionné son nouveau fichier 4 et le fichier 10 d'ici dans un dépôt jetable et obtenu le même `CONFLICT (add/add)`, limité à la valeur de `projects`. La consigne « garder le fichier 10 » tient donc sur ce constat de F-001, non sur un essai fait ici.

**G. Exécution sans compilation et installation de production** : dans une copie sans tests, `pnpm install --frozen-lockfile --prod` installe 98 paquets (31 Mo), sans PGlite, Vitest ni TypeScript ; `node apps/server/src/main.ts` et `node packages/db/src/migrer.ts` s'y exécutent, les paquets du workspace étant atteints par leurs liens. À l'inverse, un fichier `.ts` placé sous `node_modules` est refusé par Node (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). `node --env-file=.env src/main.ts` : `node: .env: not found` et code 9 sans le fichier ; avec lui, les variables sont lues.

**H. Docker Compose, sans tirer d'image, avant la veille des conteneurs** (`docker compose config` sur un brouillon du fichier décrit par l'ADR-0006) : sans `POSTGRES_PASSWORD`, ou avec une valeur vide, code 1 et `required variable POSTGRES_PASSWORD is missing a value` ; sans `apps/server/.env`, code 1 et `env file …/apps/server/.env not found` ; avec les deux, code 0, et l'environnement du service `serveur` contient une variable ajoutée au fichier (`BETTER_AUTH_SECRET`) à côté de `HOTE`, `PORT` et `URL_BASE_DONNEES` fixées par le fichier Compose.

**I. Contrôles du socle sur le gabarit** : `pnpm audit --audit-level high` : `No known vulnerabilities found`. `trivy fs --exit-code 1 --severity HIGH,CRITICAL .`, avec un Dockerfile volontairement fautif (image non épinglée, utilisateur root) : seul `pnpm-lock.yaml` est analysé, zéro vulnérabilité, code 0. `gitleaks stdin` (commande du socle) sur les deux fichiers d'exemple, sur un extrait de test portant `mot-de-passe-de-test` et sur un extrait du fichier Compose : aucun constat. `prettier --check` passe sur les fichiers 1 à 13 et sur le `_journal.json` vide.

**J. Image du serveur, variante Alpine** (essai fait après la veille des conteneurs). Squelette écrit pour l'essai, hors dépôt : trois paquets aux manifestes des fichiers 1, 4 et 7 (dépendances d'exécution aux versions du plan, `pnpm install` réel), un `main.ts` d'une cinquantaine de lignes (Express, `helmet`, `pino`, `GET /sante`, `GET /pret` avec une sonde bornée à 2 secondes par le code, arrêt sur `SIGTERM`), un `migrer.ts` qui appelle le migrateur de Drizzle par le pilote `pg` sur un dossier de migrations à `entries` vide. Ce squelette n'est pas le code de F-008. Dockerfile de l'ADR-0006 : deux étapes sur `node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80`, `npm install -g pnpm@12.10.1`, `pnpm install --frozen-lockfile --prod`, puis dans l'étape finale `rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx`, `USER node`, `HEALTHCHECK` par `fetch`. `docker build` réussit. Dans l'image construite :

```text
uid=1000(node) gid=1000(node) groups=1000(node),1000(node)
v26.10.0
3.24.2
```

`command -v npm npx corepack pnpm yarn` ne trouve rien (code 127) ; `/usr/local/bin` ne contient que `docker-entrypoint.sh` et `node` ; `/usr/local/lib/node_modules` et `/opt` sont vides ; `/app/node_modules` pèse 31,9 Mo ; `Config.User` vaut `node`. Les deux points d'entrée s'exécutent sans compilation :

```text
$ docker run --rm <image>
Configuration invalide : URL_BASE_DONNEES
code=1
$ docker run --rm <image> node packages/db/src/migrer.ts
Configuration invalide : URL_BASE_DONNEES
code=1
$ docker run --rm -e URL_BASE_DONNEES=postgres://u:s3cret@127.0.0.1:9/x <image> node packages/db/src/migrer.ts
La migration a echoue. DrizzleQueryError
code=1
```

Leur exécution contre une vraie base est en K. `trivy image --severity HIGH,CRITICAL --scanners vuln` sur l'image construite : une cible `alpine 3.24.2` (18 paquets) et les paquets Node de `/app`, zéro constat ; avec `--exit-code 1`, code 0. La même commande sur l'image de base donne les 4 constats HIGH de la veille, tous sous `usr/local/lib/node_modules/npm/node_modules/` (`brace-expansion` 5.0.9, deux fois ; `http-cache-semantics` 4.2.0 ; `undici` 6.28.0). Sur `postgres:18.6@sha256:74935e72…` : 84 constats, 62 dans les paquets Debian (61 HIGH, 1 CRITICAL, aucun avec version corrigée) et 22 dans `usr/local/bin/gosu` (21 HIGH, 1 CRITICAL).

**K. Séquence de fumée sur une pile réelle.** Fichier Compose de l'ADR-0006 (trois services, images épinglées par empreinte, volume nommé sur `/var/lib/postgresql`, messages quotés, `env_file` en forme longue, ports réglables), projet `essai-f008-fumee`, ports 55432 et 53000 (le port 5432 du poste était pris par une autre base). Le contrôle de santé de la base était `pg_isready -U notionlike -d notionlike` pour cette séquence, puis `-h 127.0.0.1` pour trois démarrages à volume vide (L). D'abord `docker compose config` :

```text
error while interpolating services.base.environment.POSTGRES_PASSWORD: required variable POSTGRES_PASSWORD is missing a value: Variable obligatoire : copier infra/.env.example en infra/.env
code=1
env file /tmp/essai-f008-archi/apps/server/.env not found: stat /tmp/essai-f008-archi/apps/server/.env: no such file or directory
code=1
```

(la même erreur est répétée pour les deux services qui portent `URL_BASE_DONNEES`). Avec les deux fichiers, code 0. Le même fichier avec le message non quoté : `go-yaml load error in scanner at L9.C68: mapping values are not allowed in this context`, code 1. Puis la séquence, par un script d'essai ; les sorties sont citées telles quelles, sans les lignes de progression de Compose (`Starting`, `Waiting`), sans les accusés de `psql` et sans la ligne `ecoute` du journal :

```text
== 1. up -d --wait
code=0
 Container essai-f008-fumee-base-1 Healthy
 Container essai-f008-fumee-migration-1 Exited
 Container essai-f008-fumee-serveur-1 Healthy
GET /pret : 200 en 0.015040s
== 2. migration
base running 0 healthy
migration exited 0
serveur running 0 healthy
drizzle.__drizzle_migrations
== 3. version
PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
/var/lib/postgresql/18/docker
variables : {"essai":"vue-par-le-serveur","uid":1000}
== 4. base arretee
GET /pret : 503 en 0.014035s
GET /pret : 503 en 0.005776s
GET /sante : 200 en 0.001527s
== 5. base redemarree
GET /pret : 200 en 0.025003s (essai 2)
serveur avant : 2026-10-08T11:21:39.902006719Z 0
serveur apres : 2026-10-08T11:21:39.902006719Z 0
== 6. down puis up sans supprimer le volume
down code=0
up code=0
drizzle.__drizzle_migrations|42
GET /pret : 200 en 0.014262s
== 7. arret du serveur
code de sortie : 0, duree : 0 s
{"level":30,"time":1791458519860,"pid":1,"hostname":"b057451ed269","msg":"arret demande"}
{"level":30,"time":1791458519861,"pid":1,"hostname":"b057451ed269","msg":"arret termine"}
== 8. nettoyage
code=0
```

- Ligne `variables` : une route d'essai rend une variable ajoutée à `apps/server/.env` (F-008-AC24) et l'identifiant de l'utilisateur du processus (1000, `node`). `HOTE=127.0.0.1` écrit dans ce même fichier n'a pas empêché le serveur de répondre : la valeur fixée par le fichier Compose l'emporte.
- Étape 5 : les deux lignes sont la date de démarrage et le compteur de redémarrages du conteneur du serveur, avant et après. La première sonde après le redémarrage a répondu 503, la deuxième 200, une seconde plus tard.
- Étape 6 : `42` est une ligne témoin insérée avant `down` ; elle et la table de suivi ont survécu.
- Étape 7 : `SIGTERM` reçu alors que la réserve `pg` tenait une connexion ouverte par les sondes.

Base figée (`docker compose pause base`), donc connectée mais muette :

```text
GET /pret : 200 en 0.038499s
GET /pret : 503 en 2.015716s
GET /pret : 503 en 2.012947s
GET /sante : 200 en 0.003634s
GET /pret : 200 en 0.003528s
```

La dernière ligne suit `unpause`. Migration en échec, par un fichier de surcharge qui donne un mauvais mot de passe au seul service `migration` :

```text
 Container essai-f008-fumee-base-1 Healthy
 Container essai-f008-fumee-migration-1 Error service "migration" didn't complete successfully: exit 1
service "migration" didn't complete successfully: exit 1
base running 0
migration exited 1
serveur created 0
migration-1  | La migration a echoue. DrizzleQueryError
GET /pret : 000
```

`up -d --wait` finit en code 1 ; `curl` finit en code 7 (connexion refusée) : le serveur n'a jamais démarré. Enfin `docker compose up --abort-on-container-exit`, sur la pile saine :

```text
 Container essai-f008-fumee-base-1 Error dependency base failed to start
dependency failed to start: container essai-f008-fumee-base-1 exited (0)
base exited 0
migration exited 0
serveur created 0
```

**L. Deux constats sur l'image `postgres:18.6`.** Volume nommé monté sur `/var/lib/postgresql/data` : le conteneur sort en code 1.

```text
base-1  | Error: in 18+, these Docker images are configured to store database data in a
base-1  |        format which is compatible with "pg_ctlcluster" (specifically, using
base-1  |        major-version-specific directory names).
…
base-1  |        The suggested container configuration for 18+ is to place a single mount
base-1  |        at /var/lib/postgresql which will then place PostgreSQL data in a
base-1  |        subdirectory, allowing usage of "pg_upgrade --link" without mount point
base-1  |        boundary issues.
```

`pg_isready` pendant l'initialisation d'un volume vide, allongée par un script d'initialisation qui dort 8 secondes, interrogé chaque seconde par la socket puis par le port TCP :

```text
t=1s socket: /var/run/postgresql:5432 - accepting connections | tcp: 127.0.0.1:5432 - no response
…
t=7s socket: /var/run/postgresql:5432 - accepting connections | tcp: 127.0.0.1:5432 - no response
t=8s socket: /var/run/postgresql:5432 - accepting connections | tcp: 127.0.0.1:5432 - accepting connections
```

D'où `-h 127.0.0.1` dans le contrôle de santé. Avec lui, trois démarrages de la pile à volume vide : `up -d --wait` code 0, `GET /pret` 200, `migration` sorti en code 0, les trois fois. Sans script d'initialisation, la fenêtre est courte : les démarrages de K, faits sans `-h`, n'y sont pas tombés.

Nettoyage : conteneurs, réseau, volume et images construites de l'essai supprimés, dossier `/tmp/essai-f008-archi` supprimé ; les images `node` et `postgres` tirées par la veille sont laissées en place, comme le cache de construction de Docker.

**N. Script du bloc 0, forme précédente, sur une copie de l'arbre principal.** Le script différait de celui d'aujourd'hui par trois points : la constante ESLint était insérée avant `export default tseslint.config(`, il n'avait pas de garde d'arbre propre, et il était extrait par numéros de ligne. Copie complète de l'arbre de travail hors du dépôt (`/tmp/essai-f008-bloc0`, sans `.git` ni `node_modules`), prise le 2026-10-08 à 19 h 37, `packages/document` et `apps/web` tels qu'ils étaient à cet instant, `pnpm install` refait sur place. Environnement : celui des essais A à L (Node 26.11.0, pnpm 12.10.1). Avant le script, sur cette copie : `prettier --check .`, `pnpm lint`, `pnpm typecheck` et `pnpm contrats` (96 modules) en code 0, `pnpm test` à 29 fichiers et 445 tests passés. Puis la commande d'une ligne de « Bloc 0 (dev) », telle quelle. Sortie (codes de couleur, lignes vides, avertissements `localStorage` de Node et conseils de performance de Vitest retirés) :

```text
cree     packages/contrats/package.json
cree     packages/contrats/vitest.config.ts
cree     packages/contrats/tsconfig.json
cree     packages/db/package.json
cree     packages/db/vitest.config.ts
cree     packages/db/tsconfig.json
cree     apps/server/package.json
cree     apps/server/vitest.config.ts
cree     apps/server/tsconfig.json
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
modifie  vitest.config.ts
modifie  package.json
Scope: all 6 workspace projects
Packages: +109 -4
Progress: resolved 109, reused 309, downloaded 0, added 109, done
devDependencies:
+ @types/node 26.6.3
+ yaml 2.9.1
Done in 495ms using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
Scope: 5 of 6 workspace projects
packages/db typecheck: Done
packages/contrats typecheck: Done
packages/document typecheck: Done
apps/server typecheck: Done
apps/web typecheck: Done
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (99 modules, 265 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  29 passed (29)
      Tests  445 passed (445)
bloc 0 : code=0
```

- Tests avant et après : 29 fichiers et 445 tests passés dans les deux cas, aucun échec, aucun test sauté.
- Relance : `ARRET : packages/contrats/package.json existe deja, rien n'est ecrit`, `bloc 0 : code=1`, les fichiers racine et le verrou identiques octet pour octet.
- Attendu chiffré, ligne 0 : `vitest list --filesOnly` avec les quatre `--project` n'affiche rien et finit en `code=0` ; `vitest run` finit en `code=1` avec `No test files found, exiting with code 1` et `projects: contrats, db, server, infra`.
- Verrou : les dix versions attendues, une seule version de `zod` ; `pnpm audit --audit-level high` : `No known vulnerabilities found`.
- **Effet sur `apps/web` et `packages/document`, par le verrou seul.** Aucun de leurs fichiers n'est touché, mais `vite` et `vitest` ont `@types/node` et `yaml` pour pairs facultatifs, et pnpm les résout à la racine du workspace dès qu'ils y sont : leurs entrées du verrou passent de `vitest@5.0.3(jsdom@30.1.1)(vite@8.3.2)` à `vitest@5.0.3(@types/node@26.6.3)(jsdom@30.1.1)(vite@8.3.2(@types/node@26.6.3)(yaml@2.9.1))`, mêmes versions de `vite` et de `vitest`. Les types de Node deviennent donc visibles depuis `apps/web` par les types de Vite ; `tsc` sur `apps/web` et sur `packages/document` passe avant comme après, et leurs tests sont les mêmes.
- Une première copie, prise dix minutes plus tôt pendant que deux agents écrivaient dans `apps/web`, était rouge avant le script : `apps/web/e2e/arborescence.spec.ts` non formaté et deux `no-console`, un nombre magique dans `apps/web/src/edition/extensions.ts`, six tests d'`apps/web` en échec sur 390. Le script s'y arrêtait à `prettier --check .` (`bloc 0 : code=1`), ses quatorze fichiers écrits et l'installation faite ; les contrôles passés ensuite un par un donnaient les mêmes constats et les mêmes six échecs qu'avant, `pnpm typecheck` et `pnpm contrats` en code 0. Aucun de ces constats ne venait du script. C'est ce qu'il faut attendre si le dev le lance pendant qu'un agent frontend écrit.

**O. Barrières sur la même copie.** La séquence de « Vérification des barrières après le bloc 0 », extraite de ce document et jouée sur la même copie après le script : les onze résultats attendus, une seule violation par étape en échec ; à la fin, chaque paquet ne contient plus que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts`.

**P. Signatures figées.** Sur la même copie, quatre fichiers jetables : `packages/contrats/src/index.ts` (les neuf noms, écrits avec `z.strictObject`, `z.enum` et `z.literal`), `packages/db/src/index.ts` et `packages/db/test/essai.ts` (les déclarations de « Parallélisme et interfaces figées », sans corps), et un fichier d'`apps/server` qui importe les trois entrées par leur nom de paquet et se sert de chaque nom. `pnpm typecheck` : code 0 pour les cinq paquets. Seuls les types sont prouvés : aucune réalisation n'a été écrite. Fichiers supprimés ensuite.

**Q. Installation de production avec le verrou élargi.** Le verrou connaît maintenant cinq paquets du workspace, l'image n'en reçoit que trois. Dans un dossier jetable : `package.json` racine, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et les seuls manifestes de `packages/contrats`, `packages/db` et `apps/server`, puis `pnpm install --frozen-lockfile --prod` : code 0, `Lockfile is up to date, resolution step is skipped`, 98 paquets, 31 Mo, ni PGlite, ni Vitest, ni React, ni Tiptap ; `apps/server/node_modules` contient `@notionlike/contrats`, `@notionlike/db`, `express`, `helmet`, `pino` et `zod`. Même résultat avec les cinq manifestes et `--filter "@notionlike/server..."`. L'étape de dépendances du Dockerfile de l'ADR-0006 tient donc telle qu'écrite, avec trois manifestes. Sans Docker : `docker build` n'a pas été rejoué.

Nettoyage des essais N à Q : `/tmp/essai-f008-bloc0` et ses fichiers voisins supprimés ; rien n'a été installé ni écrit dans le dépôt hors de `docs/decisions/`, aucun conteneur lancé.

**R. Script du bloc 0 sur un gabarit tiré de HEAD.** Gabarit hors du dépôt : `git archive HEAD` du commit `2e8a651` déplié dans un dossier jetable, donc la disposition réelle du dépôt, `apps/.gitkeep` et `packages/.gitkeep` compris, `apps/` sans rien d'autre, `packages/document` tel que livré ; ce document y remplace sa version commitée. Le dossier est rendu dépôt git (`git init`, un commit), parce que le script interroge `git status`. `pnpm install --frozen-lockfile`. Environnement : Node 26.11.0, pnpm 12.10.1, les versions d'outils des essais A à L. Avant le script : `prettier --check .`, `pnpm lint`, `pnpm typecheck` et `pnpm contrats` (19 modules, 39 dépendances) en code 0, `pnpm test` à 6 fichiers et 224 tests passés. Puis la commande de « Bloc 0 (dev) », telle quelle. Sortie (codes de couleur, lignes vides, lignes d'écho de `tsc`, avertissements `localStorage` de Node retirés) :

```text
cree     packages/contrats/package.json
cree     packages/contrats/vitest.config.ts
cree     packages/contrats/tsconfig.json
cree     packages/db/package.json
cree     packages/db/vitest.config.ts
cree     packages/db/tsconfig.json
cree     apps/server/package.json
cree     apps/server/vitest.config.ts
cree     apps/server/tsconfig.json
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
modifie  vitest.config.ts
modifie  package.json
Scope: all 5 workspace projects
Packages: +108 -3
Progress: resolved 108, reused 237, downloaded 0, added 108, done
devDependencies:
+ @types/node 26.6.3
+ yaml 2.9.1
Done in 540ms using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
Scope: 4 of 5 workspace projects
packages/contrats typecheck: Done
packages/db typecheck: Done
packages/document typecheck: Done
apps/server typecheck: Done
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (22 modules, 42 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  6 passed (6)
      Tests  224 passed (224)
bloc 0 : code=0
```

- `git status --short` ensuite : les cinq fichiers racine modifiés, les trois dossiers de paquet non suivis, rien d'autre.
- Relance sans commit : `ARRET : fichier racine modifie et non commite, rien n'est ecrit ; lancer dans un arbre propre :`, suivi des cinq lignes de `git status`, puis `bloc 0 : code=1`. Relance après commit (jouée dans l'essai S) : `ARRET : packages/contrats/package.json existe deja, rien n'est ecrit`. Dans les deux cas l'état de l'arbre est inchangé.
- Attendu chiffré, ligne 0 : `vitest list --filesOnly` avec les quatre `--project` n'affiche rien et finit en `code=0` ; `vitest run` finit en `code=1` avec `No test files found, exiting with code 1` et `projects: contrats, db, server, infra`. Sans filtre, `vitest list --filesOnly` rend les six fichiers `[document]`.
- Verrou : les dix versions attendues, une seule version de `zod` ; `pnpm audit --audit-level high` : `No known vulnerabilities found`.
- Barrières : la séquence de « Vérification des barrières après le bloc 0 », extraite de ce document et jouée telle quelle, donne les onze résultats attendus, une seule violation par étape en échec ; à la fin, chaque paquet ne contient plus que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts`.
- Installation de production (l'essai Q refait avec ce verrou, qui connaît quatre paquets du workspace) : racine, verrou, `pnpm-workspace.yaml` et les trois manifestes, `pnpm install --frozen-lockfile --prod` : code 0, `Lockfile is up to date, resolution step is skipped`, 98 paquets, 31 Mo ; `apps/server/node_modules` contient `@notionlike/contrats`, `@notionlike/db`, `express`, `helmet`, `pino` et `zod` ; ni PGlite, ni Vitest, ni TypeScript ne sont installés.

**S. Composition avec le travail non commité de F-002 et F-003, dans les deux ordres.** Dans le dépôt jetable de l'essai R, trois branches à partir du même commit (HEAD) : `f008`, le résultat de l'essai R commité ; `f002`, HEAD recouvert par l'état de l'arbre principal du 2026-10-08 pour `.dependency-cruiser.cjs`, `eslint.config.mjs`, `pnpm-lock.yaml`, `apps/web/` (sans `node_modules`, `dist` ni rapports) et les dossiers `src` et `test` de `packages/document` ; ni l'une ni l'autre n'est une branche du dépôt.

F-008 d'abord : `git merge f002` depuis `f008`.

```text
Auto-merging .dependency-cruiser.cjs
Auto-merging eslint.config.mjs
Auto-merging pnpm-lock.yaml
CONFLICT (content): Merge conflict in pnpm-lock.yaml
Automatic merge failed; fix conflicts and then commit the result.
```

Le verrou porte 50 marques de conflit. `pnpm install`, sans autre geste :

```text
Scope: all 6 workspace projects
Merge conflict detected in pnpm-lock.yaml and successfully merged
✓ Lockfile passes supply-chain policies (400 entries in 1.9s)
Packages: +101 -3
```

Plus aucune marque ; `.dependency-cruiser.cjs` porte vingt-deux règles ; `prettier --check .`, `pnpm lint` et `pnpm typecheck` (cinq paquets) en code 0 ; `pnpm contrats` : `no dependency violations found (101 modules, 268 dependencies cruised)` ; `pnpm test` : 29 fichiers, 448 tests passés.

F-002 d'abord : la branche `f002` extraite dans un second dossier, `pnpm install --frozen-lockfile`, puis la commande du bloc 0 telle quelle : les treize lignes `cree` et `modifie`, `Scope: all 6 workspace projects`, les cinq contrôles en code 0 (`101 modules, 268 dependencies cruised`, 29 fichiers et 448 tests), `bloc 0 : code=0`. La séquence des barrières y donne les onze résultats attendus, une seule violation par étape en échec, `apps/web` présente.

Les deux ordres donnent les mêmes fichiers : `cmp` ne trouve aucune différence entre le résultat de la fusion et celui du script pour `.dependency-cruiser.cjs`, `eslint.config.mjs`, `vitest.config.ts` et `package.json`.

Limites de cet essai : l'état de F-002 et F-003 est celui de l'arbre à cet instant, pas un bloc 0 commité par le dev ; `apps/web` y était verte, ce qui n'engage pas son état futur ; ses tests de bout en bout (Playwright) n'ont pas été lancés.

**T. `tsc` et les globales de Node.** Un fichier jetable `export const essai = [process.env, Buffer, setImmediate];` posé dans `src/`, puis `tsc --noEmit -p tsconfig.json` dans le paquet :

| Où                  | Quand                                                                                                 | Résultat                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/document` | avant le bloc 0 (gabarit de l'essai R, HEAD)                                                          | code 2 : `TS2591: Cannot find name 'process'`, `TS2591: Cannot find name 'Buffer'`, `TS2304: Cannot find name 'setImmediate'` |
| `packages/document` | après le bloc 0                                                                                       | code 0, aucune erreur                                                                                                         |
| `packages/contrats` | après le bloc 0                                                                                       | code 0, aucune erreur                                                                                                         |
| les deux            | après le bloc 0, avec un `tsconfig` jetable qui étend celui du paquet et réduit `include` à `["src"]` | code 2, les trois erreurs                                                                                                     |
| `packages/contrats` | après le bloc 0, fichier `[window, document]`                                                         | code 2 : `TS2304: Cannot find name 'window'`, `TS2584: Cannot find name 'document'`                                           |

Cause, lue dans `tsc --explainFiles` : `@types/node/index.d.ts` entre par `Type library referenced via 'node' from file '…/vite/dist/node/index.d.ts'`. `vitest.config.ts` et les tests sont dans `include` et importent Vitest, donc les types de Vite. Avant le bloc 0, cette référence ne se résout pas, `@types/node` n'étant installé nulle part. Retirer `@types/node` du seul `package.json` racine ne change rien (essayé) : `packages/db` et `apps/server` l'installent, et pnpm le donne pour pair à l'unique instance de `vitest` du workspace. ESLint, lui, refuse `process` dans `packages/contrats/src` avant comme après (étape 3 des barrières).

Nettoyage des essais R à T : les dossiers jetables sont dans le répertoire temporaire de la session, hors du dépôt ; rien n'a été installé ni écrit dans le dépôt hors de `docs/decisions/`, aucun conteneur lancé, aucune branche créée dans le dépôt.

**U. Script du bloc 0 sur un gabarit tiré de HEAD (2026-10-09).** Gabarit hors du dépôt : `git archive HEAD` du commit `651991f` de `F-008-socle` déplié dans un dossier jetable (`apps/.gitkeep` et `packages/.gitkeep` compris, `apps/web` et `packages/document` tels que livrés) ; ce document y est ajouté. Le dossier est rendu dépôt git (`git init`, un commit), parce que le script interroge `git status`. `pnpm install --frozen-lockfile`. Environnement : macOS (arm64), Node 26.11.0, pnpm 12.10.1. Avant le script : `prettier --check .`, `pnpm lint` et `pnpm typecheck` en code 0, `pnpm contrats` à 76 modules et 203 dépendances, `pnpm test` à 21 fichiers et 777 tests passés ; `[process.env, Buffer, setImmediate]` dans `packages/document/src` : `tsc` en code 2. Puis le script, extrait de ce document par la commande de « Bloc 0 (dev) » et lancé par `zsh`. Sortie (codes de couleur, lignes vides, barre de progression et avertissements `localStorage` de Node retirés) :

```text
cree     packages/contrats/package.json
cree     packages/contrats/vitest.config.ts
cree     packages/contrats/tsconfig.json
cree     packages/db/package.json
cree     packages/db/vitest.config.ts
cree     packages/db/tsconfig.json
cree     apps/server/package.json
cree     apps/server/vitest.config.ts
cree     apps/server/tsconfig.json
cree     packages/document/tsconfig.src.json
modifie  .dependency-cruiser.cjs
modifie  eslint.config.mjs
modifie  vitest.config.ts
modifie  package.json
modifie  packages/document/package.json
Scope: all 6 workspace projects
Packages: +109 -4
Progress: resolved 109, reused 273, downloaded 0, added 109, done
devDependencies:
+ @types/node 26.6.4
+ yaml 2.9.1
Done in 1.8s using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
Scope: 5 of 6 workspace projects
packages/contrats typecheck: Done
packages/db typecheck: Done
apps/server typecheck: Done
packages/document typecheck: Done
apps/web typecheck: Done
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (79 modules, 206 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  21 passed (21)
      Tests  777 passed (777)
bloc 0 : code=0
```

- Vingt règles dans `.dependency-cruiser.cjs`. `git diff --name-only` après commit : les seize fichiers de « Bloc 0 (dev) », rien d'autre.
- **Un premier passage, sur un autre exemplaire du même gabarit, a fini en `bloc 0 : code=1`.** Les seize fichiers étaient écrits, l'installation faite, `prettier`, `pnpm lint`, `pnpm typecheck` et `pnpm contrats` en code 0 ; `pnpm test` a duré 546 secondes et rendu `Test Files  13 passed (13)`, `Tests  546 passed (546)`, `Errors  8 errors`, les huit erreurs étant `[vitest-pool]: Failed to start forks worker for test files …` avec `Timeout waiting for worker to respond` (environ 43 secondes de démarrage par processus de test). La machine était chargée (charge moyenne de 8, d'autres agents y travaillaient). Aucun test n'a échoué. `pnpm test` relancé seul sur ce même exemplaire, sans rien y changer : 21 fichiers, 777 tests passés, 9 secondes. Le passage cité plus haut est le second, sur un exemplaire neuf.

**V. Script du bloc 0 sur un gabarit tiré de `main` (2026-10-09).** Même méthode, avec `git archive main` (commit `c1df7d8`), `specs/F-008.md` de HEAD et ce document : c'est l'arbre que donne la fusion de `main` dans `F-008-socle` (`git merge-tree --write-tree HEAD main` finit en code 0, sans conflit ; la fusion elle-même n'a pas été faite). Avant le script : les trois premiers contrôles en code 0, `pnpm contrats` à 146 modules et 395 dépendances, `pnpm test` à 32 fichiers et 1 078 tests passés ; `tsc` en code 2 sur les trois globales de Node dans `packages/document/src`. Le même script, au même texte (même empreinte SHA-256 du fichier extrait) :

```text
Scope: all 6 workspace projects
Packages: +110 -5
Progress: resolved 110, reused 275, downloaded 0, added 110, done
devDependencies:
+ @types/node 26.6.4
+ yaml 2.9.1
Done in 364ms using pnpm v12.10.1
Checking formatting...
All matched files use Prettier code style!
$ eslint --no-warn-ignored .
$ pnpm -r run typecheck
Scope: 5 of 6 workspace projects
packages/db typecheck: Done
packages/contrats typecheck: Done
apps/server typecheck: Done
packages/document typecheck: Done
apps/web typecheck: Done
$ depcruise --config .dependency-cruiser.cjs apps packages
✔ no dependency violations found (147 modules, 398 dependencies cruised)
$ vitest run --passWithNoTests
 Test Files  32 passed (32)
      Tests  1078 passed (1078)
bloc 0 : code=0
```

(les quinze lignes `cree` et `modifie` sont celles de l'essai U.)

- Vingt-trois règles. Seize fichiers changés, dont le verrou.
- Relance après commit : `ARRET : packages/contrats/package.json existe deja, rien n'est ecrit`, `bloc 0 : code=1`, arbre inchangé (`git status --short` vide). Relance sans commit, sur le premier exemplaire de l'essai U : `ARRET : fichier a modifier deja modifie et non commite, rien n'est ecrit ; lancer dans un arbre propre :`, suivi des six lignes de `git status`, puis `bloc 0 : code=1`.
- Attendu chiffré, ligne 0 : `vitest list --filesOnly` avec les quatre `--project` n'affiche rien et finit en code 0 ; `vitest run` finit en code 1 avec `No test files found, exiting with code 1` et `projects: contrats, db, server, infra`. Sans filtre, `vitest list --filesOnly` rend 7 fichiers `[document]` et 25 fichiers `[web]` (14 `[web]` sur le gabarit de l'essai U).
- Verrou : `express@5.2.1`, `helmet@8.3.0`, `pino@10.3.1`, `drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`, `@types/express@5.0.6`, `@types/node@26.6.4`, `yaml@2.9.1`, une seule version de `zod` (`4.6.5`). `pnpm audit --audit-level high` : `No known vulnerabilities found`.
- Installation de production avec ce verrou, qui connaît six importateurs : dans un dossier jetable, `package.json` racine, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et les seuls manifestes de `packages/contrats`, `packages/db` et `apps/server`, puis `pnpm install --frozen-lockfile --prod` : `Lockfile is up to date, resolution step is skipped`, 98 paquets, 31 Mo ; `apps/server/node_modules` contient `@notionlike/contrats`, `@notionlike/db`, `express`, `helmet`, `pino` et `zod` ; ni PGlite, ni Vitest, ni TypeScript, ni React, ni Tailwind ne sont installés. L'étape de dépendances du Dockerfile de l'ADR-0006 tient donc avec le verrou du jour ; `docker build` n'a pas été rejoué.
- `pino@10.4.0`, dans un dossier jetable à part (`minimumReleaseAge: 10080`), le 2026-10-09 à 13 h 52 UTC : `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, `pino@10.4.0 was published at 2026-10-02T18:18:54.863Z, within the minimumReleaseAge cutoff`.
- **Ordre inverse.** Dans un dépôt jetable à trois branches (l'arbre de HEAD pour base ; cette base avec les seize fichiers de l'essai U ; l'arbre de `main`), `git merge` de la troisième dans la deuxième : `Auto-merging .dependency-cruiser.cjs`, `Auto-merging eslint.config.mjs`, `CONFLICT (content): Merge conflict in pnpm-lock.yaml` (9 marques). `pnpm install` : `Merge conflict detected in pnpm-lock.yaml and successfully merged`, plus aucune marque. `diff -rq` entre ce résultat et le gabarit de l'essai V après le script, hors `node_modules` et `.git` : aucune différence, verrou compris. Les contrôles n'y ont pas été relancés : l'arbre est le même.

**W. Barrières après le bloc 0 (2026-10-09).** La séquence de « Vérification des barrières après le bloc 0 », extraite de ce document et jouée telle quelle sur les gabarits des essais U et V, après commit du bloc 0 : les douze résultats attendus sur les deux, une seule violation par étape en échec des contrats, `zod` résolu en `node_modules/.pnpm/zod@4.6.5/node_modules/zod/index.d.cts` ; à la fin, chaque paquet ne contient plus que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts`, et `git status --short packages/document` ne rend rien.

Détail de la barrière de types, sur le gabarit de l'essai V, avec `export const essai = [process.env, Buffer, setImmediate];` :

| Où                                       | Commande                                       | Résultat                                                                      |
| ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/document/src`, avant le bloc 0 | `tsc --noEmit -p tsconfig.json`                | code 2 : `TS2591` (`process`), `TS2591` (`Buffer`), `TS2304` (`setImmediate`) |
| `packages/document/src`, après le bloc 0 | `tsc --noEmit -p tsconfig.json`                | code 0 : la première passe ne retient plus rien                               |
| `packages/document/src`, après le bloc 0 | `tsc --noEmit -p tsconfig.src.json`            | code 2, les trois erreurs                                                     |
| `packages/document/src`, après le bloc 0 | `pnpm --filter @notionlike/document typecheck` | code 1, les trois erreurs ; code 0 une fois le fichier retiré                 |
| `packages/contrats/src`, après le bloc 0 | `tsc --noEmit -p tsconfig.json`                | code 0 : limite connue (« Limite pour `packages/contrats` »)                  |

Nettoyage des essais U à W : les dossiers jetables sont dans le répertoire temporaire de la session, hors du dépôt ; rien n'a été installé ni écrit dans le dépôt hors de `docs/decisions/`, aucun conteneur lancé, aucune branche créée ni fusionnée dans le dépôt.

Non essayé :

- le code de F-008 dans l'image et sur la pile : J à L portent sur un squelette, pas sur les blocs 1 à 5, qui n'existent pas ;
- `infra/fumee.sh` lui-même, qui n'était pas écrit le jour de ces essais (il l'est depuis, et a été lancé le 2026-10-12, voir « Livré autrement que ce plan ») : ses constats 1 à 9 ont été joués à la main et par un script d'essai, dans un autre ordre ; le constat 10 l'a été sur une image construite à part, pas sur celle du projet Compose ; la surcharge du constat 9 était un fichier posé à côté du fichier Compose, pas un fichier temporaire ;
- une image unique nommée et partagée par les deux services : à l'essai, `migration` et `serveur` portaient chacun la même section `build`, ce qui donne deux noms d'image sur les mêmes couches ;
- la variante `slim` construite, et l'image `postgres:18.6-alpine` ;
- une architecture autre que linux/arm64 ;
- une version de Compose plus ancienne que la 5.5.1 : le minimum 2.24.0 vient de la documentation lue par la veille ;
- l'étiquette Docker de Node 26.11, qui n'existe pas encore ;
- un mot de passe changé dans `infra/.env` après l'initialisation du volume (ADR-0006, « Conséquences ») : déduit de la documentation de l'image, pas joué ;
- un vrai PostgreSQL au-delà de K : SQL d'une migration non vide par le pilote `pg`, réserve de connexions sous charge ;
- `drizzle-kit`, non installé ;
- `pino@10.4.0` installée : pnpm la refuse jusqu'au 2026-10-09 à 18 h 18 UTC (essai V) ;
- Docker le 2026-10-09 : le démon ne répondait pas ; tout ce que le plan dit des images et de la pile vient des essais H à L du 2026-10-08, non rejoués ;
- les essais A à T avec `@types/node@26.6.4` et sur l'état du dépôt du 2026-10-09 ;
- `SIGTERM` reçu pendant une requête en cours contre un vrai PostgreSQL (K, étape 7, l'a envoyé avec une connexion ouverte mais inactive) ;
- les hooks du socle sur ces fichiers, `ac-couverture.sh` sur les noms de tests, `semgrep` sur le code des blocs ;
- le script du bloc 0 dans le dépôt lui-même, et la fusion de `main` dans `F-008-socle` : ils l'ont été sur des gabarits (essais U et V) ;
- les hooks du dépôt sur le commit du bloc 0 : les gabarits n'ont pas de hooks ;
- les essais A à D et G à L sur le gabarit de l'essai R : ils portent sur les bibliothèques, la base et les conteneurs ;
- l'essai P (signatures figées) sur le gabarit de l'essai R : il l'a été sur la copie de l'arbre principal, avec les mêmes versions de paquets ;
- l'attendu chiffré des blocs 1 à 6 avec le projet `document` présent (la ligne 0 l'a été, essai V) ;
- les réalisations derrière les signatures figées : l'essai P ne vérifie que leurs types ;
- `docker build` et la pile Compose avec le verrou du 2026-10-09 : seule l'installation de production l'a été (essai V) ;
- l'écriture réellement simultanée par trois agents ;
- la fermeture sans réponse d'une connexion qui n'envoie pas une requête HTTP lisible (ADR-0004) ;
- le fichier `enveloppe.ts` séparé, et les trois fichiers de test de `contrats`, des blocs 4 à 6 tels que nommés : le squelette en avait moins.
