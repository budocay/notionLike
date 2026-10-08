# ADR-0006 — Exécution et conteneurisation : TypeScript exécuté par Node 26 sans compilation, une image, Docker Compose

Statut : proposé
Date : 2026-10-08

## Contexte et problème

Le serveur et la commande de migration sont écrits en TypeScript et doivent tourner sur le poste, dans les tests et dans un conteneur. La spec F-008 laisse à la conception le mode d'exécution et la forme du Dockerfile (H10), tant que F-008-AC19 à AC21 tiennent. Ce choix fixe la forme de tous les paquets serveur (imports, syntaxe permise) et celle de l'image : y revenir toucherait chaque fichier.

Statut « proposé » : la spec `specs/F-008.md` est encore en brouillon. Cet ADR passe à « accepté » par un commit d'`agent-architecte-conception` une fois la spec validée par le dev, avant la revue de conception.

D'où vient chaque choix :

- Arrêtés par la spec F-008 : images épinglées par version et par empreinte, ports sur `127.0.0.1`, volume nommé, contrôles de santé, utilisateur non root (F-008-AC20) ; service de migration à exécution unique dont l'échec bloque le serveur (F-008-AC19, AC21) ; mot de passe exigé sans valeur par défaut (F-008-AC13) ; fichier `apps/server/.env` chargé en entier (F-008-AC24, H14) ; preuve par tests statiques et script de fumée (H12).
- Tranchés par cette conception : exécution native, image unique, emplacement des fichiers, variables fixées par le fichier Compose, contenu du script de fumée.

## Options étudiées

Mode d'exécution (H10) :

1. **Exécution native par Node 26** (retenue) : Node retire les annotations de type au chargement. `node apps/server/src/main.ts`, sans étape de compilation, sur le poste comme dans l'image.
2. Compilation préalable (`tsc` vers `dist/`). Écartée : une étape de build et une configuration de plus par paquet, un `exports` différent en développement et en production, et un écart entre le code testé (source) et le code exécuté (compilé). Rien dans F-008 ne la demande.
3. Chargeur tiers (`tsx`). Écarté : une dépendance d'exécution pour ce que Node fait seul.

Image : une image par service, ou **une seule image pour le serveur et la migration** (retenue) : même code, même dépendances, deux commandes.

Installation dans l'image : `pnpm deploy` (copie des paquets dans `node_modules`) ou **installation du workspace tel quel, sans dépendances de développement** (retenue). Node refuse de retirer les types d'un fichier situé sous `node_modules` ; les paquets du workspace doivent donc rester à leur place, reliés par les liens de pnpm, dont Node suit le chemin réel.

## Décision

### Exécution native

- Les trois paquets serveur sont des paquets source : `exports` désigne un fichier `.ts`, les imports relatifs portent l'extension `.ts`, et la syntaxe reste effaçable (`erasableSyntaxOnly` : ni `enum`, ni `namespace`, ni propriété déclarée dans les paramètres d'un constructeur). Même forme que `@notionlike/document` (ADR-0003).
- Points d'entrée : `apps/server/src/main.ts` et `packages/db/src/migrer.ts`, lancés par `node <fichier>`.
- Barrière : un test lance chacun des deux points d'entrée par un vrai processus `node`, sans Vitest entre les deux. Tout fichier de `src/` des trois paquets est chargé par l'un ou l'autre ; un import sans extension ou une syntaxe non effaçable, que Vitest tolérerait, y fait donc échouer `pnpm test`. `pnpm typecheck` le signale aussi, mais aucun contrôle du socle ne le lance.
- Sur le poste, deux scripts chargent le fichier d'environnement par l'option de Node, sans dépendance : `demarrer` (`node --env-file=.env src/main.ts`, dans `apps/server`) et `migrer` (`node --env-file=../../apps/server/.env src/migrer.ts`, dans `packages/db`). Aucun fichier de `src/` ne lit un fichier `.env` : `main.ts` et `migrer.ts` ne connaissent que `process.env`.

### Processus serveur (`apps/server/src/main.ts`)

1. `lireConfiguration(process.env)`. Erreur : le message de l'`ErreurConfiguration` sur la sortie d'erreur, code de sortie 1, rien n'écoute et aucune connexion n'est ouverte (F-008-AC12).
2. `creerJournal()`, `ouvrirBase(configuration.urlBaseDonnees)`, `creerApplication(…)`, `demarrerServeur(…)` avec `DELAI_ARRET_MS` (8 000 ms).
3. Ligne de journal `ecoute`, avec l'hôte et le port réel.
4. À la réception de `SIGTERM` : `arreter()` du serveur, puis `fermer()` de la base, puis code de sortie 0 (F-008-AC7). Le délai de 8 000 ms laisse deux secondes de marge sous les 10 secondes du critère.

Le serveur démarre même si la base est injoignable : `GET /sante` répond 200, `GET /pret` 503. L'ordre de démarrage est l'affaire du fichier Compose.

### Fichiers d'infrastructure

| Fichier                    | Rôle                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- |
| `infra/docker-compose.yml` | trois services : `base`, `migration`, `serveur` ; un volume nommé                 |
| `infra/Dockerfile`         | image unique du serveur et de la migration                                        |
| `.dockerignore` (racine)   | contexte de construction en liste blanche                                         |
| `infra/.env.example`       | `POSTGRES_PASSWORD` factice                                                       |
| `apps/server/.env.example` | variables du serveur, valeurs factices (périmètre d'`agent-backend`)              |
| `infra/fumee.sh`           | script de fumée de F-008-AC19, lancé par le dev                                   |
| `infra/tests/*.test.ts`    | tests statiques du fichier Compose, du Dockerfile et des fichiers d'exemple (H12) |

Le fichier Compose vit dans `infra/` : `docker compose` y lit `infra/.env` pour ses propres variables. Le contexte de construction est la racine du dépôt.

**Image (`infra/Dockerfile`)**, deux étapes sur la même image officielle Node 26, épinglée par version complète et par empreinte :

- étape de dépendances : installe pnpm à la version du champ `packageManager`, copie les manifestes du workspace (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et les trois `package.json` des paquets), puis `pnpm install --frozen-lockfile --prod` ;
- étape d'exécution : `NODE_ENV=production`, copie des `node_modules` de l'étape précédente, des `src/` des trois paquets et de `packages/db/migrations/` ; utilisateur `node` ; contrôle de santé qui interroge `GET /sante` avec le `fetch` de Node ; commande `["node", "apps/server/src/main.ts"]` en forme tableau, pour que Node reçoive `SIGTERM` directement.

**Services (`infra/docker-compose.yml`)** :

- `base` : image `postgres:18.6` épinglée par empreinte, relue au registre le jour du bloc (H1) ; utilisateur et base `notionlike` ; `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?…}` ; port `127.0.0.1:5432:5432` ; volume nommé ; contrôle de santé `pg_isready`.
- `migration` : même image que le serveur, commande `["node", "packages/db/src/migrer.ts"]`, sans redémarrage, démarre quand `base` est saine.
- `serveur` : `env_file` sur `../apps/server/.env`, obligatoire ; port `127.0.0.1:3000:3000` ; démarre quand `base` est saine et que `migration` a réussi (`service_completed_successfully`).

Trois variables sont fixées par le fichier Compose pour le service `serveur`, parce qu'elles décrivent le conteneur et non l'application : `HOTE` (`0.0.0.0`), `PORT` (`3000`) et `URL_BASE_DONNEES` (hôte `base`, mot de passe `${POSTGRES_PASSWORD:?…}`). Elles l'emportent sur le fichier chargé. Toute autre variable vient d'`apps/server/.env` sans être recopiée (F-008-AC24). Le service `migration` reçoit la même `URL_BASE_DONNEES`.

Conséquence pour le mot de passe : il figure dans une URL, donc il ne contient que des caractères qui n'y ont pas besoin d'être encodés. Les fichiers d'exemple le disent et donnent la commande qui en produit un (`openssl rand -hex 24`).

**Contexte de construction (`.dockerignore`)** : première ligne `*`, puis les seules exceptions dont l'image a besoin (manifestes, `src/` des trois paquets, `packages/db/migrations/`). Aucun fichier `.env`, aucun test, aucun `node_modules` du poste n'entre dans le contexte.

**Script de fumée (`infra/fumee.sh`)**, sous un nom de projet Compose distinct pour ne pas toucher au volume de travail du dev. Il constate, dans l'ordre :

1. la pile démarre et `GET /pret` répond 200 ;
2. le service `migration` a fini avec le code 0 et la table `drizzle.__drizzle_migrations` existe ;
3. `select version()` annonce PostgreSQL 18.6 ;
4. base arrêtée : `GET /pret` répond 503 en moins de 3 secondes, `GET /sante` répond 200 ;
5. base redémarrée : `GET /pret` répond de nouveau 200, le conteneur du serveur n'ayant pas redémarré ;
6. pile arrêtée puis relancée sans supprimer le volume : la table de suivi est toujours là ;
7. arrêt du service `serveur` : code de sortie 0 en moins de 10 secondes ;
8. nettoyage du projet de fumée, volume compris.

## Conséquences

- Pas de build : le code exécuté dans l'image est le code testé. Revenir à une compilation resterait local à chaque paquet (`exports`, un script), mais toucherait les trois manifestes et l'image.
- L'image contient pnpm dans son étape de dépendances seulement, et aucune dépendance de développement : ni PGlite, ni Vitest, ni TypeScript.
- Le contrôle `CONTENEURS` du socle (`trivy fs`) n'analyse que les dépendances du verrou et les secrets (constaté à l'essai) : il ne lit ni le Dockerfile, ni le fichier Compose, ni les images. Les exigences de forme de F-008-AC20 sont donc tenues par les tests statiques d'`infra/tests/`, que `pnpm test` lance ; les failles des images de base ne sont vues par aucun contrôle du socle.
- F-008-AC19 n'est prouvé que par le script de fumée, hors des hooks (H12, dette D-002 proposée).
- Avec `NODE_ENV=production` dans l'image, un mot de passe laissé à sa valeur factice empêche le serveur de démarrer sous Compose (F-008-AC14). C'est voulu ; le dev peut poser `NODE_ENV=development` dans `apps/server/.env` pour un essai.
- Non vérifié par la veille, à lire par `agent-devops` au bloc d'infrastructure et à prouver par le script de fumée : l'étiquette exacte et l'empreinte de l'image Node 26, la présence de `npm` et l'absence de `corepack` dans cette image, et le point de montage du volume de données de l'image PostgreSQL 18.
- Les contrôles de santé et la politique de redémarrage du serveur en cas d'arrêt inattendu restent au minimum : pas de `restart` sur le service `serveur`. Le déploiement hors du poste n'est couvert par aucune feature.
