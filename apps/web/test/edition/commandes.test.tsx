// Liste des commandes de bloc et disponibilité (F-005-AC11, AC14, AC21) : une seule liste pour la
// barre et le menu slash, et aucune commande que le schéma refuse n'écrit quoi que ce soit.
import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { commandesFiltrees, LISTE_DES_COMMANDES } from "../../src/edition/index.ts";
import { bloc, contenuLu, documentForge } from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  blocDuCurseur,
  commande,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  menuSlash,
  monterLEditeur,
  NOMS_DES_COMMANDES,
  nomsDuMenu,
  placerLeCurseurALaFinDe,
  placerLeCurseurDansLeDernierBloc,
  presser,
  schemaDeLEditeur,
  selectionnerLeBloc,
  taper,
} from "./aides-edition.tsx";

// Nœuds de la table qui ne sont pas des blocs que l'on choisit : la racine, le texte, et l'élément
// de liste, qui n'existe que dans une liste.
const NOEUDS_SANS_COMMANDE = ["doc", "listItem", "text"];

/** Une liste à puces dont l'unique élément porte ces paragraphes, écrite par `yjs` seul. */
function documentAvecUnElement(...paragraphes: string[]): Y.Doc {
  const liste = new Y.XmlElement("bulletList");
  const element = new Y.XmlElement("listItem");
  element.insert(
    0,
    paragraphes.map((texte) => bloc("paragraph", texte)),
  );
  liste.insert(0, [element]);
  return documentForge(liste);
}

const LISTE_ATTENDUE =
  "<bulletlist><listitem><paragraph>premier</paragraph></listitem></bulletlist>";

describe("une seule liste de commandes", () => {
  it("F-005-AC21 chaque type de bloc de la dernière ligne de la table a sa commande dans la barre et dans le menu ouvert dans un paragraphe de premier niveau, et chaque commande donne un nœud du schéma", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();
    const dansLaBarre = NOMS_DES_COMMANDES.filter((nom) =>
      barreDeBlocs()?.querySelector(`[aria-label="${nom}"]`),
    );
    placerLeCurseurALaFinDe("texte");
    taper(" /");
    await laisserLeMenuSuivre();
    const dansLeMenu = nomsDuMenu();
    const noeudsDuSchema = Object.keys(schemaDeLEditeur().noeuds);
    const types = Object.keys(TABLE_DES_VERSIONS_PAGE.at(-1)?.noeuds ?? {}).filter(
      (noeud) => !NOEUDS_SANS_COMMANDE.includes(noeud),
    );

    const noms = LISTE_DES_COMMANDES.map((une) => une.nom);
    expect(dansLaBarre).toEqual(noms);
    expect(dansLeMenu).toEqual(noms);
    for (const type of types) {
      expect(
        LISTE_DES_COMMANDES.filter((une) => une.noeud === type).map((une) => une.nom),
        type,
      ).not.toEqual([]);
    }
    expect(LISTE_DES_COMMANDES.filter((une) => !noeudsDuSchema.includes(une.noeud))).toEqual([]);
    expect([...new Set(LISTE_DES_COMMANDES.map((une) => une.noeud))].sort()).toEqual(types.sort());
  });

  it("F-005-AC21 cas fautifs : un type de bloc sans commande, et une commande d'un type absent du schéma, sont vus", () => {
    const sansCommande = ["bulletList", "codeBlock", "blocFutur"].filter(
      (type) => !LISTE_DES_COMMANDES.some((une) => une.noeud === type),
    );
    const schema = ["paragraph", "heading"];

    expect(sansCommande).toEqual(["blocFutur"]);
    expect(
      LISTE_DES_COMMANDES.filter((une) => !schema.includes(une.noeud)).map((une) => une.nom),
    ).toEqual(["Liste à puces", "Liste numérotée", "Bloc code"]);
  });

  it("F-005-AC14 le filtre, fonction pure, garde l'ordre d'origine et ignore la casse et les accents", () => {
    expect(commandesFiltrees(LISTE_DES_COMMANDES, "").map((une) => une.nom)).toEqual(
      LISTE_DES_COMMANDES.map((une) => une.nom),
    );
    expect(commandesFiltrees(LISTE_DES_COMMANDES, "NUMÉRO").map((une) => une.nom)).toEqual([
      "Liste numérotée",
    ]);
    expect(commandesFiltrees(LISTE_DES_COMMANDES, "éèê")).toEqual([]);
    expect(
      commandesFiltrees([{ nom: "Élément", motsCles: ["cafe"] }], "CAFÉ").map((une) => une.nom),
    ).toEqual(["Élément"]);
  });
});

describe("commande indisponible", () => {
  it("F-005-AC11 dans le premier paragraphe d'un élément de liste, « Bloc code » est désactivée dans la barre et absente du menu ; ni le clic, ni le raccourci de l'extension n'écrivent quoi que ce soit, et l'élément reste dans sa liste", async () => {
    const { doc, emises } = monterLEditeur(documentAvecUnElement("premier"));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("premier");
    selectionnerLeBloc();
    const etat = commande("Bloc code").getAttribute("aria-disabled");
    const avant = emises.length;

    act(() => commande("Bloc code").click());
    placerLeCurseurALaFinDe("premier");
    const raccourciTraite = presser("c", { ctrlKey: true, altKey: true });
    presser("c", { ctrlKey: true, altKey: true, shiftKey: true });

    expect(etat).toBe("true");
    expect(raccourciTraite).toBe(false);
    expect(emises.length).toBe(avant);
    expect(contenuLu(doc).toLowerCase()).toBe(LISTE_ATTENDUE);
  });

  it("F-005-AC11 F-005-AC18 dans le premier paragraphe d'un élément de liste, « /code » ne liste rien : Entrée y ferme le menu et agit comme Entrée, sans bloc code, l'élément restant dans sa liste", async () => {
    const { doc } = monterLEditeur(documentAvecUnElement("premier"));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("premier");
    taper(" /code");
    await laisserLeMenuSuivre();
    const liste = nomsDuMenu();
    const ouvert = menuSlash();

    presser("Enter");
    await laisserLeMenuSuivre();

    expect(ouvert).not.toBeNull();
    expect(liste).toEqual([]);
    expect(menuSlash()).toBeNull();
    expect(contenuLu(doc).toLowerCase()).not.toContain("codeblock");
    expect(contenuLu(doc).toLowerCase()).toMatch(
      /^<bulletlist><listitem><paragraph>premier \/code<\/paragraph><\/listitem>/,
    );
  });

  it("F-005-AC11 dans le deuxième paragraphe d'un élément de liste, « Bloc code » est disponible et donne un bloc code à l'intérieur de l'élément, par la barre comme par le menu", async () => {
    const parLaBarre = monterLEditeur(documentAvecUnElement("premier", "second"));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("second");
    selectionnerLeBloc();
    const etat = commande("Bloc code").getAttribute("aria-disabled");

    act(() => commande("Bloc code").click());

    expect(etat).toBeNull();
    expect(contenuLu(parLaBarre.doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>premier</paragraph><codeblock>second</codeblock></listitem></bulletlist>",
    );
  });

  it("F-005-AC11 le menu ouvert dans le deuxième paragraphe d'un élément liste « Bloc code », qui y donne un bloc code dans l'élément", async () => {
    const { doc } = monterLEditeur(documentAvecUnElement("premier", ""));
    entrerDansLEditeur();
    placerLeCurseurDansLeDernierBloc();
    taper("/cod");
    await laisserLeMenuSuivre();
    const liste = nomsDuMenu();

    presser("Enter");
    await laisserLeMenuSuivre();

    expect(liste).toEqual(["Bloc code"]);
    expect(blocDuCurseur().noeud).toBe("codeBlock");
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>premier</paragraph><codeblock></codeblock></listitem></bulletlist>",
    );
  });

  it.each(["Paragraphe", "Titre 1", "Titre 2", "Titre 3", "Liste numérotée"] as const)(
    "F-005-AC11 F-003-AC8 « %s » reste disponible dans le premier paragraphe d'un élément de liste : jugée à blanc, elle s'applique comme avant",
    (nom) => {
      monterLEditeur(documentAvecUnElement("premier"));
      entrerDansLEditeur();
      placerLeCurseurALaFinDe("premier");
      selectionnerLeBloc();

      const etat = commande(nom).getAttribute("aria-disabled");
      act(() => commande(nom).click());

      expect(etat).toBeNull();
      expect(blocDuCurseur().texte).toBe("premier");
    },
  );
});
