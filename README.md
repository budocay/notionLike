# notionLike

notionLike est un éditeur de pages et de bases à la manière de Notion, construit « local d'abord » : le contenu (pages, blocs, tables) vit dans des documents Yjs gardés sur l'appareil (IndexedDB), et l'éditeur fonctionne sans réseau. Le serveur synchronise ces documents et autorise l'accès (comptes, espaces, droits) ; il n'est jamais la source d'une frappe.

État actuel : les features livrées, la prochaine prévue et les dettes ouvertes sont dans [`MEMORY/STATE.md`](MEMORY/STATE.md), qui fait foi.

## Prérequis

| Outil             | Version                                                                    | Source                                          |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| Node.js           | 26 ou plus récent                                                          | `engines.node` (`>=26`) de `package.json`       |
| pnpm              | 12.10.1                                                                    | `packageManager` de `package.json`              |
| Docker et Compose | Compose 2.24.0 ou plus récent (serveur et base seulement)                  | `infra/docker-compose.yml`, `infra/fumee.sh`    |
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

La dernière ligne branche les hooks du dépôt (`.githooks/pre-commit`, `commit-msg`, `pre-push`). Il n'y a pas encore de CI (dette D-001) : ces hooks sont la seule barrière (format, lint, secrets, périmètre, tests). Ne les contournez pas (`--no-verify` est proscrit).

## Lancer le client seul (local d'abord)

```sh
pnpm --filter @notionlike/web dev
```

Ouvre `http://127.0.0.1:5173` (port strict, `apps/web/vite.config.ts`). Sans serveur, l'éditeur fonctionne et garde le contenu dans le navigateur ; les fonctions qui demandent le serveur (compte, espaces partagés) restent indisponibles.

## Lancer le serveur et la base

La pile est dans `infra/` (Docker Compose) : `base` (PostgreSQL 18.6), `migration` (exécution unique) puis `serveur` (image construite par `infra/Dockerfile`).

1. Copier les deux fichiers d'exemple :

   ```sh
   cp infra/.env.example infra/.env
   cp apps/server/.env.example apps/server/.env
   ```

2. Dans `infra/.env`, remplacer `POSTGRES_PASSWORD` par un vrai mot de passe. Facultatifs : `PORT_PUBLIE_BASE` (5432 par défaut) et `PORT_PUBLIE_SERVEUR` (3000 par défaut), publiés sur `127.0.0.1` seulement.

3. Dans `apps/server/.env`, mettre un vrai secret de session :

   ```sh
   openssl rand -hex 32   # à copier dans BETTER_AUTH_SECRET
   ```

   Le serveur refuse de démarrer avec un secret de moins de 32 caractères, et, en production (ce que Compose impose), avec le secret factice de l'exemple ou le mot de passe factice de la base.

4. Démarrer, depuis `infra/` :

   ```sh
   cd infra
   docker compose up -d --wait
   ```

   Arrêt : `docker compose down` (le volume des données reste). Ne jamais ajouter `-v`.

Le serveur écoute sur `http://127.0.0.1:3000`. `GET /pret` répond 200 quand la base répond, 503 sinon ; `GET /sante` répond 200 dès que le processus tourne.

Variables lues par le serveur (`apps/server/src/configuration.ts`) : `URL_PUBLIQUE` (origine publique du serveur, http ou https), `ORIGINES_AUTORISEES` (origines exactes séparées par des virgules), `BETTER_AUTH_SECRET`, `PROXYS_DE_CONFIANCE` (0 par défaut), et `NODE_ENV`, `HOTE`, `PORT`, `URL_BASE_DONNEES`, que Compose impose au conteneur (`production`, `0.0.0.0`, `3000`, URL bâtie sur `POSTGRES_PASSWORD`). Une erreur de configuration nomme les variables fautives, jamais leur valeur.

Client et serveur ensemble : lancer le client comme plus haut. Vite relaie `/api` (WebSocket compris) vers `http://127.0.0.1:3000`, cible réglable par `NOTIONLIKE_RELAIS_API` ; le navigateur n'a qu'une origine. Le relais ne réécrit ni `Host` ni `Origin` : better-auth n'accepte que `URL_PUBLIQUE` et `ORIGINES_AUTORISEES` (`apps/server/src/authentification.ts`), l'origine `http://127.0.0.1:5173` doit donc figurer dans l'une des deux.

Sauvegarde, restauration et retour arrière : [`infra/RETOUR-ARRIERE.md`](infra/RETOUR-ARRIERE.md).

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
| `infra/fumee.sh`                         | fumée de la pile Docker réelle                                    |

Bout en bout : installer d'abord le navigateur de Playwright (`pnpm --filter @notionlike/web exec playwright install chromium`). Playwright lance son propre Vite sur le port 5174 ; les scénarios qui visent le serveur réel sont ignorés quand il est absent, et inversement.

Fumée (`infra/fumee.sh`, lancée depuis n'importe quel dossier) : elle monte une pile jetable à part (projet `notionlike-fumee`, ports 55432 et 53000, mot de passe tiré au hasard) et prouve onze constats : démarrage et `GET /pret` à 200, migration finie en code 0, PostgreSQL 18.6 dans le volume nommé, `/pret` à 503 en moins de 3 s base arrêtée ou figée puis 200 sans redémarrer le serveur, données gardées après `down`, arrêt propre du serveur, serveur jamais démarré si la migration échoue, `trivy image` sans constat HIGH ni CRITICAL, nettoyage complet. Prérequis : Docker démarré, Compose 2.24.0 ou plus récent, `curl`, `trivy`, et un `apps/server/.env` au vrai secret (le service `serveur` tourne en production et refuse le secret factice). Elle ne touche ni au volume ni aux ports de la pile de travail.

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
