# Retour arrière de la pile locale

Procédure de la pile de travail décrite par `infra/docker-compose.yml` (F-008, ADR-0005, ADR-0006). Le dev la déroule à la main ; aucun agent ne la lance.

## Ce que la pile contient

| Élément                   | Valeur                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Projet Compose            | `notionlike` (fixé par `name:`, indépendant du dossier de lancement)                           |
| Services                  | `base` (PostgreSQL), `migration` (exécution unique), `serveur`                                 |
| Volume des données        | `donnees-base` dans le fichier, `notionlike_donnees-base` pour Docker                          |
| Montage                   | `/var/lib/postgresql` ; les données de la majeure 18 sont dans `/var/lib/postgresql/18/docker` |
| Image de la base          | épinglée par étiquette et empreinte : `postgres:<version>@sha256:<empreinte>`                  |
| Image serveur / migration | construite depuis le dépôt (`infra/Dockerfile`, image de Node épinglée par empreinte)          |
| Rôle et base              | `notionlike` / `notionlike`                                                                    |

Toutes les commandes ci-dessous se lancent depuis `infra/`, avec `infra/.env` et `apps/server/.env` en place : le fichier Compose les exige pour toute commande, `exec` et `stop` compris. Les sauvegardes vont dans `~/sauvegardes-notionlike/`, hors du dépôt : elles contiennent les données et ne sont jamais versées.

## Règle : le volume des données n'est jamais supprimé

- La pile de travail s'arrête par `docker compose down` sans option : conteneurs et réseau sont supprimés, le volume reste (constat 7 de `infra/fumee.sh`).
- Interdits sur la pile de travail : l'option `-v` (ou `--volumes`) de `docker compose down`, `docker volume rm notionlike_donnees-base`, `docker volume prune` et `docker system prune --volumes`. Aucun de ces gestes ne « répare » une migration ou un mot de passe : il efface la base.
- Seul `infra/fumee.sh` supprime un volume : celui de sa pile jetable, sous le projet à part `notionlike-fumee`.
- Garde-fou : `infra/tests/retention.test.ts` (dans `pnpm test`) refuse ces commandes dans tout fichier d'`infra/` hors `fumee.sh`, ainsi qu'un `tmpfs`, un volume anonyme, un dossier du poste ou un volume au pilote `tmpfs` monté sur `/var/lib/postgresql`.

Vérifier que le volume est là :

```sh
docker volume ls --filter name=notionlike_donnees-base
```

## 1. Sauvegarde manuelle

Obligatoire avant : une montée de version majeure de PostgreSQL (section 5) ; une migration destructive (suppression de table ou de colonne, changement de type, réécriture ou suppression de lignes) ; un retour du code du serveur en deçà d'une migration appliquée (section 2) ; une restauration (section 4), pour garder l'état présent.

```sh
mkdir -p ~/sauvegardes-notionlike
SAUVEGARDE=~/sauvegardes-notionlike/notionlike-$(date +%Y%m%d-%H%M%S).dump
docker compose exec -T base pg_dump -U notionlike -d notionlike --format=custom >"$SAUVEGARDE"
```

Vérifier qu'elle se relit et qu'elle porte la table de suivi des migrations :

```sh
docker compose exec -T base pg_restore --list <"$SAUVEGARDE" | grep __drizzle_migrations
```

La commande doit afficher au moins une ligne ; sinon la sauvegarde n'est pas utilisable et l'opération prévue attend. La sauvegarde est gardée jusqu'à ce que la nouvelle version ait servi sans incident.

## 2. Revenir à l'image précédente

### Base : empreinte précédente de `postgres`

Retrouver les lignes `image:` successives dans l'historique :

```sh
git log -p -- docker-compose.yml | grep -E '^[-+] +image: postgres:'
```

Remettre dans `docker-compose.yml` la ligne précédente, étiquette et empreinte ensemble (ou `git revert` du commit de mise à jour), puis :

```sh
docker compose pull base
docker compose up -d --wait
docker compose exec -T base psql -U notionlike -d notionlike -At -c 'select version()'
docker compose exec -T base psql -U notionlike -d notionlike -At -c 'show data_directory'
```

`select version()` annonce la version remise ; `show data_directory` répond `/var/lib/postgresql/<majeure>/docker`. Entre deux versions d'une même majeure (18.x), le format des données est le même : l'aller et le retour se font sur le volume en place. Entre deux majeures, voir la section 5. Si le registre ne sert plus l'empreinte, le retour est impossible : avant toute mise à jour, noter l'empreinte servie avec `docker image ls --digests postgres`.

### Serveur et migration : code précédent

Leur image est construite depuis le dépôt, sans empreinte au registre : revenir à l'image précédente, c'est reconstruire depuis le commit précédent (`git revert` du commit fautif sur la branche de travail), puis :

```sh
docker compose up -d --wait --build
```

Une migration déjà appliquée le reste : le migrateur ne compare que l'horodatage de la dernière migration appliquée (spec F-008, H13), donc un code plus ancien n'applique rien, finit en code 0, et le serveur précédent tourne sur le schéma plus récent. S'il ne le supporte pas, restaurer la sauvegarde prise avant cette migration (section 4).

## 3. Échec d'une migration

Ce qui se passe (ADR-0005, H13 ; F-008-AC16, AC21 ; constat 9 de `infra/fumee.sh`) : toutes les migrations en attente d'un lancement passent dans une seule transaction ; à la première erreur, elle est annulée en entier et aucune migration de ce lancement n'est appliquée. Le service `migration` sort en code 1, le service `serveur` reste à l'état `created` et ne démarre jamais, `docker compose up -d --wait` finit en code différent de 0. Les données sont celles d'avant le lancement.

Constater :

```sh
docker compose ps -a
docker compose logs migration
docker compose exec -T base psql -U notionlike -d notionlike -At -c 'select id, hash, created_at from drizzle.__drizzle_migrations order by created_at'
```

Attendu : `migration` sorti en code 1, `serveur` à `created`, le journal qui commence par « La migration a échoué : aucune migration de ce lancement n'est appliquée. », et la table de suivi identique à celle d'avant le lancement.

Puis, selon la cause donnée par le journal :

- **Échec d'authentification** : le mot de passe d'`infra/.env` a changé après le premier démarrage, alors que l'image ne lit `POSTGRES_PASSWORD` que sur un volume vide (ADR-0006). `pnpm -w pile demarrer` le dit avant de lancer la migration (F-031-AC20). Deux issues, depuis n'importe quel dossier du dépôt : remettre l'ancien mot de passe dans `infra/.env` et relancer `pnpm -w pile demarrer` ; ou garder le nouveau et le donner au volume par `pnpm -w pile accorder`, puis `pnpm -w pile demarrer`. `accorder` passe par la connexion locale du conteneur de la base et `\password` de `psql` (empreinte calculée côté client : le mot de passe n'apparaît ni en argument ni dans le journal de la base), sans demander l'ancien et sans toucher aux données (F-031-AC21, AC22).
- **Erreur dans une migration** : la corriger par un nouveau commit (une migration jamais appliquée nulle part peut être corrigée ; une migration déjà appliquée ne se modifie pas), puis `docker compose up -d --wait --build`.
- **Retour au code précédent** : section 2 ; rien n'ayant été appliqué, le code précédent démarre sur le schéma inchangé.

Une migration qui a réussi mais a détruit ou altéré des données ne relève pas de cette section : restaurer la sauvegarde prise avant elle (section 4).

## 4. Restaurer une sauvegarde

D'abord une sauvegarde de l'état présent (section 1), puis, `SAUVEGARDE` désignant le fichier à restaurer, vérifié comme en section 1 :

```sh
docker compose stop serveur
docker compose exec -T base dropdb -U notionlike --force notionlike
docker compose exec -T base createdb -U notionlike -O notionlike notionlike
docker compose exec -T base pg_restore -U notionlike -d notionlike --no-owner --exit-on-error --single-transaction <"$SAUVEGARDE"
```

La base est vidée puis recréée plutôt que restaurée par-dessus : une table créée par une migration postérieure à la sauvegarde resterait sinon en place et ferait échouer la migration suivante. Remettre ensuite le code du commit dont la sauvegarde porte la dernière migration (section 2), puis :

```sh
docker compose up -d --wait --build
```

## 5. Montée de version majeure de PostgreSQL

C'est une feature `structurel` : le test statique impose `postgres:18.6` (F-008-AC20). Déroulé prévu :

1. Sauvegarde vérifiée (section 1).
2. Ligne `image:` de la nouvelle majeure, étiquette et empreinte relues au registre, avec un `trivy image`.
3. Démarrer la seule base, sur une grappe neuve :

   ```sh
   docker compose up -d --wait base
   docker compose exec -T base psql -U notionlike -d notionlike -At -c 'show data_directory'
   ```

   La nouvelle image range ses données dans `/var/lib/postgresql/<nouvelle majeure>/docker`, sur le même volume ; celles de la majeure 18 restent dans `/var/lib/postgresql/18/docker`, sans y être touchées. Le vérifier par `docker compose exec base ls /var/lib/postgresql` avant d'aller plus loin.

4. Restaurer la sauvegarde dans la base neuve, puis lancer le reste de la pile :

   ```sh
   docker compose exec -T base pg_restore -U notionlike -d notionlike --no-owner --exit-on-error --single-transaction <"$SAUVEGARDE"
   docker compose up -d --wait
   ```

Retour arrière : remettre la ligne `image:` de la 18.6 (section 2). Elle retrouve `/var/lib/postgresql/18/docker` tel qu'avant la montée. Ce qui a été écrit depuis n'y est pas, et une sauvegarde faite par la nouvelle majeure ne se restaure pas dans l'ancienne : un retour arrière après la montée perd ces écritures, d'où une montée faite quand la base n'est pas en usage, et un retour décidé aussitôt.
