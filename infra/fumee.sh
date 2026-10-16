#!/usr/bin/env bash
# Script de fumée : constats 1 à 10 de l'ADR-0006 (F-008-AC19 pour les constats 1 à 8, F-008-AC21
# pour le 9, F-008-AC20 pour le 10), puis ceux de la commande de la pile (F-031-AC26) : 11 configuration
# refusée sans volume créé, puis démarrage par `pile.sh demarrer` sans volume, 12 second démarrage,
# 13 inscription selon l'origine, 14 arrêt qui garde le volume, 15 mot de passe désaccordé puis remis
# en accord, 16 port du serveur déjà pris ; 17 nettoyage, en dernier, et pile de travail intacte
# (F-031-AC27).
#
# Lancé par le dev, Docker démarré, depuis n'importe quel dossier du dépôt : pnpm -w fumee
# Prérequis : Docker avec Compose 2.24.0 ou plus récent, curl, trivy, node, et le fichier
# apps/server/.env, que le fichier Compose exige (pnpm -w pile preparer le crée).
#
# La pile de fumée est à part : projet « notionlike-fumee », ports 55432 et 53000 du poste, mot de
# passe tiré au hasard pour ce lancement. Elle ne touche ni au volume, ni aux conteneurs, ni aux ports
# de la pile de travail (projet « notionlike »), ce que le constat 17 vérifie ; tout ce qu'elle crée
# (conteneurs, volume, images construites) est supprimé à la fin, que le script réussisse ou non.
set -euo pipefail
export LC_ALL=C

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
PROJET="notionlike-fumee"
export PORT_PUBLIE_BASE=55432
export PORT_PUBLIE_SERVEUR=53000
# Mot de passe de 32 caractères tirés de A-Z a-z 0-9 : la recherche de ses segments de 4 caractères
# dans le journal de la base (constat 15) ne bute pas sur des segments hexadécimaux du journal.
tirer_un_mot_de_passe() {
  local alea
  alea="$(head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
  [ "${#alea}" -ge 32 ] || { printf 'ECHEC : le générateur aléatoire du poste n a pas répondu\n' >&2; exit 1; }
  printf '%s' "${alea:0:32}"
}
POSTGRES_PASSWORD="$(tirer_un_mot_de_passe)"
export POSTGRES_PASSWORD

VERSION_ATTENDUE="PostgreSQL 18.6 "
DONNEES_ATTENDUES="/var/lib/postgresql/18/docker"
TABLE_DE_SUIVI="drizzle.__drizzle_migrations"
TEMPORAIRE="$(mktemp -d)"
FICHIERS=(-f "$RACINE/infra/docker-compose.yml")
CONSTAT_EN_COURS=0
CODE_HTTP=""
DUREE=""
PROJET_DE_TRAVAIL="notionlike"
VOLUME_DE_FUMEE="${PROJET}_donnees-base"
# Fichiers de la commande de la pile pour le projet de fumée (F-031 H12) : ses variables de Compose
# (mode 600) et une surcharge qui impose au serveur les origines qu'écrit `pile.sh preparer`.
ENV_DE_FUMEE="$TEMPORAIRE/infra.env"
SURCHARGE_DES_ORIGINES="$TEMPORAIRE/origines.yml"
SURCHARGE_REFUSEE="$TEMPORAIRE/refusee.yml"
ORIGINE_DU_CLIENT="http://127.0.0.1:5173"
ORIGINE_REFUSEE="http://localhost:5173"
ROUTE_D_INSCRIPTION="/api/auth/sign-up/email"
COOKIE_DE_SESSION="__Secure-better-auth.session_token="
RELEVE_AVANT=""
ECOUTEUR=""

compose() {
  docker compose -p "$PROJET" "${FICHIERS[@]}" "$@"
}

nettoyer() {
  if [ -n "$ECOUTEUR" ]; then kill "$ECOUTEUR" >/dev/null 2>&1 || true; fi
  compose down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TEMPORAIRE"
}
trap nettoyer EXIT

constat() {
  CONSTAT_EN_COURS="$1"
  printf '== constat %s : %s\n' "$1" "$2"
}

echec() {
  printf 'ECHEC constat %s : %s\n' "$CONSTAT_EN_COURS" "$1" >&2
  compose ps -a >&2 || true
  compose logs --tail 40 >&2 || true
  exit 1
}

# Interroge le serveur publié ; renseigne CODE_HTTP (000 si rien ne répond) et DUREE (secondes).
sonder() {
  local reponse
  reponse="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 8 \
    "http://127.0.0.1:$PORT_PUBLIE_SERVEUR$1" || true)"
  CODE_HTTP="${reponse%% *}"
  DUREE="${reponse##* }"
  printf 'GET %s : %s en %s s\n' "$1" "$CODE_HTTP" "$DUREE"
}

exiger_statut() {
  sonder "$1"
  [ "$CODE_HTTP" = "$2" ] || echec "GET $1 a répondu $CODE_HTTP, attendu $2"
}

# Sonde une fois par seconde, trente fois au plus, jusqu'au statut attendu.
attendre_statut() {
  local essai
  for essai in $(seq 1 30); do
    sonder "$1"
    [ "$CODE_HTTP" = "$2" ] && return 0
    sleep 1
  done
  echec "GET $1 n'a pas répondu $2 en $essai essais"
}

exiger_duree() {
  awk -v duree="$DUREE" -v minimum="$1" -v maximum="$2" \
    'BEGIN { exit !(duree >= minimum && duree < maximum) }' ||
    echec "réponse en $DUREE s, attendue entre $1 et $2 s"
}

requete() {
  compose exec -T base psql -U notionlike -d notionlike -At -c "$1"
}

# État et code de sortie d'un service, par exemple « exited 0 ».
etat_du_service() {
  compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' |
    awk -v service="$1" '$1 == service { print $2, $3 }'
}

conteneur() {
  compose ps -aq "$1"
}

exiger_table_de_suivi() {
  local table
  table="$(requete "select to_regclass('$TABLE_DE_SUIVI')")"
  [ "$table" = "$TABLE_DE_SUIVI" ] || echec "table de suivi absente : « $table »"
  printf 'table de suivi : %s\n' "$table"
}

verifier_le_poste() {
  local outil version
  for outil in docker curl trivy; do
    command -v "$outil" >/dev/null || echec "outil absent du poste : $outil"
  done
  docker info >/dev/null 2>&1 || echec "le démon Docker ne répond pas"
  version="$(docker compose version --short)"
  printf '%s\n' "${version#v}" | awk -F. '{ exit !($1 > 2 || ($1 == 2 && $2 >= 24)) }' ||
    echec "Docker Compose $version, attendu 2.24.0 ou plus récent"
  command -v node >/dev/null || echec "outil absent du poste : node"
  [ -f "$RACINE/apps/server/.env" ] ||
    echec "apps/server/.env absent : pnpm -w pile preparer le crée"
}

# Commande de la pile sur le projet de fumée (F-031-AC26) : mêmes ports, même mot de passe.
pile() {
  PILE_PROJET="$PROJET" PILE_ENV_INFRA="$ENV_DE_FUMEE" PILE_SURCHARGE="$SURCHARGE_DES_ORIGINES" \
    bash "$RACINE/infra/pile.sh" "$@"
}

# Écrit le fichier des variables de Compose de la fumée, mot de passe courant compris.
ecrire_l_env_de_fumee() {
  (
    umask 077
    printf 'POSTGRES_PASSWORD=%s\nPORT_PUBLIE_BASE=%s\nPORT_PUBLIE_SERVEUR=%s\n' \
      "$POSTGRES_PASSWORD" "$PORT_PUBLIE_BASE" "$PORT_PUBLIE_SERVEUR" >"$ENV_DE_FUMEE"
  )
}

# F-031-AC27 : date de création du volume de travail et conteneurs du projet de travail.
releve_de_la_pile_de_travail() {
  docker volume inspect --format '{{.CreatedAt}}' "${PROJET_DE_TRAVAIL}_donnees-base" 2>/dev/null ||
    printf 'volume absent\n'
  docker ps -a --filter "label=com.docker.compose.project=$PROJET_DE_TRAVAIL" \
    --format '{{.ID}} {{.State}}' | sort
}

exiger_le_volume_de_fumee() {
  docker volume inspect "$VOLUME_DE_FUMEE" >/dev/null 2>&1 || echec "volume $VOLUME_DE_FUMEE absent"
}

exiger_aucun_conteneur() {
  [ -z "$(compose ps -aq)" ] || echec "des conteneurs du projet de fumée existent : $(compose ps -a --format '{{.Service}} {{.State}}' | tr '\n' ' ')"
}

exiger_le_temoin() {
  local temoin
  temoin="$(requete "select valeur from fumee_temoin_pile")"
  [ "$temoin" = "31" ] || echec "la ligne témoin a disparu : « $temoin »"
  printf 'ligne témoin : %s\n' "$temoin"
}

# Inscription par la route du serveur publié ; le corps, qui porte le mot de passe du compte d'essai,
# passe par l'entrée standard de curl. Renseigne CODE_HTTP ; les en-têtes vont dans $TEMPORAIRE.
inscrire() {
  printf '{"name":"Fumee","email":"%s","password":"%s"}' "$2" "$MOT_DE_PASSE_DU_COMPTE" |
    curl -s -o /dev/null -D "$TEMPORAIRE/entetes" -w '%{http_code}' --max-time 8 \
      -H "Origin: $1" -H 'Content-Type: application/json' --data-binary @- \
      "http://127.0.0.1:$PORT_PUBLIE_SERVEUR$ROUTE_D_INSCRIPTION" >"$TEMPORAIRE/code" || true
  CODE_HTTP="$(cat "$TEMPORAIRE/code")"
  printf 'inscription, Origin %s : %s\n' "$1" "$CODE_HTTP"
}

cookie_de_session_pose() {
  grep -qi "^set-cookie: $COOKIE_DE_SESSION" "$TEMPORAIRE/entetes"
}

verifier_le_poste
RELEVE_AVANT="$(releve_de_la_pile_de_travail)"
compose down -v --remove-orphans >/dev/null 2>&1 || true

constat 1 "up -d --wait finit en code 0 et GET /pret répond 200"
compose up -d --wait --build || echec "up -d --wait a fini en code $?"
exiger_statut /pret 200

constat 2 "la migration a fini en code 0 et la table de suivi existe"
etat="$(etat_du_service migration)"
[ "$etat" = "exited 0" ] || echec "service migration : « $etat », attendu « exited 0 »"
printf 'migration : %s\n' "$etat"
exiger_table_de_suivi

constat 3 "PostgreSQL 18.6, données dans le volume nommé"
version="$(requete "select version()")"
printf '%s\n' "$version"
case "$version" in
"$VERSION_ATTENDUE"*) ;;
*) echec "version servie inattendue" ;;
esac
donnees="$(requete "show data_directory")"
[ "$donnees" = "$DONNEES_ATTENDUES" ] || echec "data_directory vaut « $donnees »"
montage="$(docker inspect --format '{{range .Mounts}}{{println .Type .Name .Destination}}{{end}}' \
  "$(conteneur base)" | awk 'NF')"
[ "$montage" = "volume ${PROJET}_donnees-base /var/lib/postgresql" ] ||
  echec "montages de la base : « $montage »"
printf '%s\n%s\n' "$donnees" "$montage"

constat 4 "base arrêtée : GET /pret répond 503 en moins de 3 secondes, GET /sante répond 200"
demarrage_avant="$(docker inspect --format '{{.State.StartedAt}} {{.RestartCount}}' "$(conteneur serveur)")"
compose stop base
exiger_statut /pret 503
exiger_duree 0 3
exiger_statut /sante 200

constat 5 "base redémarrée : GET /pret répond de nouveau 200 sans redémarrage du serveur"
compose start base
attendre_statut /pret 200
demarrage_apres="$(docker inspect --format '{{.State.StartedAt}} {{.RestartCount}}' "$(conteneur serveur)")"
printf 'serveur avant : %s\nserveur après : %s\n' "$demarrage_avant" "$demarrage_apres"
[ "$demarrage_avant" = "$demarrage_apres" ] || echec "le conteneur du serveur a redémarré"
[ "${demarrage_apres##* }" = "0" ] || echec "compteur de redémarrages du serveur non nul"

constat 6 "base figée : GET /pret répond 503 en 1,9 à 3 secondes, puis 200 une fois relâchée"
exiger_statut /pret 200
compose pause base
sonder /pret
compose unpause base
[ "$CODE_HTTP" = "503" ] || echec "GET /pret a répondu $CODE_HTTP, attendu 503"
exiger_duree 1.9 3
attendre_statut /pret 200

constat 7 "pile arrêtée puis relancée sans supprimer le volume : la table de suivi est toujours là"
requete "create table fumee_temoin as select 42 as valeur" >/dev/null
compose down
compose up -d --wait || echec "la relance a fini en code $?"
exiger_table_de_suivi
temoin="$(requete "select valeur from fumee_temoin")"
[ "$temoin" = "42" ] || echec "la ligne témoin écrite avant l'arrêt a disparu : « $temoin »"
printf 'ligne témoin : %s\n' "$temoin"
exiger_statut /pret 200

constat 8 "arrêt du serveur : code de sortie 0 en moins de 10 secondes"
serveur="$(conteneur serveur)"
SECONDS=0
compose stop serveur
duree_arret="$SECONDS"
code_arret="$(docker inspect --format '{{.State.ExitCode}}' "$serveur")"
printf 'code de sortie : %s, durée : %s s\n' "$code_arret" "$duree_arret"
[ "$code_arret" = "0" ] || echec "le serveur est sorti en code $code_arret"
[ "$duree_arret" -lt 10 ] || echec "arrêt du serveur en $duree_arret s"

constat 9 "migration en échec : up finit en erreur et le serveur n'est jamais démarré"
compose down -v
cat >"$TEMPORAIRE/migration-en-echec.yml" <<'SURCHARGE'
services:
  migration:
    environment:
      URL_BASE_DONNEES: "postgres://notionlike:mot-de-passe-errone@base:5432/notionlike"
SURCHARGE
FICHIERS+=(-f "$TEMPORAIRE/migration-en-echec.yml")
if compose up -d --wait; then
  echec "up -d --wait a fini en code 0 malgré la migration en échec"
fi
etat="$(etat_du_service migration)"
[ "$etat" = "exited 1" ] || echec "service migration : « $etat », attendu « exited 1 »"
etat_serveur="$(etat_du_service serveur)"
[ "${etat_serveur%% *}" = "created" ] || echec "service serveur : « $etat_serveur », attendu « created »"
printf 'migration : %s\nserveur : %s\n' "$etat" "$etat_serveur"
sonder /pret
[ "$CODE_HTTP" = "000" ] || echec "un serveur répond sur le port de fumée"

constat 10 "trivy image sur l'image du serveur : aucun constat HIGH ni CRITICAL"
image="$(docker inspect --format '{{.Config.Image}}' "$(conteneur serveur)")"
trivy image --exit-code 1 --severity HIGH,CRITICAL --scanners vuln "$image" ||
  echec "trivy image a fini en code $? sur $image"

# Les constats 11 à 16 passent par la commande de la pile, sans la surcharge de migration en échec.
FICHIERS=(-f "$RACINE/infra/docker-compose.yml" -f "$SURCHARGE_DES_ORIGINES")
cat >"$SURCHARGE_DES_ORIGINES" <<SURCHARGE
services:
  serveur:
    environment:
      URL_PUBLIQUE: "$ORIGINE_DU_CLIENT"
      ORIGINES_AUTORISEES: "$ORIGINE_DU_CLIENT,http://127.0.0.1:5174"
SURCHARGE
ecrire_l_env_de_fumee

constat 11 "pile.sh demarrer sans volume préexistant finit en code 0 et GET /pret répond 200"
compose down -v --remove-orphans
if docker volume inspect "$VOLUME_DE_FUMEE" >/dev/null 2>&1; then echec "volume $VOLUME_DE_FUMEE encore présent"; fi
# F-031-AC8 sur la pile réelle : une configuration refusée par la vérification ne crée pas le volume.
cat >"$SURCHARGE_REFUSEE" <<SURCHARGE
services:
  serveur:
    environment:
      URL_PUBLIQUE: "$ORIGINE_DU_CLIENT"
      ORIGINES_AUTORISEES: "$ORIGINE_DU_CLIENT"
      BETTER_AUTH_SECRET: "trop-court"
SURCHARGE
if PILE_PROJET="$PROJET" PILE_ENV_INFRA="$ENV_DE_FUMEE" PILE_SURCHARGE="$SURCHARGE_REFUSEE" \
  bash "$RACINE/infra/pile.sh" demarrer 2>"$TEMPORAIRE/refus"; then
  echec "pile.sh demarrer a fini en code 0 avec une configuration refusée"
fi
grep "^Configuration invalide : " "$TEMPORAIRE/refus" || echec "le refus de la configuration n'est pas relayé"
if docker volume inspect "$VOLUME_DE_FUMEE" >/dev/null 2>&1; then
  echec "la configuration refusée a laissé le volume $VOLUME_DE_FUMEE"
fi
printf 'configuration refusée : volume %s absent\n' "$VOLUME_DE_FUMEE"
pile demarrer || echec "pile.sh demarrer a fini en code $?"
exiger_statut /pret 200

constat 12 "un second pile.sh demarrer finit en code 0 et garde la ligne témoin"
requete "create table fumee_temoin_pile as select 31 as valeur" >/dev/null
pile demarrer || echec "le second pile.sh demarrer a fini en code $?"
exiger_le_temoin
exiger_statut /pret 200

constat 13 "inscription acceptée depuis $ORIGINE_DU_CLIENT, cookie de session posé ; refusée en 403 depuis $ORIGINE_REFUSEE"
MOT_DE_PASSE_DU_COMPTE="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
inscrire "$ORIGINE_DU_CLIENT" "fumee-acceptee@exemple.test"
[ "$CODE_HTTP" = "200" ] || echec "inscription depuis $ORIGINE_DU_CLIENT : $CODE_HTTP, attendu 200"
cookie_de_session_pose || echec "aucun cookie ${COOKIE_DE_SESSION%=} posé"
printf 'cookie de session posé : %s\n' "${COOKIE_DE_SESSION%=}"
inscrire "$ORIGINE_REFUSEE" "fumee-refusee@exemple.test"
[ "$CODE_HTTP" = "403" ] || echec "inscription depuis $ORIGINE_REFUSEE : $CODE_HTTP, attendu 403"
if cookie_de_session_pose; then echec "cookie de session posé pour $ORIGINE_REFUSEE"; fi

constat 14 "pile.sh arreter garde le volume ; la ligne témoin est là au démarrage suivant"
pile arreter || echec "pile.sh arreter a fini en code $?"
exiger_le_volume_de_fumee
exiger_aucun_conteneur
printf 'volume gardé : %s\n' "$VOLUME_DE_FUMEE"
pile demarrer || echec "pile.sh demarrer après l'arrêt a fini en code $?"
exiger_le_temoin

constat 15 "mot de passe changé après l'initialisation : diagnostic sans migration, puis accorder et demarrer"
pile arreter >/dev/null
POSTGRES_PASSWORD="$(tirer_un_mot_de_passe)"
export POSTGRES_PASSWORD
ecrire_l_env_de_fumee
if pile demarrer 2>"$TEMPORAIRE/diagnostic"; then echec "pile.sh demarrer a fini en code 0 avec un mot de passe désaccordé"; fi
cat "$TEMPORAIRE/diagnostic"
grep -q "La base refuse POSTGRES_PASSWORD" "$TEMPORAIRE/diagnostic" || echec "diagnostic du mot de passe absent"
[ -z "$(conteneur migration)" ] || echec "la migration a été lancée malgré le mot de passe désaccordé"
printf 'migration : jamais lancée\n'
pile accorder || echec "pile.sh accorder a fini en code $?"
pile demarrer || echec "pile.sh demarrer après accorder a fini en code $?"
exiger_le_temoin
journal="$(compose logs --no-color base 2>&1)"
# F-031-AC22 : ni le mot de passe entier, ni l'un de ses segments de 4 caractères (sans les recopier).
position=0
while [ "$position" -le $((${#POSTGRES_PASSWORD} - 4)) ]; do
  case "$journal" in
  *"${POSTGRES_PASSWORD:$position:4}"*) echec "un segment de 4 caractères du nouveau mot de passe (position $position) figure dans le journal de la base" ;;
  esac
  position=$((position + 1))
done
printf 'journal de la base : ni le mot de passe ni aucun de ses %s segments de 4 caractères\n' "$position"

constat 16 "port du serveur tenu par un autre processus : pile.sh demarrer refuse sans rien démarrer"
pile arreter >/dev/null
node -e "require('node:net').createServer().listen($PORT_PUBLIE_SERVEUR, '127.0.0.1')" &
ECOUTEUR=$!
for _ in $(seq 1 20); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT_PUBLIE_SERVEUR") 2>/dev/null; then break; fi
  sleep 0.5
done
if pile demarrer 2>"$TEMPORAIRE/port"; then echec "pile.sh demarrer a fini en code 0 sur un port pris"; fi
cat "$TEMPORAIRE/port"
grep -q "Le port $PORT_PUBLIE_SERVEUR (PORT_PUBLIE_SERVEUR) est déjà en écoute" "$TEMPORAIRE/port" ||
  echec "le port pris n'est pas nommé"
exiger_aucun_conteneur
kill "$ECOUTEUR"
ECOUTEUR=""

constat 17 "nettoyage du projet de fumée, volume et images construites compris ; pile de travail intacte"
compose down -v --rmi local --remove-orphans || echec "le nettoyage a fini en code $?"
releve_apres="$(releve_de_la_pile_de_travail)"
printf 'pile de travail avant :\n%s\npile de travail après :\n%s\n' "$RELEVE_AVANT" "$releve_apres"
[ "$RELEVE_AVANT" = "$releve_apres" ] || echec "la pile de travail a changé pendant la fumée"

printf 'FUMEE: OK (constats 1 à 17)\n'
