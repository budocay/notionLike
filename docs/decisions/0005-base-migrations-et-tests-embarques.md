# ADR-0005 — Base de données : PostgreSQL 18, accès par `packages/db`, migrations par commande, tests sur une base embarquée

Statut : accepté
Date : 2026-10-08

## Contexte et problème

Le serveur a besoin d'une base, d'un moyen de la faire évoluer et de tests qui tournent dans les hooks de tous les agents, y compris ceux du client. La version de PostgreSQL, le format de la table de suivi des migrations et la façon dont le code de production reçoit sa base se défont mal : des données existeront dès F-009.

Statut « accepté » le 2026-10-08 : la spec `specs/F-008.md` a été validée par le dev et entérine les choix de cet ADR. Elle l'a été d'abord sur la branche d'archive `planification-reunie` (commit `38b5c5f`), puis, au même texte, le 2026-10-09 sur la ligne de `main` (branche `F-008-socle`, commit `651991f`), où cet ADR est reposé sans changement de décision. Il est resté « proposé » tant qu'elle était en brouillon.

D'où vient chaque choix :

- Arrêtés par la spec F-008 : PostgreSQL 18.6 épinglé par étiquette et par empreinte (H1) ; tests sur PGlite, une instance par fichier de test, pilote `pg` en production, écarts de PGlite assumés (H5) ; aucune table métier (H6) ; migrations par une commande dédiée, jamais au démarrage du serveur (H7) ; un seul rôle PostgreSQL (H8) ; toutes les migrations d'un lancement dans une seule transaction (H13) ; délai de sonde de 2 secondes imposé par le code (F-008-AC3, AC17).
- Versions : veille du 2026-10-08 (`drizzle-orm@0.45.3`, `pg@8.23.1`, `@electric-sql/pglite@0.5.8`, `@types/pg@8.23.1`).
- Tranchés par cette conception : l'état du dossier de migrations réel (H6), l'interface de `packages/db`, l'injection de la base, la forme de la commande de migration, le faux serveur PostgreSQL des tests, le report de `drizzle-kit`.
- Venus de la relecture de structure du 2026-10-12, sur le code : la fermeture idempotente qui coupe les requêtes en vol (F-008-AC17, tel qu'accordé au commit `cdab8cc`), le faux serveur unique et ses deux ajouts (`neFermeJamais`, `messagesRecus`), la limite D-011.
- Venus de la deuxième revue du 2026-10-12 : le gabarit des bases embarquées et les délais d'ouverture des tests (commits `e911441`, `0375fa3`), la réversibilité des migrations (« Réversibilité des migrations », demandée par les reviewers ; aucun code).

## Options étudiées

Dossier de migrations réel (H6) :

1. **Dossier sans migration** (retenue) : `packages/db/migrations/meta/_journal.json` avec une liste d'entrées vide. Le migrateur de Drizzle exige ce fichier ; avec zéro entrée, il crée la table de suivi et n'applique rien (constaté à l'essai).
2. Une migration sans objet (`select 1`). Écartée : elle laisserait pour toujours une ligne factice dans la table de suivi de chaque base, et son horodatage pèserait sur l'ordre de toutes les suivantes (H13).

Injection de la base pour les tests :

- a. Une variable d'environnement qui fait choisir PGlite par le code de production. Écartée : PGlite deviendrait une dépendance d'exécution, et un réglage pourrait l'activer en production.
- b. Simuler `pg` dans les tests. Écartée : rien de réel ne serait exercé.
- c. **Le serveur reçoit un objet `Base` ; la production le construit avec `pg`, les tests avec PGlite, par un fichier d'aide qui vit dans `packages/db/test/`** (retenue).

Sonde qui ne répond pas : occuper PGlite par `pg_sleep`, ou **un faux serveur PostgreSQL de test qui se tait** (retenue). PGlite exécute `pg_sleep` en bloquant la boucle d'événements de Node : la minuterie du code ne peut pas se déclencher, et la sonde finit par réussir après le délai (constaté à l'essai). Le faux serveur fait attendre le vrai pilote `pg`, ce qui est le cas décrit par F-008-AC3.

`drizzle-kit` : l'installer dès F-008, comme le premier brouillon de la spec le listait, ou **le reporter à F-009** (retenue ; la spec l'écrit depuis dans son hypothèse H9 et ne le liste plus dans ses prérequis). Aucun schéma n'existe dans F-008, donc rien à générer : la dépendance serait déclarée sans être atteinte.

## Décision

### Interface publique (`packages/db/src/index.ts`)

Quatre noms, dont deux types :

```ts
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

- `ouvrirBase(url)` valide l'URL (protocole `postgres:` ou `postgresql:`), crée la réserve de connexions `pg` et l'accès Drizzle. Elle n'ouvre aucune connexion : la première requête le fait. URL invalide : `ErreurBase` de code `url-de-connexion-invalide`, sans `cause` (l'erreur d'analyse d'une URL porte l'URL).
- `db` est l'accès Drizzle typé. Son type est celui du cœur PostgreSQL de Drizzle, commun aux deux pilotes ; le schéma est vide dans F-008 et sera typé par F-009.
- `sonder()` exécute `select 1` et la met en course avec une minuterie de `DELAI_SONDE_MS` (2 000 ms, constante de `src/sonde.ts`). Réponse à temps : la promesse aboutit. Échec de la requête : `ErreurBase` `base-injoignable`. Échéance atteinte : `ErreurBase` `sonde-hors-delai`, que la requête finisse plus tard ou jamais. Aucun réglage de la base (`statement_timeout`) n'intervient.
- `fermer()` ferme la réserve de connexions. Elle est idempotente : `creerBase` mémorise la promesse du premier appel et la rend à tout appel suivant, sans rappeler le pilote, qu'aucun des deux moteurs n'accepte de fermer deux fois. Elle coupe les requêtes encore en vol au lieu de les attendre : `ouvrirPilotePg` tient la liste des connexions empruntées (événements `acquire` et `release` de la réserve) et, à la fermeture, demande la fin de la réserve puis ferme chaque connexion empruntée, ce qui fait échouer sa requête et la rend. Contrat pour l'appelant : il a fini son travail avant d'appeler `fermer()` ; une requête lancée par lui et encore en vol échoue. Le serveur ne l'appelle qu'après l'arrêt de son écoute, ou quand l'écoute n'a jamais eu lieu (ADR-0004).
- `CodeErreurBase` a un lecteur hors du paquet : le journal du serveur, qui type par lui le code de sa ligne `base-indisponible`.
- Le message d'une `ErreurBase` est une phrase fixe par code : il ne contient ni l'URL, ni le mot de passe, ni le message du pilote.
- Les trois codes suivent la convention des codes d'erreur du dépôt (ADR-0004).

### Organisation interne

Six fichiers dans `src/`, à plat :

| Fichier            | Rôle                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/erreurs.ts`   | `ErreurBase`, `CodeErreurBase`                                                                                                                      |
| `src/sonde.ts`     | `DELAI_SONDE_MS` et la course entre une requête et une minuterie                                                                                    |
| `src/acces.ts`     | `Pilote` (interne), `creerBase(pilote)`, `ouvrirPilotePg(url)`, `ouvrirBase(url)`                                                                   |
| `src/migration.ts` | `lancerMigration(pilote, dossier, ecrire)` : applique les migrations en attente et rend le code de sortie ; `DOSSIER_MIGRATIONS`                    |
| `src/migrer.ts`    | point d'entrée de la commande de migration : lit `URL_BASE_DONNEES`, ouvre le pilote `pg`, appelle `lancerMigration`, ferme, fixe le code de sortie |
| `src/index.ts`     | réexporte `ouvrirBase`, `ErreurBase` et les types `Base` et `CodeErreurBase`, rien d'autre                                                          |

`migration.ts` est un calcul sur un `Pilote` reçu, qui écrit par la fonction qu'on lui passe ; `migrer.ts` est le seul fichier du paquet qui lit `process.env`, écrit sur la sortie d'erreur et fixe le code de sortie.

`Pilote` est la couture entre les deux moteurs. Il reste interne au paquet :

```ts
interface Pilote {
  readonly db: Base["db"];
  appliquerMigrations(dossier: string): Promise<void>;
  fermer(): Promise<void>;
}
```

- `ouvrirPilotePg(url)` le construit avec `pg`, `drizzle-orm/node-postgres` et son migrateur.
- `creerBase(pilote)` en tire une `Base` : même `db`, `sonder` bornée, `fermer` mémorisée. Elle ne dépend d'aucun moteur.
- `ouvrirBase(url)` vaut `creerBase(ouvrirPilotePg(url))`.

Trois règles sur la réserve de connexions `pg` :

- Elle porte un écouteur de l'événement `error`. Sans lui, une connexion inactive coupée par la base (base arrêtée, redémarrée) lève une exception non interceptée et arrête le serveur (constaté à l'essai), ce que F-008-AC3 interdit.
- L'erreur de cet événement n'est jamais journalisée ni transmise : elle porte l'objet client de `pg`, dont le mot de passe en clair (constaté à l'essai). L'écouteur l'ignore ; la sonde suivante dit si la base répond.
- Son délai de connexion est `DELAI_SONDE_MS`, la constante de la sonde ; sa taille n'est pas réglée : c'est celle du pilote, 10 connexions.

### Base embarquée et faux serveur (`@notionlike/db/essai`)

Le manifeste du paquet a une seconde entrée, `"./essai": "./test/essai.ts"`, pour les tests de `packages/db` et d'`apps/server`. Elle désigne un fichier de `test/` : rien de `src/` ne l'importe, et PGlite reste une dépendance de développement.

Trois fonctions et deux types, rien d'autre (`test/essai.ts`, tenu par `test/structure.test.ts`) :

- `ouvrirBaseEmbarquee()` crée une instance PGlite en mémoire, son accès Drizzle et son migrateur, et rend `{ base, pilote }` construits par `creerBase`. Une instance par appel : aucune instance partagée, aucun fichier sur disque, aucun port fixe (F-008-AC18). Depuis le commit `e911441`, les instances d'un même module partent d'un gabarit : le répertoire de données de la première instance est copié en mémoire (`dumpDataDir("none")`) avant qu'elle ne serve, et chaque instance suivante démarre d'une copie de cette archive (`loadDataDir`) au lieu de refaire un `initdb`. Chacune garde son propre répertoire ; ce qu'une base reçoit après son ouverture n'atteint pas une base ouverte ensuite (test F-008-AC18 d'`acces.test.ts`). Une copie en échec remet le gabarit à vide. Le gabarit vit dans le module, donc dans un fichier de test : Vitest isole les modules de chaque fichier. Le `pilote` ne sert qu'aux tests de migration de `packages/db` : aucun fichier hors du paquet ne le lit (test de couture de `test/migration.test.ts`).
- `demarrerFauxPostgres(motDePasse, { neFermeJamais })` ouvre sur un port libre de `127.0.0.1` un serveur TCP qui répond au protocole PostgreSQL juste assez pour le pilote `pg` : il accepte toute connexion sans vérifier le mot de passe et termine chaque requête simple sans ligne. Il rend :
  - `url`, que `ouvrirBase` accepte telle quelle ;
  - `seTaire()` : les requêtes suivantes restent sans réponse ;
  - `couper()` : ferme toutes les connexions sans arrêter l'écoute ;
  - `arreter()` ;
  - `messagesRecus` : les types des messages reçus après le démarrage, toutes connexions confondues, dans l'ordre d'arrivée (`Q` pour une requête simple, `X` pour l'adieu du pilote). C'est par lui qu'un test constate qu'une réserve a bien fermé ses connexions.
- L'option `neFermeJamais` (fausse par défaut) fait garder au faux serveur son côté de chaque connexion après l'adieu du pilote, comme une base figée : le pilote `pg` y attend sans fin la fermeture. Elle sert à prouver que la sortie du serveur ne dépend pas de la base (F-008-AC7, ADR-0006).
- `portFerme()` rend un port de `127.0.0.1` sur lequel rien n'écoute (F-008-AC17).

Il n'y a qu'un faux serveur PostgreSQL dans le dépôt, celui-ci : les tests de `packages/db` et ceux d'`apps/server` démarrent le même, par la même entrée. Un test de couture (`test/faux-postgres.test.ts`) énumère les fichiers qui en démarrent un et ceux qui lui passent des options : un appelant de plus se déclare. Il sert à prouver avec le vrai pilote ce que PGlite ne peut pas montrer : la sonde sans réponse, la connexion inactive coupée, la fermeture pendant une requête en vol, la base figée, et le chemin complet de la commande de migration.

### Migrations

- Format : celui de Drizzle. Un dossier contient `meta/_journal.json` et un fichier SQL par migration ; la table de suivi est `drizzle.__drizzle_migrations`.
- Dossier réel : `packages/db/migrations/`, qui naît avec le seul `meta/_journal.json` (`version` « 7 », `dialect` « postgresql », `entries` vide). La première migration réelle arrive avec F-009.
- Jeux d'essai : trois dossiers au même format sous `packages/db/test/migrations-essai/`, propres aux tests (H6).
- Commande : `node packages/db/src/migrer.ts`, que le service à exécution unique du fichier Compose lance (ADR-0006). Le script `migrer` du manifeste la lance sur le poste avec le fichier `apps/server/.env`.
- Codes de sortie : 0 quand toutes les migrations en attente sont appliquées, ou qu'il n'y en a aucune ; 1 dans tous les autres cas (variable `URL_BASE_DONNEES` absente, URL invalide, base injoignable, migration en échec).
- En cas d'échec, la commande écrit sur la sortie d'erreur une phrase fixe, puis le message de chaque erreur de la chaîne des `cause`, cinq au plus, une chaîne par ligne. Elle n'écrit jamais un objet d'erreur.
- Le serveur n'applique aucune migration : `Base` n'a pas de méthode pour le faire, et `serveur-liste-blanche` (ADR-0004) lui interdit `src/migration.ts`.
- Une migration ne contient aucune instruction qui refuse de s'exécuter dans une transaction (H13).

### Réversibilité des migrations

Le migrateur d'exécution de Drizzle (`drizzle-orm@0.45.3`) ne fait que monter : il n'existe pas de migration descendante, et F-008 n'en livre pas. Le migrateur ne lit, pour chaque entrée du journal, que son fichier SQL, et applique dans une transaction celles dont l'horodatage dépasse celui de la dernière migration consignée (`pg-core/dialect.js`, méthode `migrate`, relue dans `node_modules` le 2026-10-12).

La réversibilité d'un lancement repose sur sa transaction unique (H13) : toutes les migrations en attente s'appliquent dans une seule transaction, un échec annule le lancement entier et laisse la base dans l'état du lancement précédent (testé par F-008-AC16, `packages/db/test/migration.test.ts`).

Revenir sur une migration déjà appliquée se fait en avant, par une migration qui la compense, jamais en réécrivant ou en supprimant une migration consignée. Une donnée détruite par une migration réussie ne revient que par la restauration d'une sauvegarde prise avant elle (`infra/RETOUR-ARRIERE.md`, sections 1 et 4, ADR-0006).

Toute migration destructive future (suppression ou renommage de table ou de colonne, changement de type avec perte, suppression de données) exigera que sa spec décrive, avant validation, la sauvegarde préalable (quoi, comment, où, comment restaurer) et un test de la migration compensatoire sur la base embarquée.

### `drizzle-kit`

Non installé par F-008, comme l'écrit la spec (H9) : ses prérequis ne le listent pas. Il entre avec F-009, qui écrit le premier schéma et génère la première migration : la spec F-009 le porte dans ses propres prérequis (`drizzle-kit@0.31.11` en dépendance de développement de `packages/db`, son hypothèse H19).

## Conséquences

- Le code de production ne dépend pas de PGlite : `pnpm contrats` refuse l'import depuis `packages/db/src` et depuis `apps/server/src`, et une installation sans dépendances de développement ne le contient pas (constaté à l'essai).
- Ce que `pnpm test` prouve avec le vrai pilote `pg`, sans base : l'erreur de connexion sans secret, la sonde bornée quand la requête ne revient jamais, la survie à une connexion inactive coupée, la fermeture qui aboutit pendant une requête en vol puis une seconde fois, le rejet de cette requête une fois la base fermée (« Connection terminated », commit `ba94c90`), et le câblage de la commande de migration jusqu'au code de sortie 0.
- Ouvrir une base embarquée prend du temps : la première ouverture d'un fichier compile le WebAssembly de PGlite et fait un `initdb`, au-delà des délais par défaut de Vitest (5 000 ms pour un test, 10 000 ms pour un crochet) quand toute la suite tourne en parallèle. Les tests ouvrent donc leurs bases dans des crochets, ou dans un test, au délai explicite de 30 000 ms (`DELAI_D_OUVERTURE_D_UNE_BASE_MS`, `ARCHITECTURE.md`, « Configuration racine »). Le gabarit réduit les ouvertures suivantes d'un fichier, pas la première.
- Ce que `pnpm test` ne prouve pas, et que seul le script de fumée de F-008-AC19 constate sur un PostgreSQL 18.6 réel : l'authentification, le SQL des migrations exécuté par le pilote `pg`, la concurrence et la réserve de connexions sous charge, les rôles. C'est la dette D-002. Le faux serveur ne remplace pas une base : il ne comprend aucune requête.
- Limite connue, dette D-011 : une sonde hors délai laisse sa requête en vol, sans l'annuler, et garde sa connexion empruntée jusqu'à la réponse de la base ou la mort de la socket. Devant une base figée, chaque `GET /pret` en retient une de plus, jusqu'aux 10 de la réserve ; les sondes suivantes échouent alors par le délai de connexion (2 000 ms, même constante), donc `GET /pret` répond toujours 503 dans le temps de F-008-AC3, et `fermer()` coupe ces connexions. Aucune autre requête n'emprunte la réserve dans F-008. L'effet d'une sonde hors délai une fois la base revenue n'est pas vérifié par un test. À reprendre avec F-009, avant que des routes métier partagent la réserve : la sonde sur un client dédié, hors de la réserve.
- Le migrateur ne compare que l'horodatage de la dernière migration appliquée (H13) : la limite reste entière, à reprendre dès que deux branches produisent des migrations en parallèle.
- Les fichiers `meta/*.json` que `drizzle-kit` générera à partir de F-009 devront passer `prettier --check` comme tout fichier commité : à formater après génération, Drizzle les relit quel que soit leur formatage (non essayé).
- Le jour où l'image passe à PostgreSQL 19, la version embarquée par PGlite est à vérifier (veille du 2026-10-08).
