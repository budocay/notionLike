// Couture : la poignée du curseur pose, dans un bloc vide, une sélection de nœud de premier niveau
// (F-006-AC14, `selectionnerLeBlocDuCurseur`), et Mod+A une sélection de tout le document ; l'une et
// l'autre commencent à la profondeur 0, où aucun bloc de texte ne porte le début. Chaque lecteur de
// la sélection du module d'édition est énuméré par programme et dit comment il la lit ; la barre est
// ensuite exercée par la poignée sur un titre, une liste et un bloc code vides.
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { lireDossier } from "../aides-disque.ts";
import { contenuLu } from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  entrerDansLEditeur,
  monterLEditeur,
  type NomDeCommande,
  NOMS_DES_COMMANDES,
  NOMS_DES_COMMANDES_DE_MARQUE,
  presser,
  selecteurDeLangage,
  taper,
  toutSelectionner,
} from "./aides-edition.tsx";

// ——— Énumération des lecteurs ———

/** Le lecteur passe par `bornesLues`, ou lit la sélection d'une façon que la profondeur 0 ne fausse pas. */
type Lecture = { readonly bornes: true } | { readonly indifferent: string };

interface Lecteur {
  /** Nombre de lectures de la sélection dans sa déclaration. */
  readonly lectures: number;
  readonly lecture: Lecture;
}

const BORNES: Lecture = { bornes: true };

// Clé : « fichier › déclaration de premier niveau qui lit la sélection ».
const LECTEURS: Readonly<Record<string, Lecteur>> = {
  "barre.ts › lire": { lectures: 2, lecture: BORNES },
  "barre.ts › mesurer": {
    lectures: 1,
    lecture: { indifferent: "positions à l'écran de `from` et `to`, valables à toute profondeur" },
  },
  "bloc-code.ts › collerDUnEditeurDeCode": {
    lectures: 4,
    lecture: {
      indifferent:
        "profondeur 0 traitée par `blocCodeAdmisALaPlaceDe` ; sélection d'après le collage",
    },
  },
  "bloc-code.ts › blocVideEnParagraphe": {
    lectures: 1,
    lecture: { indifferent: "n'agit que sur un curseur (`empty`) : jamais à la profondeur 0" },
  },
  "bloc-code.ts › sortieParLeBas": {
    lectures: 1,
    lecture: { indifferent: "n'agit que sur un curseur (`empty`) : jamais à la profondeur 0" },
  },
  "commandes-de-marque.ts › lienVise": {
    lectures: 1,
    lecture: {
      indifferent:
        "hors d'un curseur, `selectionDansUnBloc` : aucun lien visé, « Lien » indisponible",
    },
  },
  "commandes-de-marque.ts › etatDesMarques": { lectures: 1, lecture: BORNES },
  "commandes-de-marque.ts › effetDuRaccourciDeLien": {
    lectures: 1,
    lecture: { indifferent: "ne lit que `empty`" },
  },
  "commandes-de-marque.ts › surLEtendue": {
    lectures: 1,
    lecture: { indifferent: "appelé seulement avec un lien visé, donc dans un bloc de texte" },
  },
  "deplacement-de-bloc.ts › selectionApres": {
    lectures: 1,
    lecture: { indifferent: "sélection de texte et sélection de nœud traitées chacune" },
  },
  "deplacement-de-bloc.ts › deplacerLeBloc": {
    lectures: 2,
    lecture: { indifferent: "`from`, `to` et le type de la sélection, à toute profondeur" },
  },
  "deplacement-de-bloc.ts › blocDeLaSelection": {
    lectures: 1,
    lecture: { indifferent: "profondeur 0 traitée : la sélection de nœud désigne son bloc" },
  },
  "depot.ts › blocSelectionneParLaPoignee": {
    lectures: 1,
    lecture: { indifferent: "n'admet que la profondeur 0 : la sélection des blocs glissés" },
  },
  "invite.ts › blocAInviter": {
    lectures: 1,
    lecture: { indifferent: "n'invite qu'au curseur (`empty`) ou dans le seul bloc vide" },
  },
  "marques.ts › lienCourant": {
    lectures: 1,
    lecture: { indifferent: "à la profondeur 0, le voisin est un bloc, sans marque : aucun lien" },
  },
  "marques.ts › selectionDansUnBloc": {
    lectures: 1,
    lecture: { indifferent: "faux à la profondeur 0 : le document n'est pas un bloc de texte" },
  },
  "placement.ts › placerLaBarre": {
    lectures: 1,
    lecture: { indifferent: "les bords mesurés de la sélection, pas la sélection de l'éditeur" },
  },
  "schema.ts › dansUnBlocCode": { lectures: 1, lecture: BORNES },
  "selection-du-navigateur.ts › relireLaSelectionDuNavigateur": {
    lectures: 2,
    lecture: { indifferent: "compare `anchor` et `head` à ceux du navigateur" },
  },
  "types-de-bloc.ts › typeDuBlocCourant": { lectures: 1, lecture: BORNES },
  "types-de-bloc.ts › bornesLues": {
    lectures: 0,
    lecture: { indifferent: "la lecture elle-même" },
  },
  "types-de-bloc.ts › blocsAChanger": {
    lectures: 2,
    lecture: { indifferent: "parcourt les nœuds de `from` à `to`, à toute profondeur" },
  },
  "types-de-bloc.ts › etatDeDepart": {
    lectures: 3,
    lecture: BORNES,
  },
  "types-de-bloc.ts › composer": {
    lectures: 2,
    lecture: { indifferent: "part d'`etatDeDepart`, dont la sélection est déjà de texte" },
  },
  "types-de-bloc.ts › donnerLeType": {
    lectures: 1,
    lecture: { indifferent: "recopie la sélection finale de la composition" },
  },
};

const DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+)([\w$]+)/;
// `x.selection`, ou `{ …, selection, … } =` : une lecture de la sélection.
const LECTURE = /\.selection\b|\{[^{}]*\bselection\b[^{}]*\}\s*=/g;

/** Le code sans ses commentaires : une mention en commentaire n'est pas une lecture. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Chaque déclaration de premier niveau qui lit la sélection, son texte et ses lectures. */
function lecteursDe(
  sources: ReadonlyMap<string, string>,
): Map<string, { texte: string; lectures: number }> {
  const trouves = new Map<string, { texte: string; lectures: number }>();
  for (const [chemin, source] of sources) {
    const fichier = chemin.split("/").at(-1) ?? chemin;
    let courante: { cle: string; lignes: string[] } | undefined;
    const clore = (): void => {
      if (courante === undefined) {
        return;
      }
      const texte = courante.lignes.join("\n");
      const lectures = texte.match(LECTURE)?.length ?? 0;
      if (lectures > 0 || courante.cle in LECTEURS) {
        trouves.set(courante.cle, { texte, lectures });
      }
    };
    for (const ligne of sansCommentaires(source).split("\n")) {
      const nom = DECLARATION.exec(ligne)?.[1];
      if (nom !== undefined) {
        clore();
        courante = { cle: `${fichier} › ${nom}`, lignes: [] };
      }
      courante?.lignes.push(ligne);
    }
    clore();
  }
  return trouves;
}

/** Les écarts entre les lecteurs trouvés dans ces sources et le registre ; vide : couverture. */
function fautesDesLecteurs(
  sources: ReadonlyMap<string, string>,
  registre: Readonly<Record<string, Lecteur>>,
): string[] {
  const trouves = lecteursDe(sources);
  const fautes: string[] = [];
  for (const [cle, { texte, lectures }] of trouves) {
    const inscrit = registre[cle];
    if (inscrit === undefined) {
      fautes.push(`${cle} : lecteur non couvert`);
    } else if (inscrit.lectures !== lectures) {
      fautes.push(`${cle} : ${String(lectures)} lectures, ${String(inscrit.lectures)} inscrites`);
    } else if ("bornes" in inscrit.lecture && !texte.includes("bornesLues(")) {
      fautes.push(`${cle} : ne passe pas par bornesLues`);
    }
  }
  for (const cle of Object.keys(registre)) {
    if (!trouves.has(cle)) {
      fautes.push(`${cle} : inscrit, introuvable`);
    }
  }
  return fautes;
}

function sourcesDeLEdition(): Map<string, string> {
  return new Map([...lireDossier("src/edition")].filter(([chemin]) => /\.tsx?$/.test(chemin)));
}

describe("couture : lecteurs de la sélection du module d'édition", () => {
  it("F-006-AC14 F-005-AC6 F-005-AC11 chaque lecteur de la sélection est inscrit, avec son nombre de lectures, et ceux qui nomment le bloc passent par bornesLues", () => {
    expect(fautesDesLecteurs(sourcesDeLEdition(), LECTEURS)).toEqual([]);
  });

  it("F-006-AC14 cas fautifs : un lecteur nouveau, une lecture de plus, un lecteur qui ne passe plus par bornesLues, un lecteur retiré sont vus par le même contrôle", () => {
    const sources = sourcesDeLEdition();
    const avec = (chemin: string, modifier: (source: string) => string): Map<string, string> =>
      new Map(
        [...sources].map(([un, source]) => [un, un.endsWith(chemin) ? modifier(source) : source]),
      );

    const nouveau = avec(
      "barre.ts",
      (source) =>
        `${source}\nfunction lecteurNouveau(etat: EditorState) {\n  return etat.selection.$from.parent;\n}\n`,
    );
    const dePlus = avec("barre.ts", (source) =>
      source.replace(
        "const dansUnLien",
        "const plus = editeur.state.selection.from;\n  const dansUnLien",
      ),
    );
    const contourne = avec("schema.ts", (source) =>
      source.replace("bornesLues(editeur.state.selection)", "editeur.state.selection"),
    );
    const retire = { ...LECTEURS, "barre.ts › disparu": { lectures: 1, lecture: BORNES } };

    expect(fautesDesLecteurs(nouveau, LECTEURS)).toEqual([
      "barre.ts › lecteurNouveau : lecteur non couvert",
    ]);
    expect(fautesDesLecteurs(dePlus, LECTEURS)).toEqual([
      "barre.ts › lire : 3 lectures, 2 inscrites",
    ]);
    expect(fautesDesLecteurs(contourne, LECTEURS)).toEqual([
      "schema.ts › dansUnBlocCode : ne passe pas par bornesLues",
    ]);
    expect(fautesDesLecteurs(sources, retire)).toEqual([
      "barre.ts › disparu : inscrit, introuvable",
    ]);
  });
});

// ——— La poignée du curseur sur un bloc vide ———

const VIDES = {
  titre: {
    nom: "un titre vide",
    saisie: "# ",
    marquee: "Titre 1",
    depart: '<heading level="1"></heading>',
  },
  liste: {
    nom: "une liste vide",
    saisie: "- ",
    marquee: "Liste à puces",
    depart: "<bulletlist><listitem><paragraph></paragraph></listitem></bulletlist>",
  },
  code: {
    nom: "un bloc code vide",
    saisie: "``` ",
    marquee: "Bloc code",
    depart: "<codeblock></codeblock>",
  },
} as const satisfies Record<
  string,
  { nom: string; saisie: string; marquee: NomDeCommande; depart: string }
>;

type Vide = keyof typeof VIDES;

// Le bloc après la commande ; `undefined` : la commande est indisponible, rien ne change.
const PARAGRAPHE = "<paragraph></paragraph>";
const TITRE = (niveau: number): string => `<heading level="${String(niveau)}"></heading>`;
const PUCES = "<bulletlist><listitem><paragraph></paragraph></listitem></bulletlist>";
const NUMEROS = '<orderedlist start="1"><listitem><paragraph></paragraph></listitem></orderedlist>';
const CODE = "<codeblock></codeblock>";
const EFFETS: Readonly<Record<Vide, Readonly<Record<NomDeCommande, string | undefined>>>> = {
  titre: {
    Paragraphe: PARAGRAPHE,
    "Titre 1": TITRE(1),
    "Titre 2": TITRE(2),
    "Titre 3": TITRE(3),
    "Liste à puces": PUCES,
    "Liste numérotée": NUMEROS,
    "Bloc code": CODE,
  },
  liste: {
    Paragraphe: PARAGRAPHE,
    "Titre 1": TITRE(1),
    "Titre 2": TITRE(2),
    "Titre 3": TITRE(3),
    "Liste à puces": PUCES,
    "Liste numérotée": NUMEROS,
    // Le premier paragraphe d'un élément de liste refuse un bloc code (F-005-AC11).
    "Bloc code": undefined,
  },
  code: {
    Paragraphe: PARAGRAPHE,
    "Titre 1": TITRE(1),
    "Titre 2": TITRE(2),
    "Titre 3": TITRE(3),
    "Liste à puces": PUCES,
    "Liste numérotée": NUMEROS,
    "Bloc code": CODE,
  },
};

const AVANT = "<paragraph>avant</paragraph>";

/** Un paragraphe « avant », puis ce bloc vide, sélectionné entier par la poignée du curseur. */
function poigneeSurUnBlocVide(vide: Vide): ReturnType<typeof monterLEditeur> {
  const montage = monterLEditeur();
  entrerDansLEditeur();
  taper("avant");
  presser("Enter");
  taper(VIDES[vide].saisie);
  act(() => undefined);
  act(() => screen.getByRole("button", { name: "Déplacer le bloc" }).click());
  return montage;
}

function boutonDeLaBarre(nom: string): HTMLElement {
  return within(barreDeBlocs() as HTMLElement).getByRole("button", { name: nom });
}

function marquees(): string[] {
  return NOMS_DES_COMMANDES.filter(
    (nom) => boutonDeLaBarre(nom).getAttribute("aria-pressed") === "true",
  );
}

function indisponibles(): string[] {
  return [...NOMS_DES_COMMANDES, ...NOMS_DES_COMMANDES_DE_MARQUE].filter(
    (nom) => boutonDeLaBarre(nom).getAttribute("aria-disabled") === "true",
  );
}

describe("couture : la poignée du curseur sur un bloc vide", () => {
  it.each((Object.keys(VIDES) as Vide[]).map((vide) => [VIDES[vide].nom, vide] as const))(
    "F-006-AC14 F-005-AC6 F-005-AC11 %s, sélectionné par la poignée : la barre marque son type réel, n'offre ni marque ni lien, et le sélecteur de langage suit le bloc code",
    (_nom, vide) => {
      const { doc } = poigneeSurUnBlocVide(vide);

      expect(contenuLu(doc)).toBe(`${AVANT}${VIDES[vide].depart}`);
      expect(marquees()).toEqual([VIDES[vide].marquee]);
      expect(indisponibles()).toEqual([
        ...NOMS_DES_COMMANDES.filter((nom) => EFFETS[vide][nom] === undefined),
        ...NOMS_DES_COMMANDES_DE_MARQUE,
      ]);
      expect(selecteurDeLangage() !== null).toBe(vide === "code");
    },
  );

  it.each(
    (Object.keys(VIDES) as Vide[]).flatMap((vide) =>
      NOMS_DES_COMMANDES.map((nom) => [VIDES[vide].nom, nom, vide] as const),
    ),
  )(
    "F-006-AC14 F-005-AC1 F-005-AC11 %s, sélectionné par la poignée : « %s » donne au bloc ce type, ou ne change rien si elle est indisponible",
    (_nom, nom, vide) => {
      const { doc } = poigneeSurUnBlocVide(vide);

      act(() => boutonDeLaBarre(nom).click());

      expect(contenuLu(doc)).toBe(`${AVANT}${EFFETS[vide][nom] ?? VIDES[vide].depart}`);
    },
  );

  it("F-005-AC6 bloc code vide sélectionné par la poignée : le sélecteur y enregistre le langage choisi", () => {
    const { doc } = poigneeSurUnBlocVide("code");
    const selecteur = selecteurDeLangage() as HTMLSelectElement;

    act(() => {
      selecteur.value = "python";
      selecteur.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(contenuLu(doc)).toBe(`${AVANT}<codeblock language="python"></codeblock>`);
  });

  it("F-028-AC4 F-005-AC6 tout le document sélectionné (Mod+A) : la barre marque le type du premier bloc, et le gras, disponible, s'applique", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("# titre");
    presser("Enter");
    taper("suite");
    toutSelectionner();

    expect(marquees()).toEqual(["Titre 1"]);
    // Le lien ne s'étend pas sur deux blocs (F-028-AC6).
    expect(indisponibles()).toEqual(["Lien"]);
    act(() => boutonDeLaBarre("Gras").click());
    expect(contenuLu(doc)).toBe(
      '<heading level="1"><bold>titre</bold></heading><paragraph><bold>suite</bold></paragraph>',
    );
  });
});
