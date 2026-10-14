// Couture de F-012 dans `packages/db`. Deux règles : la lecture et l'écriture des instantanés
// passent par un seul module du serveur, celui du stockage (F-012-AC29 énumère les modules
// d'`apps/server` qui lisent ou écrivent un document) ; et aucune requête ne supprime un document,
// qui ne disparaît qu'avec son espace, par la cascade de la clé étrangère, dans la transaction de
// `supprimerEspace` (F-012-AC31). La suppression d'un document isolé est livrée par F-025, qui
// étendra ce test (F-025-AC36). Ce fichier porte les motifs cherchés : il est écarté de la recherche.
import { describe, expect, it } from "vitest";

import * as entreePublique from "../src/index.ts";
import { faitEntrer, fichiersDuWorkspace } from "./fichiers-du-workspace.ts";

const LECTURE_ET_ECRITURE = ["lireDocument", "enregistrerDocument"];
const CE_FICHIER = "packages/db/test/couture-documents.test.ts";

// Une suppression dans la table des documents, par Drizzle ou en SQL écrit à la main.
const supprimeUnDocument = (texte: string): boolean =>
  /\.delete\(\s*document\s*\)|delete\s+from\s+"?document"?(?![\w"])/i.test(texte);

function fautesDeCouture(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  const stockent = [...fichiers]
    .filter(([chemin]) => chemin.startsWith("apps/server/src/"))
    .filter(([, texte]) => LECTURE_ET_ECRITURE.some((nom) => faitEntrer(texte, nom)))
    .map(([chemin]) => chemin);
  if (stockent.length > 1) {
    fautes.push(`modules qui lisent ou écrivent un instantané : ${stockent.join(", ")}`);
  }
  for (const [chemin, texte] of fichiers) {
    if (chemin !== CE_FICHIER && supprimeUnDocument(texte)) {
      fautes.push(`${chemin} supprime un document`);
    }
  }
  return fautes;
}

function entrer(clause: string): string {
  return `${"import"} ${clause} from "@notionlike/db";\n`;
}

describe("couture des documents", () => {
  it("F-012-AC29 F-012-AC31 au plus un module du serveur lit ou écrit un instantané, et aucun fichier du workspace ne supprime un document", () => {
    expect(fautesDeCouture(fichiersDuWorkspace())).toEqual([]);
  });

  it("F-012-AC29 les fonctions énumérées sont bien exportées par l'entrée publique", () => {
    for (const nom of LECTURE_ET_ECRITURE) {
      expect(entreePublique).toHaveProperty(nom);
    }
  });

  it.each<[string, [string, string][], string]>([
    [
      "deux modules qui lisent ou écrivent un instantané",
      [
        ["apps/server/src/synchro/stockage.ts", entrer("{ lireDocument }")],
        ["apps/server/src/synchro/relais.ts", entrer("{ enregistrerDocument as ecrire }")],
      ],
      "modules qui lisent ou écrivent un instantané : apps/server/src/synchro/stockage.ts, apps/server/src/synchro/relais.ts",
    ],
    [
      "une suppression par Drizzle",
      [["packages/db/src/documents.ts", "await db.delete(document).where(cle);"]],
      "packages/db/src/documents.ts supprime un document",
    ],
    [
      "une suppression en SQL écrit à la main",
      [["apps/server/src/purge.ts", 'await db.execute(sql`DELETE FROM "document" WHERE x`);']],
      "apps/server/src/purge.ts supprime un document",
    ],
  ])("F-012-AC29 F-012-AC31 la couture refuse %s", (_cas, fautifs, faute) => {
    expect(fautesDeCouture(new Map(fautifs))).toEqual([faute]);
  });

  it("F-012-AC29 F-012-AC31 la couture accepte un module de stockage, le décompte ailleurs, les tests du serveur et la suppression d'un espace", () => {
    const admis = new Map([
      ["apps/server/src/synchro/stockage.ts", entrer("{ lireDocument, enregistrerDocument }")],
      ["apps/server/src/synchro/quota.ts", entrer("{ compterDocuments }")],
      ["apps/server/test/synchro.test.ts", entrer("{ lireDocument, enregistrerDocument }")],
      ["packages/db/src/espaces.ts", "await transaction.delete(espace).where(cle);"],
      ["packages/db/test/documents.test.ts", 'sql`delete from "document_cache"`'],
    ]);

    expect(fautesDeCouture(admis)).toEqual([]);
  });
});
