// F-018-AC4, AC58 côté paquet (décision de l'orchestrateur après la revue du bloc 2) : la lecture de
// la version refuse, comme le serveur, un type racine `meta` d'une autre nature et un élément non
// compté dans le type racine `versions`. Couture : les appelants de `lireFormeStockee` et les
// lecteurs de `meta` sont énumérés dans les sources, et chacun est éprouvé.
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { ouvrirDocumentEspace, ouvrirDocumentPage, ouvrirDocumentTable } from "../src/index.ts";
import { codeDuRefusDe } from "./aides-page.ts";

const SOURCES = new URL("../src/", import.meta.url);

function source(fichier: string): string {
  return readFileSync(new URL(fichier, SOURCES), "utf8");
}

function fichiersQui(motif: RegExp, sauf: string): string[] {
  return readdirSync(SOURCES)
    .filter((fichier) => fichier.endsWith(".ts") && fichier !== sauf)
    .filter((fichier) => motif.test(source(fichier)))
    .sort();
}

// Une mise à jour écrite par `ecrire` sur une copie de `base`, qui n'est pas touchée.
function ecrireSurUneCopie(base: Uint8Array, ecrire: (doc: Y.Doc) => void): Uint8Array {
  const copie = new Y.Doc();
  Y.applyUpdate(copie, base);
  const avant = Y.encodeStateVector(copie);
  ecrire(copie);
  const miseAJour = Y.encodeStateAsUpdate(copie, avant);
  copie.destroy();
  return miseAJour;
}

function docRecu(...misesAJour: Uint8Array[]): Y.Doc {
  const doc = new Y.Doc();
  misesAJour.forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
  return doc;
}

// Une version 1 inscrite dans `versions`, lisible par les trois formats.
const BASE = (() => {
  const doc = new Y.Doc();
  doc.getArray<unknown>("versions").push([1]);
  return Y.encodeStateAsUpdate(doc);
})();

// Des attributs de mise en forme autour de l'entrée : éléments non comptés, que `forEach` passe.
const VERSIONS_MISES_EN_FORME = ecrireSurUneCopie(BASE, (doc) =>
  doc.getText("versions").format(0, 1, { bold: true }),
);

type Ouverture = (doc: Y.Doc) => unknown;

// Chaque appelant de `lireFormeStockee`, par l'ouverture de la façade qui le traverse.
const OUVERTURES_PAR_APPELANT: Record<string, Ouverture> = {
  "document-page.ts": (doc) => ouvrirDocumentPage(doc),
  "format-table.ts": (doc) => ouvrirDocumentTable(doc).lire(),
  "format.ts": (doc) => ouvrirDocumentEspace(doc).lire(),
};

describe("élément non compté dans le type racine versions", () => {
  it("F-018-AC58 les appelants de lireFormeStockee sont ceux que ce fichier éprouve", () => {
    expect(fichiersQui(/lireFormeStockee\(/, "format-page.ts")).toEqual(
      Object.keys(OUVERTURES_PAR_APPELANT).sort(),
    );
  });

  it("F-018-AC58 la mise en forme est bien invisible pour forEach : le cas n'est pas vide", () => {
    const doc = docRecu(BASE, VERSIONS_MISES_EN_FORME);
    const versions = doc.getArray<unknown>("versions");
    expect(versions.toArray()).toEqual([1]);
    let nonComptes = 0;
    for (let element = versions._start; element !== null; element = element.right) {
      nonComptes += element.countable ? 0 : 1;
    }
    expect(nonComptes).toBeGreaterThan(0);
  });

  it.each(Object.entries(OUVERTURES_PAR_APPELANT))(
    "F-018-AC58 %s : la version 1 inscrite seule s'ouvre, entourée d'attributs de mise en forme elle est refusée par version-non-prise-en-charge, sans rien écrire",
    (_appelant, ouvrir) => {
      expect(codeDuRefusDe(() => ouvrir(docRecu(BASE)))).toBeUndefined();

      const forge = docRecu(BASE, VERSIONS_MISES_EN_FORME);
      const avant = Y.encodeStateAsUpdate(forge);
      expect(codeDuRefusDe(() => ouvrir(forge))).toBe("version-non-prise-en-charge");
      expect(Y.encodeStateAsUpdate(forge)).toEqual(avant);
    },
  );
});

// Un type racine `meta` d'une autre nature qu'un `Y.Map` : reçu sous un autre type, ou déjà lu
// localement sous un autre type partagé.
const META_FORGES: [string, () => Y.Doc][] = [
  [
    "meta défini sous un Y.Array",
    () => docRecu(ecrireSurUneCopie(BASE, (doc) => doc.getArray<unknown>("meta").push([1]))),
  ],
  [
    "meta défini sous un Y.Text",
    () => docRecu(ecrireSurUneCopie(BASE, (doc) => doc.getText("meta").insert(0, "1"))),
  ],
  [
    "meta défini sous un Y.XmlFragment",
    () =>
      docRecu(
        ecrireSurUneCopie(BASE, (doc) => doc.getXmlFragment("meta").insert(0, [new Y.XmlText()])),
      ),
  ],
  [
    "meta déjà lu sous un autre type partagé",
    () => {
      const doc = new Y.Doc();
      doc.getArray<unknown>("meta");
      Y.applyUpdate(doc, BASE);
      return doc;
    },
  ],
];

describe("type racine meta d'une autre nature", () => {
  it("F-018-AC58 seul le format du document d'espace nomme le type racine meta", () => {
    expect(fichiersQui(/"meta"/, "")).toEqual(["format.ts"]);
  });

  it("F-018-AC58 un meta Y.Map de version 2 et un meta absent s'ouvrent : le contrôle n'est pas vide", () => {
    const enVersionDeux = docRecu(
      ecrireSurUneCopie(BASE, (doc) => doc.getMap<unknown>("meta").set("version", 2)),
    );
    expect(codeDuRefusDe(() => ouvrirDocumentEspace(enVersionDeux).lire())).toBeUndefined();
    expect(codeDuRefusDe(() => ouvrirDocumentEspace(docRecu(BASE)).lire())).toBeUndefined();
  });

  it.each(META_FORGES)(
    "F-018-AC58 %s : lire() et chaque écriture refusent par version-non-prise-en-charge, sans rien écrire",
    (_cas, forger) => {
      const doc = forger();
      const avant = Y.encodeStateAsUpdate(doc);
      const espace = ouvrirDocumentEspace(doc);
      const operations = [
        () => espace.lire(),
        () => espace.creerPage("p"),
        () => espace.creerTable("t"),
      ];

      expect(operations.map(codeDuRefusDe)).toEqual(
        operations.map(() => "version-non-prise-en-charge"),
      );
      expect(Y.encodeStateAsUpdate(doc)).toEqual(avant);
      espace.fermer();
    },
  );
});
