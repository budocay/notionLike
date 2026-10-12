import { isDeepStrictEqual } from "node:util";

export interface Instruction {
  readonly nom: string;
  readonly arguments: string;
}

const IMAGE_NODE = /^node:26\.\d+\.\d+-alpine3\.\d+@sha256:[0-9a-f]{64}$/;
const INSTALLATION_DE_PNPM = /npm install -g pnpm@(\S+)/;
const INSTALLATION_DE_PAQUETS = /\b(?:npm|pnpm|yarn|apk)\s+(?:install|add|i)\b/;
const RESTES_DE_NPM = [
  "/usr/local/lib/node_modules/npm",
  "/usr/local/bin/npm",
  "/usr/local/bin/npx",
];
const UTILISATEUR = "node";
const COMMANDE_DU_SERVEUR = ["node", "apps/server/src/main.ts"];
const CHEMIN_DE_SANTE = "/sante";
const MODE_DE_PRODUCTION = "NODE_ENV=production";
const NOM_DE_SECRET = /PASSWORD|SECRET|TOKEN|JETON|MOT_DE_PASSE|URL_BASE_DONNEES/i;
const FICHIER_D_ENVIRONNEMENT = /(?:^|[\s/])\.env(?:[\s.]|$)/;
const ENTREE_INTERDITE_DU_CONTEXTE = /\.env|node_modules|test/;

/** Découpe un Dockerfile en instructions : commentaires retirés, lignes continuées réunies. */
export function lireInstructions(texte: string): Instruction[] {
  return texte
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("#"))
    .join("\n")
    .replaceAll(/\\\n\s*/g, " ")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "")
    .map((ligne) => {
      const [nom = "", ...reste] = ligne.split(/\s+/);
      return { nom: nom.toUpperCase(), arguments: reste.join(" ") };
    });
}

function instructionsNommees(instructions: readonly Instruction[], nom: string): Instruction[] {
  return instructions.filter((instruction) => instruction.nom === nom);
}

function etapeFinale(instructions: readonly Instruction[]): Instruction[] {
  const debut = instructions.findLastIndex((instruction) => instruction.nom === "FROM");
  return debut < 0 ? [] : instructions.slice(debut);
}

function imageDuFrom(instruction: Instruction): string {
  return instruction.arguments.split(" ").find((mot) => !mot.startsWith("--")) ?? "";
}

/** F-008-AC20 : chaque étape part de la même image Node 26 Alpine, épinglée par étiquette et empreinte. */
export function constatsImagesDeBase(instructions: readonly Instruction[]): string[] {
  const images = instructionsNommees(instructions, "FROM").map(imageDuFrom);
  const constats = images
    .filter((image) => !IMAGE_NODE.test(image))
    .map((image) => `FROM ${image} : attendu node:26.<m>.<c>-alpine3.<v>@sha256:<empreinte>`);
  if (images.length === 0) constats.push("aucune instruction FROM");
  if (new Set(images).size > 1) constats.push("les étapes ne partent pas de la même image");
  return constats;
}

/** F-008-AC20 (H10) : pnpm vient de npm, à la version du champ packageManager ; corepack est absent. */
export function constatsGestionnaire(
  instructions: readonly Instruction[],
  versionDePnpm: string,
): string[] {
  const commandes = instructions.map((instruction) => instruction.arguments);
  const versions = commandes.flatMap((commande) => INSTALLATION_DE_PNPM.exec(commande)?.[1] ?? []);
  const constats: string[] = [];
  if (!isDeepStrictEqual(versions, [versionDePnpm])) {
    constats.push(`pnpm installé en « ${versions.join(", ")} », attendu ${versionDePnpm}`);
  }
  if (commandes.some((commande) => commande.includes("corepack"))) {
    constats.push("corepack est absent de l'image de base");
  }
  return constats;
}

/** F-008-AC20 : l'image finale n'a plus npm, et rien ne s'y installe. */
export function constatsRetraitDeNpm(instructions: readonly Instruction[]): string[] {
  const commandes = instructionsNommees(etapeFinale(instructions), "RUN").map(
    (instruction) => instruction.arguments,
  );
  const retraits = commandes.filter((commande) => commande.startsWith("rm -rf ")).join(" ");
  const constats = RESTES_DE_NPM.filter((chemin) => !retraits.split(" ").includes(chemin)).map(
    (chemin) => `l'étape finale ne retire pas ${chemin}`,
  );
  if (commandes.some((commande) => INSTALLATION_DE_PAQUETS.test(commande))) {
    constats.push("l'étape finale installe des paquets");
  }
  return constats;
}

/** F-008-AC20 : le dernier USER de l'étape finale est `node`. */
export function constatsUtilisateur(instructions: readonly Instruction[]): string[] {
  const dernier = instructionsNommees(etapeFinale(instructions), "USER").at(-1);
  if (dernier === undefined) return ["aucun USER dans l'étape finale : l'image tourne en root"];
  return dernier.arguments === UTILISATEUR
    ? []
    : [`dernier USER égal à « ${dernier.arguments} », attendu ${UTILISATEUR}`];
}

/** F-008-AC20 : un contrôle de santé du serveur, qui interroge GET /sante. */
export function constatsSanteDuServeur(instructions: readonly Instruction[]): string[] {
  const controle = instructionsNommees(etapeFinale(instructions), "HEALTHCHECK").at(-1);
  if (controle === undefined) return ["aucun HEALTHCHECK dans l'étape finale"];
  return controle.arguments.includes(CHEMIN_DE_SANTE)
    ? []
    : [`le HEALTHCHECK n'interroge pas ${CHEMIN_DE_SANTE}`];
}

function tableau(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return undefined;
  }
}

/** F-008-AC19 : commande en forme tableau, pour que Node reçoive SIGTERM sans shell entre les deux. */
export function constatsCommande(instructions: readonly Instruction[]): string[] {
  const commande = instructionsNommees(etapeFinale(instructions), "CMD").at(-1);
  return isDeepStrictEqual(tableau(commande?.arguments ?? ""), COMMANDE_DU_SERVEUR)
    ? []
    : [`CMD attendu en forme tableau : ${JSON.stringify(COMMANDE_DU_SERVEUR)}`];
}

/** F-008-AC14 : l'image fixe NODE_ENV=production, donc une valeur factice y est refusée par défaut. */
export function constatsModeDeProduction(instructions: readonly Instruction[]): string[] {
  const variables = instructionsNommees(etapeFinale(instructions), "ENV").map(
    (instruction) => instruction.arguments,
  );
  return variables.includes(MODE_DE_PRODUCTION) ? [] : [`ENV ${MODE_DE_PRODUCTION} attendu`];
}

/** F-008-AC13 : aucun secret dans l'image, ni par ENV ou ARG, ni par la copie d'un fichier .env. */
export function constatsSecrets(instructions: readonly Instruction[]): string[] {
  const variables = instructions
    .filter(({ nom }) => nom === "ENV" || nom === "ARG")
    .filter((instruction) => NOM_DE_SECRET.test(instruction.arguments))
    .map(({ nom }) => `${nom} porte un secret`);
  const copies = instructions
    .filter(({ nom }) => nom === "COPY" || nom === "ADD")
    .filter((instruction) => FICHIER_D_ENVIRONNEMENT.test(instruction.arguments))
    .map(({ nom }) => `${nom} copie un fichier .env`);
  return [...variables, ...copies];
}

function entreesDuContexte(texte: string): string[] {
  return texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"));
}

/** F-008-AC13, F-008-AC20 : contexte en liste blanche, sans fichier .env, test ni node_modules du poste. */
export function constatsContexte(texte: string): string[] {
  const [premiere, ...exceptions] = entreesDuContexte(texte);
  const constats: string[] = [];
  if (premiere !== "*") constats.push(".dockerignore ne commence pas par *");
  for (const exception of exceptions) {
    if (!exception.startsWith("!")) constats.push(`« ${exception} » n'est pas une exception`);
    if (ENTREE_INTERDITE_DU_CONTEXTE.test(exception)) {
      constats.push(`« ${exception} » fait entrer un fichier interdit dans le contexte`);
    }
  }
  return constats;
}

function sourcesDuContexte(instruction: Instruction): string[] {
  const mots = instruction.arguments.split(" ");
  if (mots.some((mot) => mot.startsWith("--from="))) return [];
  return mots
    .filter((mot) => !mot.startsWith("--"))
    .slice(0, -1)
    .map((source) => source.replace(/^\.\//, "").replace(/\/$/, ""));
}

/** F-008-AC20 : tout ce que le Dockerfile copie du contexte figure dans la liste blanche. */
export function constatsCopies(instructions: readonly Instruction[], contexte: string): string[] {
  const admis = entreesDuContexte(contexte)
    .filter((entree) => entree.startsWith("!"))
    .map((entree) => entree.slice(1).replace(/\/$/, ""));
  return instructionsNommees(instructions, "COPY")
    .flatMap(sourcesDuContexte)
    .filter(
      (source) => !admis.some((entree) => source === entree || source.startsWith(`${entree}/`)),
    )
    .map((source) => `COPY ${source} : absent de la liste blanche de .dockerignore`);
}
