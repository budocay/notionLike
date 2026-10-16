#!/usr/bin/env bash
# Commande de la pile de travail (F-031, ADR-0017) : préparer les fichiers de configuration, démarrer
# base, migration et serveur, dire leur état, les arrêter, remettre en accord le mot de passe de la base.
# Lancée par `pnpm -w pile <sous-commande>` depuis n'importe quel dossier du dépôt ; `pnpm -w pile aide`
# liste les sous-commandes. Les chemins sont résolus depuis l'emplacement de ce script, jamais depuis le
# dossier de lancement.
#
# Variables réservées à la fumée et aux tests, absentes de l'aide :
#   PILE_PROJET     projet Compose (défaut notionlike) ; le volume des données est <projet>_donnees-base.
#   PILE_ENV_INFRA  fichier des variables de Compose (défaut infra/.env), passé par --env-file à chaque
#                   appel ; c'est lui que preparer crée et que demarrer et accorder lisent.
#   PILE_SURCHARGE  fichier Compose ajouté après infra/docker-compose.yml (défaut : aucun).
#
# Secrets (F-031-AC6, AC22) : un secret ne passe que par des commandes internes de bash (printf, test,
# case, redirections), par une variable d'environnement transmise par son nom (-e PGPASSWORD) ou par
# l'entrée standard ; jamais en argument d'une commande, jamais sur les sorties.
# Données : le volume des données n'est jamais supprimé (infra/RETOUR-ARRIERE.md, retention.test.ts).
# Compatible avec le bash de macOS (3.2) : ni tableau associatif, ni mapfile, ni changement de casse.
set -euo pipefail
export LC_ALL=C
umask 077

RACINE="$(cd "$(dirname "$0")/.." && pwd -P)"
PROJET="${PILE_PROJET:-notionlike}"
ENV_INFRA="${PILE_ENV_INFRA:-$RACINE/infra/.env}"
SURCHARGE="${PILE_SURCHARGE:-}"
ENV_SERVEUR="$RACINE/apps/server/.env"
EXEMPLE_INFRA="$RACINE/infra/.env.example"
EXEMPLE_SERVEUR="$RACINE/apps/server/.env.example"
FICHIER_COMPOSE="$RACINE/infra/docker-compose.yml"
SURCHARGE_DE_VERIFICATION="$RACINE/infra/verification-configuration.yml"
ENTREE_DE_VERIFICATION="apps/server/src/verifier-configuration.ts"
VOLUME="${PROJET}_donnees-base"
ROLE="notionlike"

# Origines que le dépôt sert : le serveur de Vite (apps/web/vite.config.ts) et celui que lance
# Playwright (apps/web/playwright.config.ts) ; couture : infra/tests/pile-preparer.test.ts (F-031-AC28).
ADRESSE_CLIENT="http://127.0.0.1:5173"
ORIGINES_DU_CLIENT="http://127.0.0.1:5173,http://127.0.0.1:5174"
MOT_DE_PASSE_FACTICE="factice-a-remplacer"
OCTETS_DU_MOT_DE_PASSE=24
OCTETS_DU_SECRET=32
PORT_BASE_PAR_DEFAUT=5432
PORT_SERVEUR_PAR_DEFAUT=3000
ESSAIS_DE_PRET=30
LIGNES_DE_JOURNAL=30
PREMIERE_LIGNE_DU_REFUS="Configuration invalide : "
COMMANDE_DU_CLIENT="pnpm --filter @notionlike/web dev"
COMMANDE_DU_MODE_HOTE="pnpm --filter @notionlike/server demarrer"

# Une variable du shell l'emporterait sur le fichier de Compose ; COMPOSE_FILE désignerait un autre
# fichier ; PGPASSWORD ne vient que de l'épreuve du mot de passe.
unset POSTGRES_PASSWORD PORT_PUBLIE_BASE PORT_PUBLIE_SERVEUR COMPOSE_FILE COMPOSE_PROJECT_NAME PGPASSWORD

FICHIER_EN_COURS=""
DOSSIER_TEMPORAIRE=""
VALEUR=""
TROUVEE=0
RAISON=""
MOT_DE_PASSE=""
PORT_BASE=""
PORT_SERVEUR=""
PROCESSUS=""
CONTENEURS=""

nettoyer() {
  if [ -n "$FICHIER_EN_COURS" ]; then rm -f "$FICHIER_EN_COURS"; fi
  if [ -n "$DOSSIER_TEMPORAIRE" ]; then rm -rf "$DOSSIER_TEMPORAIRE"; fi
}
trap nettoyer EXIT
trap 'exit 130' INT TERM

dire() { printf '%s\n' "$*"; }
erreur() { printf '%s\n' "$*" >&2; }
echouer() {
  erreur "$@"
  exit 1
}

relatif() {
  case "$1" in
  "$RACINE"/*) printf '%s' "${1#"$RACINE"/}" ;;
  *) printf '%s' "$1" ;;
  esac
}

dossier_temporaire() {
  if [ -z "$DOSSIER_TEMPORAIRE" ]; then
    DOSSIER_TEMPORAIRE="$(mktemp -d "${TMPDIR:-/tmp}/pile.XXXXXX")"
  fi
}

aide() {
  cat <<'AIDE'
Usage : pnpm -w pile <sous-commande>   (depuis n'importe quel dossier du dépôt)

  aide       cette liste
  preparer   crée infra/.env et apps/server/.env s'ils manquent, secrets tirés au hasard ; ne modifie jamais un fichier présent
  demarrer   prépare, vérifie la configuration, les ports et le mot de passe de la base, puis démarre base, migration et serveur
  etat       état des services, réponse de GET /pret et présence du volume des données
  arreter    arrête et supprime les conteneurs de la pile ; le volume des données est gardé
  accorder   donne au rôle de la base le mot de passe d'infra/.env, sans toucher aux données

Le client se lance à part : pnpm --filter @notionlike/web dev, puis http://127.0.0.1:5173 (pas localhost).
AIDE
}

# Lit la dernière affectation CLE=valeur d'un fichier d'environnement, comme Compose : guillemets
# retirés, commentaire de fin de ligne retiré hors guillemets. Renseigne VALEUR et TROUVEE (0 ou 1),
# sans passer la valeur à aucune commande.
lire_variable() {
  local fichier="$1" cle="$2" ligne
  VALEUR=""
  TROUVEE=0
  if [ ! -f "$fichier" ] || [ ! -r "$fichier" ]; then return 0; fi
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    ligne="${ligne%$'\r'}"
    case "$ligne" in
    "$cle="* | "export $cle="*)
      VALEUR="${ligne#*=}"
      TROUVEE=1
      ;;
    esac
  done <"$fichier"
  case "$VALEUR" in
  \"*\")
    VALEUR="${VALEUR#\"}"
    VALEUR="${VALEUR%\"}"
    ;;
  \'*\')
    VALEUR="${VALEUR#\'}"
    VALEUR="${VALEUR%\'}"
    ;;
  *)
    VALEUR="${VALEUR%% \#*}"
    while [ "${VALEUR% }" != "$VALEUR" ]; do VALEUR="${VALEUR% }"; done
    ;;
  esac
}

# F-031-AC9 : renseigne MOT_DE_PASSE et RAISON (vide si le mot de passe d'infra/.env est admis).
juger_le_mot_de_passe() {
  lire_variable "$ENV_INFRA" POSTGRES_PASSWORD
  MOT_DE_PASSE="$VALEUR"
  RAISON=""
  if [ "$TROUVEE" = 0 ]; then
    RAISON="absent"
  elif [ -z "$VALEUR" ]; then
    RAISON="vide"
  elif [ "$VALEUR" = "$MOT_DE_PASSE_FACTICE" ]; then
    RAISON="valeur factice de l'exemple"
  else
    case "$VALEUR" in
    *[!A-Za-z0-9._~-]*) RAISON="caractère hors de A-Z a-z 0-9 - . _ ~ (il entre tel quel dans une URL de connexion)" ;;
    esac
  fi
}

exiger_un_mot_de_passe_admis() {
  local fichier
  fichier="$(relatif "$ENV_INFRA")"
  juger_le_mot_de_passe
  if [ -n "$RAISON" ]; then
    erreur "POSTGRES_PASSWORD de $fichier refusé : $RAISON."
    erreur "Rien n'est lancé : un volume initialisé avec ce mot de passe serait refusé ensuite par le serveur."
    erreur "Issue : y écrire un mot de passe fait des seuls caractères A-Z a-z 0-9 - . _ ~ (openssl rand -hex 24 en tire un),"
    erreur "ou, s'il n'y a pas encore de volume des données, mettre le fichier de côté sous le nom infra/.env.sauvegarde.local"
    erreur "(ignoré par git) puis relancer : pnpm -w pile preparer."
    exit 1
  fi
}

lire_les_ports() {
  lire_variable "$ENV_INFRA" PORT_PUBLIE_BASE
  PORT_BASE="${VALEUR:-$PORT_BASE_PAR_DEFAUT}"
  lire_variable "$ENV_INFRA" PORT_PUBLIE_SERVEUR
  PORT_SERVEUR="${VALEUR:-$PORT_SERVEUR_PAR_DEFAUT}"
}

alea_hexadecimal() {
  od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
}

# Tire un secret de $1 octets ; échoue si le générateur ne rend pas la longueur attendue.
tirer() {
  local valeur
  valeur="$(alea_hexadecimal "$1")"
  if [ "${#valeur}" != "$(($1 * 2))" ]; then
    echouer "Le générateur aléatoire du poste (/dev/urandom) n'a pas répondu : aucun fichier créé."
  fi
  printf '%s' "$valeur"
}

# Contenu d'infra/.env : l'exemple, commentaires et lignes facultatives gardés, mot de passe tiré.
contenu_infra() {
  local ligne ecrit=0
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    case "$ligne" in
    POSTGRES_PASSWORD=*)
      printf 'POSTGRES_PASSWORD=%s\n' "$NOUVEAU_MOT_DE_PASSE"
      ecrit=1
      ;;
    *) printf '%s\n' "$ligne" ;;
    esac
  done <"$EXEMPLE_INFRA"
  if [ "$ecrit" = 0 ]; then printf 'POSTGRES_PASSWORD=%s\n' "$NOUVEAU_MOT_DE_PASSE"; fi
}

# Contenu d'apps/server/.env : l'exemple, avec le secret tiré, l'URL du mode hôte et l'adresse du client.
contenu_serveur() {
  local ligne secret=0 url=0 origines=0 publique=0
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    case "$ligne" in
    BETTER_AUTH_SECRET=*)
      printf 'BETTER_AUTH_SECRET=%s\n' "$NOUVEAU_SECRET"
      secret=1
      ;;
    URL_BASE_DONNEES=*)
      if [ -n "$URL_DU_MODE_HOTE" ]; then printf 'URL_BASE_DONNEES=%s\n' "$URL_DU_MODE_HOTE"; else printf '%s\n' "$ligne"; fi
      url=1
      ;;
    ORIGINES_AUTORISEES=*)
      printf 'ORIGINES_AUTORISEES=%s\n' "$ORIGINES_DU_CLIENT"
      origines=1
      ;;
    URL_PUBLIQUE=*)
      printf 'URL_PUBLIQUE=%s\n' "$ADRESSE_CLIENT"
      publique=1
      ;;
    *) printf '%s\n' "$ligne" ;;
    esac
  done <"$EXEMPLE_SERVEUR"
  if [ "$secret" = 0 ]; then printf 'BETTER_AUTH_SECRET=%s\n' "$NOUVEAU_SECRET"; fi
  if [ "$url" = 0 ] && [ -n "$URL_DU_MODE_HOTE" ]; then printf 'URL_BASE_DONNEES=%s\n' "$URL_DU_MODE_HOTE"; fi
  if [ "$origines" = 0 ]; then printf 'ORIGINES_AUTORISEES=%s\n' "$ORIGINES_DU_CLIENT"; fi
  if [ "$publique" = 0 ]; then printf 'URL_PUBLIQUE=%s\n' "$ADRESSE_CLIENT"; fi
}

# F-031-AC5, AC7 : crée $1 avec la sortie de la fonction $2, en mode 600, sans jamais écraser, suivre
# un lien ni laisser de fichier partiel. Le contenu entier va dans un fichier temporaire du même
# dossier (.env.<aléa>.local, ignoré par git), puis `link` le pose au chemin final : link(2) échoue si
# quoi que ce soit y est apparu entre-temps. Rend 0 si le fichier a été créé, 1 s'il était là.
creer_si_absent() {
  local chemin="$1" ecrire="$2" nom dossier contenu temporaire
  nom="$(relatif "$chemin")"
  if [ -e "$chemin" ] || [ -L "$chemin" ]; then
    dire "$nom : déjà présent, laissé tel quel."
    return 1
  fi
  dossier="$(dirname "$chemin")"
  contenu="$("$ecrire")"
  temporaire="$dossier/.env.$(alea_hexadecimal 6).local"
  if ! (set -C && : >"$temporaire") 2>/dev/null; then
    echouer "$nom : écriture impossible dans $(relatif "$dossier")/ (dossier absent ou non inscriptible) ; aucun fichier créé."
  fi
  FICHIER_EN_COURS="$temporaire"
  if ! printf '%s\n' "$contenu" 2>/dev/null >"$temporaire"; then
    echouer "$nom : écriture interrompue (disque plein ?) ; aucun fichier créé."
  fi
  if ! link "$temporaire" "$chemin" 2>/dev/null; then
    rm -f "$temporaire"
    FICHIER_EN_COURS=""
    if [ -e "$chemin" ] || [ -L "$chemin" ]; then
      dire "$nom : apparu pendant la préparation, laissé tel quel."
      return 1
    fi
    echouer "$nom : création impossible au chemin final ; aucun fichier créé."
  fi
  rm -f "$temporaire"
  FICHIER_EN_COURS=""
  return 0
}

preparer() {
  local nom_infra nom_serveur
  nom_infra="$(relatif "$ENV_INFRA")"
  nom_serveur="$(relatif "$ENV_SERVEUR")"
  if [ ! -f "$EXEMPLE_INFRA" ] || [ ! -f "$EXEMPLE_SERVEUR" ]; then
    echouer "Fichier d'exemple introuvable (infra/.env.example, apps/server/.env.example) : aucun fichier créé."
  fi
  NOUVEAU_MOT_DE_PASSE=""
  if [ ! -e "$ENV_INFRA" ] && [ ! -L "$ENV_INFRA" ]; then
    NOUVEAU_MOT_DE_PASSE="$(tirer "$OCTETS_DU_MOT_DE_PASSE")"
  fi
  if creer_si_absent "$ENV_INFRA" contenu_infra; then
    dire "$nom_infra : créé (mode 600), POSTGRES_PASSWORD tiré au hasard."
  fi
  NOUVEAU_MOT_DE_PASSE=""

  if [ -e "$ENV_SERVEUR" ] || [ -L "$ENV_SERVEUR" ]; then
    dire "$nom_serveur : déjà présent, laissé tel quel."
    return 0
  fi
  # L'URL du mode hôte part du mot de passe d'infra/.env tel qu'il est sur le disque.
  URL_DU_MODE_HOTE=""
  juger_le_mot_de_passe
  lire_les_ports
  if [ -z "$RAISON" ]; then
    URL_DU_MODE_HOTE="postgres://$ROLE:$MOT_DE_PASSE@127.0.0.1:$PORT_BASE/notionlike"
  fi
  MOT_DE_PASSE=""
  NOUVEAU_SECRET="$(tirer "$OCTETS_DU_SECRET")"
  if creer_si_absent "$ENV_SERVEUR" contenu_serveur; then
    dire "$nom_serveur : créé (mode 600), BETTER_AUTH_SECRET tiré au hasard, ORIGINES_AUTORISEES et URL_PUBLIQUE sur $ADRESSE_CLIENT."
    if [ -n "$URL_DU_MODE_HOTE" ]; then
      dire "  URL_BASE_DONNEES vise 127.0.0.1:$PORT_BASE avec le mot de passe de $nom_infra (mode hôte seulement)."
    else
      erreur "  URL_BASE_DONNEES laissée à la valeur de l'exemple : POSTGRES_PASSWORD de $nom_infra est refusé ($RAISON)."
    fi
  fi
  NOUVEAU_SECRET=""
  URL_DU_MODE_HOTE=""
}

compose() {
  docker compose -p "$PROJET" --env-file "$ENV_INFRA" -f "$FICHIER_COMPOSE" ${SURCHARGE:+-f "$SURCHARGE"} "$@"
}

version_suffisante() {
  local reste="${1#v}" majeure mineure
  majeure="${reste%%.*}"
  reste="${reste#*.}"
  mineure="${reste%%.*}"
  case "$majeure.$mineure" in
  *[!0-9.]* | .* | *.) return 1 ;;
  esac
  [ "$majeure" -gt 2 ] || { [ "$majeure" -eq 2 ] && [ "$mineure" -ge 24 ]; }
}

# F-031-AC17.
verifier_le_poste() {
  local version
  if ! command -v docker >/dev/null 2>&1; then
    echouer "Docker est absent du PATH : installer Docker Desktop (macOS) ou Docker Engine et son greffon Compose (Linux), puis relancer."
  fi
  if ! docker info >/dev/null 2>&1; then
    echouer "Le démon Docker ne répond pas : démarrer Docker Desktop (ou le service docker sous Linux), puis relancer."
  fi
  version="$(docker compose version --short 2>/dev/null || true)"
  if ! version_suffisante "$version"; then
    echouer "Docker Compose ${version:-introuvable} : la version 2.24.0 ou plus récente est requise ; mettre à jour Docker Desktop ou le greffon docker-compose-plugin."
  fi
}

volume_present() {
  docker volume inspect "$VOLUME" >/dev/null 2>&1
}

# Une ligne « service|état|statut|ports » par conteneur du projet.
lire_les_conteneurs() {
  CONTENEURS="$(docker ps -a --filter "label=com.docker.compose.project=$PROJET" \
    --format '{{.Label "com.docker.compose.service"}}|{{.State}}|{{.Status}}|{{.Ports}}' 2>/dev/null || true)"
}

# Écrit « état|statut » du service $1, ou rien s'il n'a pas de conteneur.
etat_de() {
  local ligne
  while IFS= read -r ligne; do
    case "$ligne" in
    "$1|"*)
      ligne="${ligne#*|}"
      printf '%s' "${ligne%|*}"
      return 0
      ;;
    esac
  done <<CONTENEURS
$CONTENEURS
CONTENEURS
}

port_tenu_par_la_pile() {
  case "$CONTENEURS" in
  *":$1->"*) return 0 ;;
  esac
  return 1
}

# Vrai si un processus écoute sur le port $1 en TCP ; renseigne PROCESSUS quand le système le donne.
port_en_ecoute() {
  local sortie ligne
  PROCESSUS=""
  if command -v lsof >/dev/null 2>&1; then
    sortie="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fc 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    sortie="$(ss -Hltnp "sport = :$1" 2>/dev/null || true)"
  else
    erreur "Avertissement : ni lsof ni ss sur le poste, le port $1 n'est pas contrôlé."
    return 1
  fi
  if [ -z "$sortie" ]; then return 1; fi
  while IFS= read -r ligne; do
    case "$ligne" in
    c*)
      PROCESSUS="${ligne#c}"
      break
      ;;
    *'users:(("'*)
      ligne="${ligne#*users:((\"}"
      PROCESSUS="${ligne%%\"*}"
      break
      ;;
    esac
  done <<SORTIE
$sortie
SORTIE
  return 0
}

port_valide() {
  case "$1" in
  '' | *[!0-9]*) return 1 ;;
  esac
  [ "${#1}" -le 5 ] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

# F-031-AC18 (H9) : un port publié tenu par un autre processus que les conteneurs du projet.
verifier_les_ports() {
  local port variable fichier
  fichier="$(relatif "$ENV_INFRA")"
  lire_les_conteneurs
  for variable in PORT_PUBLIE_BASE PORT_PUBLIE_SERVEUR; do
    if [ "$variable" = PORT_PUBLIE_BASE ]; then port="$PORT_BASE"; else port="$PORT_SERVEUR"; fi
    if ! port_valide "$port"; then
      echouer "$variable de $fichier n'est pas un port (entier de 1 à 65535) : le corriger, puis relancer."
    fi
    if port_tenu_par_la_pile "$port" || ! port_en_ecoute "$port"; then continue; fi
    erreur "Le port $port ($variable) est déjà en écoute sur le poste, processus : ${PROCESSUS:-non donné par le système}."
    erreur "Rien n'est lancé. Deux issues :"
    if [ "$variable" = PORT_PUBLIE_SERVEUR ]; then
      erreur "  - arrêter ce processus ; si c'est le serveur lancé en mode hôte ($COMMANDE_DU_MODE_HOTE), l'arrêter ;"
      erreur "  - ou choisir un autre port : PORT_PUBLIE_SERVEUR=<port> dans $fichier, et NOTIONLIKE_RELAIS_API=http://127.0.0.1:<port>"
      erreur "    pour le relais de Vite (apps/web/.env.local)."
    else
      erreur "  - arrêter ce processus (une autre base PostgreSQL, par exemple) ;"
      erreur "  - ou choisir un autre port : PORT_PUBLIE_BASE=<port> dans $fichier, et le même port dans URL_BASE_DONNEES"
      erreur "    d'apps/server/.env pour le mode hôte."
    fi
    exit 1
  done
}

# F-031-AC8, AC10 (ADR-0017) : la configuration du service serveur, vérifiée par le code du serveur, dans
# son image, avec l'environnement exact du service ; la surcharge retire les volumes et le réseau.
verifier_la_configuration() {
  local sortie code=0 erreurs ligne publique="" origines="" relayer=0 variables variable
  dossier_temporaire
  erreurs="$DOSSIER_TEMPORAIRE/verification"
  sortie="$(compose -f "$SURCHARGE_DE_VERIFICATION" --progress quiet \
    run --rm --no-deps -T serveur node "$ENTREE_DE_VERIFICATION" 2>"$erreurs")" || code=$?

  if [ "$code" = 1 ]; then
    while IFS= read -r ligne || [ -n "$ligne" ]; do
      case "$ligne" in
      "$PREMIERE_LIGNE_DU_REFUS"*)
        relayer=1
        variables="${ligne#"$PREMIERE_LIGNE_DU_REFUS"}"
        ;;
      esac
      if [ "$relayer" = 1 ]; then erreur "$ligne"; fi
    done <"$erreurs"
  fi
  if [ "$code" = 1 ] && [ "$relayer" = 1 ]; then
    erreur "Fichier à corriger :"
    variables="${variables//,/ }"
    for variable in $variables; do
      case "$variable" in
      URL_BASE_DONNEES) erreur "  - URL_BASE_DONNEES : Compose la bâtit sur POSTGRES_PASSWORD de $(relatif "$ENV_INFRA") ; corriger ce mot de passe." ;;
      NODE_ENV | HOTE | PORT) erreur "  - $variable : imposée par infra/docker-compose.yml." ;;
      *) erreur "  - $variable : apps/server/.env." ;;
      esac
    done
    erreur "Issue : corriger la valeur à la main, ou mettre apps/server/.env de côté sous le nom apps/server/.env.sauvegarde.local"
    erreur "(ignoré par git) puis relancer : pnpm -w pile preparer. Rien n'est lancé : ni base, ni volume, ni migration."
    exit 1
  fi
  if [ "$code" != 0 ]; then
    echouer "La vérification de la configuration n'a pas pu se faire (code $code) : rien n'est lancé. Relancer ; si l'échec persiste, docker compose -p $PROJET build en dit la cause."
  fi

  while IFS= read -r ligne; do
    case "$ligne" in
    URL_PUBLIQUE=*) publique="${ligne#URL_PUBLIQUE=}" ;;
    ORIGINES_AUTORISEES=*) origines="${ligne#ORIGINES_AUTORISEES=}" ;;
    esac
  done <<SORTIE
$sortie
SORTIE
  case ",$origines," in
  *",$ADRESSE_CLIENT,"*) return 0 ;;
  esac
  if [ "$publique" = "$ADRESSE_CLIENT" ]; then return 0; fi
  erreur "Ni URL_PUBLIQUE ni ORIGINES_AUTORISEES d'apps/server/.env ne contient l'adresse du client."
  erreur "Ajouter $ADRESSE_CLIENT à ORIGINES_AUTORISEES (origines séparées par des virgules), puis relancer."
  erreur "Le client s'ouvre sur $ADRESSE_CLIENT, pas sur localhost : le serveur refuserait l'inscription et la connexion."
  exit 1
}

# F-031-AC11 : l'URL du mode hôte ne sert pas au conteneur ; un écart n'est qu'un avertissement.
avertir_de_l_url_du_mode_hote() {
  local attendue
  attendue="$ROLE:$MOT_DE_PASSE@127.0.0.1:$PORT_BASE/notionlike"
  lire_variable "$ENV_SERVEUR" URL_BASE_DONNEES
  if [ "$VALEUR" = "postgres://$attendue" ] || [ "$VALEUR" = "postgresql://$attendue" ]; then
    VALEUR=""
    return 0
  fi
  VALEUR=""
  erreur "Avertissement : URL_BASE_DONNEES d'apps/server/.env ne vise pas 127.0.0.1:$PORT_BASE avec le mot de passe de $(relatif "$ENV_INFRA")."
  erreur "  Elle ne sert qu'au mode hôte ($COMMANDE_DU_MODE_HOTE) : Compose impose la sienne au conteneur. La pile démarre quand même."
}

# H7 : le mot de passe est éprouvé par TCP sur l'adresse du réseau (-h base, règle scram-sha-256),
# comme la migration et le serveur ; pg_isready n'authentifie personne. Rend 0 s'il est accepté,
# 1 si l'authentification est refusée, 2 pour tout autre échec.
eprouver_le_mot_de_passe() {
  local erreurs code=0
  dossier_temporaire
  erreurs="$DOSSIER_TEMPORAIRE/epreuve"
  PGPASSWORD="$MOT_DE_PASSE"
  export PGPASSWORD
  compose exec -T -e PGPASSWORD base \
    psql -h base -U "$ROLE" -d notionlike -w -At -c 'select 1' >/dev/null 2>"$erreurs" || code=$?
  unset PGPASSWORD
  if [ "$code" = 0 ]; then return 0; fi
  if grep -q 'password authentication failed' "$erreurs"; then return 1; fi
  return 2
}

# Rend la base à l'état trouvé ($1 : état du conteneur avant, vide s'il n'existait pas).
rendre_la_base() {
  case "$1" in
  running*) ;;
  *) compose stop base >/dev/null 2>&1 || true ;;
  esac
}

demarrer_la_base_seule() {
  if ! compose up -d --wait base; then
    echouer "La base n'a pas démarré : rien d'autre n'est lancé. Journal : docker compose -p $PROJET logs base (depuis infra/)."
  fi
}

# F-031-AC20 : la base seule démarrée, le mot de passe d'infra/.env doit ouvrir une session.
exiger_un_mot_de_passe_accorde() {
  local trouve code=0
  lire_les_conteneurs
  trouve="$(etat_de base)"
  demarrer_la_base_seule
  eprouver_le_mot_de_passe || code=$?
  if [ "$code" = 0 ]; then return 0; fi
  rendre_la_base "$trouve"
  if [ "$code" = 2 ]; then
    echouer "L'épreuve du mot de passe de la base n'a pas pu se faire : ni la migration ni le serveur ne sont lancés. Relancer : pnpm -w pile demarrer."
  fi
  erreur "La base refuse POSTGRES_PASSWORD de $(relatif "$ENV_INFRA") : le volume des données $VOLUME a été initialisé avec un autre"
  erreur "mot de passe, que PostgreSQL ne relit jamais. Ni la migration ni le serveur ne sont lancés. Deux issues :"
  erreur "  - remettre l'ancien mot de passe dans $(relatif "$ENV_INFRA"), puis relancer pnpm -w pile demarrer ;"
  erreur "  - ou donner au volume le mot de passe actuel : pnpm -w pile accorder, puis pnpm -w pile demarrer."
  erreur "Ne pas supprimer le volume des données : cela efface la base de travail."
  exit 1
}

# F-031-AC19 : nomme le service en échec et montre la fin de son journal.
diagnostiquer_l_echec() {
  local service etat en_echec=""
  lire_les_conteneurs
  for service in base migration serveur; do
    etat="$(etat_de "$service")"
    case "$etat" in
    exited*"Exited (0)"* | "") ;;
    exited* | dead* | restarting* | *unhealthy*) en_echec="$service" ;;
    esac
    if [ -n "$en_echec" ]; then break; fi
  done
  if [ -z "$en_echec" ]; then
    erreur "Le démarrage de la pile a échoué sans service en échec identifié. État : pnpm -w pile etat."
  else
    erreur "Le démarrage de la pile a échoué : service $en_echec ($(etat_de "$en_echec"))."
    erreur "Dernières lignes de son journal :"
    compose logs --no-color --tail "$LIGNES_DE_JOURNAL" "$en_echec" >&2 2>/dev/null || true
  fi
  erreur "Causes et issues (échec d'authentification, erreur dans une migration) : section 3 d'infra/RETOUR-ARRIERE.md."
  exit 1
}

code_de_pret() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT_SERVEUR/pret" 2>/dev/null || true
}

attendre_pret() {
  local essai=0 code=""
  while [ "$essai" -lt "$ESSAIS_DE_PRET" ]; do
    code="$(code_de_pret)"
    if [ "$code" = 200 ]; then return 0; fi
    essai=$((essai + 1))
    sleep 1
  done
  echouer "GET /pret sur le port $PORT_SERVEUR répond ${code:-rien} après $ESSAIS_DE_PRET essais : voir pnpm -w pile etat."
}

demarrer() {
  local volume_existant=0
  verifier_le_poste
  preparer
  exiger_un_mot_de_passe_admis
  lire_les_ports
  verifier_les_ports
  if volume_present; then volume_existant=1; fi
  dire "Construction de l'image du serveur :"
  if ! compose build; then
    echouer "La construction de l'image du serveur a échoué (lignes ci-dessus) : rien n'est lancé."
  fi
  verifier_la_configuration
  avertir_de_l_url_du_mode_hote
  if [ "$volume_existant" = 1 ]; then exiger_un_mot_de_passe_accorde; fi
  if ! compose up -d --wait --build; then diagnostiquer_l_echec; fi
  attendre_pret
  MOT_DE_PASSE=""
  dire ""
  dire "La pile de travail est prête (GET /pret : 200)."
  dire "  Serveur : http://127.0.0.1:$PORT_SERVEUR"
  dire "  Client : $ADRESSE_CLIENT (pas localhost : le serveur n'admet que cette origine)."
  dire "  Lancer le client : $COMMANDE_DU_CLIENT"
  if [ "$PORT_SERVEUR" != "$PORT_SERVEUR_PAR_DEFAUT" ]; then
    dire "    avec NOTIONLIKE_RELAIS_API=http://127.0.0.1:$PORT_SERVEUR dans apps/web/.env.local (relais de Vite)."
  fi
  dire "  Arrêter la pile : pnpm -w pile arreter (le volume des données est gardé)."
}

# F-031-AC21 à AC23 : par la connexion locale du conteneur de la base (admise sans mot de passe par
# l'image), `\password` de psql calcule l'empreinte SCRAM côté client : le mot de passe ne parvient pas
# en clair au serveur, donc ni à son journal ; il arrive à psql par l'entrée standard.
accorder() {
  local fichier trouve code=0
  fichier="$(relatif "$ENV_INFRA")"
  if [ ! -f "$ENV_INFRA" ]; then
    echouer "$fichier absent : il n'y a pas de mot de passe à accorder. pnpm -w pile preparer le crée."
  fi
  juger_le_mot_de_passe
  if [ -n "$RAISON" ]; then
    echouer "POSTGRES_PASSWORD de $fichier refusé : $RAISON. Rien n'est modifié."
  fi
  verifier_le_poste
  if ! volume_present; then
    echouer "Aucun volume des données ($VOLUME) : rien à accorder. pnpm -w pile demarrer le crée avec le mot de passe de $fichier."
  fi
  if [ ! -f "$ENV_SERVEUR" ]; then
    echouer "apps/server/.env absent : Compose l'exige pour toute commande. pnpm -w pile preparer le crée."
  fi
  lire_les_conteneurs
  trouve="$(etat_de base)"
  demarrer_la_base_seule
  eprouver_le_mot_de_passe || code=$?
  if [ "$code" = 0 ]; then
    rendre_la_base "$trouve"
    dire "Le mot de passe de $fichier est déjà accordé au volume des données : rien n'est modifié."
    return 0
  fi
  if [ "$code" = 2 ]; then
    rendre_la_base "$trouve"
    echouer "L'épreuve du mot de passe de la base n'a pas pu se faire : rien n'est modifié."
  fi
  code=0
  printf '%s\n%s\n' "$MOT_DE_PASSE" "$MOT_DE_PASSE" |
    compose exec -T base psql -U "$ROLE" -d notionlike -v ON_ERROR_STOP=1 -q -c "\\password $ROLE" \
      >/dev/null 2>&1 || code=$?
  if [ "$code" != 0 ]; then
    rendre_la_base "$trouve"
    echouer "La remise en accord a échoué (code $code) : le mot de passe du rôle $ROLE n'est pas changé."
  fi
  code=0
  eprouver_le_mot_de_passe || code=$?
  rendre_la_base "$trouve"
  MOT_DE_PASSE=""
  if [ "$code" != 0 ]; then
    echouer "Après la remise en accord, la base refuse encore le mot de passe de $fichier : voir la section 3 d'infra/RETOUR-ARRIERE.md."
  fi
  dire "Mot de passe de $fichier accordé au rôle $ROLE ; aucune autre donnée n'est modifiée."
  dire "Démarrer la pile : pnpm -w pile demarrer."
}

etat() {
  local service ligne code
  lire_les_ports
  dire "Pile de travail (projet $PROJET) :"
  if ! command -v docker >/dev/null 2>&1; then
    dire "  Docker : absent du PATH."
  elif ! docker info >/dev/null 2>&1; then
    dire "  Docker : le démon ne répond pas."
  else
    lire_les_conteneurs
    for service in base migration serveur; do
      ligne="$(etat_de "$service")"
      dire "  $service : ${ligne:-aucun conteneur}"
    done
    if volume_present; then
      dire "  Volume des données $VOLUME : présent."
    else
      dire "  Volume des données $VOLUME : absent."
    fi
  fi
  code="$(code_de_pret)"
  if [ -z "$code" ] || [ "$code" = 000 ]; then
    dire "  GET /pret sur le port $PORT_SERVEUR : aucun serveur ne répond."
  else
    dire "  GET /pret sur le port $PORT_SERVEUR : $code."
  fi
  dire "  Client : $ADRESSE_CLIENT ($COMMANDE_DU_CLIENT ; pas localhost)."
}

# F-031-AC24 : sans fichier Compose (dossier vide), Compose retrouve les conteneurs et le réseau du
# projet par leurs étiquettes ; les fichiers de configuration ne sont donc pas requis.
arreter() {
  if ! command -v docker >/dev/null 2>&1; then
    dire "Docker est absent du PATH : aucune pile ne tourne. Le volume des données $VOLUME est gardé."
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    dire "Le démon Docker ne répond pas : aucune pile ne tourne. Le volume des données $VOLUME est gardé."
    return 0
  fi
  dossier_temporaire
  if ! (cd "$DOSSIER_TEMPORAIRE" && docker compose -p "$PROJET" down); then
    echouer "L'arrêt de la pile a échoué : voir les lignes ci-dessus. Le volume des données $VOLUME est gardé."
  fi
  dire "Pile de travail arrêtée : conteneurs et réseau supprimés, volume des données $VOLUME gardé."
}

principal() {
  case "${1:-}" in
  aide) aide ;;
  preparer) preparer ;;
  demarrer) demarrer ;;
  etat) etat ;;
  arreter) arreter ;;
  accorder) accorder ;;
  *)
    erreur "Sous-commande absente ou inconnue."
    aide >&2
    exit 2
    ;;
  esac
}

principal "$@"
