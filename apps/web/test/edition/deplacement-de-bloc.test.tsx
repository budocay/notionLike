// Déplacement d'un bloc dans l'éditeur, sous jsdom (F-006-AC14 à AC22, AC31, AC35, AC37). Le geste
// de la poignée se joue par un lâcher construit par le test, l'état de glissement de la vue posé à
// la main comme la poignée le fait (H11) : ce qui est prouvé est le chemin du lâcher jusqu'à
// l'opération unique ; la poignée au survol et le repère à l'écran, seul le bout en bout les prouve.
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { lireVersionPage, TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";

import { contenuLu, fragmentBrut, inventaireDuContenu } from "../aides-facade-page.ts";
import { simulerLaLargeur } from "../aides-largeur.ts";
import { ouvrirUnePage } from "../aides-page.tsx";
import {
  annuler,
  barreDeBlocs,
  collerDuHtml,
  commande,
  couperLeReseau,
  curseurDansLeBloc,
  deposerDuHtml,
  deposerUnFichier,
  entrerDansLEditeur,
  finirLeGesteDeLaPoignee,
  glisserLeBlocParSaPoignee,
  monterLEditeur,
  optionsDuCurseurDeDepot,
  placerLeCurseurDans,
  presser,
  retablir,
  saisirLeBlocParSaPoignee,
  selectionnerDe,
  selectionnerLeTexte,
  selectionVueParLEditeur,
  taper,
  textesDesBlocs,
  zoneDeSaisie,
} from "./aides-edition.tsx";

/** Écrit un paragraphe par texte, dans l'ordre. */
function ecrire(...textes: string[]): void {
  textes.forEach((texte, rang) => {
    if (rang > 0) {
      presser("Enter");
    }
    taper(texte);
  });
}

function unDeuxTrois(): ReturnType<typeof monterLEditeur> {
  const montage = monterLEditeur();
  entrerDansLEditeur();
  ecrire("one", "two", "three");
  return montage;
}

const ALT_MAJ = { altKey: true, shiftKey: true } as const;

/** Chaîne de chaque bloc du fragment, telle que le document la porte. */
function blocsDuDocument(doc: Y.Doc): string[] {
  return fragmentBrut(doc)
    .toArray()
    .map((element) => element.toString());
}

describe("poignée de bloc", () => {
  it("F-006-AC14 F-006-AC28 le curseur dans un bloc fait paraître, en regard, une poignée nommée « Déplacer le bloc », hors du contenu ; son affichage n'émet aucune mise à jour Yjs", () => {
    const { doc, emises } = monterLEditeur();
    expect(screen.queryByRole("button", { name: "Déplacer le bloc" })).toBeNull();
    entrerDansLEditeur();
    ecrire("one", "two");
    const avant = emises.length;

    placerLeCurseurDans("one");
    const auPremier = screen.getAllByRole("button", { name: "Déplacer le bloc" });
    placerLeCurseurDans("two");
    const auSecond = screen.getAllByRole("button", { name: "Déplacer le bloc" });

    expect(auPremier).toHaveLength(1);
    expect(auSecond).toHaveLength(1);
    const poignee = auSecond[0] as HTMLElement;
    expect(poignee.tabIndex).toBe(-1);
    expect(poignee.getAttribute("aria-keyshortcuts")).toBeNull();
    expect(zoneDeSaisie().contains(poignee)).toBe(false);
    expect(contenuLu(doc)).toBe("<paragraph>one</paragraph><paragraph>two</paragraph>");
    expect(emises.length).toBe(avant);
    // La poignée de l'éditeur, montée elle aussi, reste masquée tant que le pointeur ne survole rien.
    const auSurvol = document.querySelector("[data-poignee-de-bloc]")?.parentElement;
    expect(auSurvol?.style.visibility).toBe("hidden");
    expect(zoneDeSaisie().contains(auSurvol ?? null)).toBe(false);
  });

  it("F-006-AC14 sans focus dans l'éditeur, aucune poignée du curseur", () => {
    unDeuxTrois();
    expect(screen.getAllByRole("button", { name: "Déplacer le bloc" })).toHaveLength(1);

    act(() => zoneDeSaisie().blur());

    expect(screen.queryByRole("button", { name: "Déplacer le bloc" })).toBeNull();
  });
});

describe("déplacement d'un bloc par sa poignée", () => {
  it("F-006-AC15 F-006-AC16 lâché entre deux blocs, avant le premier ou après le dernier, le bloc y arrive, par une seule mise à jour Yjs, et l'action par défaut est empêchée", () => {
    const { doc, emises } = unDeuxTrois();
    const parcours: [string[], number][] = [];

    for (const [de, intervalle] of [
      [0, 3],
      [2, 0],
      [1, 3],
    ] as const) {
      const avant = emises.length;
      const empeche = glisserLeBlocParSaPoignee(de, intervalle);
      expect(empeche).toBe(true);
      parcours.push([textesDesBlocs(), emises.length - avant]);
    }

    expect(parcours).toEqual([
      [["two", "three", "one"], 1],
      [["one", "two", "three"], 1],
      [["one", "three", "two"], 1],
    ]);
    expect(contenuLu(doc)).toBe(
      "<paragraph>one</paragraph><paragraph>three</paragraph><paragraph>two</paragraph>",
    );
  });

  it("F-006-AC15 un geste abandonné (Échap, ou lâché hors de l'éditeur) ne modifie rien, et le lâcher suivant d'un contenu venu d'ailleurs reste un collage", () => {
    const { doc, emises } = unDeuxTrois();
    const avant = emises.length;

    saisirLeBlocParSaPoignee(0);
    act(() => void document.body.dispatchEvent(new Event("drop", { bubbles: true })));
    finirLeGesteDeLaPoignee();
    deposerDuHtml("<p>venu d'ailleurs</p>", "two");

    expect(blocsDuDocument(doc).filter((bloc) => bloc.includes("venu d'ailleurs"))).toHaveLength(1);
    expect(textesDesBlocs()[0]).toBe("one");
    expect(emises.length).toBe(avant + 1);
  });

  it("F-006-AC17 lâché là où il est déjà, le bloc n'émet aucune mise à jour Yjs", () => {
    const { emises } = unDeuxTrois();
    const avant = emises.length;

    glisserLeBlocParSaPoignee(1, 1);
    glisserLeBlocParSaPoignee(1, 2);
    glisserLeBlocParSaPoignee(0, 0);

    expect(textesDesBlocs()).toEqual(["one", "two", "three"]);
    expect(emises.length).toBe(avant);
  });
});

// Un bloc de chaque type de la dernière ligne de la table des versions, marques et attributs compris.
const UN_BLOC_DE_CHAQUE_TYPE = [
  '<p><strong>gras</strong> <em>italique</em> <a href="https://exemple.fr/">lien</a></p>',
  "<h1>titre un</h1>",
  "<h2>titre deux</h2>",
  "<h3>titre trois</h3>",
  "<ul><li><p>puce</p><ul><li>sous-puce</li></ul></li><li>seconde puce</li></ul>",
  '<ol start="4" type="a"><li>numéro</li></ol>',
].join("");

describe("une seule opération", () => {
  it("F-006-AC16 F-006-AC19 pour chaque type de bloc de la dernière ligne de la table des versions, le déplacement est une seule mise à jour Yjs, et le contenu lu est le même à l'ordre des blocs près", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    collerDuHtml(UN_BLOC_DE_CHAQUE_TYPE);
    const depart = blocsDuDocument(doc);
    const derniere = TABLE_DES_VERSIONS_PAGE.at(-1);
    const types = Object.keys(inventaireDuContenu(doc).noeuds).filter((nom) => nom !== "doc");

    expect(types.sort()).toEqual(
      Object.keys(derniere?.noeuds ?? {})
        .filter((nom) => !["doc", "text"].includes(nom))
        .sort(),
    );
    expect(inventaireDuContenu(doc).marques).toEqual(derniere?.marques);
    // Chaque bloc va à la fin ; le dernier, au début.
    for (let de = 0; de < depart.length; de += 1) {
      const avant = blocsDuDocument(doc);
      const misesAJour = emises.length;
      const auDebut = de === avant.length - 1;
      glisserLeBlocParSaPoignee(de, auDebut ? 0 : avant.length);
      const apres = blocsDuDocument(doc);
      const autres = avant.filter((_bloc, rang) => rang !== de);
      expect(emises.length - misesAJour, `bloc ${de}`).toBe(1);
      expect(auDebut ? apres[0] : apres.at(-1), `bloc ${de}`).toBe(avant[de]);
      expect(auDebut ? apres.slice(1) : apres.slice(0, -1)).toEqual(autres);
      expect([...apres].sort()).toEqual([...avant].sort());
    }
    expect([...blocsDuDocument(doc)].sort()).toEqual([...depart].sort());
  });

  it("F-006-AC16 au clavier aussi, chaque type de bloc descend par la même opération : une mise à jour Yjs, le bloc intact une place plus bas", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    collerDuHtml(UN_BLOC_DE_CHAQUE_TYPE);

    for (const texte of ["gras", "titre un", "titre deux", "titre trois", "puce"]) {
      const avant = blocsDuDocument(doc);
      const de = avant.findIndex((bloc) => bloc.includes(texte));
      const misesAJour = emises.length;
      placerLeCurseurDans(texte, 1);
      presser("ArrowDown", ALT_MAJ);
      const apres = blocsDuDocument(doc);
      expect(emises.length - misesAJour, texte).toBe(1);
      expect(apres[de + 1], texte).toBe(avant[de]);
      expect(apres[de], texte).toBe(avant[de + 1]);
      expect([...apres].sort()).toEqual([...avant].sort());
    }
  });
});

describe("déplacement d'un bloc au clavier", () => {
  it("F-006-AC18 F-006-AC16 Alt+Maj+Flèche haut et bas déplacent d'une place le bloc du curseur, par une seule mise à jour Yjs ; le curseur reste au même endroit de son texte ; l'action par défaut est empêchée", () => {
    const { emises } = unDeuxTrois();
    placerLeCurseurDans("two", 2);
    const depart = curseurDansLeBloc();
    const avant = emises.length;

    const haut = presser("ArrowUp", ALT_MAJ);
    const apresHaut = [textesDesBlocs(), curseurDansLeBloc(), selectionVueParLEditeur()];
    const bas = presser("ArrowDown", ALT_MAJ);
    const bisBas = presser("ArrowDown", ALT_MAJ);

    expect([haut, bas, bisBas]).toEqual([true, true, true]);
    expect(depart).toEqual({ bloc: 1, decalage: 3 });
    expect(apresHaut).toEqual([["two", "one", "three"], { bloc: 0, decalage: 3 }, ""]);
    expect(textesDesBlocs()).toEqual(["one", "three", "two"]);
    expect(curseurDansLeBloc()).toEqual({ bloc: 2, decalage: 3 });
    expect(emises.length - avant).toBe(3);
  });

  it("F-006-AC18 sur le premier bloc, Alt+Maj+Flèche haut, et sur le dernier, Alt+Maj+Flèche bas, n'émettent rien, l'action par défaut étant empêchée et la sélection non étendue", () => {
    const { emises } = unDeuxTrois();
    const avant = emises.length;

    placerLeCurseurDans("one", 1);
    const premier = presser("ArrowUp", ALT_MAJ);
    const selectionPremier = [curseurDansLeBloc(), selectionVueParLEditeur()];
    placerLeCurseurDans("three", 1);
    const dernier = presser("ArrowDown", ALT_MAJ);
    const selectionDernier = [curseurDansLeBloc(), selectionVueParLEditeur()];

    expect([premier, dernier]).toEqual([true, true]);
    expect(selectionPremier).toEqual([{ bloc: 0, decalage: 2 }, ""]);
    expect(selectionDernier).toEqual([{ bloc: 2, decalage: 2 }, ""]);
    expect(textesDesBlocs()).toEqual(["one", "two", "three"]);
    expect(emises.length).toBe(avant);
  });

  it("F-006-AC18 une sélection sur plusieurs blocs : les deux combinaisons sont empêchées, n'émettent rien et la sélection reste la même ; « Monter le bloc » et « Descendre le bloc » sont indisponibles", () => {
    const { emises } = unDeuxTrois();
    selectionnerDe("two", "three");
    const avant = emises.length;

    const haut = presser("ArrowUp", ALT_MAJ);
    const bas = presser("ArrowDown", ALT_MAJ);

    expect([haut, bas]).toEqual([true, true]);
    expect(selectionVueParLEditeur()).toBe("twothree");
    expect(commande("Monter le bloc").getAttribute("aria-disabled")).toBe("true");
    expect(commande("Descendre le bloc").getAttribute("aria-disabled")).toBe("true");
    act(() => commande("Monter le bloc").click());
    expect(textesDesBlocs()).toEqual(["one", "two", "three"]);
    expect(emises.length).toBe(avant);
  });

  it("F-006-AC18 F-006-AC28 « Monter le bloc » et « Descendre le bloc » de la barre de blocs déplacent le bloc de la sélection et la gardent ; indisponibles au bord, avec un état lisible", () => {
    const { emises } = unDeuxTrois();
    selectionnerLeTexte("tw");
    const avant = emises.length;

    act(() => commande("Monter le bloc").click());
    const monte = [textesDesBlocs(), selectionVueParLEditeur()];
    const indisponible = commande("Monter le bloc").getAttribute("aria-disabled");
    act(() => commande("Descendre le bloc").click());

    expect(barreDeBlocs()).not.toBeNull();
    expect(monte).toEqual([["two", "one", "three"], "tw"]);
    expect(indisponible).toBe("true");
    expect(textesDesBlocs()).toEqual(["one", "two", "three"]);
    expect(selectionVueParLEditeur()).toBe("tw");
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(emises.length - avant).toBe(2);
  });

  it("F-006-AC19 le curseur dans un élément de liste déplace la liste entière, ses éléments ensemble", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    collerDuHtml("<p>avant</p><ul><li>premier</li><li>second</li></ul><p>après</p>");
    placerLeCurseurDans("second", 1);

    presser("ArrowUp", ALT_MAJ);

    expect(textesDesBlocs()).toEqual(["premiersecond", "avant", "après"]);
    expect(blocsDuDocument(doc)[0]).toMatch(
      /^<bulletlist><listitem>.*premier.*second.*<\/bulletlist>$/i,
    );
  });

  it("F-006-AC19 la poignée d'une liste la glisse d'un seul tenant : aucun élément n'en sort seul", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    collerDuHtml("<ul><li>premier</li><li>second</li></ul><p>après</p>");
    const avant = [blocsDuDocument(doc), emises.length] as const;

    glisserLeBlocParSaPoignee(0, 2);
    const listeDeplacee = textesDesBlocs();

    expect(listeDeplacee).toEqual(["après", "premiersecond"]);
    expect(blocsDuDocument(doc)).toHaveLength(avant[0].length);
    expect(emises.length - avant[1]).toBe(1);
  });

  it("F-006-AC20 Mod+Z juste après un déplacement remet le bloc à sa place, la saisie d'avant restant ; le rétablissement le replace", () => {
    const { doc } = unDeuxTrois();
    placerLeCurseurDans("two", 3);
    taper("!");

    presser("ArrowUp", ALT_MAJ);
    const deplace = textesDesBlocs();
    annuler();
    const annule = textesDesBlocs();
    retablir();

    expect(deplace).toEqual(["two!", "one", "three"]);
    expect(annule).toEqual(["one", "two!", "three"]);
    expect(textesDesBlocs()).toEqual(["two!", "one", "three"]);
    expect(contenuLu(doc)).toContain("two!");
  });

  it("F-006-AC20 l'annulation d'un déplacement par la poignée remet le bloc à sa place", () => {
    unDeuxTrois();

    glisserLeBlocParSaPoignee(0, 3);
    annuler();

    expect(textesDesBlocs()).toEqual(["one", "two", "three"]);
  });
});

describe("dépôts venus d'ailleurs", () => {
  const RICHE_ET_PIEGE = [
    '<p data-origine="ailleurs" style="color:red" onclick="window.__depotExecute = 1">déposé <u>souligné</u> <s>barré</s> <a href="javascript:window.__depotExecute=2">piège</a></p>',
    '<img src="x" onerror="window.__depotExecute = 3">',
    "<script>window.__depotExecute = 4</script>",
  ].join("");

  it("F-006-AC21 un contenu riche lâché dans l'éditeur est traité comme un collage : script, marque et attribut hors du schéma écartés, rien d'exécuté ni de chargé", () => {
    const { doc } = unDeuxTrois();

    deposerDuHtml(RICHE_ET_PIEGE, "two");

    const contenu = contenuLu(doc);
    expect(contenu).toContain("déposé");
    expect(contenu).toContain("souligné");
    expect(contenu).not.toMatch(/style|onclick|onerror|data-|script|javascript|src=|__depot/);
    expect(inventaireDuContenu(doc).noeuds).toEqual({ paragraph: [] });
    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(
      zoneDeSaisie().querySelectorAll("script, img, [style], [onclick], [onerror], u, s"),
    ).toHaveLength(0);
    expect(Reflect.get(window, "__depotExecute")).toBeUndefined();
  });

  it.each([
    ["seul", false],
    ["accompagné de texte", true],
  ])(
    "F-006-AC35 un fichier lâché dans l'éditeur, %s, est refusé : action par défaut empêchée, contenu lu inchangé, aucune mise à jour Yjs",
    (_cas, avecDuTexte) => {
      const { doc, emises } = unDeuxTrois();
      const [avant, misesAJour] = [contenuLu(doc), emises.length];

      const empeche = deposerUnFichier("two", avecDuTexte);

      expect(empeche).toBe(true);
      expect(contenuLu(doc)).toBe(avant);
      expect(contenuLu(doc)).not.toMatch(/image\.png|contenu du fichier|texte joint/);
      expect(emises.length).toBe(misesAJour);
    },
  );
});

describe("aucun changement de format", () => {
  it.each([
    [1, () => ecrire("one", "two", "three")],
    [
      2,
      () => {
        ecrire("one", "two", "three");
        selectionnerLeTexte("two");
        presser("b", { ctrlKey: true });
      },
    ],
  ])(
    "F-006-AC31 dans un document de version %s, un déplacement laisse la version lue inchangée, sans élévation demandée",
    (version, remplir) => {
      const { doc, page } = monterLEditeur();
      entrerDansLEditeur();
      remplir();
      expect(lireVersionPage(doc)).toBe(version);
      const elever = vi.spyOn(page, "eleverVersion");

      glisserLeBlocParSaPoignee(0, 3);
      placerLeCurseurDans("two", 1);
      presser("ArrowUp", ALT_MAJ);

      expect(textesDesBlocs()).toEqual(["two", "three", "one"]);
      expect(lireVersionPage(doc)).toBe(version);
      expect(elever).not.toHaveBeenCalled();
    },
  );
});

describe("curseur de dépôt et poignée par les jetons", () => {
  it("F-006-AC37 le curseur de dépôt de l'éditeur, tel que le module d'édition le crée, n'a pas de couleur propre et porte la classe de l'application", () => {
    monterLEditeur();

    const options = optionsDuCurseurDeDepot();

    expect(options?.color).toBe(false);
    expect(options?.class).toBe("curseur-de-depot");
    expect(Object.values(options ?? {}).filter((valeur) => typeof valeur === "string")).toEqual([
      "curseur-de-depot",
    ]);
  });
});

describe("réseau coupé", () => {
  it("F-006-AC33 un bloc se déplace réseau coupé, par sa poignée comme au clavier, sans aucune requête", () => {
    const appels = couperLeReseau();
    unDeuxTrois();

    glisserLeBlocParSaPoignee(0, 3);
    placerLeCurseurDans("one", 1);
    presser("ArrowUp", ALT_MAJ);

    expect(textesDesBlocs()).toEqual(["two", "one", "three"]);
    expect(appels).toEqual([]);
  });
});

describe("poignée selon la largeur", () => {
  it.each([
    ["large", 1280, 1],
    ["étroit", 360, 0],
  ])(
    "F-006-AC14 sur écran %s (%s pixels), l'application rend %s poignée au bloc du curseur : sur écran étroit, hors périmètre du geste, le bloc se déplace par la barre et le clavier",
    async (_cas, largeur, attendues) => {
      simulerLaLargeur(largeur);
      await ouvrirUnePage("Poignées");
      entrerDansLEditeur();
      taper("un bloc");

      expect(screen.queryAllByRole("button", { name: "Déplacer le bloc" })).toHaveLength(attendues);
      expect(document.querySelectorAll("[data-poignee-de-bloc]")).toHaveLength(attendues);
    },
  );
});
