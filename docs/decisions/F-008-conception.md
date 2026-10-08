# F-008 — Conception : approche, plan par blocs, fichiers réservés au dev

Date : 2026-10-08
Spec : `specs/F-008.md` (**brouillon** au moment de l'écriture ; le commit de validation `Agent: dev` reste à faire)
ADR : ADR-0004 (paquets, enveloppe d'erreur, application), ADR-0005 (base, migrations, tests embarqués), ADR-0006 (exécution, conteneurs)

Ce document est le plan de réalisation de F-008. Il ne décrit pas du code existant.

- Cette conception est préparée avant la validation de la spec. Elle n'est pas présentée au gate `agent-architecte` tant que la spec est en brouillon.
- Les trois ADR sont en statut « proposé ». Ils passent à « accepté » par un commit d'`agent-architecte-conception` après la validation de la spec et avant la revue de conception. Si la validation retouche un critère ou une hypothèse, le plan est repris d'abord.
- `ARCHITECTURE.md` n'est pas modifié par ce commit : le dépôt ne contient aucun code serveur, et le fichier n'existe pas sur la branche `F-008` (il naît sur la branche `F-001`). Il est écrit bloc après bloc (« Plan par blocs »).
- Les ADR-0001 à 0003 cités ici vivent sur la branche `F-001`.
- Reprise du 2026-10-08, après la veille des conteneurs (commit `42a92f8`) : l'infrastructure (ADR-0006, bloc 6) est alignée sur ses constats et sur trois essais faits avec Docker (« Essais », J à L). Les blocs 0 à 5 ne changent pas.
- Reprise du 2026-10-08, après la retouche de la spec par `agent-planif` (commit `2d9e14d`, spec toujours en brouillon) : la spec reprend les choix d'infrastructure de l'ADR-0006 et le report de `drizzle-kit` (« Ce que F-008 laisse aux features suivantes » dit ce qui a changé). Les formulations de ce document et des ADR-0005 et 0006 sont alignées sur elle ; aucune décision, aucun bloc, aucun fichier du plan ne change.
- Reprise du 2026-10-08, après la révision 4 du plan de F-001 (branche `F-001`, commit `38a5117`) : son fichier 4, le `vitest.config.ts` racine, ne déclare plus `projects: ["packages/*"]` mais les deux motifs du fichier 10 d'ici, dans le même ordre, sans le projet `infra`. Ce document écrit cet état dans « Composition avec le bloc 0 de F-001 », sous le fichier 10, dans la première séquence du bloc 0 et dans les essais A et F ; il dit ce qui a été essayé ici et ce qui vient de l'essai M de F-001. Aucune décision, aucun bloc, aucun fichier du plan ne change ; aucun essai n'a été rejoué pour cette reprise.

## Approche

Trois paquets, chacun avec une seule raison de changer :

- `packages/contrats` : ce que le client et le serveur se disent. Schémas `zod`, codes d'erreur, chemins. Aucune logique.
- `packages/db` : ce qui parle à PostgreSQL. Accès Drizzle, sonde bornée par le code, commande de migration.
- `apps/server` : ce qui parle HTTP. Une fonction compose l'application à partir d'une configuration validée, d'une `Base` et d'un journal ; un fichier porte le processus.

Trois idées tiennent le reste :

- **L'application reçoit ses dépendances.** La production lui donne une `Base` construite avec `pg` ; les tests, une `Base` construite avec PGlite par un fichier d'aide de `packages/db/test/`. Aucun fichier de `src/` ne connaît PGlite (ADR-0005).
- **Le code tourne tel qu'il est écrit.** Node 26 exécute le TypeScript sans compilation, sur le poste, dans les tests et dans l'image (ADR-0006).
- **Chaque frontière est un contrôle.** Les imports permis à chaque paquet sont une liste blanche de `.dependency-cruiser.cjs` ; ce que les imports ne montrent pas est tenu par ESLint ou par un test (« Barrières et contrôles qui les tiennent »).

## Traçabilité : spec, veille, conception

| Élément                                                                                                                                                                                                                                                           | Origine                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les 24 critères F-008-AC1 à AC24 ; les hypothèses H1 à H9 et H11 à H14                                                                                                                                                                                            | spec, consignées sans être rouvertes (ADR-0004 à 0006)                                                                                                                                                                                                         |
| H6 (état du dossier de migrations réel)                                                                                                                                                                                                                           | laissée à la conception par la spec ; tranchée par l'ADR-0005                                                                                                                                                                                                  |
| H10 (mode d'exécution, forme du Dockerfile)                                                                                                                                                                                                                       | tranchée par l'ADR-0006 ; la spec l'écrit telle quelle depuis le commit `2d9e14d` (exécution native par Node 26, variante Alpine, `npm` retiré, `USER node`), la forme exacte du Dockerfile restant à la conception tant que F-008-AC19 à AC21 tiennent        |
| H15 (risque accepté sur l'image `postgres:18.6`)                                                                                                                                                                                                                  | ADR-0006, « Conséquences » ; reprise par la spec avec le même décompte (84 constats, 2 CRITICAL et 82 HIGH)                                                                                                                                                    |
| Neuf fichiers de squelette (trois paquets : `package.json`, `vitest.config.ts`, `tsconfig.json`), `package.json` racine, `pnpm-lock.yaml`, `.dependency-cruiser.cjs`                                                                                              | prérequis de la spec                                                                                                                                                                                                                                           |
| Versions `express@5.2.1`, `helmet@8.3.0`, `zod@4.6.5`, `drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`, `@types/express@5.0.6`, `yaml@2.9.1`                                                                                  | veille du 2026-10-08, reprises par la spec                                                                                                                                                                                                                     |
| `pino@10.3.1`, `@types/node@26.6.3`                                                                                                                                                                                                                               | règle de la spec (dernière version publiée depuis au moins 7 jours le jour de l'installation ; pour `@types/node`, dans la majeure 26) ; versions lues au registre le 2026-10-08 par cette conception, à relire le jour de l'installation (fichiers du bloc 0) |
| Écarts de PGlite, migrateur Drizzle en une transaction, `statement_timeout` non appliqué                                                                                                                                                                          | veille, repris par la spec (H5, H13)                                                                                                                                                                                                                           |
| Étiquettes et contenu de l'image Node 26 (`corepack` absent, root par défaut), volume de PostgreSQL 18 sur `/var/lib/postgresql`, syntaxes de Compose, version minimale 2.24.0, failles des images                                                                | veille des conteneurs du 2026-10-08, rejouée par cette conception (« Essais », J à L) ; reprise depuis par la spec (H1, H10, H15, F-008-AC20, prérequis du poste)                                                                                              |
| Variante Alpine de l'image Node, `npm` retiré de l'image finale, `USER node` explicite ; `pg_isready` sur l'adresse TCP ; variables facultatives `PORT_PUBLIE_BASE` et `PORT_PUBLIE_SERVEUR` ; lancement par `up -d --wait` et constats 1 à 10 du script de fumée | conception (ADR-0006), après essai ; repris par la spec au commit `2d9e14d` (H10, H11, H12, F-008-AC19, AC20) : ce ne sont plus des ajouts                                                                                                                     |
| `drizzle-kit` n'est pas installé                                                                                                                                                                                                                                  | spec (H9 : il entre avec F-009, qui le porte dans ses prérequis, son hypothèse H19) ; ADR-0005                                                                                                                                                                 |
| **Ajouts de la conception, hors des prérequis de la spec**                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                |
| `vitest.config.ts` à la racine                                                                                                                                                                                                                                    | la spec demande la garantie (« `pnpm exec vitest run` à la racine exécute les tests des trois paquets et d'`infra/tests/` ») sans nommer le fichier                                                                                                            |
| `eslint.config.mjs` : globales de Node interdites dans `packages/contrats/src`                                                                                                                                                                                    | conception (F-008-AC23)                                                                                                                                                                                                                                        |
| `.dependency-cruiser.cjs` : quatre règles en liste blanche au lieu des trois règles de la spec, et option `exclude` corrigée                                                                                                                                      | conception ; les quatre règles couvrent les trois demandées et vont plus loin                                                                                                                                                                                  |
| Script racine `typecheck`                                                                                                                                                                                                                                         | conception (même ligne que le bloc 0 de F-001)                                                                                                                                                                                                                 |
| Scripts `migrer` (`packages/db`) et `demarrer` (`apps/server`), entrée `./essai` du manifeste de `packages/db`                                                                                                                                                    | conception (ADR-0005, ADR-0006)                                                                                                                                                                                                                                |
| Noms `URL_BASE_DONNEES` et `POSTGRES_PASSWORD`, valeur factice `factice-a-remplacer`, limite de 100 000 octets, délai d'arrêt de 8 000 ms                                                                                                                         | conception ; la spec fixe les comportements, pas ces noms ni ces valeurs                                                                                                                                                                                       |
| Faux serveur PostgreSQL de test                                                                                                                                                                                                                                   | conception (ADR-0005)                                                                                                                                                                                                                                          |

Tout ce qui figure sous « Ajouts » n'est validé par personne tant que le dev ne l'a pas commité : c'est le commit `Agent: dev` du bloc 0, qui introduit ces fichiers, qui les entérine. Si le dev en refuse un, le bloc 0 n'est pas commité et la conception est reprise. Il ne reste aucun écart à la liste des prérequis de la spec : elle ne liste plus `drizzle-kit`.

## Fichiers

| Fichier                                                                                                                              | Rôle                                                                     | Producteur      | Naît au bloc |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------- | ------------ |
| les quatorze fichiers de « Fichiers à commiter par le dev »                                                                          | squelettes, configuration des contrôles                                  | dev             | 0            |
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

Le bloc 0 est fait par le dev ; les blocs 1 à 6 sont chacun un commit d'un producteur (`Feature: F-008`), dans cet ordre. Chaque bloc livre son code et ses tests, et laisse `pnpm test`, `pnpm lint`, `pnpm contrats` et `pnpm typecheck` verts. Un bloc ne démarre que si l'attendu chiffré du bloc précédent est constaté (« Attendu chiffré après chaque bloc »).

**Règle d'atteinte, vraie de chaque bloc.** Tout fichier de `src/`, toute fonction, tout export, toute route, tout code d'erreur, toute variable de configuration et toute commande livrés par un bloc sont exercés, dans le commit de ce même bloc, par au moins un test qui passe par un point d'entrée public. Un module peut naître un bloc avant son premier appelant de production : `contrats` (bloc 1) et `db` (blocs 2 et 3) ne sont importés par le serveur qu'au bloc 4, et les fonctions du serveur livrées au bloc 4 ne sont appelées par `main.ts` qu'au bloc 5. Il naît alors avec les tests qui l'exercent par son point d'entrée public, et rien n'y est livré qui ne soit pas exercé. Le bloc 0 ne livre aucun code : ses barrières sont prouvées par « Vérification après le commit du bloc 0 ».

Points d'entrée publics :

- `packages/contrats` : `src/index.ts` ;
- `packages/db` : `src/index.ts`, l'entrée de test `test/essai.ts`, et la commande `src/migrer.ts` lancée par un processus ;
- `apps/server` : la surface HTTP de l'application construite par `creerApplication` et servie par `demarrerServeur` sur un port libre, interrogée par `fetch` ; `lireConfiguration` et `creerJournal`, qui construisent ses arguments ; le processus `src/main.ts`.

Une exception, nommée : `packages/db/test/migration.test.ts` importe `src/migration.ts` pour appeler `lancerMigration` sur la base embarquée, parce que la commande, elle, ne sait ouvrir que le pilote `pg`. La commande est exercée dans le même bloc par `test/commande.test.ts`, par un vrai processus.

| Bloc | Producteur      | Contenu                                                                                                                             | Critères                                                                                                 | `ARCHITECTURE.md`                                                                   |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0    | dev             | Squelettes des trois paquets, configuration racine de Vitest, quatre contrats de dépendances, règle ESLint, scripts, `pnpm install` | prépare AC18 et AC23 : les barrières sont actives avant la première ligne de code                        | oui : trois paquets sans code, contrats en vigueur, règle ESLint, projets Vitest    |
| 1    | `agent-backend` | `packages/contrats` entier : enveloppe d'erreur, cinq codes, réponses et chemins de `/sante` et `/pret`                             | AC22 (schémas, liste, convention), AC23 (part de `contrats`)                                             | oui : module `contrats` et ses neuf exports                                         |
| 2    | `agent-bdd`     | `packages/db`, accès : `ouvrirBase`, sonde bornée, erreurs typées, fermeture ; base embarquée et faux serveur PostgreSQL de test    | AC17, AC18 (part de `db`), AC23 (part de `db`) ; part d'AC3 tenue par le pilote                          | oui : module `db` (accès), entrée `./essai`                                         |
| 3    | `agent-bdd`     | `packages/db`, migrations : `lancerMigration`, commande `migrer.ts`, dossier réel sans migration, jeux d'essai                      | AC15, AC16 ; fin d'AC17 (commande vers un port fermé)                                                    | oui : flux de migration, commande, table de suivi                                   |
| 4    | `agent-backend` | `apps/server`, HTTP : configuration validée, journal, enveloppe, application, écoute et arrêt                                       | AC1 à AC6, AC8 à AC11, AC18 (part du serveur), AC22 (réponses validées) ; AC7, AC12 et AC14 par fonction | oui : modules du serveur et leurs dépendances ; lignes des menaces que le code pare |
| 5    | `agent-backend` | `apps/server`, processus : `main.ts`, `SIGTERM`, refus de démarrer, `apps/server/.env.example`                                      | fin d'AC7, AC12 et AC14 (par le processus) ; AC13 (fichier d'exemple du serveur)                         | oui : processus, commande de lancement                                              |
| 6    | `agent-devops`  | Infrastructure : fichier Compose, Dockerfile, `.dockerignore`, `infra/.env.example`, tests statiques, script de fumée               | AC13, AC19, AC20, AC21, AC24 ; fin d'AC14 (fichiers d'exemple)                                           | oui : infrastructure ; relecture finale de fidélité au diff livré                   |

`ARCHITECTURE.md` est écrit par `agent-architecte-conception`, seul agent qui l'a dans son périmètre. Après chaque bloc, l'orchestrateur l'invoque avant de lancer le bloc suivant : un commit `Agent: agent-architecte-conception`, `Feature: F-008`, qui ne touche que `ARCHITECTURE.md` et décrit ce que le commit du bloc vient de livrer, pas davantage. Si le fichier n'existe pas encore sur la branche à ce moment (F-001 non fusionnée), il est créé avec le titre et les trois titres de section de la version de F-001 (`## Modules réels et dépendances`, `## Flux de synchronisation`, `## Menaces du produit`), le contenu du serveur sous des sous-titres `### Serveur`. Les deux branches créant alors le même fichier, leur fusion donne un conflit d'ajout, à résoudre en gardant les deux contenus.

Après le bloc 6, le dev lance `infra/fumee.sh` une fois Docker démarré : c'est la seule preuve de la part dynamique de F-008-AC19 (H12).

Entre le bloc 0 et le bloc qui crée chaque `src/index.ts`, le champ `exports` des manifestes désigne un fichier qui n'existe pas encore. Rien ne s'y heurte : `apps/server` n'importe les deux paquets qu'au bloc 4.

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

Les quatre `--project` rendent l'attendu indépendant de F-001 et de l'ordre d'application des deux blocs 0 : que son bloc 0 soit en place ou non, que la branche soit fusionnée entre-temps ou non, le projet `document` et ses fichiers `[document]` ne sont ni listés ni comptés ici. Les attendus du tableau valent donc dans les trois ordres de « Composition avec le bloc 0 de F-001 ». Ils ont été essayés sans paquet `document` (« Essais », A) ; avec lui, ils reposent sur le filtre, non rejoué ici. Le plan de F-001 fait de même de son côté avec `--project document`.

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
| AC23    | 0, 1, 2 | `packages/contrats/test/structure.test.ts`, `packages/db/test/structure.test.ts`                    | bloc 0 : les quatre contrats et la règle ESLint, prouvés par la seconde séquence de vérification. Blocs 1 et 2 : manifestes. À chaque bloc : `pnpm contrats` et `pnpm lint`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC24    | 6       | `infra/tests/compose.test.ts`                                                                       | `serveur.env_file` a une seule entrée, de chemin `../apps/server/.env` et sans `required: false` ; les clés de `serveur.environment` sont exactement `HOTE`, `PORT` et `URL_BASE_DONNEES`. L'échec de `docker compose config` sans le fichier est constaté à l'essai (« Essais », H et K)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Règles de dépendances

Sort des cinq contrats en vigueur (texte actuel cité plus bas) : tous conservés, aucun modifié.

| Contrat existant               | Portée dans F-008                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `pas-de-cycle`                 | s'applique aux fichiers des trois paquets dès le bloc 1                                             |
| `domaine-pur`                  | sans objet : aucun des trois paquets n'a de dossier `domain`                                        |
| `paquets-sans-apps`            | s'applique à `packages/db` et `packages/contrats`                                                   |
| `apps-isolees`                 | sans objet tant qu'`apps/web` n'existe pas ; tiendra « le client et le serveur ne s'importent pas » |
| `document-sans-reseau-ni-base` | prend effet : `packages/db` et `packages/contrats` existent                                         |

Quatre contrats ajoutés au bloc 0, tous en liste blanche : ils nomment ce qui est permis, tout le reste échoue sans énumération (autre paquet npm, fichier d'un autre paquet du workspace, fichier de `test/`, import non résolu).

| Contrat                  | Depuis                                   | Seules destinations permises                                                                                                                           | Demandes de la spec couvertes                                                                                                  |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `contrats-zod-seulement` | `packages/contrats/src/`                 | `packages/contrats/src/`, paquet `zod`                                                                                                                 | `contrats` sans `db`, sans `document`, sans Express, sans module intégré de Node ; `zod` seule dépendance d'exécution          |
| `db-liste-blanche`       | `packages/db/src/`                       | `packages/db/src/`, paquets `drizzle-orm` et `pg`, modules intégrés de Node                                                                            | `db` sans `contrats` ni Express ; PGlite hors du code de production                                                            |
| `serveur-liste-blanche`  | `apps/server/src/`                       | `apps/server/src/`, `packages/db/src/index.ts`, `packages/contrats/src/index.ts`, paquets `express`, `helmet`, `pino`, `zod`, modules intégrés de Node | ajout de la conception : entrée publique seule ; ni PGlite, ni `pg`, ni `drizzle-orm`, ni `src/migration.ts` depuis le serveur |
| `db-reserve-au-serveur`  | tout sauf `packages/db` et `apps/server` | n'importe quoi sauf un fichier de `packages/db/`                                                                                                       | `db` réservé au serveur ; `apps/web` ne dépend pas de `db`                                                                     |

Les fichiers de `test/` ne sont pas visés par les trois premières règles : `apps/server/test/` importe `packages/db/test/essai.ts`, ce que `db-reserve-au-serveur` permet.

Option `exclude` modifiée, par la même ligne que le bloc 0 de F-001 : elle ne masque plus `node_modules`, et ne masque `dist` et `coverage` que dans un paquet ou une application du dépôt. Avec le motif actuel, les paquets npm sont retirés du graphe avant l'évaluation des règles : aucune liste blanche ne verrait un import de `pg`, de PGlite ou d'`express`. Vérifié pour les paquets visés ici (« Essais », B) : `zod` se résout en `node_modules/.pnpm/zod@4.6.5/node_modules/zod/index.d.cts`, `express` en `…/node_modules/express/index.js`, `pg` en `…/node_modules/pg/esm/index.mjs`, `drizzle-orm` en `…/node_modules/drizzle-orm/index.d.ts`, PGlite en `…/node_modules/@electric-sql/pglite/dist/index.d.ts` ; le motif ancré n'en masque aucun.

Hors dependency-cruiser : la règle ESLint `no-restricted-globals` sur `packages/contrats/src` (fichier 12 du bloc 0).

## Barrières et contrôles qui les tiennent

| Barrière promise                                                                                                                                | Contrôle du socle qui la tient                                                                                 | Ce qui n'est pas tenu par le socle                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `contrats` importable dans un navigateur (AC23)                                                                                                 | `pnpm contrats` (`contrats-zod-seulement`) ; `pnpm lint` (globales de Node) ; `pnpm test` (manifeste)          | `pnpm typecheck` (`lib` sans DOM ni Node, `types` vide) : seconde barrière, hors du socle             |
| `db` sans `contrats` ni Express, réservé au serveur (AC23)                                                                                      | `pnpm contrats` (`db-liste-blanche`, `db-reserve-au-serveur`)                                                  |                                                                                                       |
| PGlite jamais dans le code de production (H5)                                                                                                   | `pnpm contrats` (`db-liste-blanche`, `serveur-liste-blanche`) ; `pnpm test` (manifeste de `db`)                |                                                                                                       |
| Le serveur n'applique aucune migration (H7)                                                                                                     | `pnpm contrats` (`serveur-liste-blanche` interdit `src/migration.ts`) ; `Base` n'a pas de méthode de migration |                                                                                                       |
| Le code s'exécute sans compilation (H10)                                                                                                        | `pnpm test` : les deux points d'entrée sont lancés par un vrai processus `node`                                | entre le bloc 1 et le bloc 5, `contrats` n'est chargé nativement par aucun test                       |
| Aucun secret dans le journal ni dans les erreurs (AC8, AC11, AC17)                                                                              | `pnpm test`                                                                                                    |                                                                                                       |
| Aucun secret dans git (AC13)                                                                                                                    | `secrets.sh` (gitleaks) à chaque commit et sur la plage ; `pnpm test` (fichiers d'exemple, fichier Compose)    |                                                                                                       |
| Forme du fichier Compose et du Dockerfile (AC20, AC21, AC24)                                                                                    | `pnpm test` (`infra/tests/`)                                                                                   | `CONTENEURS` (`trivy fs`) ne lit ni le Dockerfile ni le fichier Compose ni les images                 |
| Aucune faille HIGH ou CRITICAL connue dans l'image du serveur                                                                                   | aucun                                                                                                          | constat 10 d'`infra/fumee.sh` (`trivy image`), lancé à la main ; dépend de la base de failles du jour |
| Failles connues de l'image `postgres:18.6`                                                                                                      | aucun                                                                                                          | risque accepté (ADR-0006) ; image épinglée, relue à chaque mise à jour                                |
| La pile démarre, résiste à l'arrêt de la base, sert PostgreSQL 18.6 (AC19) ; une migration en échec bloque le serveur sur la pile réelle (AC21) | aucun                                                                                                          | `infra/fumee.sh`, lancé à la main par le dev (H12, dette D-002 proposée)                              |
| Types corrects                                                                                                                                  | aucun                                                                                                          | `pnpm typecheck`, exigé par ce plan à chaque bloc ; aucune barrière ne repose sur lui seul            |

## État actuel des fichiers racine

Le gate ne voit que le diff : les fichiers que le plan modifie ou dont il dépend sont recopiés ici tels qu'ils sont au commit `3f02118` (copie intégrale, faite par lecture le 2026-10-08). `git diff 3f02118 d9e4a1a` est vide sur ces fichiers.

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

`pnpm-workspace.yaml` :

```yaml
packages:
  - apps/*
  - packages/*

# Protection chaîne d'approvisionnement : un paquet publié depuis moins de 7 jours n'est pas installé.
minimumReleaseAge: 10080
```

Il n'existe ni `vitest.config.ts` ni `ARCHITECTURE.md` à la racine. `apps/` et `packages/` ne contiennent chacun qu'un fichier `.gitkeep` (protégé).

Commandes du socle qui lisent ces fichiers (`.agents/outils.env`, fichier protégé, cité sans modification) :

```text
TEST_CMD="pnpm exec vitest run --passWithNoTests"
LINT_CMD="pnpm exec eslint --no-warn-ignored"
CONTRATS_CMD="pnpm exec depcruise --config .dependency-cruiser.cjs apps packages"
CONTENEURS_CMD="trivy fs --exit-code 1 --severity HIGH,CRITICAL ."
SCA_CMD="pnpm audit --audit-level high"
```

Aucune commande du socle ne lance `tsc`. `CONTRATS_CMD` ne parcourt que `apps` et `packages` : `infra/` est hors des contrats de dépendances.

## Fichiers à commiter par le dev (bloc 0)

Fichiers protégés ou partagés, hors du périmètre des agents : quatorze fichiers, textes complets, conformes à Prettier (`printWidth` 100). Un seul commit `Agent: dev`, `Feature: F-008`, après `pnpm install`.

Les textes des fichiers 11, 12 et 13 sont donnés deux fois : le fichier complet tel qu'il doit être si le bloc 0 de F-001 n'est pas encore en place, puis la liste des ajouts, qui vaut dans les deux cas (« Composition avec le bloc 0 de F-001 »).

Deux versions dépendent de la date d'installation, par la règle des 7 jours : `pino` vaut `10.3.1` jusqu'au 2026-10-09 à 18 h 18 UTC puis `10.4.0` ; `@types/node` vaut `26.6.3` jusqu'au 2026-10-08 à 22 h 39 UTC puis `26.6.4` (dates lues au registre npm le 2026-10-08). Les essais ont porté sur `10.3.1` et `26.6.3`.

### 1. `packages/contrats/package.json` (nouveau)

```json
{
  "name": "@notionlike/contrats",
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
    "zod": "4.6.5"
  },
  "devDependencies": {
    "vitest": "^5.0.3"
  }
}
```

### 2. `packages/contrats/vitest.config.ts` (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "contrats",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 3. `packages/contrats/tsconfig.json` (nouveau)

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

`lib` sans `DOM` et `types` vide : ni API de navigateur ni API de Node ne compile dans ce paquet. `resolveJsonModule` sert au test de structure, qui importe le manifeste.

### 4. `packages/db/package.json` (nouveau)

```json
{
  "name": "@notionlike/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./essai": "./test/essai.ts"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "migrer": "node --env-file=../../apps/server/.env src/migrer.ts"
  },
  "dependencies": {
    "drizzle-orm": "0.45.3",
    "pg": "8.23.1"
  },
  "devDependencies": {
    "@electric-sql/pglite": "0.5.8",
    "@types/node": "26.6.3",
    "@types/pg": "8.23.1",
    "vitest": "^5.0.3"
  }
}
```

`drizzle-kit` n'y figure pas : la spec ne le liste pas (H9), F-009 le porte (ADR-0005).

### 5. `packages/db/vitest.config.ts` (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 6. `packages/db/tsconfig.json` (nouveau)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": ["node"],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

### 7. `apps/server/package.json` (nouveau)

```json
{
  "name": "@notionlike/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint --no-warn-ignored .",
    "format": "prettier --write --ignore-unknown .",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "demarrer": "node --env-file=.env src/main.ts"
  },
  "dependencies": {
    "@notionlike/contrats": "workspace:*",
    "@notionlike/db": "workspace:*",
    "express": "5.2.1",
    "helmet": "8.3.0",
    "pino": "10.3.1",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@types/express": "5.0.6",
    "@types/node": "26.6.3",
    "vitest": "^5.0.3"
  }
}
```

### 8. `apps/server/vitest.config.ts` (nouveau)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

### 9. `apps/server/tsconfig.json` (nouveau)

Même texte que le fichier 6 :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": ["node"],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

### 10. `vitest.config.ts` à la racine (nouveau, ou remplacé s'il existe)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
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
  },
});
```

- Les deux motifs désignent les fichiers de configuration, pas les dossiers. Un motif `packages/*` attrape `packages/.gitkeep`, et Vitest refuse alors de démarrer (« Essais », A). C'était la forme du fichier 4 du bloc 0 de F-001 jusqu'à sa révision 3 ; depuis sa révision 4 (commit `38a5117`), ce fichier 4 porte ces deux mêmes motifs, dans le même ordre, sans le projet `infra`. Le fichier 10 est donc le fichier 4 de F-001 plus le projet `infra` : s'il le trouve en place, il le remplace en entier.
- `infra/` n'est pas un paquet du workspace : son projet est décrit ici, sans fichier de configuration à lui. Ses tests trouvent `yaml` et les types de Node à la racine (fichier 13).

### 11. `.dependency-cruiser.cjs` (modifié, fichier protégé)

Fichier complet, bloc 0 de F-001 absent :

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
    exclude: { path: "^(apps|packages)/[^/]+/(dist|coverage)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
```

Les ajouts, dans les deux cas :

- les quatre règles `contrats-zod-seulement`, `db-liste-blanche`, `serveur-liste-blanche` et `db-reserve-au-serveur`, insérées entre `apps-isolees` et `document-sans-reseau-ni-base` (et non à la fin de la liste, où le bloc 0 de F-001 ajoute les siennes) ;
- la ligne `exclude`, remplacée par `exclude: { path: "^(apps|packages)/[^/]+/(dist|coverage)/" },` : c'est la ligne du fichier 5 du bloc 0 de F-001, à l'identique.

Lecture des règles :

- `pathNot` reçoit une liste : une dépendance viole la règle quand son chemin résolu ne correspond à aucune des expressions.
- `dependencyTypesNot: ["core"]` s'ajoute à `pathNot` : la violation demande aussi que la dépendance ne soit pas un module intégré de Node. `contrats-zod-seulement` n'a pas cette ligne : un module intégré y est une violation.
- Un paquet npm est reconnu par son dernier segment `node_modules/<nom>/` : `node_modules/pg/` ne reconnaît ni `pg-pool` ni `pg-protocol`, `node_modules/drizzle-orm/` ne reconnaît pas `drizzle-kit`.
- Un paquet du workspace importé par son nom se résout en son chemin réel : `@notionlike/db` en `packages/db/src/index.ts`, `@notionlike/db/essai` en `packages/db/test/essai.ts` (« Essais », B).

### 12. `eslint.config.mjs` (modifié, fichier protégé)

Fichier complet, bloc 0 de F-001 absent :

```js
// Règles objectives du CRAFT GATE : ce fichier est protégé (Agent: dev uniquement).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const COMPLEXITE_CYCLOMATIQUE_MAX = 10;
const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];

const GLOBALES_INTERDITES_CONTRATS = [
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
);
```

Les ajouts, dans les deux cas :

- la constante `GLOBALES_INTERDITES_CONTRATS`, précédée d'une ligne vide, juste avant `export default tseslint.config(` ;
- le bloc `files: ["packages/contrats/src/**"]`, dernier élément de la liste, après le bloc des `**/*.cjs`.

`pnpm lint` et le contrôle de lint du socle (`LINT_CMD`, lancé par le hook `pre-commit`) lisent ce fichier : la règle s'applique à chaque commit. `checkGlobalObject` étend l'interdiction à `globalThis.process` et aux formes voisines. Limite assumée : une globale de Node absente de la liste échappe à ESLint ; `pnpm typecheck` la refuse (`types` vide). Les règles `no-restricted-globals` de F-001 et de F-008 visent des dossiers différents : elles ne se remplacent pas l'une l'autre.

### 13. `package.json` à la racine (modifié, fichier partagé)

Fichier complet, bloc 0 de F-001 absent :

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
    "contrats": "depcruise --config .dependency-cruiser.cjs apps packages",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "26.6.3",
    "dependency-cruiser": "^18.5.0",
    "eslint": "^10.11.0",
    "prettier": "^3.9.9",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.71.0",
    "vitest": "^5.0.3",
    "yaml": "2.9.1"
  }
}
```

Les ajouts, dans les deux cas :

- le script `typecheck` : la même ligne que le fichier 6 du bloc 0 de F-001 ; si elle y est déjà, rien à faire ;
- `@types/node` et `yaml` dans `devDependencies`, pour les tests statiques d'`infra/tests/` (prérequis de la spec).

`pnpm typecheck` ne couvre pas `infra/tests/`, qui n'est pas un paquet du workspace : ces tests sont lus par ESLint et exécutés par Vitest, pas vérifiés par `tsc`.

### 14. `pnpm-lock.yaml` (modifié, fichier partagé)

Produit par `pnpm install` à la racine après les fichiers 1 à 13. Attendu, constaté sur le gabarit : `express@5.2.1`, `helmet@8.3.0`, `pino@10.3.1`, `drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`, `@types/express@5.0.6`, `@types/node@26.6.3`, `yaml@2.9.1`, et une seule version de `zod` (`zod@4.6.5`, une clé dans `packages` et une dans `snapshots`). `pnpm install` a accepté `pg@8.23.1` le 2026-10-08. Si pnpm refuse une version pour son âge, ne rien forcer et le signaler (spec).

### Sans changement

`pnpm-workspace.yaml` (les motifs `apps/*` et `packages/*` couvrent les trois paquets), `tsconfig.base.json`, `.prettierrc.json`, `.prettierignore`, `.gitignore` (`.env` y est déjà, à toute profondeur), `.agents/outils.env`.

À la charge du dev s'il le souhaite, hors de ce plan : écrire dans `AGENTS.md` (fichier protégé) les commandes de lancement, `docker compose up` depuis `infra/` et `pnpm --filter @notionlike/server demarrer`.

Sur le poste, pour le bloc 6 et le script de fumée : Docker avec Compose 2.24.0 ou plus récent, `curl` et `trivy`, comme l'écrivent les prérequis de la spec (le poste a Compose 5.5.1 ; aucune version plus ancienne n'a été essayée).

## Composition avec le bloc 0 de F-001

Les deux blocs 0 touchent les mêmes fichiers racine. Ils se composent dans les deux ordres.

| Fichier                   | Bloc 0 de F-001                                                                    | Bloc 0 de F-008                                                     | Composition                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.dependency-cruiser.cjs` | deux règles à la fin de `forbidden` ; ligne `exclude`                              | quatre règles avant `document-sans-reseau-ni-base` ; même `exclude` | les ajouts ne se touchent pas ; la ligne `exclude` est la même : fusion automatique (« Essais », F). Onze règles au total                               |
| `eslint.config.mjs`       | constante après `NOMBRES_NON_MAGIQUES` ; bloc avant celui des `.cjs`               | constante avant `export default` ; bloc en fin de liste             | fusion automatique (« Essais », F)                                                                                                                      |
| `package.json` racine     | script `typecheck`                                                                 | même script ; deux dépendances de développement                     | fusion automatique (« Essais », F)                                                                                                                      |
| `vitest.config.ts` racine | fichier 4 : `projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"]` | fichier 10 : les deux mêmes motifs, plus le projet `infra`          | conflit d'ajout, qui subsiste avec cette forme (essai M de F-001) : **garder le fichier 10** en entier. Il couvre `packages/document` par le même motif |
| `pnpm-lock.yaml`          | `yjs`, `fast-check`                                                                | dépendances du serveur                                              | ne pas fusionner à la main : `pnpm install` le régénère à partir des manifestes fusionnés (non essayé)                                                  |

Le fichier 4 de F-001 a changé de forme. Jusqu'à la révision 3 de son plan, il déclarait `projects: ["packages/*"]` : ce motif attrape `packages/.gitkeep` et Vitest refuse de démarrer, défaut trouvé ici par exécution (« Essais », A). La révision 4 (branche `F-001`, commit `38a5117`) l'a remplacé par la forme du tableau. Les deux plans donnent maintenant le même fichier, au projet `infra` près, et les trois ordres mènent au même `vitest.config.ts` racine, le fichier 10 :

- **F-008 d'abord** : appliquer les fichiers 1 à 14 tels qu'écrits. Quand le bloc 0 de F-001 arrive, ses fichiers 5, 6 et 7 s'ajoutent comme écrits dans son plan ; son fichier 4 n'est pas appliqué (son bloc 0 compte alors sept fichiers, comme l'écrit son plan), le fichier 10 d'ici le contient déjà.
- **F-001 d'abord** : pour les fichiers 11, 12 et 13, appliquer les seuls ajouts ; pour le fichier 10, remplacer le fichier existant en entier. Le seul écart entre les deux textes est l'ajout du projet `infra`.
- **Deux branches fusionnées** : trois fichiers fusionnent seuls, `vitest.config.ts` s'arrête sur un conflit d'ajout et demande de garder le fichier 10 en entier, le verrou est régénéré.

Ce qui a été essayé, et par qui : la fusion des trois autres fichiers et le conflit sur `vitest.config.ts` l'ont été ici avec l'ancienne forme du fichier 4 (« Essais », F). Avec la nouvelle forme, le conflit et la consigne viennent de l'essai M du plan de F-001 (M6), qui a fusionné son fichier 4 et le fichier 10 d'ici ; cette fusion n'a pas été rejouée ici.

Dans tous les cas, après composition, `pnpm exec vitest list --filesOnly` doit lister les fichiers `[document]` de F-001 dès son bloc 1 : le projet `document` est ramassé par le motif `packages/*/vitest.config.ts`. Non essayé ici. L'essai M de F-001 (M5) a posé le fichier 10 sur son gabarit, avec un paquet `document` mais sans dossier `infra/` ni paquet de F-008 : les deux fichiers `[document]` y sont listés et comptés. La composition des cinq projets réels n'a été essayée d'aucun côté.

## Vérification après le commit du bloc 0

Deux séquences, lancées après le commit du bloc 0 et avant le bloc 1 ; leurs sorties sont consignées dans la trace de la feature. Les sorties attendues sont celles de l'essai E, joué sans le bloc 0 de F-001 ; ce qui change quand il est déjà en place est écrit sous chaque séquence.

Première séquence, sur le dépôt tel que commité :

```bash
pnpm install --frozen-lockfile
pnpm test        # aucun test encore : passe grâce à --passWithNoTests
pnpm contrats
pnpm lint
pnpm typecheck
```

Attendu : cinq codes de sortie à 0 dans les deux cas ci-dessous. `pnpm test` et `pnpm contrats` ne portent pas de `--project` : ce qu'ils affichent dépend de l'ordre d'application des deux blocs 0.

- **F-008 d'abord** (le bloc 0 de F-001 n'est pas en place ; essai E) : `pnpm test` affiche `No test files found, exiting with code 0`, puis les quatre projets `infra`, `server`, `contrats` et `db` avec leur motif `include` : la configuration racine les connaît tous les quatre. `pnpm contrats` affiche `✔ no dependency violations found (4 modules, 3 dependencies cruised)` : les trois `vitest.config.ts` et la feuille `vitest` qu'ils importent.
- **F-001 d'abord, ou branches déjà fusionnées** (le bloc 0 de F-001 est en place) : `pnpm test` affiche la même première ligne, puis cinq projets, les quatre d'ici et `document` avec son motif `include` (ordre d'affichage non constaté). `pnpm contrats` compte un module et une dépendance de plus (`5 modules, 4 dependencies cruised`) : le `vitest.config.ts` de `packages/document`. Si le bloc 1 de F-001 est en place lui aussi, `pnpm test` ne dit plus `No test files found` : il passe les tests `[document]`, toujours en code 0, et le compte de `pnpm contrats` croît avec ses fichiers. Ce cas n'a pas été essayé ici ; l'essai M de F-001 (M5) a constaté que le fichier 10, sur son gabarit sans paquet de F-008, affiche les projets `infra` et `document`.

Dans les deux cas, une ligne `Startup Error` à la place : le `vitest.config.ts` commité n'est pas le fichier 10, ou la disposition du dépôt a changé ; le bloc 1 ne démarre pas.

Seconde séquence, preuve que les barrières mordent sur l'installation réelle. Elle écrit des fichiers jetables dans `packages/contrats`, `packages/db` et `apps/server`, jamais commités et supprimés au fil des étapes. Ces dossiers relèvent de deux producteurs : le dev la lance lui-même après son commit, ou l'orchestrateur si le hook de périmètre le lui permet.

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
  | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{for(const m of JSON.parse(s).modules)console.log(m.dependencies.length,m.source)})'

# 3. contrats : une globale de Node fait échouer le lint
printf 'export const essai = process.env;\n' > "$C"
pnpm lint; echo "code=$?"
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

rmdir packages/contrats/src packages/contrats/test packages/db/src packages/db/test apps/server/src
git status --short packages apps   # attendu : aucune ligne
```

Attendu, étape par étape :

1. `code=1` et `error contrats-zod-seulement: packages/contrats/src/essai.ts → fs`.
2. `code=0`, puis six lignes : `1 apps/server/vitest.config.ts`, `0 node_modules/.pnpm/vitest@…/node_modules/vitest/config.d.ts`, `1 packages/contrats/src/essai.ts`, `0 node_modules/.pnpm/zod@4.6.5/node_modules/zod/index.d.cts`, `1 packages/contrats/vitest.config.ts`, `1 packages/db/vitest.config.ts`. `zod` est donc dans le graphe (le motif `exclude` ne le masque pas), et chaque ligne `node_modules/…` commence par `0` (rien n'y est suivi).
3. `code=1` et `error  Unexpected use of 'process'. F-008-AC23 : packages/contrats/src reste importable dans un navigateur  no-restricted-globals`.
4. `code=1` et `error db-liste-blanche: packages/db/src/essai.ts → node_modules/.pnpm/@electric-sql+pglite@0.5.8/node_modules/@electric-sql/pglite/dist/index.d.ts`.
5. `code=1` et `error db-liste-blanche: packages/db/src/essai.ts → packages/db/test/essai-aide.ts`.
6. `code=0` et `✔ no dependency violations found (8 modules, 6 dependencies cruised)`.
7. `code=0` et `✔ no dependency violations found (8 modules, 6 dependencies cruised)`.
8. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → packages/db/src/acces.ts`.
9. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → packages/db/test/essai.ts`.
10. `code=1` et `error serveur-liste-blanche: apps/server/src/essai.ts → node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.d.ts`.
11. `code=1` et `error db-reserve-au-serveur: packages/contrats/test/essai.ts → packages/db/src/index.ts`, seule violation.

Chaque étape en échec affiche une seule violation : aucune autre règle ne mord à sa place. Si une étape ne donne pas ce résultat, le bloc 1 ne démarre pas : l'écart est remonté au dev.

## Ce que F-008 laisse aux features suivantes

- F-009 : ajouter `better-auth` et `@better-auth/*` à `serveur-liste-blanche` (fichier protégé), en plus de la règle que sa spec demande déjà ; installer `drizzle-kit` (sa spec le porte désormais dans ses prérequis) ; typer le schéma de `Base["db"]` ; insérer l'authentification entre les étapes 5 et 6 de `creerApplication` ; ne pas journaliser telle quelle une erreur de requête Drizzle (son message porte les paramètres) ; formater les fichiers `meta/*.json` générés.
- F-009 ou F-010 : requêtes de pré-vérification CORS.
- F-002, première application cliente : le motif `apps/*/vitest.config.ts` du fichier 10 ramassera `apps/web` sans retouche.
- Dev et `agent-veille` : relire l'étiquette et l'empreinte de l'image Node quand la 26 passe en LTS (2026-10-28) ; refaire `trivy image` sur les deux images à chaque changement d'empreinte ; l'image `postgres:18.6-alpine`, non analysée, si le risque accepté sur l'image Debian devait être rouvert.
- `agent-planif` : les retouches de la spec F-008 que cette conception demandait sont faites (commit `2d9e14d`, spec toujours en brouillon) ; cette conception n'a pas modifié la spec. Ce qui a changé : F-008-AC19 (lancement par `up -d --wait`, constats 1 à 8 de l'ADR-0006, constats 9 et 10 rattachés à AC21 et AC20) ; F-008-AC20 (variante Alpine par étiquette complète, volume sur `/var/lib/postgresql`, `pg_isready` sur l'adresse TCP, `USER node`, `npm` retiré, portée exacte du contrôle `CONTENEURS`, `trivy image` sur l'image du serveur par le script de fumée) ; H1 (point de montage du volume) ; H5 (ce que les essais J à L prouvent et ne prouvent pas) ; H9 (`drizzle-kit` reporté à F-009 et retiré des prérequis de `packages/db`) ; H10 (tranchée par l'ADR-0006) ; H11 (ports du poste réglables) ; H12 (forme du script de fumée, preuves des constats 9 et 10) ; H15, nouvelle (risque accepté sur `postgres:18.6`, décompte de l'ADR-0006) ; prérequis du poste (« Compose 2.24.0 ou plus récent », `curl`, `trivy`).
- `agent-planif` : la dette D-002 est confirmée par ce plan (« Barrières et contrôles ») ; le plan de F-001 devait remplacer son fichier 4 (`projects: ["packages/*"]`, « Essais », A) : c'est fait par sa révision 4 (branche `F-001`, commit `38a5117`), il n'y a plus rien à demander.

## Essais

Ce qui suit est une déclaration de l'auteur de la conception, pas une preuve que le gate peut rejouer : la seconde séquence ci-dessus en rend l'essentiel reproductible au bloc 0.

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

**E. Séquences du bloc 0** : les deux séquences de « Vérification après le commit du bloc 0 » ont été jouées mot pour mot sur le gabarit nu ; elles ont donné les sorties écrites dans cette section. Deux écarts : le gabarit n'est pas un dépôt git (la dernière ligne a été remplacée par un `ls`, qui ne montrait plus que `node_modules`, `package.json`, `tsconfig.json` et `vitest.config.ts` dans chaque paquet), et ses hooks ne sont pas ceux du dépôt.

**F. Fusion avec le bloc 0 de F-001** : dans un dépôt git jetable, une branche portant les fichiers 4, 5, 6 et 7 du plan de F-001 et une autre les fichiers 10 à 13 d'ici, à partir des fichiers racine actuels. Le fichier 4 était alors dans son ancienne forme, `projects: ["packages/*"]` (révision 3 du plan de F-001). `git merge` :

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

Non essayé :

- le code de F-008 dans l'image et sur la pile : J à L portent sur un squelette, pas sur les blocs 1 à 5, qui n'existent pas ;
- `infra/fumee.sh` lui-même, qui reste à écrire : ses constats 1 à 9 ont été joués à la main et par un script d'essai, dans un autre ordre ; le constat 10 l'a été sur une image construite à part, pas sur celle du projet Compose ; la surcharge du constat 9 était un fichier posé à côté du fichier Compose, pas un fichier temporaire ;
- une image unique nommée et partagée par les deux services : à l'essai, `migration` et `serveur` portaient chacun la même section `build`, ce qui donne deux noms d'image sur les mêmes couches ;
- la variante `slim` construite, et l'image `postgres:18.6-alpine` ;
- une architecture autre que linux/arm64 ;
- une version de Compose plus ancienne que la 5.5.1 : le minimum 2.24.0 vient de la documentation lue par la veille ;
- l'étiquette Docker de Node 26.11, qui n'existe pas encore ;
- un mot de passe changé dans `infra/.env` après l'initialisation du volume (ADR-0006, « Conséquences ») : déduit de la documentation de l'image, pas joué ;
- un vrai PostgreSQL au-delà de K : SQL d'une migration non vide par le pilote `pg`, réserve de connexions sous charge ;
- `drizzle-kit`, non installé ;
- `pino@10.4.0` et `@types/node@26.6.4` ;
- `SIGTERM` reçu pendant une requête en cours contre un vrai PostgreSQL (K, étape 7, l'a envoyé avec une connexion ouverte mais inactive) ;
- la composition avec un paquet `packages/document` réel, et la régénération du verrou après fusion des deux blocs 0 ;
- les hooks du socle sur ces fichiers, `ac-couverture.sh` sur les noms de tests, `semgrep` sur le code des blocs ;
- les séquences du bloc 0 et l'attendu chiffré des blocs sur le dépôt lui-même : ils ne peuvent l'être qu'après le commit du bloc 0 par le dev ;
- la fermeture sans réponse d'une connexion qui n'envoie pas une requête HTTP lisible (ADR-0004) ;
- le fichier `enveloppe.ts` séparé, et les trois fichiers de test de `contrats`, des blocs 4 à 6 tels que nommés : le squelette en avait moins.
