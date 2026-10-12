#!/usr/bin/env bash
# Script de fumée de F-008 : constats 1 à 11 de l'ADR-0006 sur une pile réelle
# (F-008-AC19 pour les constats 1 à 8, F-008-AC21 pour le 9, F-008-AC20 pour le 10).
#
# Lancé par le dev, Docker démarré, depuis n'importe quel dossier : infra/fumee.sh
# Prérequis : Docker avec Compose 2.24.0 ou plus récent, curl, trivy, et le fichier apps/server/.env
# (copie d'apps/server/.env.example), que le fichier Compose exige.
#
# La pile de fumée est à part : projet « notionlike-fumee », ports 55432 et 53000 du poste, mot de
# passe tiré au hasard pour ce lancement. Elle ne touche ni au volume ni aux ports de la pile de
# travail, et tout ce qu'elle crée (conteneurs, volume, images construites) est supprimé à la fin,
# que le script réussisse ou non.
set -euo pipefail
export LC_ALL=C

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
PROJET="notionlike-fumee"
export PORT_PUBLIE_BASE=55432
export PORT_PUBLIE_SERVEUR=53000
POSTGRES_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export POSTGRES_PASSWORD

VERSION_ATTENDUE="PostgreSQL 18.6 "
DONNEES_ATTENDUES="/var/lib/postgresql/18/docker"
TABLE_DE_SUIVI="drizzle.__drizzle_migrations"
TEMPORAIRE="$(mktemp -d)"
FICHIERS=(-f "$RACINE/infra/docker-compose.yml")
CONSTAT_EN_COURS=0
CODE_HTTP=""
DUREE=""

compose() {
  docker compose -p "$PROJET" "${FICHIERS[@]}" "$@"
}

nettoyer() {
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
  [ -f "$RACINE/apps/server/.env" ] ||
    echec "apps/server/.env absent : copier apps/server/.env.example en apps/server/.env"
}

verifier_le_poste
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

constat 11 "nettoyage du projet de fumée, volume et images construites compris"
compose down -v --rmi local --remove-orphans || echec "le nettoyage a fini en code $?"

printf 'FUMEE: OK (constats 1 à 11)\n'
