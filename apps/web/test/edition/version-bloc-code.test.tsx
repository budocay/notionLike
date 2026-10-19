// Version 3 du document de page et montée de version par le premier bloc code (F-005-AC23 à AC28),
// jouées par la session de page et la zone principale, comme l'application les monte.
import {
  lireVersionPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "@notionlike/document";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { contenuLu, fragmentBrut, inventaireDuContenu } from "../aides-facade-page.ts";
import {
  documentDeLaLigne,
  documentDeVersionInconnue,
  relireParLaPersistance,
  textesDeLaLigne,
  VERSION_INCONNUE,
} from "../aides-lignes.ts";
import {
  afficherUnePage,
  attendrePhase,
  demarrerUneSession,
  rendreLaSession,
} from "../aides-session-page.tsx";
import {
  annuler,
  chercherLaZoneDeSaisie,
  collerLesDonnees,
  commande,
  deposerDuHtml,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  placerLeCurseurApres,
  presser,
  presserAvecMod,
  schemaDeLEditeur,
  selectionnerLeBloc,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const VERSION_DU_BLOC_CODE = 3;
const LIGNES_ANTERIEURES = TABLE_DES_VERSIONS_PAGE.filter(
  (ligne) => ligne.version < VERSION_PAGE_PRISE_EN_CHARGE,
).map((ligne) => ligne.version);

function blocsCode(doc: Y.Doc): number {
  return inventaireDuContenu(doc).noeuds.codeBlock === undefined ? 0 : 1;
}

/** Après chaque mise à jour, rejouée dans l'ordre sur l'état de départ : bloc code et version. */
function lecturesSuccessives(depart: Uint8Array, misesAJour: readonly Uint8Array[]) {
  const rejoue = new Y.Doc();
  Y.applyUpdate(rejoue, depart);
  return misesAJour.map((miseAJour) => {
    Y.applyUpdate(rejoue, miseAJour);
    return { blocCode: blocsCode(rejoue) > 0, version: lireVersionPage(rejoue) };
  });
}

/** Chaque chemin qui inscrit un bloc code, joué depuis un paragraphe « mot », curseur à sa fin. */
const CHEMINS: readonly (readonly [string, () => Promise<void>])[] = [
  [
    "la barre de blocs",
    async () => {
      selectionnerLeBloc();
      act(() => commande("Bloc code").click());
      await Promise.resolve();
    },
  ],
  [
    "le menu slash",
    async () => {
      taper(" /cod");
      await laisserLeMenuSuivre();
      presser("Enter");
      await laisserLeMenuSuivre();
    },
  ],
  [
    "la règle de saisie",
    async () => {
      presser("Enter");
      taper("```python ");
      await Promise.resolve();
    },
  ],
  [
    "le collage d'un `pre`",
    async () => {
      presser("Enter");
      collerLesDonnees({ "text/plain": "x", "text/html": "<pre><code>x</code></pre>" });
      await Promise.resolve();
    },
  ],
  [
    "le collage depuis un éditeur de code",
    async () => {
      presser("Enter");
      collerLesDonnees({ "text/plain": "x", "vscode-editor-data": '{"mode":"python"}' });
      await Promise.resolve();
    },
  ],
  [
    "le dépôt d'un `pre`",
    async () => {
      deposerDuHtml("<pre><code>depose</code></pre>", "mot");
      await Promise.resolve();
    },
  ],
];

describe("numéro de version", () => {
  it("F-005-AC23 les numéros se suivent depuis 1 sans trou, chaque ligne contient la précédente, la dernière ajoute codeBlock et son attribut language, le schéma de l'éditeur est exactement la dernière ligne et la version prise en charge est son numéro", async () => {
    await afficherUnePage();
    const schema = schemaDeLEditeur();
    const derniere = TABLE_DES_VERSIONS_PAGE.at(-1);
    const avant = TABLE_DES_VERSIONS_PAGE.at(-2);

    expect(TABLE_DES_VERSIONS_PAGE.map((ligne) => ligne.version)).toEqual(
      TABLE_DES_VERSIONS_PAGE.map((_, rang) => rang + 1),
    );
    TABLE_DES_VERSIONS_PAGE.slice(1).forEach((ligne, rang) => {
      const precedente = TABLE_DES_VERSIONS_PAGE[rang];
      for (const [noeud, attributs] of Object.entries(precedente?.noeuds ?? {})) {
        expect(ligne.noeuds[noeud], noeud).toEqual(expect.arrayContaining([...attributs]));
      }
      expect(ligne.marques).toEqual(expect.arrayContaining([...(precedente?.marques ?? [])]));
    });
    expect(derniere?.version).toBe(VERSION_DU_BLOC_CODE);
    expect(derniere?.noeuds).toEqual({ ...avant?.noeuds, codeBlock: ["language"] });
    expect(derniere?.marques).toEqual(avant?.marques);
    expect(schema.noeuds).toEqual(derniere?.noeuds);
    expect(schema.marques).toEqual(derniere?.marques);
    expect(VERSION_PAGE_PRISE_EN_CHARGE).toBe(VERSION_DU_BLOC_CODE);
  });
});

describe("lecture d'une version antérieure", () => {
  it.each(LIGNES_ANTERIEURES)(
    "F-005-AC24 un document de la ligne %s s'affiche entier, sans mise à jour à l'ouverture, et ni une frappe ni une commande de bloc autre que « Bloc code » n'écrivent de version",
    async (version) => {
      const doc = documentDeLaLigne(version);
      const depart = [...Y.encodeStateAsUpdate(doc)];

      const { emises } = await afficherUnePage(doc);
      const aLOuverture = [emises.length, [...Y.encodeStateAsUpdate(doc)]] as const;
      const affiche = zoneDeSaisie().textContent;
      entrerDansLEditeur();
      const texte = textesDeLaLigne(version)[1] ?? "";
      placerLeCurseurApres(texte);
      taper(" et la suite");
      selectionnerLeBloc();
      act(() => commande("Titre 2").click());
      act(() => commande("Liste numérotée").click());

      expect(aLOuverture).toEqual([0, depart]);
      for (const un of textesDeLaLigne(version)) {
        expect(affiche).toContain(un);
      }
      expect(contenuLu(doc)).toContain("et la suite");
      expect(contenuLu(doc)).toContain("<orderedlist");
      expect(lireVersionPage(doc)).toBe(version);
      expect(doc.getArray("versions").length).toBe(version === 1 ? 0 : 1);
    },
  );
});

describe("écriture de la version", () => {
  it.each(CHEMINS)(
    "F-005-AC25 par %s, la version est élevée à 3 avant toute mise à jour qui porte un bloc code, et une annulation retire le bloc code sans abaisser la version",
    async (_chemin, inscrire) => {
      const { doc, emises } = await afficherUnePage(documentDeLaLigne(2));
      entrerDansLEditeur();
      placerLeCurseurApres("gras de la ligne 2");
      presser("Enter");
      taper("mot");
      const depart = Y.encodeStateAsUpdate(doc);
      const avant = emises.length;

      await inscrire();
      const lectures = lecturesSuccessives(depart, emises.slice(avant));
      const inscrit = blocsCode(doc);
      annuler();

      expect(inscrit).toBe(1);
      expect(lectures.filter((lu) => lu.blocCode && lu.version < VERSION_DU_BLOC_CODE)).toEqual([]);
      expect(lectures.at(-1)).toEqual({ blocCode: true, version: VERSION_DU_BLOC_CODE });
      expect(blocsCode(doc)).toBe(0);
      expect(lireVersionPage(doc)).toBe(VERSION_DU_BLOC_CODE);
    },
  );

  it("F-005-AC25 la version élevée est celle du bloc code, et non la plus haute connue ; l'élévation part avant, dans sa propre mise à jour, sans bloc code", async () => {
    const { doc, emises } = await afficherUnePage();
    entrerDansLEditeur();
    taper("mot");
    const depart = Y.encodeStateAsUpdate(doc);
    const avant = emises.length;

    selectionnerLeBloc();
    act(() => commande("Bloc code").click());

    expect(lecturesSuccessives(depart, emises.slice(avant))).toEqual([
      { blocCode: false, version: VERSION_DU_BLOC_CODE },
      { blocCode: true, version: VERSION_DU_BLOC_CODE },
    ]);
  });
});

describe("la version ne baisse jamais", () => {
  it("F-005-AC26 un bloc code inséré dans un document de version 2, puis l'historique épuisé : plus de bloc code, la version lue reste 3, ici et sur un document vierge qui reçoit les mises à jour", async () => {
    const { doc } = await afficherUnePage(documentDeLaLigne(2));
    entrerDansLEditeur();
    placerLeCurseurApres("gras de la ligne 2");
    presser("Enter");
    taper("``` code");
    presser("Enter");
    taper("suite");
    const avantLesAnnulations = [blocsCode(doc), lireVersionPage(doc)];

    for (let essai = 0; essai < 10; essai += 1) {
      annuler();
    }
    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, Y.encodeStateAsUpdate(doc));

    expect(avantLesAnnulations).toEqual([1, VERSION_DU_BLOC_CODE]);
    expect(blocsCode(doc)).toBe(0);
    expect(lireVersionPage(doc)).toBe(VERSION_DU_BLOC_CODE);
    expect(blocsCode(vierge)).toBe(0);
    expect(lireVersionPage(vierge)).toBe(VERSION_DU_BLOC_CODE);
    expect(fragmentBrut(doc).toString()).toBe(fragmentBrut(documentDeLaLigne(2)).toString());
  });
});

describe("refus d'une version supérieure", () => {
  it("F-005-AC27 un document de la version 4, avec un nœud et une marque absents du schéma : aucun éditeur, aucune mise à jour, l'état encodé inchangé à l'octet près", async () => {
    const doc = documentDeVersionInconnue();
    const avant = [...Y.encodeStateAsUpdate(doc)];

    const { session, emises } = demarrerUneSession(undefined, doc);
    rendreLaSession(session);
    await act(() => attendrePhase(session, "version-non-prise-en-charge"));

    expect(VERSION_INCONNUE).toBe(VERSION_DU_BLOC_CODE + 1);
    expect(lireVersionPage(doc)).toBe(VERSION_INCONNUE);
    expect(chercherLaZoneDeSaisie()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/Mettez l'application à jour/);
    expect(emises).toEqual([]);
    expect([...Y.encodeStateAsUpdate(doc)]).toEqual(avant);
  });
});

describe("couture du format", () => {
  it("F-005-AC28 un bloc code s'enregistre comme un nœud codeBlock de texte seul, sans marque, au seul attribut language, omis sans langage, sans nouveau type racine", async () => {
    const { doc } = await afficherUnePage();
    entrerDansLEditeur();
    taper("```python a");
    presser("Enter");
    taper("b");
    presserAvecMod("Enter");
    taper("``` c");

    const [avecLangage, sansLangage] = fragmentBrut(doc).toArray() as Y.XmlElement[];
    expect(avecLangage?.nodeName).toBe("codeBlock");
    expect(avecLangage?.getAttributes()).toEqual({ language: "python" });
    expect(avecLangage?.toArray().map((enfant) => enfant.constructor.name)).toEqual(["YXmlText"]);
    expect((avecLangage?.get(0) as Y.XmlText).toDelta()).toEqual([{ insert: "a\nb" }]);
    expect(sansLangage?.nodeName).toBe("codeBlock");
    expect(sansLangage?.getAttributes()).toEqual({});
    expect([...doc.share.keys()].sort()).toEqual(["contenu", "versions"]);
  });

  it("F-005-AC28 un document qui porte un bloc code de plusieurs lignes avec langage, enregistré par le module de persistance puis relu dans un document vierge, donne le même contenu lu", async () => {
    const doc = documentDeLaLigne(VERSION_DU_BLOC_CODE);

    const relu = await relireParLaPersistance(doc);

    expect(contenuLu(relu)).toBe(contenuLu(doc));
    expect(contenuLu(relu)).toContain(
      '<codeblock language="python">def ligne_3():\n    return 3</codeblock>',
    );
    expect(lireVersionPage(relu)).toBe(VERSION_DU_BLOC_CODE);
  });
});
