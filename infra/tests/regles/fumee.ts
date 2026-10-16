import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const ANNONCE_DE_CONSTAT = /^\s*constat (\d+) /;
const NOMBRE_DE_CONSTATS = 17;
const ANNONCE_ET_SENS = /^\s*constat (\d+) "([^"]*)"/;
const NETTOYAGE = "nettoyage";
const APPEL_DE_LA_PILE = /PILE_PROJET="\$PROJET".*\bbash "\$RACINE\/infra\/pile\.sh"/;
const SOUS_COMMANDES_EPROUVEES = ["demarrer", "arreter", "accorder"];
const LANCEMENT = "up -d --wait";
const OPTION_INTERDITE = "--abort-on-container-exit";
const PORTS_DE_TRAVAIL = ["5432", "3000"];
const AFFECTATION = /^(?:export\s+|readonly\s+)?([A-Z_]+)="?([^"\s]*)"?$/;

function lignesDeCommande(texte: string): string[] {
  return texte
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"));
}

function variablesDuScript(lignes: readonly string[]): Map<string, string> {
  const affectations = lignes.flatMap((ligne) => {
    const [, nom, valeur] = AFFECTATION.exec(ligne) ?? [];
    return nom === undefined || valeur === undefined ? [] : [[nom, valeur] as const];
  });
  return new Map(affectations);
}

/**
 * F-008-AC19, F-031-AC26 : les constats 1 à 17 (1 à 10 de l'ADR-0006, 11 à 16 de la commande de la
 * pile, 17 le nettoyage) sont annoncés, chacun une fois, dans l'ordre.
 */
export function constatsOrdreDesConstats(texte: string): string[] {
  const annonces = lignesDeCommande(texte).flatMap((ligne) => {
    const numero = ANNONCE_DE_CONSTAT.exec(ligne)?.[1];
    return numero === undefined ? [] : [Number(numero)];
  });
  const attendus = Array.from({ length: NOMBRE_DE_CONSTATS }, (_, rang) => rang + 1);
  return isDeepStrictEqual(annonces, attendus)
    ? []
    : [`constats annoncés : ${annonces.join(", ")} ; attendus : ${attendus.join(", ")}`];
}

/** F-008-AC19 (H12) : lancement par `up -d --wait`, jamais par `--abort-on-container-exit`. */
export function constatsLancement(texte: string): string[] {
  const lignes = lignesDeCommande(texte);
  const constats: string[] = [];
  if (!lignes.some((ligne) => ligne.includes(LANCEMENT))) {
    constats.push(`la pile n'est pas lancée par ${LANCEMENT}`);
  }
  if (lignes.some((ligne) => ligne.includes(OPTION_INTERDITE))) {
    constats.push(`${OPTION_INTERDITE} arrête la pile dès que la migration finit`);
  }
  return constats;
}

/** F-008-AC19 (H12) : nom de projet et ports du poste distincts de ceux de la pile de travail. */
export function constatsIsolement(texte: string, projetDeTravail: string): string[] {
  const variables = variablesDuScript(lignesDeCommande(texte));
  const projet = variables.get("PROJET");
  const constats: string[] = [];
  if (projet === undefined || projet === projetDeTravail) {
    constats.push("le projet de fumée n'a pas un nom distinct de la pile de travail");
  }
  for (const nom of ["PORT_PUBLIE_BASE", "PORT_PUBLIE_SERVEUR"]) {
    const port = variables.get(nom);
    if (port === undefined || PORTS_DE_TRAVAIL.includes(port)) {
      constats.push(`${nom} n'est pas un port distinct de ceux de la pile de travail`);
    }
  }
  return constats;
}

/** F-008-AC19 : le script se lit sans erreur de syntaxe (`bash -n`), faute de pouvoir être lancé ici. */
export function constatsSyntaxe(texte: string): string[] {
  const { status, stderr } = spawnSync("bash", ["-n", "-s"], { input: texte, encoding: "utf8" });
  return status === 0 ? [] : [`bash -n : ${stderr.trim()}`];
}

/** F-031-AC26 : le nettoyage reste le dernier constat annoncé. */
export function constatsDernierConstat(texte: string): string[] {
  const annonces = lignesDeCommande(texte).flatMap((ligne) => {
    const [, numero, sens] = ANNONCE_ET_SENS.exec(ligne) ?? [];
    return numero === undefined || sens === undefined ? [] : [{ numero, sens }];
  });
  const dernier = annonces.at(-1);
  return dernier?.sens.startsWith(NETTOYAGE) === true
    ? []
    : [`le dernier constat (${dernier?.numero ?? "aucun"}) n'est pas le nettoyage`];
}

/**
 * F-031-AC26 : la fumée passe par infra/pile.sh sous son propre projet, et en éprouve demarrer, arreter
 * et accorder.
 */
export function constatsCommandeDeLaPile(texte: string): string[] {
  const lignes = lignesDeCommande(texte);
  const constats = APPEL_DE_LA_PILE.test(lignes.join(" "))
    ? []
    : ["infra/pile.sh n'est pas lancé sous le projet de fumée (PILE_PROJET)"];
  for (const sousCommande of SOUS_COMMANDES_EPROUVEES) {
    if (!lignes.some((ligne) => new RegExp(`\\bpile ${sousCommande}\\b`).test(ligne))) {
      constats.push(`pile ${sousCommande} n'est pas éprouvé`);
    }
  }
  return constats;
}
