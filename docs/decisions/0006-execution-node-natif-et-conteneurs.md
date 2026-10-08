# ADR-0006 — Exécution et conteneurisation : TypeScript exécuté par Node 26 sans compilation, une image, Docker Compose

Statut : proposé
Date : 2026-10-08

## Contexte et problème

Le serveur et la commande de migration sont écrits en TypeScript et doivent tourner sur le poste, dans les tests et dans un conteneur. La spec F-008 laisse à la conception le mode d'exécution et la forme du Dockerfile (H10), tant que F-008-AC19 à AC21 tiennent. Ce choix fixe la forme de tous les paquets serveur (imports, syntaxe permise) et celle de l'image : y revenir toucherait chaque fichier.

Statut « proposé » : la spec `specs/F-008.md` est encore en brouillon. Cet ADR passe à « accepté » par un commit d'`agent-architecte-conception` une fois la spec validée par le dev, avant la revue de conception.

D'où vient chaque choix :

- Arrêtés par la spec F-008 : images épinglées par version et par empreinte, ports sur `127.0.0.1`, volume nommé, contrôles de santé, utilisateur non root (F-008-AC20) ; service de migration à exécution unique dont l'échec bloque le serveur (F-008-AC19, AC21) ; mot de passe exigé sans valeur par défaut (F-008-AC13) ; fichier `apps/server/.env` chargé en entier (F-008-AC24, H14) ; preuve par tests statiques et script de fumée (H12).
- Tranchés par cette conception : exécution native, image unique, variante de l'image de base, emplacement des fichiers, variables fixées par le fichier Compose, contenu du script de fumée.
- Constatés par la veille des conteneurs du 2026-10-08 (`MEMORY/VEILLE.md`, sections « Image Docker officielle de Node 26 », « Image Docker postgres:18.6 », « Docker Compose v2 ») puis rejoués par cette conception sur une pile jetable (`F-008-conception.md`, « Essais », J à L) : étiquettes et contenu de l'image Node, point de montage du volume de PostgreSQL 18, syntaxes de Compose, failles connues des deux images.

## Options étudiées

Mode d'exécution (H10) :

1. **Exécution native par Node 26** (retenue) : Node retire les annotations de type au chargement. `node apps/server/src/main.ts`, sans étape de compilation, sur le poste comme dans l'image.
2. Compilation préalable (`tsc` vers `dist/`). Écartée : une étape de build et une configuration de plus par paquet, un `exports` différent en développement et en production, et un écart entre le code testé (source) et le code exécuté (compilé). Rien dans F-008 ne la demande.
3. Chargeur tiers (`tsx`). Écarté : une dépendance d'exécution pour ce que Node fait seul.

Image : une image par service, ou **une seule image pour le serveur et la migration** (retenue) : même code, même dépendances, deux commandes.

Variante de l'image de base Node 26, départagée par `trivy image --severity HIGH,CRITICAL --scanners vuln` (trivy 0.75.0, base de failles du 2026-10-08) :

1. `node:26.10.0-slim` (Debian 13) : 47 constats HIGH, dont 43 dans des paquets Debian sans version corrigée et 4 dans le `npm` embarqué (veille). Écartée : aucun de ces 43 constats ne peut être levé par le Dockerfile.
2. **`node:26.10.0-alpine3.24`, `npm` retiré de l'étape d'exécution** (retenue) : 4 constats HIGH dans l'image de base, tous dans le `npm` embarqué, aucun dans un paquet Alpine (veille, rejoué). Une fois `npm` retiré, l'image construite à l'essai n'a plus aucun constat HIGH ni CRITICAL, et elle exécute `main.ts` et `migrer.ts` (« Essais », J). Aucune dépendance d'exécution de F-008 n'a de module natif : la bibliothèque C d'Alpine (musl) ne change rien pour elles.

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

**Image (`infra/Dockerfile`)**, deux étapes sur la même image officielle Node 26, variante Alpine, épinglée par étiquette complète et par empreinte : `node:26.<mineure>.<correctif>-alpine3.<version>@sha256:<empreinte>`, la même référence aux deux lignes `FROM`.

- Mineure épinglée : celle qui se tire au registre le jour où le bloc d'infrastructure est écrit, avec l'empreinte relue ce jour-là. Le 2026-10-08, c'est `node:26.10.0-alpine3.24` (`sha256:0b36e8c1…`, veille) : Node 26.11 est publié mais n'a pas encore d'étiquette Docker. L'image peut donc avoir une mineure de retard sur le Node du poste.
- Étape de dépendances : `npm install -g pnpm@<version du champ packageManager>` (`corepack` est absent de l'image), copie des manifestes du workspace (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et les trois `package.json` des paquets), puis `pnpm install --frozen-lockfile --prod`.
- Étape d'exécution : retrait de `npm` (`rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx`) ; `NODE_ENV=production` ; copie des `node_modules` de l'étape précédente (celui de la racine et celui de chacun des trois paquets), des `src/` des trois paquets et de `packages/db/migrations/` ; `USER node` explicite, l'image tournant en root par défaut ; contrôle de santé qui interroge `GET /sante` avec le `fetch` de Node ; commande `["node", "apps/server/src/main.ts"]` en forme tableau, pour que Node reçoive `SIGTERM` directement.
- Ni pnpm ni `npm` ne sont dans l'image finale : rien ne s'y installe après la construction.

**Services (`infra/docker-compose.yml`)** :

- `base` : image `postgres:18.6` épinglée par empreinte, relue au registre le jour du bloc (H1) ; utilisateur et base `notionlike` ; `POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?…}"` ; port `127.0.0.1:${PORT_PUBLIE_BASE:-5432}:5432` ; volume nommé monté sur `/var/lib/postgresql` ; contrôle de santé `pg_isready -h 127.0.0.1 -U notionlike -d notionlike`.
- `migration` : même construction que le serveur (même Dockerfile, même contexte, donc mêmes couches), commande `["node", "packages/db/src/migrer.ts"]`, sans redémarrage, démarre quand `base` est saine.
- `serveur` : `env_file` en forme longue (`path: ../apps/server/.env`, `required: true`) ; port `127.0.0.1:${PORT_PUBLIE_SERVEUR:-3000}:3000` ; démarre quand `base` est saine et que `migration` a réussi (`service_completed_successfully`).

Quatre points que l'essai a fixés :

- **Volume.** À partir de la majeure 18, l'image range ses données dans `/var/lib/postgresql/18/docker` (`PGDATA`) et déclare son volume sur `/var/lib/postgresql`. Le volume nommé se monte donc sur `/var/lib/postgresql`, et `PGDATA` n'est pas redéfini. Monté sur `/var/lib/postgresql/data`, comme avec les majeures précédentes, le conteneur refuse de démarrer (code 1, « Essais », L).
- **Contrôle de santé de la base.** `pg_isready` interroge le port TCP (`-h 127.0.0.1`), pas la socket Unix : pendant l'initialisation d'un volume vide, l'image lance un serveur provisoire qui n'écoute que sur la socket, et `pg_isready` sans `-h` y répond « accepting connections » alors que la base n'est pas joignable par le réseau (« Essais », L). Sans `-h`, la migration pourrait partir trop tôt au premier démarrage.
- **Message de variable manquante.** Toute valeur qui contient `${POSTGRES_PASSWORD:?<message>}` est quotée en entier : un message non quoté qui contient « : » fait échouer le chargement du fichier (`mapping values are not allowed in this context`).
- **Ports publiés.** L'adresse `127.0.0.1` est écrite en dur ; seul le port du poste est réglable, par `PORT_PUBLIE_BASE` et `PORT_PUBLIE_SERVEUR`, facultatives. Sans elles, les ports sont 5432 et 3000. Elles servent au script de fumée, qui doit pouvoir tourner à côté de la pile de travail, et au dev dont le port 5432 est déjà pris par une autre base (c'était le cas du poste le jour de l'essai).

Version minimale de Docker Compose : 2.24.0, pour la forme longue d'`env_file` avec `required` (veille). Le fichier Compose n'a pas de champ pour le dire : un commentaire en tête du fichier et `infra/.env.example` le portent.

Trois variables sont fixées par le fichier Compose pour le service `serveur`, parce qu'elles décrivent le conteneur et non l'application : `HOTE` (`0.0.0.0`), `PORT` (`3000`) et `URL_BASE_DONNEES` (hôte `base`, mot de passe `${POSTGRES_PASSWORD:?…}`). Elles l'emportent sur le fichier chargé. Toute autre variable vient d'`apps/server/.env` sans être recopiée (F-008-AC24). Le service `migration` reçoit la même `URL_BASE_DONNEES`.

Conséquence pour le mot de passe : il figure dans une URL, donc il ne contient que des caractères qui n'y ont pas besoin d'être encodés. Les fichiers d'exemple le disent et donnent la commande qui en produit un (`openssl rand -hex 24`).

**Contexte de construction (`.dockerignore`)** : première ligne `*`, puis les seules exceptions dont l'image a besoin (manifestes, `src/` des trois paquets, `packages/db/migrations/`). Aucun fichier `.env`, aucun test, aucun `node_modules` du poste n'entre dans le contexte.

**Script de fumée (`infra/fumee.sh`)**, sous un nom de projet Compose distinct et sur d'autres ports du poste (`PORT_PUBLIE_BASE`, `PORT_PUBLIE_SERVEUR`), pour ne toucher ni au volume ni aux ports de la pile de travail du dev. La pile est lancée par `docker compose up -d --wait`, jamais par `up --abort-on-container-exit` : cette option arrête toute la pile dès que le service `migration` finit, même en code 0. Le script constate, dans l'ordre :

1. `up -d --wait` finit en code 0 et `GET /pret` répond 200 ;
2. le service `migration` a fini avec le code 0 et la table `drizzle.__drizzle_migrations` existe ;
3. `select version()` annonce PostgreSQL 18.6 et `show data_directory` répond `/var/lib/postgresql/18/docker` ;
4. base arrêtée (`stop base`) : `GET /pret` répond 503 en moins de 3 secondes, `GET /sante` répond 200 ;
5. base redémarrée : `GET /pret` répond de nouveau 200, le conteneur du serveur n'ayant pas redémarré (même date de démarrage, compteur de redémarrages à 0) ;
6. base figée (`pause base`), donc connectée mais muette : `GET /pret` répond 503 entre 1,9 et 3 secondes ; base relâchée : 200 ;
7. pile arrêtée puis relancée sans supprimer le volume : la table de suivi est toujours là ;
8. arrêt du service `serveur` : code de sortie 0 en moins de 10 secondes ;
9. volume supprimé, puis pile relancée avec une surcharge temporaire, écrite par le script, qui donne un mauvais mot de passe au seul service `migration` : `up -d --wait` finit en code différent de 0, `migration` est sorti en code 1 et `serveur` est resté à l'état `created` (F-008-AC21) ;
10. `trivy image --exit-code 1 --severity HIGH,CRITICAL --scanners vuln` sur l'image construite du serveur finit en code 0 ;
11. nettoyage du projet de fumée, volume et images construites compris.

Les constats 1 à 9 ont été joués le 2026-10-08 sur un squelette (« Essais », K) ; le script lui-même reste à écrire au bloc d'infrastructure.

## Conséquences

- Pas de build : le code exécuté dans l'image est le code testé. Revenir à une compilation resterait local à chaque paquet (`exports`, un script), mais toucherait les trois manifestes et l'image.
- L'image contient pnpm dans son étape de dépendances seulement, et aucune dépendance de développement : ni PGlite, ni Vitest, ni TypeScript. L'image finale n'a ni `npm`, ni `npx`, ni pnpm.
- Variante Alpine : la bibliothèque C est musl. Une dépendance d'exécution à module natif, le jour où il en entre une, doit être essayée dans l'image avant d'être retenue ; à défaut, retour à la variante `slim`, avec ses constats sans correctif. Un diagnostic dans le conteneur se fait sans `bash` (l'image n'a que `sh`).
- Mineure de Node épinglée : l'image ne reçoit aucun correctif tant que le Dockerfile n'est pas retouché. Node 26 passe en LTS le 2026-10-28 (veille) : l'étiquette et l'empreinte sont à relire à cette date, puis à chaque mise à jour. Les tests du poste tournent sur le Node du dev (26.11.0 le jour de l'essai), l'image sur la mineure épinglée (26.10.0) : seul le script de fumée exerce le code sur le Node de l'image.
- **Ce que le contrôle `CONTENEURS` couvre.** Sa commande est `trivy fs --exit-code 1 --severity HIGH,CRITICAL .` (`.agents/outils.env`). Elle lit le dépôt : les dépendances de `pnpm-lock.yaml` et les secrets des fichiers suivis. Constaté à l'essai : devant un Dockerfile volontairement fautif (image non épinglée, utilisateur root), elle n'analyse que le verrou et finit en code 0. Elle ne lit ni le Dockerfile, ni le fichier Compose, ni aucune image.
- **F-008-AC20, dernière phrase** (« le contrôle `CONTENEURS` (trivy) DOIT finir sans constat HIGH ni CRITICAL »). Le critère est tenu à la lettre dès que le verrou n'a aucune faille HIGH ou CRITICAL connue et que le dépôt n'a aucun secret. Il ne prouve rien sur les images : ni sur l'image de base Node, ni sur l'image construite, ni sur `postgres:18.6`. Les exigences de forme d'AC20 sont tenues par les tests statiques d'`infra/tests/`, que `pnpm test` lance. L'absence de constat dans l'image du serveur n'est vue que par le constat 10 du script de fumée, lancé à la main (dette D-002 proposée). Une reformulation du critère est demandée à `agent-planif`.
- **Risque accepté : failles connues de l'image `postgres:18.6`.** `trivy image --severity HIGH,CRITICAL --scanners vuln` y trouve 84 constats (rejoué le 2026-10-08, trivy 0.75.0) : 62 dans des paquets Debian 13 (61 HIGH et 1 CRITICAL, CVE-2026-6653 dans `libxml2` ; aussi `gnupg`, `perl`, `util-linux`, `ncurses`), tous sans version corrigée, et 22 dans le binaire `gosu` (21 HIGH et 1 CRITICAL, CVE-2025-68121, dans la bibliothèque standard de Go avec laquelle il est compilé ; corrigées dans des versions de Go plus récentes, mais le binaire est celui de l'image). Soit 2 CRITICAL et 82 HIGH ; la veille résume « 1 CRITICAL et 83 HIGH » pour les mêmes 84 constats, en comptant à part celui de `gosu`. PostgreSQL lui-même n'y figure pas, et la page des avis de la majeure 18 n'en a aucun d'ouvert pour la 18.6 (veille). C'est l'image officielle : elle n'est ni reconstruite ni modifiée, et aucune variante sans ces paquets n'a été évaluée (`18.6-alpine` existe, non analysée). Parades en place : port publié sur `127.0.0.1` seulement (test statique) ; base jointe par le seul réseau du projet Compose, par les services `migration` et `serveur` ; aucun service de F-008 ne lui passe de XML, de clé GnuPG ni de script Perl ; image épinglée par étiquette et par empreinte, donc toute mise à jour est un diff relu, avec un `trivy image` à refaire ce jour-là. Ce qui n'est pas paré : un attaquant qui exécute déjà du code dans le conteneur de la base. Le risque est accepté pour un outil interne servi sur le poste ; il est à rouvrir avant tout déploiement hors du poste, que ne couvre aucune feature.
- F-008-AC19 n'est prouvé que par le script de fumée, hors des hooks (H12, dette D-002 proposée). Le script apporte aussi la seule preuve dynamique de F-008-AC21 (constat 9) ; sa preuve statique reste dans `pnpm test`.
- Avec `NODE_ENV=production` dans l'image, un mot de passe laissé à sa valeur factice empêche le serveur de démarrer sous Compose (F-008-AC14). C'est voulu ; le dev peut poser `NODE_ENV=development` dans `apps/server/.env` pour un essai.
- Un mot de passe changé dans `infra/.env` après le premier démarrage n'est pas appliqué à la base : l'image ne lit `POSTGRES_PASSWORD` que sur un volume vide. La migration échoue alors à l'authentification et le serveur ne démarre pas (même effet que le constat 9). Le fichier d'exemple le dit.
- Les contrôles de santé et la politique de redémarrage du serveur en cas d'arrêt inattendu restent au minimum : pas de `restart` sur le service `serveur`. Le déploiement hors du poste n'est couvert par aucune feature.
