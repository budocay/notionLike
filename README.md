# notionLike

notionLike est un éditeur de pages et de bases à la manière de Notion, construit « local d'abord » : le contenu (pages, blocs, tables) vit dans des documents Yjs gardés sur l'appareil (IndexedDB), et l'éditeur fonctionne sans réseau. Le serveur synchronise ces documents et autorise l'accès (comptes, espaces, droits) ; il n'est jamais la source d'une frappe.

État actuel : les features livrées, la prochaine prévue et les dettes ouvertes sont dans [`MEMORY/STATE.md`](MEMORY/STATE.md), qui fait foi.

## Prérequis

| Outil             | Version                                                                    | Source                                          |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| Node.js           | 26 ou plus récent                                                          | `engines.node` (`>=26`) de `package.json`       |
| pnpm              | 12.10.1                                                                    | `packageManager` de `package.json`              |
| Docker et Compose | Compose 2.24.0 ou plus récent (serveur et base seulement)                  | `infra/docker-compose.yml`, `infra/pile.sh`     |
| gitleaks          | 8.19 ou plus récent ; sans lui, aucun commit ne passe le hook `pre-commit` | `.agents/checks/test-blocage.sh`                |
| semgrep, trivy    | contrôles du socle ; trivy sert aussi à la fumée                           | `.agents/checks/controles.sh`, `infra/fumee.sh` |

Pourquoi Node 26 : les tests d'intégration du serveur tournent sur PGlite (PostgreSQL embarqué) et dépassent leurs délais sous une version plus ancienne ; l'image du serveur est aussi sur Node 26 (`infra/Dockerfile`). Le dépôt n'épingle pas de version de semgrep ni de trivy ; les derniers relevés connus ont été faits avec gitleaks 8.30.0, semgrep 1.178.0 et trivy 0.73.0 (`MEMORY/features/F-008.md`).

pnpm refuse tout paquet publié depuis moins de 7 jours (`minimumReleaseAge` de `pnpm-workspace.yaml`).

## Démarrage

```sh
git clone git@github.com:budocay/notionLike.git
cd notionLike
pnpm install --frozen-lockfile
git config core.hooksPath .githooks
```

La dernière ligne branche les hooks du dépôt (`.githooks/pre-commit`, `commit-msg`, `pre-push`). La CI GitHub Actions tourne depuis le 2026-10-16 (`.github/workflows/ci.yml`, checks requis sur `main`) ; les hooks restent la première barrière (format, lint, secrets, périmètre, tests). Ne les contournez pas (`--no-verify` est proscrit).

## Lancer le client seul (local d'abord)

```sh
pnpm --filter @notionlike/web dev
```

Ouvre `http://127.0.0.1:5173` (port strict, `apps/web/vite.config.ts`). Sans serveur, l'éditeur fonctionne et garde le contenu dans le navigateur ; les fonctions qui demandent le serveur (compte, espaces partagés) restent indisponibles.

## Lancer le serveur et la base

La pile de travail est dans `infra/` (Docker Compose, projet `notionlike`) : `base` (PostgreSQL 18.6, données dans le volume `notionlike_donnees-base`), `migration` (exécution unique) puis `serveur` (image construite par `infra/Dockerfile`). Elle se pilote par la commande de la pile, `infra/pile.sh`, lancée par `pnpm -w pile <sous-commande>` depuis n'importe quel dossier du dépôt (`-w` vise la racine) :

| Commande                | Effet                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm -w pile aide`     | liste les sous-commandes                                                                                                                                                                                                                                                                                                          |
| `pnpm -w pile preparer` | crée `infra/.env` et `apps/server/.env` s'ils manquent, en mode 600, depuis les fichiers d'exemple : mot de passe de la base et secret de session tirés au hasard, `URL_BASE_DONNEES` du mode hôte, origines du client ; ne modifie jamais un fichier présent                                                                     |
| `pnpm -w pile demarrer` | prépare, puis vérifie le poste (Docker, Compose 2.24.0), le mot de passe, les ports publiés, la configuration du serveur (par son propre code, dans son image) et, si le volume existe, que le mot de passe l'ouvre ; puis `up -d --wait --build` et attend `GET /pret` à 200. Rien n'est démarré tant qu'une vérification échoue |
| `pnpm -w pile etat`     | état de chaque service, réponse de `GET /pret`, présence du volume des données                                                                                                                                                                                                                                                    |
| `pnpm -w pile arreter`  | arrête et supprime conteneurs et réseau ; le volume des données est gardé                                                                                                                                                                                                                                                         |
| `pnpm -w pile accorder` | donne au rôle de la base le mot de passe d'`infra/.env`, sans l'ancien et sans toucher aux données (volume initialisé avec un autre mot de passe)                                                                                                                                                                                 |

Depuis un clone neuf, deux commandes, la seconde dans un autre terminal :

```sh
pnpm -w pile demarrer
pnpm --filter @notionlike/web dev
```

Puis ouvrir `http://127.0.0.1:5173`, pas `http://localhost:5173` : le navigateur garde le contenu par origine, et le serveur n'admet que `http://127.0.0.1:5173` (et `http://127.0.0.1:5174`, l'origine de Playwright). Vite relaie `/api` (WebSocket compris) vers `http://127.0.0.1:3000` ; si `PORT_PUBLIE_SERVEUR` change, mettre `NOTIONLIKE_RELAIS_API=http://127.0.0.1:<port>` dans `apps/web/.env.local`. Le relais ne réécrit ni `Host` ni `Origin` : better-auth n'accepte que `URL_PUBLIQUE` et `ORIGINES_AUTORISEES` (`apps/server/src/authentification.ts`).

Navigateurs : sous Compose, le serveur tourne en production et pose un cookie de session `Secure` nommé `__Secure-better-auth.session_token`, servi en `http://127.0.0.1`. Chromium et Chrome le gardent (constaté le 2026-10-16) ; Safari 27 le refuse, donc l'inscription y réussit sans ouvrir de session ; Firefox reste à constater (`MEMORY/VEILLE.md`, section better-auth du 2026-10-16).

Le serveur publié répond sur `http://127.0.0.1:3000` (`PORT_PUBLIE_SERVEUR`). `GET /pret` répond 200 quand la base répond, 503 sinon (base arrêtée, figée ou injoignable : le serveur tourne mais ne peut rien servir) ; `GET /sante` répond 200 dès que le processus tourne. Facultatifs dans `infra/.env` : `PORT_PUBLIE_BASE` (5432) et `PORT_PUBLIE_SERVEUR` (3000), publiés sur `127.0.0.1` seulement.

Mode hôte (mise au point du serveur hors conteneur) : `pnpm --filter @notionlike/server demarrer` (`node --env-file=.env src/main.ts`). Conditions : la base de la pile de travail démarrée ; le service `serveur` arrêté (`docker compose -p notionlike stop serveur`, depuis `infra/`) ou `PORT_PUBLIE_SERVEUR` déplacé, sinon les deux veulent le port 3000 ; `URL_BASE_DONNEES` d'`apps/server/.env` telle que l'écrit `preparer` (`127.0.0.1`, port publié de la base, mot de passe d'`infra/.env` ; `demarrer` avertit d'un écart). Sans `NODE_ENV` dans `apps/server/.env`, le serveur hôte tourne en développement.

Variables lues par le serveur (`apps/server/src/configuration.ts`) : `URL_PUBLIQUE`, `ORIGINES_AUTORISEES`, `BETTER_AUTH_SECRET`, `PROXYS_DE_CONFIANCE` (0 par défaut), et `NODE_ENV`, `HOTE`, `PORT`, `URL_BASE_DONNEES`, que Compose impose au conteneur (`production`, `0.0.0.0`, `3000`, URL bâtie sur `POSTGRES_PASSWORD`). Une configuration refusée est dite par `Configuration invalide : <variables>`, puis une ligne `- <VARIABLE> : <raison>` par variable, jamais leur valeur.

### Pannes connues

| Symptôme                                                                                                            | Cause                                                                                                                           | Commande                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `- BETTER_AUTH_SECRET : valeur factice de l'exemple, refusée en production`                                         | `apps/server/.env` copié de l'exemple sans changer le secret                                                                    | y mettre la sortie de `openssl rand -hex 32`, ou renommer le fichier en `apps/server/.env.sauvegarde.local` (ignoré par git) puis `pnpm -w pile preparer` ; puis `pnpm -w pile demarrer`  |
| `POSTGRES_PASSWORD de infra/.env refusé : valeur factice de l'exemple` (ou un caractère hors `A-Z a-z 0-9 - . _ ~`) | mot de passe d'exemple ou qui casserait l'URL de connexion ; un volume initialisé avec lui serait refusé ensuite par le serveur | s'il n'y a pas encore de volume : renommer `infra/.env` en `infra/.env.sauvegarde.local` puis `pnpm -w pile preparer` ; sinon y écrire un mot de passe admis puis `pnpm -w pile accorder` |
| `La base refuse POSTGRES_PASSWORD de infra/.env` ; migration en échec d'authentification                            | mot de passe changé après l'initialisation du volume, que PostgreSQL ne relit jamais                                            | remettre l'ancien mot de passe dans `infra/.env`, ou `pnpm -w pile accorder` ; puis `pnpm -w pile demarrer`. Ne jamais supprimer le volume : la base de travail serait effacée            |
| `Le port 3000 (PORT_PUBLIE_SERVEUR) est déjà en écoute`                                                             | un autre processus tient le port, souvent le serveur lancé en mode hôte                                                         | arrêter ce processus, ou `PORT_PUBLIE_SERVEUR=<port>` dans `infra/.env` avec `NOTIONLIKE_RELAIS_API` ; même chose pour la base avec `PORT_PUBLIE_BASE` et `URL_BASE_DONNEES`              |
| `no such file or directory` sur `infra/fumee.sh` ou `docker compose` sans fichier trouvé                            | commande lancée par un chemin relatif depuis un autre dossier que celui prévu                                                   | `pnpm -w pile <sous-commande>` et `pnpm -w fumee`, valables depuis n'importe quel dossier du dépôt                                                                                        |
| inscription refusée (403) ou client sans session sur `http://localhost:5173`                                        | `localhost` n'est pas l'origine admise par le serveur ; `demarrer` refuse aussi une configuration sans `http://127.0.0.1:5173`  | ouvrir `http://127.0.0.1:5173` ; si `demarrer` le signale, ajouter `http://127.0.0.1:5173` à `ORIGINES_AUTORISEES` d'`apps/server/.env`                                                   |

`pnpm -w pile demarrer` dit les quatre premiers cas, et une configuration sans `http://127.0.0.1:5173`, avant de rien lancer ; l'adresse tapée dans le navigateur reste au dev. Pour une migration en échec : `pnpm -w pile demarrer` nomme le service et montre son journal ; sauvegarde, restauration et retour arrière : [`infra/RETOUR-ARRIERE.md`](infra/RETOUR-ARRIERE.md).

En cas de panne de `pile.sh` : depuis `infra/`, `docker compose up -d --wait` démarre la pile et `docker compose down` l'arrête, le volume des données gardé (jamais l'option `-v`, qui l'efface). `infra/.env` et `apps/server/.env` doivent alors exister et être justes : sans les vérifications de `pile.sh`, une erreur ne se voit que dans le journal (`docker compose logs`).

## Contrôles

| Commande                                 | Rôle                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `pnpm test`                              | tests Vitest de tout le dépôt (PGlite pour le serveur)            |
| `pnpm lint`                              | ESLint                                                            |
| `pnpm format`                            | Prettier, en écriture (`pnpm format:check` pour vérifier)         |
| `pnpm typecheck`                         | `tsc` dans chaque paquet (hors des hooks, D-007)                  |
| `pnpm contrats`                          | règles de dépendances entre paquets (dependency-cruiser)          |
| `.agents/checks/controles.sh main`       | tous les contrôles déterministes de la branche par rapport à main |
| `pnpm --filter @notionlike/web test:e2e` | bout en bout Playwright (Chromium)                                |
| `pnpm -w fumee`                          | fumée de la pile Docker réelle (`infra/fumee.sh`)                 |

Bout en bout : installer d'abord le navigateur de Playwright (`pnpm --filter @notionlike/web exec playwright install chromium`). Playwright lance son propre Vite sur le port 5174 ; les scénarios qui visent le serveur réel sont ignorés quand il est absent, et inversement.

Fumée (`pnpm -w fumee`, depuis n'importe quel dossier du dépôt) : elle monte une pile jetable à part (projet `notionlike-fumee`, ports 55432 et 53000, mot de passe tiré au hasard) et prouve dix-sept constats : démarrage et `GET /pret` à 200, migration finie en code 0, PostgreSQL 18.6 dans le volume nommé, `/pret` à 503 en moins de 3 s base arrêtée ou figée puis 200 sans redémarrer le serveur, données gardées après `down`, arrêt propre du serveur, serveur jamais démarré si la migration échoue, `trivy image` sans constat HIGH ni CRITICAL ; puis, par la commande de la pile, démarrage sans volume, second démarrage qui garde les données, inscription acceptée depuis `http://127.0.0.1:5173` et refusée en 403 depuis `http://localhost:5173`, arrêt qui garde le volume, mot de passe désaccordé diagnostiqué puis remis en accord par `accorder` sans clair dans le journal de la base, port du serveur déjà pris refusé ; enfin le nettoyage complet, et la pile de travail constatée intacte. Prérequis : Docker démarré, Compose 2.24.0 ou plus récent, `curl`, `trivy`, `node`, et un `apps/server/.env` au vrai secret (`pnpm -w pile preparer`). Elle ne touche ni au volume, ni aux conteneurs, ni aux ports de la pile de travail.

## Organisation du dépôt

- `apps/web` : client React, éditeur Tiptap, persistance locale (IndexedDB).
- `apps/server` : serveur Express, comptes (better-auth), espaces et droits, synchronisation Hocuspocus.
- `packages/document` : modèle des documents Yjs (pages, arbre, rangs).
- `packages/db` : schéma, migrations et accès PostgreSQL (Drizzle).
- `packages/contrats` : schémas et chemins partagés entre client et serveur.
- `infra` : Dockerfile, Compose, fumée, retour arrière et leurs tests.
- `specs` : une spec par feature (`F-xxx.md`) ; `docs/decisions` : ADR et conceptions.
- `MEMORY` : état du projet, journal des features, veille technique.
- `.agents` : socle des agents (contrôles, périmètres, outils).

Pour la suite : [`AGENTS.md`](AGENTS.md) (règles de travail des agents, trailers de commit `Agent:` et `Feature:`), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`ROADMAP.md`](ROADMAP.md), [`MEMORY/STATE.md`](MEMORY/STATE.md).
