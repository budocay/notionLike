# F-031 — Conception (mode rapide) : pile de travail en une commande

Date : 2026-10-16
Spec : `specs/F-031.md`, validée par le dev en `eed4af0`. ADR : ADR-0017 (entrée de vérification de la configuration et son lancement), statut « proposé ».

Note courte, écrite avant le code. Elle fixe le découpage entre `agent-backend` et `agent-devops`, l'interface entre eux et l'ordre de livraison. `ARCHITECTURE.md` décrit le code réel : il sera aligné après le dernier bloc, pas avant.

## Essais exécutés

Poste du dev, Docker Engine 29.8.2, Docker Compose v5.6.0. Projets jetables `f031-essai-volume` et `f031-essai-config`, dossiers du scratchpad. Tout ce qu'ils ont créé a été supprimé (`down -v` sur ces seuls projets). Le projet `notionlike` n'a pas été touché.

| Essai | Question                                                                       | Commande                                                                                                                                                                                                                                                                                       | Résultat                                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1    | `run --no-deps` crée-t-il le volume d'un autre service (H6) ?                  | `docker compose -f compose.yml run --rm --no-deps serveur` (une base à volume nommé, un service qui sort en code 3)                                                                                                                                                                            | `Volume f031-essai-volume_donnees Created`, `Network f031-essai-volume_default Created` ; code 3. **H6 est démenti** : sans parade, F-031-AC8 échoue                                                                                                         |
| E2    | Une surcharge qui retire les volumes l'empêche-t-elle ?                        | même commande, `-f sans-volume.yml` (`base.volumes: !reset []`, `volumes: !reset {}`, `serveur.network_mode: none`), `--progress quiet`, ports publiés présents                                                                                                                                | aucun volume ; le réseau du projet seul est créé (supprimé par `down`) ; code 3 rendu ; sortie d'erreur vide                                                                                                                                                 |
| E3    | Le service reçoit-il son environnement exact, depuis le vrai fichier Compose ? | `env -u POSTGRES_PASSWORD docker compose -p f031-essai-config --env-file infra/essai.env -f infra/docker-compose.yml -f infra/verification-configuration.yml -f <image du poste> --progress quiet run --rm --no-deps serveur node -e '…'`, `apps/server/.env` factice à `NODE_ENV=development` | sortie standard : `production 0.0.0.0 3000 http://127.0.0.1:5173 http://127.0.0.1:5173,http://127.0.0.1:5174 postgres://notionlike:***@base:5432/notionlike` ; sortie d'erreur vide ; code 1 rendu ; ni volume, ni réseau, ni conteneur restant après `down` |
| E4    | La règle de dépendances proposée passe-t-elle sur le code actuel ?             | `depcruise --config <règle ajoutée> apps packages` dans le worktree                                                                                                                                                                                                                            | `no dependency violations found (508 modules, 2127 dependencies cruised)`                                                                                                                                                                                    |
| E5    | Voit-elle un écart ?                                                           | même règle sur un arbre d'essai : `verifier-configuration.ts` qui importe `node:net` et `@notionlike/db`, `configuration.ts` qui importe un autre fichier du serveur                                                                                                                           | trois violations `serveur-verification-de-configuration-confinee` (`net`, `packages/db/src/index.ts`, `apps/server/src/autre.ts`) ; `zod` admis                                                                                                              |

## Mécanisme de H6 (tranché, ADR-0017)

La vérification de F-031-AC8 passe par une entrée dédiée du serveur, `apps/server/src/verifier-configuration.ts`, lancée dans l'image par `docker compose run --rm --no-deps -T serveur` avec la surcharge versée `infra/verification-configuration.yml`. Cette surcharge retire les volumes et coupe le réseau du service lancé. Il n'y a ni Node du poste ni seconde copie des quatre variables imposées par Compose. Avec ce mécanisme, la clause de F-031-AC17 sur les dépendances du dépôt ne s'applique pas : la vérification n'en a pas besoin, et `demarrer` ne contrôle pas `node_modules`. Codes de sortie, sorties et format du refus : ADR-0017, section « Décision ».

## Découpage et ordre

Le backend d'abord : les tests de devops lancent l'entrée de vérification (F-031-AC4), et le relais de `demarrer` lit son format. Un commit par bloc.

| Bloc | Agent                       | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Critères                        |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0    | dev                         | `.dependency-cruiser.cjs` : la règle ci-dessous. Elle passe sur le code actuel (E4), donc peut entrer avant B2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | H6                              |
| B1   | agent-backend               | `configuration.ts` : liste fermée des raisons (constante ordonnée, l'ordre est la priorité) ; `ErreurConfiguration` garde `variables` et `message` (la première ligne) et porte les raisons ; une fonction pure rend le texte complet du refus. `main.ts` écrit ce texte. Tests : une raison par cas d'AC12, la valeur marquée et ses segments de quatre caractères absents (AC13), tests de F-008-AC12, F-008-AC14 et F-009-AC18 gardés ; l'assertion de sortie d'erreur exacte de `processus.test.ts` attend le texte complet (plus stricte, rien de retiré)                                                                                                                                                                                                                                                                                                             | AC12, AC13                      |
| B2   | agent-backend               | `src/verifier-configuration.ts` (contrat d'ADR-0017) ; test de processus réel (acceptée : code 0 et les deux lignes ; refusée : code 1, le texte, sortie standard vide ; rien n'écoute) ; test d'atteignabilité des imports, comme celui de `main.ts` dans `synchro-coutures.test.ts` (seuls `configuration.ts` et `zod`) ; couture d'AC14 : fichiers d'`apps/`, `packages/` et `infra/` (hors `node_modules`) qui citent `lireConfiguration`, `ErreurConfiguration`, `MOT_DE_PASSE_FACTICE`, `SECRET_FACTICE` ou la fonction du texte, énumérés ; commentaire d'en-tête de `main.ts` et `coutures.test.ts` mis d'accord (deux fichiers touchent au `process`) ; `apps/server/.env.example` : `URL_PUBLIQUE=http://127.0.0.1:5173`, `ORIGINES_AUTORISEES=http://127.0.0.1:5173,http://127.0.0.1:5174`, commentaires « `preparer` copie ce fichier et y écrit… » (H4, AC29) | AC8 (côté serveur), AC14, AC29  |
| D1   | agent-devops                | `infra/pile.sh` : `aide`, `preparer`, `etat`, `arreter` ; `infra/verification-configuration.yml` ; scripts racine `pile` et `fumee` (fichier partagé, diff ci-dessous) ; `infra/.env.example` (commentaires) ; aide de test commune (arbre temporaire, `docker` et `curl` de substitution) ; tests d'AC1 à AC7, AC24, AC25, AC28 (couture des ports de Vite et de Playwright) et AC31 (`bash -n`, constructions de bash 4 refusées, un cas fautif chacune)                                                                                                                                                                                                                                                                                                                                                                                                                 | AC1–AC7, AC24, AC25, AC28, AC31 |
| D2   | agent-devops                | `demarrer` et `accorder` ; tests avec substitution, dont la couture d'AC4 (fichiers créés par `preparer`, environnement bâti comme Compose le bâtit, avec les quatre variables lues dans `infra/docker-compose.yml` par `tests/regles/compose.ts`, puis `node apps/server/src/verifier-configuration.ts` réel : code 0) et le port tenu par un vrai processus en écoute (AC18, `lsof` réel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | AC4, AC8–AC11, AC15–AC23        |
| D3   | agent-devops                | `infra/fumee.sh` : constats 1 à 10 inchangés, (a) à (f) en 11 à 16, nettoyage en 17 ; règle statique de l'ordre (`tests/regles/fumee.ts`, qui attend aujourd'hui 1 à 11) ; message d'absence d'`apps/server/.env` qui nomme `pnpm -w pile preparer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | AC26, AC27 (forme)              |
| D4   | agent-devops                | `README.md` (« Lancer le serveur et la base » : sous-commandes, mode hôte, `/pret` à 503, table des six incidents ; « Contrôles » : la fumée), `infra/RETOUR-ARRIERE.md` section 3 (renvoi à `accorder`), test « chaque sous-commande d'`aide` est citée par le README »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | AC29                            |
| A    | agent-architecte-conception | après D4 : `ARCHITECTURE.md` aligné (entrée de vérification, commande de la pile, flux de `demarrer`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                               |

## Interface entre `pile.sh` et la fumée, et les tests

`pile.sh` résout la racine depuis son propre chemin (`$(dirname "$0")/..`, `pwd -P`), jamais depuis le dossier de lancement. Trois variables d'environnement, absentes de l'aide et décrites dans son en-tête, servent à la fumée et aux tests :

- `PILE_PROJET` (défaut `notionlike`) : le projet Compose (`-p`). Le volume des données est `${PILE_PROJET}_donnees-base`.
- `PILE_ENV_INFRA` (défaut `<racine>/infra/.env`) : le fichier des variables de Compose. Il est passé par `--env-file` à chaque appel, et c'est lui que `preparer` crée et qu'AC9, AC18 et AC20 lisent. `pile.sh` retire `POSTGRES_PASSWORD`, `PORT_PUBLIE_BASE` et `PORT_PUBLIE_SERVEUR` de son environnement avant d'appeler Compose : une variable du shell l'emporterait sur le fichier.
- `PILE_SURCHARGE` (défaut vide) : un fichier Compose de plus, placé après `infra/docker-compose.yml`. La fumée y met les origines qu'écrit `preparer` (H12, constat (c)). `demarrer`, la vérification comprise, voit donc le service tel que la fumée le lance.

La fumée appelle `PILE_PROJET=notionlike-fumee PILE_ENV_INFRA=<fichier temporaire, mode 600> bash infra/pile.sh …`. Elle garde le fichier `apps/server/.env` du dev (H12) : si ce fichier n'a pas l'adresse du client, la vérification la refuse. L'avertissement d'AC11 y est attendu, le mot de passe de la fumée n'étant pas celui du mode hôte.

Ordre de `demarrer` :

1. poste (AC17) ;
2. fichiers manquants créés comme par `preparer` ;
3. `POSTGRES_PASSWORD` (AC9) ;
4. ports, moins ceux des conteneurs du projet (AC18) ;
5. présence du volume, notée à cette étape ;
6. `docker compose build` ;
7. vérification (AC8, AC10) et avertissement (AC11) ;
8. si le volume existait : la base seule, puis l'épreuve du mot de passe (AC20) ; en cas de refus, la base revient à l'état trouvé ;
9. `up -d --wait --build` (AC15, AC19) ;
10. `GET /pret`.

Tests sans Docker (AC31). L'aide de test copie dans un `mkdtemp` les seuls fichiers dont `pile.sh` a besoin :

- `infra/pile.sh` ;
- `infra/docker-compose.yml` ;
- `infra/verification-configuration.yml` ;
- les deux `.env.example`.

Elle met en tête du `PATH` un `docker` et un `curl` de substitution. Chacun consigne ses arguments, un appel par ligne, et répond selon le scénario. `lsof` reste réel pour le seul test d'AC18. Les secrets sont cherchés dans les deux sorties et dans ces arguments consignés (AC6). Seul AC1 lance `pnpm -w pile aide` sur le dépôt réel : `aide` ne lit aucun fichier de configuration. Le projet `infra` de `vitest.config.ts` couvre déjà `infra/tests/**`. Les délais se règlent par test, comme dans `processus.test.ts`.

## Points d'attention pour les producteurs

- **Arguments visibles par `ps`** (AC6, AC22). Un secret ne passe que par des commandes internes de bash (`printf`, `[ ]`, `case`, redirections), une variable d'environnement transmise par son nom (`docker compose exec -e PGPASSWORD`) ou l'entrée standard. Il ne passe jamais en argument de `sed`, `grep`, `awk`, `docker` ou `psql`.
- **Création exclusive et sans reste** (AC5, AC7). Un fichier existant, même lien cassé ou dossier, est laissé tel quel, sans en suivre la cible (`[ -e ] || [ -L ]`). Sinon :
  1. `umask 077` ;
  2. fichier temporaire du même dossier, nommé `.env.<aléa>.local`, déjà ignoré par `.env.*.local`, créé sous `set -C` ;
  3. contenu entier écrit dedans ;
  4. `ln` sans `-f` vers le chemin final, qui échoue si quelque chose y est apparu ;
  5. `rm` du nom temporaire, posé aussi dans un `trap`.

  Rien de partiel n'atteint le chemin final, et aucun `.gitignore` ne change.

- **Épreuve du mot de passe** (AC20, H7). Dans l'image `postgres`, `initdb` laisse `trust` pour `127.0.0.1` et pour la socket locale : `psql -h 127.0.0.1` dans le conteneur de la base n'éprouve rien, et `pg_isready` non plus. L'épreuve doit passer par la règle `scram-sha-256` (`host all all all`), comme la migration et le serveur, qui viennent d'un autre conteneur (par exemple `-h base`, résolu sur l'adresse du réseau). La règle est à confirmer par la veille (H7), sur `postgres:18.6`.
- **Rétention** (AC19, AC24). `retention.test.ts` lit tout `infra/` hors `fumee.sh`, donc `pile.sh` et la surcharge. Aucun message ne cite `down -v`, `--volumes`, `docker volume rm` ni un `prune`, même pour l'interdire.
- **Tests existants à mettre d'accord** : `processus.test.ts` (texte complet du refus), `tests/regles/fumee.ts` et `compose.test.ts` (constats 1 à 17), `coutures.test.ts` du serveur (deuxième fichier qui touche au `process`), `exemples.test.ts` (clés de l'exemple inchangées, nouvelles valeurs non secrètes).
- **À confirmer par la veille, en parallèle** : `!reset` et `--progress quiet` sous Compose 2.24.0 (seul v5.6.0 essayé), `pnpm -w` lancé d'un sous-dossier sous pnpm 12.10.1, `lsof` sous Docker Desktop, cookie `Secure` sur `http://127.0.0.1` par navigateur (H5).

## Ce que seuls la fumée et le dev prouvent

Seule la sortie de `pnpm -w fumee`, lancée par le dev sur le dernier commit de code et versée dans `MEMORY/features/F-031.md`, prouve sur une pile réelle (AC27) :

- AC15, AC16 ;
- AC18 sous Docker Desktop ;
- AC20 à AC22, AC24, AC26, AC27 ;
- l'absence de volume après une vérification refusée, sur la version de Compose du dev (ADR-0017).

Sont aussi relevés à la main par le dev : le bout en bout et une inscription sur `http://127.0.0.1:5173`, navigateur nommé (AC28), et la tenue du cookie `Secure` dans Safari (H5). Sans ces relevés, ces critères restent `UNVERIFIED`.

## Fichiers protégés et partagés

**`.dependency-cruiser.cjs` (protégé, à commiter par le dev).** Diff vérifié par `git apply --check`. Le fichier obtenu se charge (`require`), passe Prettier et ESLint, et la règle est éprouvée par E4 et E5 :

```diff
diff --git a/.dependency-cruiser.cjs b/.dependency-cruiser.cjs
index 3762a9e..63ec2c1 100644
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -66,6 +66,14 @@ module.exports = {
         dependencyTypesNot: ["core"],
       },
     },
+    {
+      name: "serveur-verification-de-configuration-confinee",
+      severity: "error",
+      comment:
+        "F-031 H6, ADR-0017 : l'entrée de vérification de la configuration et configuration.ts n'importent que configuration.ts et zod (ni base, ni réseau, ni module de Node) ; lancée avec les secrets du service, la vérification n'ouvre aucune connexion et n'écoute sur aucun port.",
+      from: { path: "^apps/server/src/(configuration|verifier-configuration)\\.ts$" },
+      to: { pathNot: ["^apps/server/src/configuration\\.ts$", "(^|/)node_modules/zod/"] },
+    },
     {
       name: "db-reserve-au-serveur",
       severity: "error",
```

**`package.json` racine (partagé, pas protégé : écrit par agent-devops en D1, signalé, à approuver par le dev).** Diff vérifié de même :

```diff
diff --git a/package.json b/package.json
index 893aa80..7a0dcf6 100644
--- a/package.json
+++ b/package.json
@@ -13,7 +13,9 @@
     "format": "prettier --write --ignore-unknown .",
     "format:check": "prettier --check --ignore-unknown .",
     "contrats": "depcruise --config .dependency-cruiser.cjs apps packages",
-    "typecheck": "pnpm -r run typecheck"
+    "typecheck": "pnpm -r run typecheck",
+    "pile": "bash infra/pile.sh",
+    "fumee": "bash infra/fumee.sh"
   },
   "devDependencies": {
     "@eslint/js": "^10.0.1",
```

Aucun autre fichier protégé :

- `vitest.config.ts` : le projet `infra` couvre déjà `infra/tests/**`.
- Aucun nouveau paquet.
- `.gitignore` inchangé : le fichier temporaire de `preparer` suit `.env.*.local`. Le fichier `apps/server/.env.sauvegarde` du dev reste un prérequis de la spec, à renommer en `.env.sauvegarde.local` ou à sortir du dépôt.
