// Couture de F-011 dans `packages/db` (F-011-AC32) : toute écriture d'adhésion passe par un seul
// module du serveur, qui signale chaque changement à ses abonnés, et toute décision d'autorisation
// par un seul module, qui lit l'adhésion. Ce test énumère les fichiers d'`apps/server/src` qui font
// entrer ces fonctions de `@notionlike/db`. Les tests du serveur peuvent les appeler pour préparer
// leurs données ; aucun autre paquet ne le peut (contrat `db-reserve-au-serveur`).
import { describe, expect, it } from "vitest";

import * as entreePublique from "../src/index.ts";
import { faitEntrer, fichiersDuWorkspace } from "./fichiers-du-workspace.ts";

// Les fonctions qui créent, changent ou suppriment une adhésion.
const ECRITURES_D_ADHESION = [
  "accepterInvitation",
  "changerRole",
  "creerEspace",
  "retirerMembre",
  "supprimerEspace",
];
const LECTURE_D_ADHESION = "lireAdhesion";

function appelantsDansLeServeur(fichiers: ReadonlyMap<string, string>, noms: readonly string[]) {
  return [...fichiers]
    .filter(([chemin]) => chemin.startsWith("apps/server/src/"))
    .filter(([, texte]) => noms.some((nom) => faitEntrer(texte, nom)))
    .map(([chemin]) => chemin);
}

function fautesDeCouture(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  const ecrivent = appelantsDansLeServeur(fichiers, ECRITURES_D_ADHESION);
  if (ecrivent.length > 1) {
    fautes.push(`modules qui écrivent une adhésion : ${ecrivent.join(", ")}`);
  }
  const lisent = appelantsDansLeServeur(fichiers, [LECTURE_D_ADHESION]);
  if (lisent.length > 1) {
    fautes.push(`modules qui lisent une adhésion : ${lisent.join(", ")}`);
  }
  return fautes;
}

function entrer(clause: string): string {
  return `${"import"} ${clause} from "@notionlike/db";\n`;
}

describe("couture des espaces", () => {
  it("F-011-AC32 au plus un module du serveur écrit une adhésion, et au plus un la lit pour autoriser", () => {
    expect(fautesDeCouture(fichiersDuWorkspace())).toEqual([]);
  });

  it("F-011-AC32 les fonctions énumérées sont bien exportées par l'entrée publique", () => {
    for (const nom of [...ECRITURES_D_ADHESION, LECTURE_D_ADHESION]) {
      expect(entreePublique).toHaveProperty(nom);
    }
  });

  it.each<[string, [string, string][], string]>([
    [
      "deux modules qui écrivent une adhésion",
      [
        ["apps/server/src/adhesions.ts", entrer("{ changerRole, retirerMembre }")],
        ["apps/server/src/invitations.ts", entrer("{ accepterInvitation }")],
      ],
      "modules qui écrivent une adhésion : apps/server/src/adhesions.ts, apps/server/src/invitations.ts",
    ],
    [
      "deux modules qui lisent une adhésion",
      [
        ["apps/server/src/autorisation.ts", entrer("{ lireAdhesion }")],
        ["apps/server/src/routes-espaces.ts", entrer("{ lireAdhesion, listerMembres }")],
      ],
      "modules qui lisent une adhésion : apps/server/src/autorisation.ts, apps/server/src/routes-espaces.ts",
    ],
  ])("F-011-AC32 la couture refuse %s", (_cas, fautifs, faute) => {
    expect(fautesDeCouture(new Map(fautifs))).toEqual([faute]);
  });

  it("F-011-AC32 la couture accepte un module d'écriture et un module d'autorisation, et les tests du serveur", () => {
    const admis = new Map([
      ["apps/server/src/adhesions.ts", entrer("{ creerEspace, supprimerEspace, changerRole }")],
      ["apps/server/src/autorisation.ts", entrer("{ lireAdhesion }")],
      ["apps/server/test/aides-espaces.ts", entrer("{ creerEspace, lireAdhesion }")],
    ]);

    expect(fautesDeCouture(admis)).toEqual([]);
  });
});
