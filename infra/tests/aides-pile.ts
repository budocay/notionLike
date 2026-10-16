// Aides des tests d'infra/pile.sh (F-031-AC31) : un arbre temporaire qui ne porte que les fichiers dont
// le script a besoin, et un PATH réduit à un dossier de commandes : les outils réels qu'il emploie, et
// des `docker`, `curl` et `lsof` de substitution qui consignent leurs arguments, un appel par ligne.
// Le script s'exécute sous /bin/bash (3.2 sous macOS) ; il ne lit ni n'écrit jamais les fichiers de
// configuration du dépôt, ni Docker, ni le réseau.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEPOT = fileURLToPath(new URL("../../", import.meta.url));
export const ENV_INFRA = "infra/.env";
export const ENV_SERVEUR = "apps/server/.env";
export const SOUS_COMMANDES = ["aide", "preparer", "demarrer", "etat", "arreter", "accorder"];
export const DELAI_DES_TESTS_DE_LA_PILE_MS = 20_000;
/** Délai d'un test de la pile : plusieurs lancements du script, chacun borné au délai ci-dessus. */
export const DELAI_D_UN_TEST_MS = 60_000;

const BASH = "/bin/bash";
const EXECUTABLE = 0o755;
const FICHIERS_COPIES = [
  "infra/pile.sh",
  "infra/docker-compose.yml",
  "infra/verification-configuration.yml",
  "infra/.env.example",
  "apps/server/.env.example",
];
// Les seules commandes externes qu'emploie infra/pile.sh, hors docker, curl, lsof et ss.
const OUTILS_DU_SCRIPT = ["cat", "dirname", "grep", "link", "mktemp", "od", "rm", "sleep", "tr"];
const DOSSIERS_DU_SYSTEME = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

export interface Arbre {
  /** Copie réduite du dépôt, où le script est lancé. */
  readonly racine: string;
  /** Dossier du PATH, seul dossier de commandes du script. */
  readonly bin: string;
  /** État du `docker` de substitution (volume, conteneurs, scénario), hors de la copie. */
  readonly etat: string;
  readonly journal: string;
  readonly dossier: string;
}

export interface Resultat {
  readonly code: number | null;
  readonly sortie: string;
  readonly erreur: string;
  /** Un appel par ligne : « docker <arguments> », « curl … », « lsof … ». */
  readonly appels: readonly string[];
}

/** Chemin réel d'un outil du système, ou une erreur qui le nomme. */
export function outilReel(nom: string): string {
  const chemin = DOSSIERS_DU_SYSTEME.map((dossier) => join(dossier, nom)).find((candidat) =>
    existsSync(candidat),
  );
  if (chemin === undefined) throw new Error(`outil absent du poste : ${nom}`);
  return chemin;
}

const ENTETE = (arbre: Arbre): string =>
  `#!${BASH}\nPATH=/usr/bin:/bin\nE='${arbre.etat}'\nJ='${arbre.journal}'\n`;

// `docker` de substitution : répond selon les fichiers de l'état (volume, mdp-volume, conteneurs,
// verification, refus, up-en-echec, sans-demon, version-compose). Le mot de passe du volume est celui
// du fichier --env-file au moment où un `up` le crée, comme PostgreSQL à l'initialisation.
const DOCKER = `printf 'docker %s\\n' "$*" >>"$J"
if [ -n "\${PGPASSWORD:-}" ]; then printf 'docker : PGPASSWORD reçu par son environnement\\n' >>"$J"; fi
fichier_env=""; precedent=""
for argument in "$@"; do
  if [ "$precedent" = "--env-file" ]; then fichier_env="$argument"; fi
  precedent="$argument"
done
creer_volume() {
  if [ ! -f "$E/volume" ]; then
    touch "$E/volume"
    sed -n 's/^POSTGRES_PASSWORD=//p' "$fichier_env" | tail -n 1 | tr -d '\\n' >"$E/mdp-volume"
  fi
}
case " $* " in
" info "*) if [ -f "$E/sans-demon" ]; then exit 1; fi; exit 0 ;;
*" compose version --short "*) if [ -f "$E/version-compose" ]; then cat "$E/version-compose"; else echo 2.29.1; fi; exit 0 ;;
*" volume inspect "*) if [ -f "$E/volume" ]; then exit 0; fi; echo "Error: no such volume" >&2; exit 1 ;;
" ps "*) if [ -f "$E/conteneurs" ]; then cat "$E/conteneurs"; fi; exit 0 ;;
*" run "*"verifier-configuration.ts"*)
  mode=acceptee; if [ -f "$E/verification" ]; then mode="$(cat "$E/verification")"; fi
  case "$mode" in
  acceptee) grep -E '^(URL_PUBLIQUE|ORIGINES_AUTORISEES)=' "$RACINE_DU_FAUX/apps/server/.env"; exit 0 ;;
  refusee) cat "$E/refus" >&2; exit 1 ;;
  *) echo "sortie inattendue" >&2; exit 3 ;;
  esac ;;
*'\\password'*)
  read -r premiere; read -r seconde
  if [ "$premiere" = "$seconde" ]; then printf '%s' "$premiere" >"$E/mdp-volume"; fi
  exit 0 ;;
*" exec "*" -h base "*)
  if [ "\${PGPASSWORD:-}" = "$(cat "$E/mdp-volume" 2>/dev/null)" ]; then exit 0; fi
  echo 'psql: error: connection to server at "base" (172.23.0.2), port 5432 failed: FATAL:  password authentication failed for user "notionlike"' >&2
  exit 2 ;;
*" up -d --wait base "*) creer_volume; exit 0 ;;
*" up -d --wait --build "*) if [ -f "$E/up-en-echec" ]; then exit 1; fi; creer_volume; exit 0 ;;
*" logs "*) echo 'migration-1  | La migration a échoué : aucune migration de ce lancement n est appliquée.'; exit 0 ;;
*) exit 0 ;;
esac
`;

const CURL = `printf 'curl %s\\n' "$*" >>"$J"
if [ -f "$E/pret" ]; then cat "$E/pret"; else printf 200; fi
`;

// `lsof` de substitution : un port est tenu si l'état porte « ecoute-<port> » (nom du processus).
const LSOF = `printf 'lsof %s\\n' "$*" >>"$J"
port=""
for argument in "$@"; do case "$argument" in -iTCP:*) port="\${argument#-iTCP:}" ;; esac; done
if [ -f "$E/ecoute-$port" ]; then printf 'p4242\\nc%s\\n' "$(cat "$E/ecoute-$port")"; exit 0; fi
exit 1
`;

function ecrireExecutable(chemin: string, texte: string): void {
  writeFileSync(chemin, texte);
  chmodSync(chemin, EXECUTABLE);
}

/** Pose une commande de substitution dans le PATH du script (corps sans en-tête). */
export function poserCommande(arbre: Arbre, nom: string, corps: string): void {
  rmSync(join(arbre.bin, nom), { force: true });
  ecrireExecutable(join(arbre.bin, nom), `${ENTETE(arbre)}${corps}`);
}

/** Met l'outil réel du système dans le PATH du script, à la place d'une substitution éventuelle. */
export function poserOutilReel(arbre: Arbre, nom: string): void {
  rmSync(join(arbre.bin, nom), { force: true });
  symlinkSync(outilReel(nom), join(arbre.bin, nom));
}

export function retirerCommande(arbre: Arbre, nom: string): void {
  rmSync(join(arbre.bin, nom), { force: true });
}

export function creerArbre(): Arbre {
  const dossier = mkdtempSync(join(tmpdir(), "pile-"));
  const arbre: Arbre = {
    dossier,
    racine: join(dossier, "depot"),
    bin: join(dossier, "bin"),
    etat: join(dossier, "etat"),
    journal: join(dossier, "journal"),
  };
  for (const chemin of [arbre.bin, arbre.etat, join(dossier, "tmp")]) {
    mkdirSync(chemin, { recursive: true });
  }
  for (const fichier of FICHIERS_COPIES) {
    mkdirSync(dirname(join(arbre.racine, fichier)), { recursive: true });
    copyFileSync(join(DEPOT, fichier), join(arbre.racine, fichier));
  }
  writeFileSync(arbre.journal, "");
  for (const outil of OUTILS_DU_SCRIPT) poserOutilReel(arbre, outil);
  poserCommande(arbre, "docker", DOCKER);
  poserCommande(arbre, "curl", CURL);
  poserCommande(arbre, "lsof", LSOF);
  return arbre;
}

export function supprimerArbre(arbre: Arbre): void {
  chmodSync(join(arbre.racine, "apps/server"), EXECUTABLE);
  chmodSync(join(arbre.racine, "infra"), EXECUTABLE);
  rmSync(arbre.dossier, { recursive: true, force: true });
}

/** Écrit un fichier de l'arbre, chemin relatif à sa racine. */
export function ecrire(arbre: Arbre, chemin: string, contenu: string): void {
  writeFileSync(join(arbre.racine, chemin), contenu);
}

export function lire(arbre: Arbre, chemin: string): string {
  return readFileSync(join(arbre.racine, chemin), "utf8");
}

/** Pose un fichier de l'état du `docker` de substitution (scénario). */
export function poserEtat(arbre: Arbre, nom: string, contenu = ""): void {
  writeFileSync(join(arbre.etat, nom), contenu);
}

export function lireEtat(arbre: Arbre, nom: string): string {
  return readFileSync(join(arbre.etat, nom), "utf8");
}

/** Lance `bash infra/pile.sh <arguments>` dans l'arbre, environnement entièrement fixé par le test. */
export function lancer(
  arbre: Arbre,
  argumentsDuScript: readonly string[],
  environnement: Readonly<Record<string, string>> = {},
): Resultat {
  writeFileSync(arbre.journal, "");
  const resultat = spawnSync(BASH, [join(arbre.racine, "infra/pile.sh"), ...argumentsDuScript], {
    cwd: arbre.racine,
    encoding: "utf8",
    timeout: DELAI_DES_TESTS_DE_LA_PILE_MS,
    env: {
      PATH: arbre.bin,
      HOME: arbre.dossier,
      TMPDIR: join(arbre.dossier, "tmp"),
      RACINE_DU_FAUX: arbre.racine,
      ...environnement,
    },
  });
  return {
    code: resultat.status,
    sortie: resultat.stdout,
    erreur: resultat.stderr,
    appels: readFileSync(arbre.journal, "utf8")
      .split("\n")
      .filter((ligne) => ligne !== ""),
  };
}

// Secrets marqués : leurs segments de quatre caractères n'apparaissent dans aucun texte du script.
const PAIRES_DU_MOT_DE_PASSE = 24;
const PAIRES_DU_SECRET = 32;
export const MOT_DE_PASSE = "Qz".repeat(PAIRES_DU_MOT_DE_PASSE);
export const SECRET = "Wk".repeat(PAIRES_DU_SECRET);
export const ANCIEN_MOT_DE_PASSE = "Jx".repeat(PAIRES_DU_MOT_DE_PASSE);
export const CONTENEURS_EN_MARCHE = [
  "base|running|Up 2 minutes (healthy)|127.0.0.1:5432->5432/tcp",
  "migration|exited|Exited (0) 2 minutes ago|",
  "serveur|running|Up 2 minutes (healthy)|127.0.0.1:3000->3000/tcp",
].join("\n");

/** Les variables d'apps/server/.env que preparer écrirait, avec les secrets marqués. */
export function configurationDuServeur(
  remplacements: Readonly<Record<string, string>> = {},
): string {
  const configuration: Record<string, string> = {
    HOTE: "127.0.0.1",
    PORT: "3000",
    URL_BASE_DONNEES: `postgres://notionlike:${MOT_DE_PASSE}@127.0.0.1:5432/notionlike`,
    ORIGINES_AUTORISEES: "http://127.0.0.1:5173,http://127.0.0.1:5174",
    BETTER_AUTH_SECRET: SECRET,
    URL_PUBLIQUE: "http://127.0.0.1:5173",
    ...remplacements,
  };
  return Object.entries(configuration)
    .map(([cle, valeur]) => `${cle}=${valeur}\n`)
    .join("");
}

/** Pose les deux fichiers de configuration, secrets marqués, sans lancer preparer. */
export function poserLesFichiers(
  arbre: Arbre,
  remplacements: Readonly<Record<string, string>> = {},
  infra = `POSTGRES_PASSWORD=${MOT_DE_PASSE}\n`,
): void {
  ecrire(arbre, ENV_INFRA, infra);
  ecrire(arbre, ENV_SERVEUR, configurationDuServeur(remplacements));
}

/** Les affectations CLE=valeur non commentées d'un fichier d'environnement. */
export function variables(texte: string): Map<string, string> {
  const affectation = /^([A-Z][A-Z0-9_]*)=(.*)$/;
  return new Map(
    texte.split("\n").flatMap((ligne) => {
      const [, cle, valeur] = affectation.exec(ligne) ?? [];
      return cle === undefined || valeur === undefined ? [] : [[cle, valeur] as const];
    }),
  );
}
