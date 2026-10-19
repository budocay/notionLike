// Liste des commandes de bloc et disponibilité (F-005-AC11, AC14, AC21) : une seule liste pour la
// barre et le menu slash, et aucune commande que le schéma refuse n'écrit quoi que ce soit.
import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { commandesFiltrees, LISTE_DES_COMMANDES } from "../../src/edition/index.ts";
import { bloc, contenuLu, documentForge, fragmentBrut } from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  blocDuCurseur,
  commande,
  demonterLEditeur,
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

/** Une commande telle que le contrôle d'AC21 la lit : son nom et le nœud qu'elle donne au bloc. */
interface CommandeDonnee {
  readonly nom: string;
  readonly noeud: string;
}

/**
 * Le contrôle de F-005-AC21 : chaque type de bloc a une commande dans la barre et dans le menu, et
 * aucune commande ne donne un nœud absent du schéma. Rend une faute par écart, vide si tout tient.
 */
function fautesDeLaListe(
  types: readonly string[],
  noeudsDuSchema: readonly string[],
  liste: readonly CommandeDonnee[],
  affichees: { readonly barre: readonly string[]; readonly menu: readonly string[] },
): string[] {
  const sansCommande = types.flatMap((type) => {
    const noms = liste.filter((une) => une.noeud === type).map((une) => une.nom);
    if (noms.length === 0) {
      return [`${type} : aucune commande`];
    }
    return (["barre", "menu"] as const)
      .filter((lieu) => !noms.some((nom) => affichees[lieu].includes(nom)))
      .map((lieu) => `${type} : aucune commande dans ${lieu === "barre" ? "la barre" : "le menu"}`);
  });
  const horsSchema = liste
    .filter((une) => !noeudsDuSchema.includes(une.noeud))
    .map((une) => `${une.nom} : ${une.noeud} absent du schéma`);
  return [...sansCommande, ...horsSchema];
}

/** Le nœud de premier niveau que la commande donne, par la barre, à un paragraphe sélectionné. */
function noeudDonnePar(nom: string): string {
  const { doc } = monterLEditeur();
  entrerDansLEditeur();
  taper("texte");
  selectionnerLeBloc();
  act(() => commande(nom as (typeof NOMS_DES_COMMANDES)[number]).click());
  const premier = fragmentBrut(doc).get(0);
  demonterLEditeur();
  return premier instanceof Y.XmlElement ? premier.nodeName : "";
}

const TYPES_DE_LA_TABLE = Object.keys(TABLE_DES_VERSIONS_PAGE.at(-1)?.noeuds ?? {}).filter(
  (noeud) => !NOEUDS_SANS_COMMANDE.includes(noeud),
);

describe("une seule liste de commandes", () => {
  it("F-005-AC21 chaque type de bloc de la dernière ligne de la table a sa commande dans la barre affichée sur une sélection non vide d'un paragraphe de premier niveau et dans le menu ouvert dans un paragraphe de premier niveau, et chaque commande donne un nœud du schéma", async () => {
    const liste = LISTE_DES_COMMANDES.map((une) => ({
      nom: une.nom,
      noeud: noeudDonnePar(une.nom),
    }));
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();
    const barre = NOMS_DES_COMMANDES.filter((nom) =>
      barreDeBlocs()?.querySelector(`[aria-label="${nom}"]`),
    );
    placerLeCurseurALaFinDe("texte");
    taper(" /");
    await laisserLeMenuSuivre();
    const menu = nomsDuMenu();
    const noeudsDuSchema = Object.keys(schemaDeLEditeur().noeuds);

    const noms = LISTE_DES_COMMANDES.map((une) => une.nom);
    expect(barre).toEqual(noms);
    expect(menu).toEqual(noms);
    expect(fautesDeLaListe(TYPES_DE_LA_TABLE, noeudsDuSchema, liste, { barre, menu })).toEqual([]);
    expect([...new Set(liste.map((une) => une.noeud))].sort()).toEqual(
      [...TYPES_DE_LA_TABLE].sort(),
    );
  });

  it("F-005-AC21 cas fautifs : un type sans commande, une commande absente de la barre ou du menu, une commande d'un type absent du schéma sont vus par le même contrôle", () => {
    const liste: CommandeDonnee[] = [
      { nom: "Paragraphe", noeud: "paragraph" },
      { nom: "Titre 1", noeud: "heading" },
      { nom: "Bloc code", noeud: "codeBlock" },
    ];
    const toutes = {
      barre: ["Paragraphe", "Titre 1", "Bloc code"],
      menu: ["Paragraphe", "Titre 1", "Bloc code"],
    };

    expect(
      fautesDeLaListe(
        ["paragraph", "heading", "codeBlock"],
        ["paragraph", "heading", "codeBlock"],
        liste,
        toutes,
      ),
    ).toEqual([]);
    expect(
      fautesDeLaListe(
        ["paragraph", "blocFutur"],
        ["paragraph", "heading", "codeBlock"],
        liste,
        toutes,
      ),
    ).toEqual(["blocFutur : aucune commande"]);
    expect(
      fautesDeLaListe(["codeBlock"], ["paragraph", "heading", "codeBlock"], liste, {
        barre: ["Paragraphe"],
        menu: ["Bloc code"],
      }),
    ).toEqual(["codeBlock : aucune commande dans la barre"]);
    expect(
      fautesDeLaListe(["codeBlock"], ["paragraph", "heading", "codeBlock"], liste, {
        barre: ["Bloc code"],
        menu: [],
      }),
    ).toEqual(["codeBlock : aucune commande dans le menu"]);
    expect(fautesDeLaListe([], ["paragraph", "heading"], liste, toutes)).toEqual([
      "Bloc code : codeBlock absent du schéma",
    ]);
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
  it("F-005-AC11 F-005-AC18 dans le premier paragraphe d'un élément de liste : barre sur une sélection non vide, « Bloc code » indisponible ; menu sans « Bloc code », puis « Aucune commande » après `/code` ; clic, Entrée et raccourci de l'extension n'émettent rien, l'élément reste dans sa liste, non coupé, la séquence gardée", async () => {
    const { doc, emises } = monterLEditeur(documentAvecUnElement("premier"));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("premier");
    selectionnerLeBloc();
    const barre = {
      affichee: barreDeBlocs() !== null,
      blocCode: commande("Bloc code").getAttribute("aria-disabled"),
    };
    const avantLeClic = emises.length;
    act(() => commande("Bloc code").click());
    const parLeClic = emises.length - avantLeClic;

    placerLeCurseurALaFinDe("premier");
    taper(" /");
    await laisserLeMenuSuivre();
    const ouvert = nomsDuMenu();
    taper("code");
    await laisserLeMenuSuivre();
    const filtre = [menuSlash()?.parentElement?.textContent, nomsDuMenu()];
    const avant = emises.length;
    const traitees = [
      presser("Enter"),
      presser("c", { ctrlKey: true, altKey: true }),
      presser("c", { ctrlKey: true, altKey: true, shiftKey: true }),
    ];
    await laisserLeMenuSuivre();

    expect(barre).toEqual({ affichee: true, blocCode: "true" });
    expect(parLeClic).toBe(0);
    expect(ouvert).not.toContain("Bloc code");
    expect(ouvert).not.toEqual([]);
    expect(filtre).toEqual(["Aucune commande", []]);
    expect(traitees).toEqual([true, false, false]);
    expect(emises.length).toBe(avant);
    expect(menuSlash()).not.toBeNull();
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>premier /code</paragraph></listitem></bulletlist>",
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
