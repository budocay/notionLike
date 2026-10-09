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

Ce qui suit est l'état à la fin de F-008. Il n'est pas livré d'un coup : chaque bloc du plan n'expose que ce qu'il réalise et teste (`docs/decisions/F-008-conception.md`, « Interface livrée à la fin de chaque bloc »). En particulier, `appliquerMigrations` et le `pilote` rendu par `ouvrirBaseEmbarquee` n'arrivent qu'avec le bloc des migrations.

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
- `fermer()` ferme la réserve de connexions.
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

`Pilote` est la couture entre les deux moteurs. Il reste interne au paquet :

```ts
interface Pilote {
  readonly db: Base["db"];
  appliquerMigrations(dossier: string): Promise<void>;
  fermer(): Promise<void>;
}
```

- `ouvrirPilotePg(url)` le construit avec `pg`, `drizzle-orm/node-postgres` et son migrateur.
- `creerBase(pilote)` en tire une `Base` : même `db`, `sonder` bornée, `fermer`. Elle ne dépend d'aucun moteur.
- `ouvrirBase(url)` vaut `creerBase(ouvrirPilotePg(url))`.

Deux règles sur la réserve de connexions `pg` :

- Elle porte un écouteur de l'événement `error`. Sans lui, une connexion inactive coupée par la base (base arrêtée, redémarrée) lève une exception non interceptée et arrête le serveur (constaté à l'essai), ce que F-008-AC3 interdit.
- L'erreur de cet événement n'est jamais journalisée ni transmise : elle porte l'objet client de `pg`, dont le mot de passe en clair (constaté à l'essai). L'écouteur l'ignore ; la sonde suivante dit si la base répond.

### Base embarquée et faux serveur (`@notionlike/db/essai`)

Le manifeste du paquet a une seconde entrée, `"./essai": "./test/essai.ts"`, pour les tests de `packages/db` et d'`apps/server`. Elle désigne un fichier de `test/` : rien de `src/` ne l'importe, et PGlite reste une dépendance de développement.

- `ouvrirBaseEmbarquee()` crée une instance PGlite en mémoire, son accès Drizzle et son migrateur, et rend `{ base, pilote }` construits par `creerBase`. Chaque fichier de test appelle cette fonction pour lui-même : aucune instance partagée, aucun fichier sur disque, aucun port fixe (F-008-AC18).
- `demarrerFauxPostgres(motDePasse)` ouvre sur un port libre de `127.0.0.1` un serveur TCP qui répond au protocole PostgreSQL juste assez pour le pilote `pg` : il accepte la connexion et termine chaque requête sans ligne. Il rend son `url`, `seTaire()` (les requêtes suivantes restent sans réponse), `couper()` (ferme toutes les connexions) et `arreter()`. Il sert à prouver avec le vrai pilote ce que PGlite ne peut pas montrer : la sonde sans réponse, la connexion inactive coupée, et le chemin complet de la commande de migration.
- `portFerme()` rend un port de `127.0.0.1` sur lequel rien n'écoute (F-008-AC17).

### Migrations

- Format : celui de Drizzle. Un dossier contient `meta/_journal.json` et un fichier SQL par migration ; la table de suivi est `drizzle.__drizzle_migrations`.
- Dossier réel : `packages/db/migrations/`, qui naît avec le seul `meta/_journal.json` (`version` « 7 », `dialect` « postgresql », `entries` vide). La première migration réelle arrive avec F-009.
- Jeux d'essai : trois dossiers au même format sous `packages/db/test/migrations-essai/`, propres aux tests (H6).
- Commande : `node packages/db/src/migrer.ts`, que le service à exécution unique du fichier Compose lance (ADR-0006). Le script `migrer` du manifeste la lance sur le poste avec le fichier `apps/server/.env`.
- Codes de sortie : 0 quand toutes les migrations en attente sont appliquées, ou qu'il n'y en a aucune ; 1 dans tous les autres cas (variable `URL_BASE_DONNEES` absente, URL invalide, base injoignable, migration en échec).
- En cas d'échec, la commande écrit sur la sortie d'erreur une phrase fixe, puis le message de chaque erreur de la chaîne des `cause`, cinq au plus, une chaîne par ligne. Elle n'écrit jamais un objet d'erreur.
- Le serveur n'applique aucune migration : `Base` n'a pas de méthode pour le faire, et `serveur-liste-blanche` (ADR-0004) lui interdit `src/migration.ts`.
- Une migration ne contient aucune instruction qui refuse de s'exécuter dans une transaction (H13).

### `drizzle-kit`

Non installé par F-008, comme l'écrit la spec (H9) : ses prérequis ne le listent pas. Il entre avec F-009, qui écrit le premier schéma et génère la première migration : la spec F-009 le porte dans ses propres prérequis (`drizzle-kit@0.31.11` en dépendance de développement de `packages/db`, son hypothèse H19).

## Conséquences

- Le code de production ne dépend pas de PGlite : `pnpm contrats` refuse l'import depuis `packages/db/src` et depuis `apps/server/src`, et une installation sans dépendances de développement ne le contient pas (constaté à l'essai).
- Ce que `pnpm test` prouve avec le vrai pilote `pg`, sans base : l'erreur de connexion sans secret, la sonde bornée quand la requête ne revient jamais, la survie à une connexion inactive coupée, et le câblage de la commande de migration jusqu'au code de sortie 0.
- Ce que `pnpm test` ne prouve pas, et que seul le script de fumée de F-008-AC19 constate sur un PostgreSQL 18.6 réel : l'authentification, le SQL des migrations exécuté par le pilote `pg`, la concurrence et la réserve de connexions sous charge, les rôles. C'est la dette D-002 proposée dans `ROADMAP.md`. Le faux serveur ne remplace pas une base : il ne comprend aucune requête.
- Une sonde hors délai laisse sa requête en vol : la connexion `pg` qu'elle occupe n'est rendue à la réserve que lorsque la requête finit ou que la connexion tombe. Aucune annulation n'est écrite. Si la réserve s'épuise, les sondes suivantes échouent par le délai de connexion (2 000 ms, même constante), donc `GET /pret` répond toujours 503 dans le temps de F-008-AC3.
- Le migrateur ne compare que l'horodatage de la dernière migration appliquée (H13) : la limite reste entière, à reprendre dès que deux branches produisent des migrations en parallèle.
- Les fichiers `meta/*.json` que `drizzle-kit` générera à partir de F-009 devront passer `prettier --check` comme tout fichier commité : à formater après génération, Drizzle les relit quel que soit leur formatage (non essayé).
- Le jour où l'image passe à PostgreSQL 19, la version embarquée par PGlite est à vérifier (veille du 2026-10-08).
