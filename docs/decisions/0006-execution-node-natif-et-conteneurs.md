# ADR-0006 — Exécution et conteneurisation : TypeScript exécuté par Node 26 sans compilation, une image, Docker Compose

Statut : accepté
Date : 2026-10-08

## Contexte et problème

Le serveur et la commande de migration sont écrits en TypeScript et doivent tourner sur le poste, dans les tests et dans un conteneur. Le mode d'exécution et la forme du Dockerfile sont tranchés ici : la spec F-008 le dit dans son hypothèse H10, qui reprend cette décision et laisse la forme exacte du Dockerfile à la conception tant que F-008-AC19 à AC21 tiennent. Ce choix fixe la forme de tous les paquets serveur (imports, syntaxe permise) et celle de l'image : y revenir toucherait chaque fichier.

Statut « accepté » le 2026-10-08 : la spec `specs/F-008.md` a été validée par le dev et entérine les choix de cet ADR. Elle l'a été d'abord sur la branche d'archive `planification-reunie` (commit `38b5c5f`), puis, au même texte, le 2026-10-09 sur la ligne de `main` (branche `F-008-socle`, commit `651991f`), où cet ADR est reposé sans changement de décision. Il est resté « proposé » tant qu'elle était en brouillon.

D'où vient chaque choix :

- Arrêtés par la spec F-008 dès son premier brouillon : images épinglées par version et par empreinte, ports sur `127.0.0.1`, volume nommé, contrôles de santé, utilisateur non root (F-008-AC20) ; service de migration à exécution unique dont l'échec bloque le serveur (F-008-AC19, AC21) ; mot de passe exigé sans valeur par défaut (F-008-AC13) ; fichier `apps/server/.env` chargé en entier (F-008-AC24, H14) ; preuve par tests statiques et script de fumée (H12).
- Tranchés par cette conception : exécution native, image unique, variante de l'image de base, emplacement des fichiers, variables fixées par le fichier Compose, contenu du script de fumée. La spec en a repris depuis ce qui s'observe de l'extérieur (commit `2d9e14d`) : exécution native, variante Alpine, `npm` retiré et `USER node` (H10, F-008-AC20) ; point de montage du volume et `pg_isready` sur l'adresse TCP (H1, F-008-AC20) ; ports du poste réglables (H11) ; lancement par `up -d --wait` et constats 1 à 10 (F-008-AC19, H12) ; risque accepté sur `postgres:18.6` (H15).
- Constatés par la veille des conteneurs du 2026-10-08 (`MEMORY/VEILLE.md`, sections « Image Docker officielle de Node 26 », « Image Docker postgres:18.6 », « Docker Compose v2 ») puis rejoués par cette conception sur une pile jetable (`F-008-conception.md`, « Essais », J à L) : étiquettes et contenu de l'image Node, point de montage du volume de PostgreSQL 18, syntaxes de Compose, failles connues des deux images.
- Venus du bloc d'infrastructure (2026-10-09) et de la relecture de structure (2026-10-12), sur le code : l'étiquette `node:26.11.1-alpine3.24` et son empreinte, le nom de projet `notionlike`, `NODE_ENV` fixée par le fichier Compose, la sortie explicite du processus, le service qui reçoit le processus en dépendance (ADR-0004).

## Options étudiées

Mode d'exécution (H10) :

1. **Exécution native par Node 26** (retenue) : Node retire les annotations de type au chargement. `node apps/server/src/main.ts`, sans étape de compilation, sur le poste comme dans l'image.
2. Compilation préalable (`tsc` vers `dist/`). Écartée : une étape de build et une configuration de plus par paquet, un `exports` différent en développement et en production, et un écart entre le code testé (source) et le code exécuté (compilé). Rien dans F-008 ne la demande.
3. Chargeur tiers (`tsx`). Écarté : une dépendance d'exécution pour ce que Node fait seul.

Image : une image par service, ou **une seule image pour le serveur et la migration** (retenue) : même code, même dépendances, deux commandes.

Variante de l'image de base Node 26, départagée par `trivy image --severity HIGH,CRITICAL --scanners vuln` (trivy 0.75.0, base de failles du 2026-10-08) :

1. `node:26.10.0-slim` (Debian 13) : 47 constats HIGH, dont 43 dans des paquets Debian sans version corrigée et 4 dans le `npm` embarqué (veille). Écartée : aucun de ces 43 constats ne peut être levé par le Dockerfile.
2. **`node:26.10.0-alpine3.24`, `npm` retiré de l'étape d'exécution** (retenue) : 4 constats HIGH dans l'image de base, tous dans le `npm` embarqué, aucun dans un paquet Alpine (veille, rejoué). Une fois `npm` retiré, l'image construite à l'essai n'a plus aucun constat HIGH ni CRITICAL, et elle exécute `main.ts` et `migrer.ts` (« Essais », J). Aucune dépendance d'exécution de F-008 n'a de module natif : la bibliothèque C d'Alpine (musl) ne change rien pour elles. Les deux étiquettes `26.10.0` de cette liste sont celles de la comparaison du 2026-10-08 ; l'image livrée est la même variante à l'étiquette `26.11.1-alpine3.24` (« Image », plus bas).

Installation dans l'image : `pnpm deploy` (copie des paquets dans `node_modules`) ou **installation du workspace tel quel, sans dépendances de développement** (retenue). Node refuse de retirer les types d'un fichier situé sous `node_modules` ; les paquets du workspace doivent donc rester à leur place, reliés par les liens de pnpm, dont Node suit le chemin réel.

## Décision

### Exécution native

- Les trois paquets serveur sont des paquets source : `exports` désigne un fichier `.ts`, les imports relatifs portent l'extension `.ts`, et la syntaxe reste effaçable (`erasableSyntaxOnly` : ni `enum`, ni `namespace`, ni propriété déclarée dans les paramètres d'un constructeur). Même forme que `@notionlike/document` (ADR-0003).
- Points d'entrée : `apps/server/src/main.ts` et `packages/db/src/migrer.ts`, lancés par `node <fichier>`.
- Barrière : un test lance chacun des deux points d'entrée par un vrai processus `node`, sans Vitest entre les deux. Tout fichier de `src/` des trois paquets est chargé par l'un ou l'autre ; un import sans extension ou une syntaxe non effaçable, que Vitest tolérerait, y fait donc échouer `pnpm test`. `pnpm typecheck` le signale aussi, mais aucun contrôle du socle ne le lance.
- Sur le poste, deux scripts chargent le fichier d'environnement par l'option de Node, sans dépendance : `demarrer` (`node --env-file=.env src/main.ts`, dans `apps/server`) et `migrer` (`node --env-file=../../apps/server/.env src/migrer.ts`, dans `packages/db`). Aucun fichier de `src/` ne lit un fichier `.env` : `main.ts` et `migrer.ts` ne connaissent que `process.env`.

### Processus serveur (`apps/server/src/main.ts`, `apps/server/src/service.ts`)

`main.ts` est le seul fichier qui touche au `process` global ; `service.ts` reçoit le processus en dépendance et c'est lui qui écoute le signal et demande la sortie (ADR-0004).

1. `main.ts` : `lireConfiguration(process.env)`. Erreur : le message de l'`ErreurConfiguration` sur la sortie d'erreur, `process.exitCode` à 1, rien n'écoute et aucune connexion n'est ouverte (F-008-AC12).
2. `main.ts` : `ouvrirBase(configuration.urlBaseDonnees)`, qui n'ouvre aucune connexion, puis `servir({ configuration, base, processus: process })`.
3. `servir` : journal sur la sortie standard du processus, `creerApplication(…)`, `demarrerServeur(…)` avec `DELAI_ARRET_MS` (8 000 ms). Écoute impossible : base fermée, phrase fixe sur la sortie d'erreur, `exit(1)` (F-008-AC25).
4. Ligne de journal `ecoute`, avec l'hôte et le port réel.
5. À la réception de `SIGTERM` : `arreter()` du serveur, puis `fermer()` de la base, puis la ligne de journal `arret` et `exit(0)` (F-008-AC7). Le délai de 8 000 ms laisse deux secondes de marge sous les 10 secondes du critère. Si l'arrêt ou la fermeture rejette : phrase fixe sur la sortie d'erreur, `exit(1)`, sans jamais écrire l'objet d'erreur (F-008-AC26).

La sortie après `SIGTERM` est explicite : le code appelle `exit(0)` une fois la base fermée, il n'attend pas que plus rien ne retienne le processus. Devant une base figée (conteneur en pause), le pilote `pg` envoie son adieu mais la base ne ferme jamais son côté des connexions, qui retiendraient le processus jusqu'à ce que Docker le tue. Un test le prouve sans Docker : `SIGTERM` envoyé au processus relié au faux serveur PostgreSQL lancé avec `neFermeJamais` (ADR-0005), code 0 dans le délai. Les deux sorties en échec écrivent leur phrase puis sortent dans le rappel de l'écriture, pour que la phrase soit partie avant la fin du processus.

Le serveur démarre même si la base est injoignable : `GET /sante` répond 200, `GET /pret` 503. L'ordre de démarrage est l'affaire du fichier Compose.

### Fichiers d'infrastructure

| Fichier                    | Rôle                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `infra/docker-compose.yml` | projet `notionlike` ; trois services : `base`, `migration`, `serveur` ; un volume nommé               |
| `infra/Dockerfile`         | image unique du serveur et de la migration                                                            |
| `.dockerignore` (racine)   | contexte de construction en liste blanche                                                             |
| `infra/.env.example`       | `POSTGRES_PASSWORD` factice ; les deux ports publiés, en commentaire                                  |
| `apps/server/.env.example` | variables du serveur, valeurs factices (périmètre d'`agent-backend`)                                  |
| `infra/fumee.sh`           | script de fumée de F-008-AC19, lancé à la main, Docker démarré                                        |
| `infra/tests/*.test.ts`    | tests statiques du fichier Compose, du Dockerfile, des fichiers d'exemple et du script de fumée (H12) |
| `infra/tests/regles/*.ts`  | les règles que ces tests appliquent : une fonction par exigence, qui rend la liste de ses constats    |

Le fichier Compose vit dans `infra/` : `docker compose` y lit `infra/.env` pour ses propres variables. Le contexte de construction est la racine du dépôt.

**Image (`infra/Dockerfile`)**, deux étapes sur la même image officielle Node 26, variante Alpine, épinglée par étiquette complète et par empreinte : `node:26.<mineure>.<correctif>-alpine3.<version>@sha256:<empreinte>`, la même référence aux deux lignes `FROM`.

- Référence livrée : `node:26.11.1-alpine3.24@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a`, étiquette et empreinte relues au registre le 2026-10-09, jour du bloc d'infrastructure (H10 de la spec). Les essais du 2026-10-08 avaient été faits sur `node:26.10.0-alpine3.24` : Node 26.11 n'avait pas encore d'étiquette Docker ce jour-là (veille). L'image construite sur la référence livrée n'a aucun constat HIGH ni CRITICAL (constat 10 du script de fumée, 2026-10-12).
- Étape de dépendances : `npm install -g pnpm@<version du champ packageManager>` (`corepack` est absent de l'image), copie des manifestes du workspace (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et les trois `package.json` des paquets), puis `pnpm install --frozen-lockfile --prod`.
- Étape d'exécution : retrait de `npm` (`rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx`) ; `NODE_ENV=production` ; copie des `node_modules` de l'étape précédente (celui de la racine et celui de chacun des trois paquets), des `src/` des trois paquets et de `packages/db/migrations/` ; `USER node` explicite, l'image tournant en root par défaut ; contrôle de santé qui interroge `GET /sante` avec le `fetch` de Node ; commande `["node", "apps/server/src/main.ts"]` en forme tableau, pour que Node reçoive `SIGTERM` directement.
- Ni pnpm ni `npm` ne sont dans l'image finale : rien ne s'y installe après la construction.

**Services (`infra/docker-compose.yml`)** :

- Le fichier fixe le nom du projet, `name: notionlike` : les conteneurs et le volume de la pile de travail ne dépendent pas du dossier d'où `docker compose` est lancé (H11).
- `base` : image `postgres:18.6@sha256:74935e72…`, étiquette et empreinte relues au registre le 2026-10-09 (H1) ; utilisateur et base `notionlike` ; `POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?…}"` ; port `127.0.0.1:${PORT_PUBLIE_BASE:-5432}:5432` ; volume nommé monté sur `/var/lib/postgresql` ; contrôle de santé `pg_isready -h 127.0.0.1 -U notionlike -d notionlike`.
- `migration` : même construction que le serveur (même Dockerfile, même contexte, donc mêmes couches), commande `["node", "packages/db/src/migrer.ts"]`, sans redémarrage, démarre quand `base` est saine.
- `serveur` : `env_file` en forme longue (`path: ../apps/server/.env`, `required: true`) ; port `127.0.0.1:${PORT_PUBLIE_SERVEUR:-3000}:3000` ; démarre quand `base` est saine et que `migration` a réussi (`service_completed_successfully`).

Quatre points que l'essai a fixés :

- **Volume.** À partir de la majeure 18, l'image range ses données dans `/var/lib/postgresql/18/docker` (`PGDATA`) et déclare son volume sur `/var/lib/postgresql`. Le volume nommé se monte donc sur `/var/lib/postgresql`, et `PGDATA` n'est pas redéfini. Monté sur `/var/lib/postgresql/data`, comme avec les majeures précédentes, le conteneur refuse de démarrer (code 1, « Essais », L).
- **Contrôle de santé de la base.** `pg_isready` interroge le port TCP (`-h 127.0.0.1`), pas la socket Unix : pendant l'initialisation d'un volume vide, l'image lance un serveur provisoire qui n'écoute que sur la socket, et `pg_isready` sans `-h` y répond « accepting connections » alors que la base n'est pas joignable par le réseau (« Essais », L). Sans `-h`, la migration pourrait partir trop tôt au premier démarrage.
- **Message de variable manquante.** Toute valeur qui contient `${POSTGRES_PASSWORD:?<message>}` est quotée en entier : un message non quoté qui contient « : » fait échouer le chargement du fichier (`mapping values are not allowed in this context`).
- **Ports publiés.** L'adresse `127.0.0.1` est écrite en dur ; seul le port du poste est réglable, par `PORT_PUBLIE_BASE` et `PORT_PUBLIE_SERVEUR`, facultatives. Sans elles, les ports sont 5432 et 3000. Elles servent au script de fumée, qui doit pouvoir tourner à côté de la pile de travail, et au dev dont le port 5432 est déjà pris par une autre base (c'était le cas du poste le jour de l'essai).

Version minimale de Docker Compose : 2.24.0, pour la forme longue d'`env_file` avec `required` (veille). Le fichier Compose n'a pas de champ pour le dire : un commentaire en tête du fichier et `infra/.env.example` le portent.

Quatre variables sont fixées par le fichier Compose dans `serveur.environment`, et l'emportent sur le fichier chargé par `env_file` :

- `HOTE` (`0.0.0.0`), `PORT` (`3000`) et `URL_BASE_DONNEES` (hôte `base`, mot de passe `${POSTGRES_PASSWORD:?…}`), parce qu'elles décrivent le conteneur et non l'application ;
- `NODE_ENV: production`, pour que le mode de production tienne même si `apps/server/.env` la fixe autrement : un mot de passe factice y est donc toujours refusé (F-008-AC14). Le Dockerfile la fixe aussi (`ENV`), mais une variable du fichier chargé l'emporte sur celle de l'image, pas sur celle de `environment`.

Toute autre variable vient d'`apps/server/.env` sans être recopiée (F-008-AC24). Le service `migration` reçoit la même `URL_BASE_DONNEES`, et rien d'autre.

`apps/server/.env.example` laisse `NODE_ENV` en commentaire : hors de Compose, la valeur qu'on y écrit est celle que le serveur reçoit (défaut du serveur : `development`) ; sous Compose, elle est sans effet. Un test du serveur tient que le fichier d'exemple ne la fixe pas, un test statique que le fichier Compose la fixe à `production`.

Conséquence pour le mot de passe : il figure dans une URL, donc il ne contient que des caractères qui n'y ont pas besoin d'être encodés. Les fichiers d'exemple le disent et donnent la commande qui en produit un (`openssl rand -hex 24`).

**Contexte de construction (`.dockerignore`)** : première ligne `*`, puis les seules exceptions dont l'image a besoin (manifestes, `src/` des trois paquets, `packages/db/migrations/`). Aucun fichier `.env`, aucun test, aucun `node_modules` du poste n'entre dans le contexte.

**Script de fumée (`infra/fumee.sh`)**. Il vérifie d'abord le poste (Docker, Compose 2.24.0 ou plus récent, `curl`, `trivy`, présence d'`apps/server/.env`). Il lance sa propre pile sous le projet `notionlike-fumee`, sur les ports 55432 et 53000 du poste, avec un mot de passe tiré au hasard pour ce lancement : il ne touche ni au volume ni aux ports de la pile de travail, et tout ce qu'il crée (conteneurs, volume, images construites) est supprimé à sa sortie, qu'il réussisse ou non. La pile est lancée par `docker compose up -d --wait`, jamais par `up --abort-on-container-exit` : cette option arrête toute la pile dès que le service `migration` finit, même en code 0. Le script annonce chaque constat par son numéro, s'arrête au premier qui échoue en imprimant l'état et la fin des journaux des services, et constate, dans l'ordre :

1. `up -d --wait` finit en code 0 et `GET /pret` répond 200 ;
2. le service `migration` a fini avec le code 0 et la table `drizzle.__drizzle_migrations` existe ;
3. `select version()` annonce PostgreSQL 18.6, `show data_directory` répond `/var/lib/postgresql/18/docker`, et le seul montage du conteneur est le volume nommé du projet sur `/var/lib/postgresql` ;
4. base arrêtée (`stop base`) : `GET /pret` répond 503 en moins de 3 secondes, `GET /sante` répond 200 ;
5. base redémarrée : `GET /pret` répond de nouveau 200, le conteneur du serveur n'ayant pas redémarré (même date de démarrage, compteur de redémarrages à 0) ;
6. base figée (`pause base`), donc connectée mais muette : `GET /pret` répond 503 entre 1,9 et 3 secondes ; base relâchée : 200 ;
7. pile arrêtée puis relancée sans supprimer le volume : la table de suivi est toujours là, comme une ligne témoin écrite avant l'arrêt ;
8. arrêt du service `serveur` : code de sortie 0 en moins de 10 secondes ;
9. volume supprimé, puis pile relancée avec une surcharge temporaire, écrite par le script, qui donne un mauvais mot de passe au seul service `migration` : `up -d --wait` finit en code différent de 0, `migration` est sorti en code 1 et `serveur` est resté à l'état `created` (F-008-AC21) ;
10. `trivy image --exit-code 1 --severity HIGH,CRITICAL --scanners vuln` sur l'image construite du serveur finit en code 0 ;
11. nettoyage du projet de fumée, volume et images construites compris.

Des tests statiques tiennent la forme du script sans le lancer (`infra/tests/compose.test.ts`, règles d'`infra/tests/regles/fumee.ts`) : onze constats annoncés une fois chacun et dans l'ordre, lancement par `up -d --wait`, projet et ports distincts de ceux de la pile de travail, syntaxe lue par `bash -n`.

Le script a été lancé sur la pile réelle du poste le 2026-10-12, deux fois : sur le commit `0fd735e`, puis sur l'arbre de `654f3cd` (le même code, `main` intégré). Les deux fois : `FUMEE: OK (constats 1 à 11)`, code 0. Le relevé est dans `MEMORY/features/F-008.md`. Les constats 1 à 9 avaient d'abord été joués à la main le 2026-10-08, sur un squelette (« Essais », K).

## Conséquences

- Pas de build : le code exécuté dans l'image est le code testé. Revenir à une compilation resterait local à chaque paquet (`exports`, un script), mais toucherait les trois manifestes et l'image.
- L'image contient pnpm dans son étape de dépendances seulement, et aucune dépendance de développement : ni PGlite, ni Vitest, ni TypeScript. L'image finale n'a ni `npm`, ni `npx`, ni pnpm.
- Variante Alpine : la bibliothèque C est musl. Une dépendance d'exécution à module natif, le jour où il en entre une, doit être essayée dans l'image avant d'être retenue ; à défaut, retour à la variante `slim`, avec ses constats sans correctif. Un diagnostic dans le conteneur se fait sans `bash` (l'image n'a que `sh`).
- Mineure de Node épinglée : l'image ne reçoit aucun correctif tant que le Dockerfile n'est pas retouché. Node 26 passe en LTS le 2026-10-28 (veille) : l'étiquette et l'empreinte sont à relire à cette date, puis à chaque mise à jour. Les tests du poste tournent sur le Node du dev (26.11.0 le 2026-10-12, `node -v`), l'image sur la référence épinglée (26.11.1) : seul le script de fumée exerce le code sur le Node de l'image.
- **Ce que le contrôle `CONTENEURS` couvre.** Sa commande est `trivy fs --exit-code 1 --severity HIGH,CRITICAL .` (`.agents/outils.env`). Elle lit le dépôt : les dépendances de `pnpm-lock.yaml` et les secrets des fichiers suivis. Constaté à l'essai : devant un Dockerfile volontairement fautif (image non épinglée, utilisateur root), elle n'analyse que le verrou et finit en code 0. Elle ne lit ni le Dockerfile, ni le fichier Compose, ni aucune image.
- **F-008-AC20 et le contrôle `CONTENEURS`.** Le critère, reformulé par `agent-planif` à la demande de cette conception (commit `2d9e14d`), dit maintenant ce que chaque preuve couvre. Le contrôle `CONTENEURS` finit sans constat dès que le verrou n'a aucune faille HIGH ou CRITICAL connue et que le dépôt n'a aucun secret ; il ne prouve rien sur les images : ni sur l'image de base Node, ni sur l'image construite, ni sur `postgres:18.6`. Les exigences de forme d'AC20 sont tenues par les tests statiques d'`infra/tests/`, que `pnpm test` lance. L'absence de constat HIGH ou CRITICAL dans l'image du serveur construite, que le critère exige aussi, n'est vue que par le constat 10 du script de fumée, lancé à la main (dette D-002). L'image `postgres:18.6` n'y est pas tenue (H15, point suivant).
- **Risque accepté : failles connues de l'image `postgres:18.6`** (H15 de la spec, qui renvoie ici). `trivy image --severity HIGH,CRITICAL --scanners vuln` y trouve 84 constats (rejoué le 2026-10-08, trivy 0.75.0) : 62 dans des paquets Debian 13 (61 HIGH et 1 CRITICAL, CVE-2026-6653 dans `libxml2` ; aussi `gnupg`, `perl`, `util-linux`, `ncurses`), tous sans version corrigée, et 22 dans le binaire `gosu` (21 HIGH et 1 CRITICAL, CVE-2025-68121, dans la bibliothèque standard de Go avec laquelle il est compilé ; corrigées dans des versions de Go plus récentes, mais le binaire est celui de l'image). Soit 2 CRITICAL et 82 HIGH ; la veille résume « 1 CRITICAL et 83 HIGH » pour les mêmes 84 constats, en comptant à part celui de `gosu`. PostgreSQL lui-même n'y figure pas, et la page des avis de la majeure 18 n'en a aucun d'ouvert pour la 18.6 (veille). C'est l'image officielle : elle n'est ni reconstruite ni modifiée, et aucune variante sans ces paquets n'a été évaluée (`18.6-alpine` existe, non analysée). Parades en place : port publié sur `127.0.0.1` seulement (test statique) ; base jointe par le seul réseau du projet Compose, par les services `migration` et `serveur` ; aucun service de F-008 ne lui passe de XML, de clé GnuPG ni de script Perl ; image épinglée par étiquette et par empreinte, donc toute mise à jour est un diff relu, avec un `trivy image` à refaire ce jour-là. Ce qui n'est pas paré : un attaquant qui exécute déjà du code dans le conteneur de la base. Le risque est accepté pour un outil interne servi sur le poste ; il est à rouvrir avant tout déploiement hors du poste, que ne couvre aucune feature.
- F-008-AC19 n'est prouvé que par le script de fumée, hors des hooks (H12, dette D-002) : sa sortie est un relevé fait à la main, que tout commit de code postérieur périme. Le script apporte aussi la seule preuve dynamique de F-008-AC21 (constat 9) ; sa preuve statique reste dans `pnpm test`.
- Sous Compose, le serveur est toujours en mode de production : un mot de passe laissé à sa valeur factice dans `apps/server/.env` l'empêche de démarrer (F-008-AC14), et aucune variable de ce fichier ne lève ce refus. C'est voulu. Un essai en mode de développement se fait hors de Compose, par le script `demarrer` du serveur.
- La sortie du serveur ne dépend plus de l'état de la base : `exit(0)` suit la fermeture demandée, que la base ait fermé son côté des connexions ou non. En contrepartie, ce qui retiendrait encore le processus à ce moment est abandonné sans attente : un travail de fond qu'une feature ajouterait doit être arrêté avant la fermeture de la base, dans `servir`.
- Un mot de passe changé dans `infra/.env` après le premier démarrage n'est pas appliqué à la base : l'image ne lit `POSTGRES_PASSWORD` que sur un volume vide. La migration échoue alors à l'authentification et le serveur ne démarre pas (même effet que le constat 9). Le fichier d'exemple le dit.
- Les contrôles de santé et la politique de redémarrage du serveur en cas d'arrêt inattendu restent au minimum : pas de `restart` sur le service `serveur`. Le déploiement hors du poste n'est couvert par aucune feature.
