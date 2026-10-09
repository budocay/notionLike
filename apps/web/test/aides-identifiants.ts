// Table des formes qu'un identifiant ne doit jamais avoir (F-002-AC27, AC28). Elle sert au test de
// la fonction de forme, à celui du nom des bases, et servira à celui de la route.
export const UUID_AVEC_LETTRES = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const PAGE_P = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
export const TABLE_T = "c1d2e3f4-a5b6-4c7d-9e8f-0a1b2c3d4e5f";

const LONGUEUR_CANONIQUE = UUID_AVEC_LETTRES.length;

// Même longueur qu'un UUID canonique : seule l'analyse de la forme peut refuser ces chaînes.
function deLongueurCanonique(enTete: string): string {
  return `${enTete}${UUID_AVEC_LETTRES.slice(enTete.length)}`;
}

export const FORMES_REFUSEES: readonly (readonly [cas: string, valeur: string])[] = [
  ["vide", ""],
  ["de plusieurs milliers de caractères", "a".repeat(5_000)],
  ["fait d'un UUID répété sur plusieurs milliers de caractères", UUID_AVEC_LETTRES.repeat(200)],
  ["trop court d'un caractère", UUID_AVEC_LETTRES.slice(0, -1)],
  ["trop long d'un caractère", `${UUID_AVEC_LETTRES}0`],
  ["en majuscules", UUID_AVEC_LETTRES.toUpperCase()],
  ["dont une seule lettre est en majuscule", deLongueurCanonique("0A")],
  ["dont un caractère n'est pas hexadécimal", deLongueurCanonique("0g")],
  ["dont un chiffre n'est pas ASCII", deLongueurCanonique("٠")],
  ["qui contient « : »", deLongueurCanonique(":")],
  ["suivi de « :page »", `${UUID_AVEC_LETTRES}:page`],
  ["qui contient « / »", deLongueurCanonique("/")],
  ["qui contient « # »", deLongueurCanonique("#")],
  ["qui contient « % »", deLongueurCanonique("%")],
  ["dont une séquence encodée se décoderait en UUID canonique", `%30${UUID_AVEC_LETTRES.slice(1)}`],
  ["de 36 caractères avec une séquence encodée", deLongueurCanonique("%2F")],
  ["fait de balisage HTML", "<img src=x onerror=alert(1)>"],
  ["de 36 caractères avec du balisage HTML", deLongueurCanonique("<b>")],
  ["suivi d'un segment en trop", `${UUID_AVEC_LETTRES}/autre`],
  ["précédé d'une espace", ` ${UUID_AVEC_LETTRES}`],
  ["de 36 caractères commençant par une espace", deLongueurCanonique(" ")],
  ["suivi d'un saut de ligne", `${UUID_AVEC_LETTRES}\n`],
  ["de 36 caractères finissant par un saut de ligne", `${UUID_AVEC_LETTRES.slice(0, -1)}\n`],
  ["sans tirets", UUID_AVEC_LETTRES.replaceAll("-", "")],
  ["sans tirets, complété à 36 caractères", `${UUID_AVEC_LETTRES.replaceAll("-", "")}0000`],
  ["entre accolades", `{${UUID_AVEC_LETTRES}}`],
];

export const FORMES_REFUSEES_DE_LONGUEUR_CANONIQUE = FORMES_REFUSEES.filter(
  ([, valeur]) => valeur.length === LONGUEUR_CANONIQUE,
);
