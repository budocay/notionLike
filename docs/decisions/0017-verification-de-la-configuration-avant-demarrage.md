# ADR-0017 — Vérification de la configuration avant démarrage : troisième entrée de l'image, lancée par `compose run` sans volume

Statut : proposé
Date : 2026-10-16

## Contexte et problème

F-031 (spec `specs/F-031.md`, validée en `eed4af0`) fait vérifier la configuration du service `serveur` par `infra/pile.sh demarrer` avant tout lancement : ni base démarrée, ni volume créé, ni migration lancée tant que la configuration est refusée (F-031-AC8). La vérification passe par le code du serveur lui-même, `lireConfiguration`, sans seconde copie de ses règles (H6), et voit l'environnement que le conteneur reçoit réellement : `apps/server/.env` en entier, puis les quatre variables que le fichier Compose impose (`NODE_ENV=production`, `HOTE`, `PORT`, `URL_BASE_DONNEES` bâtie sur `POSTGRES_PASSWORD`).

Trois choses se défont mal une fois `pile.sh`, ses tests et la fumée écrits dessus :

- ADR-0006 (accepté) fixe deux points d'entrée à l'image, `apps/server/src/main.ts` et `packages/db/src/migrer.ts`, et fait de `main.ts` le seul fichier qui touche au `process` global. Une troisième entrée l'amende.
- Le contrat entre le serveur et `pile.sh` : codes de sortie, ce qui va sur chaque sortie, format des raisons (F-031-AC12), que `pile.sh` relaie et complète.
- Le mécanisme de lancement. H6 recommande `docker compose run --rm --no-deps serveur`, « qui ne crée pas le volume ». L'essai le dément (ci-dessous).

Essais du 2026-10-16, Docker Engine 29.8.2, Docker Compose v5.6.0, projets jetables `f031-essai-*` supprimés ensuite (relevés dans `docs/decisions/F-031-conception.md`) :

- E1 : un fichier Compose à deux services (une base avec un volume nommé, un service qui affiche son environnement), `run --rm --no-deps` du second : le volume `<projet>_donnees` et le réseau `<projet>_default` sont créés. `--no-deps` ne démarre pas la base, mais Compose crée tous les volumes déclarés du projet.
- E2 : même lancement avec un second fichier `-f` qui pose `volumes: !reset []` sur la base, `volumes: !reset {}` au niveau du projet et `network_mode: none` sur le service lancé : aucun volume créé, le réseau du projet seul l'est (supprimé par `down`) ; le code de sortie du conteneur est rendu tel quel (3).
- E3 : le vrai `infra/docker-compose.yml`, la même surcharge, l'image `notionlike-serveur` du poste, un `apps/server/.env` factice qui fixe `NODE_ENV=development` : le conteneur reçoit `NODE_ENV=production`, `HOTE=0.0.0.0`, `PORT=3000`, `URL_BASE_DONNEES` vers `base:5432`, et `URL_PUBLIQUE` et `ORIGINES_AUTORISEES` du fichier ; avec `--progress quiet`, la sortie d'erreur est vide et la sortie standard ne porte que celle du conteneur ; code rendu tel quel ; aucun volume, aucun conteneur restant.

## Options étudiées

1. **`docker compose run --rm --no-deps serveur` tel quel** (H6) : rejetée. Il crée `notionlike_donnees-base` (E1), contre F-031-AC8.
2. **Le même lancement, avec une surcharge Compose versée qui retire les volumes et le réseau du service lancé** (retenue). Il voit l'environnement exact du service, dans l'image, sans Node sur le poste. Il ne crée aucun volume (E2, E3).
3. **Node du poste, avec les deux fichiers et les quatre variables recopiées dans `pile.sh`** (variante de H6) : rejetée. Elle fait une seconde copie de ce que le fichier Compose impose, celle qui avait divergé le 2026-10-16. `node --env-file` et `env_file` de Compose ne lisent pas un fichier de la même manière (guillemets, interpolation). Elle demande aussi `node_modules` sur le poste (F-031-AC17).
4. **`docker compose config --format json` lu par un script Node du poste** : rejetée. Elle demande un lecteur JSON sur le poste (ni `jq` ni bash 3.2 n'en offrent), et lie le code du serveur au format du modèle Compose.
5. **Une option `--verifier` de `main.ts`** au lieu d'un fichier à part : rejetée. `main.ts` importe `@notionlike/db` et `service.ts`, donc le pilote `pg` et l'écoute. Un fichier qui n'importe que `configuration.ts` se prouve sans base ni réseau par une règle de dépendances.
6. **Les règles de la configuration réécrites en shell** : exclue par H6 et F-031-AC8.

## Décision

**Entrée.** `apps/server/src/verifier-configuration.ts`, lancée par `node apps/server/src/verifier-configuration.ts`. L'image la porte sans changer le Dockerfile, qui copie déjà `apps/server/src`. Elle lit `process.env`, rien d'autre. Elle n'importe que `./configuration.ts`, qui n'importe que `zod`. La règle `serveur-verification-de-configuration-confinee` de `.dependency-cruiser.cjs` le tient : elle n'ouvre aucune connexion et n'écoute sur aucun port.

**Contrat de sortie.**

| Cas            | Code                                        | Sortie standard                                                                                                                                                               | Sortie d'erreur                        |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| acceptée       | 0                                           | exactement deux lignes, `URL_PUBLIQUE=<origine>` puis `ORIGINES_AUTORISEES=<origines séparées par des virgules>`, valeurs de la `Configuration` rendue (H4 : pas des secrets) | vide                                   |
| refusée        | 1                                           | vide                                                                                                                                                                          | le texte du refus (ci-dessous), entier |
| tout autre cas | autre, ou 1 sans la première ligne attendue | non lue                                                                                                                                                                       | non relayée                            |

**Texte du refus (F-031-AC12, AC13).** Il est le même pour `main.ts` et pour l'entrée de vérification, produit par une seule fonction pure de `configuration.ts`. La première ligne reste `ErreurConfiguration.message`, inchangé : `Configuration invalide : <variables>`. Suit une ligne `- <VARIABLE> : <raison>` par variable, dans l'ordre de `variables`. La raison est prise dans la liste fermée d'AC12, où l'ordre fixe la priorité. Le texte finit par un saut de ligne. `ErreurConfiguration` garde `variables` et `message`, et porte en plus les raisons. Aucune raison n'est tirée d'une valeur.

**Lancement par `pile.sh`.**

```sh
docker compose -p "$PROJET" --env-file "$ENV_INFRA" \
  -f infra/docker-compose.yml [-f "$SURCHARGE"] -f infra/verification-configuration.yml \
  --progress quiet run --rm --no-deps -T serveur node apps/server/src/verifier-configuration.ts
```

`infra/verification-configuration.yml` est versé ; il est en tout et pour tout :

```yaml
services:
  base:
    volumes: !reset []
  serveur:
    network_mode: none
volumes: !reset {}
```

`-T` refuse le terminal : sans lui, Compose en alloue un quand l'entrée standard en est un, et les deux sorties se mêlent. L'image est construite avant ce lancement (`docker compose build`, sortie visible), pour que la vérification lise le code du dépôt et non une image ancienne. `pile.sh` reconnaît le refus au code 1 et à la ligne qui commence par `Configuration invalide : `. Il relaie ce texte de cette ligne à la fin, ce qui reste juste même si `--progress quiet` laissait passer une ligne de Compose. Il ajoute ensuite, pour chaque variable, le fichier à corriger (F-031-AC8). Dans tout autre cas, il dit que la vérification n'a pas pu se faire, avec son code, sans rien relayer. Le contrôle de l'adresse du client (F-031-AC10) se fait dans `pile.sh`, sur les deux lignes de la sortie standard : c'est une règle du poste de travail, pas une règle du serveur.

## Conséquences

- Amendement prévu d'ADR-0006 (accepté), à reporter dans son texte quand le dev acceptera le présent ADR, pas avant. Il porte sur deux points :
  - l'image a trois points d'entrée, `apps/server/src/verifier-configuration.ts` s'ajoutant à `main.ts` et `migrer.ts` ;
  - deux fichiers touchent au `process` global, `main.ts` et `verifier-configuration.ts`.

  La barrière d'ADR-0006 vaut aussi pour la nouvelle entrée : un test la lance par un vrai processus `node` (`apps/server/test/verifier-configuration.test.ts`). Le Dockerfile ne change pas.

- La liste des constats de la fumée d'ADR-0006 s'allonge par F-031-AC26 : les constats 1 à 10 gardent leur numéro et leur sens, puis viennent les six constats de F-031 et le nettoyage, en dernier.
- Le format du refus devient un contrat lu par `pile.sh` et par les tests. Seule la première ligne est fixe depuis F-008. Changer un libellé de raison touche `configuration.ts`, ses tests et rien dans `pile.sh`, qui relaie sans interpréter, hors du nom de la variable en tête de ligne.
- Le refus de `main.ts` gagne des lignes : le test de processus qui attend la sortie d'erreur exacte (`apps/server/test/processus.test.ts`, F-008-AC12) attend le texte complet. L'assertion devient plus stricte, aucune n'est retirée (F-031-AC14).
- `docker compose run` crée le réseau `<projet>_default` même refusé (E2) : sans effet sur les données, il disparaît au prochain `arreter`.
- Le comportement mesuré (E1) est celui de Compose v5.6.0. Si une version future cessait de créer les volumes au `run`, la surcharge resterait inoffensive. La version minimale reste 2.24.0 (F-031-AC17). Que les versions 2.24.0 à 2.24.3 lisent `!reset` et `--progress quiet` n'est PAS vérifié : seule Compose v5.6.0 a été essayée, ici comme par la veille (`MEMORY/VEILLE.md`, `df931af`). C'est probable, `!reset` existant déjà dans compose-go 1.13.5 (2023), mais non prouvé. Les notes de Compose 2.24.4 disent seulement qu'elle corrige la fusion de plusieurs fichiers Compose (compose-go v2.0.0-rc3). Relever la version minimale à 2.24.4 est une décision du dev ; à défaut, seule une fumée lancée sur une 2.24.x le prouverait. Une version qui ne lirait pas `!reset` ferait échouer le chargement du modèle, sans rien créer, et `pile.sh` le dirait comme une vérification impossible.
- Ce qui n'est prouvé que sur une pile réelle : l'absence de volume après un refus, sur la version de Compose du dev. Les tests de `pnpm test` constatent les arguments exacts passés à `docker` (`--no-deps`, `-T`, la surcharge en dernier) et la forme de la surcharge (`infra/tests/pile-demarrer.test.ts`). Les essais E1 à E3 de ce document en sont le relevé.

## Écarts du code livré avec la note de conception

Relevés le 2026-10-16 sur le code d'agent-devops (`7801de3` à `b5c6ea8`). Aucun ne change la décision ci-dessus.

- **Découpage.** Le code de `demarrer` et d'`accorder` est entré dans `infra/pile.sh` dès D1 (`7801de3`, le script entier), et non en D2 comme le prévoyait `F-031-conception.md`. D2 (`d18bb92`) n'apporte que leurs tests et la couture d'AC4.
- **Construction de l'image.** Comme le prévoient la note et la section « Décision », `demarrer` construit l'image par un `docker compose build` visible (fonction `demarrer` de `pile.sh`), avant la vérification. Il n'emploie pas `run --build`, que la veille cite aussi comme possible. Sans l'une ou l'autre, `run` lirait une image périmée (veille).
- **Publication du fichier de configuration.** Le fichier est publié par `link` (link(2)), et non par `ln` comme l'écrivait la note (fonction `creer_si_absent`). `ln` sans `-f` crée le lien _dans_ un dossier présent au chemin final ; `link` refuse. F-031-AC5 couvre ce cas, d'où l'écart.
