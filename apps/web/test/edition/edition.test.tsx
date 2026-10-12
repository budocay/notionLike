// Édition d'une page par l'éditeur monté seul sur un document : saisie, types de bloc, listes,
// annulation, mises à jour reçues (F-003-AC2, AC7 à AC12, AC14, AC16, AC17, AC32).
import { act } from "@testing-library/react";
import { lireVersionPage } from "@notionlike/document";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { INVITE_DU_BLOC_VIDE } from "../../src/interface/messages.ts";
import { ajouter, bloc, contenuLu } from "../aides-facade-page.ts";
import {
  annuler,
  collerDuHtml,
  commande,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurApres,
  porteUnEditeurVivant,
  presser,
  recevoirDUneReplique,
  retablir,
  selectionnerLeBloc,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

function etatEncodeDe(doc: Y.Doc): number[] {
  return [...Y.encodeStateAsUpdate(doc)];
}

/** Types racine du document qui portent un contenu : seul le fragment doit en porter. */
function typesRacineEcrits(doc: Y.Doc): string[] {
  return [...doc.share]
    .filter(([, type]) => type._start !== null || type._map.size > 0)
    .map(([nom]) => nom);
}

describe("éditeur vide", () => {
  it("F-003-AC2 un document vide donne un éditeur vide, prêt à la saisie, avec l'invite, et rien n'est émis tant que rien n'est modifié : ni au montage sous StrictMode, ni au focus, ni à la sélection", () => {
    const { doc, emises } = monterLEditeur();
    const avant = etatEncodeDe(doc);

    entrerDansLEditeur();
    presser("ArrowRight");

    const zone = zoneDeSaisie();
    expect(zone.getAttribute("contenteditable")).toBe("true");
    expect(zone.textContent).toBe("");
    expect(zone.querySelector("p")?.getAttribute("data-invite")).toBe(INVITE_DU_BLOC_VIDE);
    expect(emises).toEqual([]);
    expect(etatEncodeDe(doc)).toEqual(avant);
    expect(contenuLu(doc)).toBe("");
    expect(lireVersionPage(doc)).toBe(1);
  });
});

describe("saisie", () => {
  it("F-003-AC7 le texte saisi est inscrit dans le document à l'endroit du curseur", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();

    taper("Bonjour");
    placerLeCurseurApres("Bonjour");
    presser("ArrowLeft");
    taper(" monde");

    expect(contenuLu(doc)).toBe("<paragraph>Bonjour monde</paragraph>");
    expect(emises.length).toBeGreaterThan(0);
  });

  it("F-003-AC7 Entrée dans un paragraphe ou dans un titre crée à la suite un nouveau paragraphe, où va le curseur", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("# Titre");
    const traiteeDansLeTitre = presser("Enter");
    taper("corps");
    const traiteeDansLeParagraphe = presser("Enter");
    taper("suite");

    expect([traiteeDansLeTitre, traiteeDansLeParagraphe]).toEqual([true, true]);
    expect(contenuLu(doc)).toBe(
      '<heading level="1">Titre</heading><paragraph>corps</paragraph><paragraph>suite</paragraph>',
    );
  });

  it.each([
    ["# ", '<heading level="1">x</heading>'],
    ["## ", '<heading level="2">x</heading>'],
    ["### ", '<heading level="3">x</heading>'],
    ["- ", "<bulletlist><listitem><paragraph>x</paragraph></listitem></bulletlist>"],
    ["1. ", '<orderedlist start="1"><listitem><paragraph>x</paragraph></listitem></orderedlist>'],
  ])(
    "F-003-AC9 la séquence « %s » en tête d'un paragraphe vide donne son type au bloc, sans rester dans le texte",
    (sequence, attendu) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      taper(`${sequence}x`);

      expect(contenuLu(doc).toLowerCase()).toBe(attendu);
    },
  );

  it("F-003-AC9 la même séquence au milieu d'un paragraphe reste du texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("a # b");

    expect(contenuLu(doc)).toBe("<paragraph>a # b</paragraph>");
  });
});

describe("listes", () => {
  it("F-003-AC10 Entrée dans un élément non vide crée l'élément suivant de la même liste ; dans un élément vide, elle sort de la liste et crée un paragraphe", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("- un");
    presser("Enter");
    taper("deux");
    const dansLaListe = contenuLu(doc).toLowerCase();
    presser("Enter");
    presser("Enter");
    taper("après");

    expect(dansLaListe).toBe(
      "<bulletlist><listitem><paragraph>un</paragraph></listitem><listitem><paragraph>deux</paragraph></listitem></bulletlist>",
    );
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>un</paragraph></listitem><listitem><paragraph>deux</paragraph></listitem></bulletlist><paragraph>après</paragraph>",
    );
  });

  it("F-003-AC11 Tab imbrique un élément sous le précédent, Maj+Tab le remonte, et Tab dans le premier élément ne modifie rien", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("- un");
    const avantTabDuPremier = emises.length;

    presser("Tab");
    const apresTabDuPremier = emises.length;
    const aPlat = contenuLu(doc).toLowerCase();
    presser("Enter");
    taper("deux");
    presser("Tab");
    const imbrique = contenuLu(doc).toLowerCase();
    presser("Tab", { shiftKey: true });

    expect(apresTabDuPremier).toBe(avantTabDuPremier);
    expect(aPlat).toBe("<bulletlist><listitem><paragraph>un</paragraph></listitem></bulletlist>");
    expect(imbrique).toBe(
      "<bulletlist><listitem><paragraph>un</paragraph><bulletlist><listitem><paragraph>deux</paragraph></listitem></bulletlist></listitem></bulletlist>",
    );
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>un</paragraph></listitem><listitem><paragraph>deux</paragraph></listitem></bulletlist>",
    );
  });
});

describe("annulation", () => {
  it("F-003-AC12 Ctrl+Z défait la dernière modification locale et Ctrl+Maj+Z la refait, sans défaire une modification reçue par une mise à jour", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("local");
    recevoirDUneReplique(doc, (replique) => ajouter(replique, bloc("paragraph", "reçu")));
    const avant = contenuLu(doc);

    const annulee = annuler();
    const apresAnnulation = contenuLu(doc);
    const retablie = retablir();

    expect(avant).toBe("<paragraph>local</paragraph><paragraph>reçu</paragraph>");
    expect([annulee, retablie]).toEqual([true, true]);
    expect(apresAnnulation).toBe("<paragraph>reçu</paragraph>");
    expect(contenuLu(doc)).toBe(avant);
  });

  it("F-003-AC12 une modification reçue seule n'est pas annulable : Ctrl+Z ne la défait pas", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    recevoirDUneReplique(doc, (replique) => ajouter(replique, bloc("paragraph", "reçu")));

    annuler();

    expect(contenuLu(doc)).toBe("<paragraph>reçu</paragraph>");
  });
});

describe("mises à jour reçues", () => {
  it("F-003-AC14 une mise à jour appliquée au document est affichée sans rechargement, et le texte en cours de saisie n'est pas perdu", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("en cours");

    recevoirDUneReplique(doc, (replique) =>
      ajouter(replique, bloc("heading", "Arrivé", { level: 2 })),
    );
    taper(" de saisie");

    const zone = zoneDeSaisie();
    expect(zone.querySelector("h2")?.textContent).toBe("Arrivé");
    expect(zone.querySelector("p")?.textContent).toBe("en cours de saisie");
    expect(contenuLu(doc)).toBe(
      '<paragraph>en cours de saisie</paragraph><heading level="2">Arrivé</heading>',
    );
  });
});

describe("accessibilité du contenu", () => {
  it("F-003-AC16 l'éditeur est une zone de texte multiligne nommée « Contenu de la page », et les titres et les listes sont rendus par leurs éléments HTML", () => {
    const doc = new Y.Doc();
    act(() =>
      Y.applyUpdate(
        doc,
        (() => {
          const source = new Y.Doc();
          const contenu = source.getXmlFragment("contenu");
          const element = bloc("listItem", "");
          element.insert(0, [bloc("paragraph", "puce")]);
          const liste = new Y.XmlElement("bulletList");
          liste.insert(0, [element]);
          const numero = bloc("listItem", "");
          numero.insert(0, [bloc("paragraph", "numéro")]);
          const numerotee = new Y.XmlElement("orderedList");
          numerotee.insert(0, [numero]);
          contenu.insert(0, [
            bloc("heading", "Un", { level: 1 }),
            bloc("heading", "Deux", { level: 2 }),
            bloc("heading", "Trois", { level: 3 }),
            liste,
            numerotee,
          ]);
          return Y.encodeStateAsUpdate(source);
        })(),
      ),
    );

    monterLEditeur(doc);

    const zone = zoneDeSaisie();
    expect(zone.getAttribute("role")).toBe("textbox");
    expect(zone.getAttribute("aria-multiline")).toBe("true");
    expect(zone.getAttribute("aria-label")).toBe("Contenu de la page");
    expect(zone.querySelector("h1")?.textContent).toBe("Un");
    expect(zone.querySelector("h2")?.textContent).toBe("Deux");
    expect(zone.querySelector("h3")?.textContent).toBe("Trois");
    expect(zone.querySelector("ul > li")?.textContent).toBe("puce");
    expect(zone.querySelector("ol > li")?.textContent).toBe("numéro");
  });
});

describe("l'édition n'écrit pas la version", () => {
  it("F-003-AC32 saisie, commandes de la barre, séquences, collage, annulation et rétablissement donnent les quatre types de blocs sans inscrire de version ni écrire hors du fragment du contenu", () => {
    const { doc } = monterLEditeur();
    const horsDuFragment: string[] = [];
    const noter = (transaction: Y.Transaction): void => {
      transaction.changedParentTypes.forEach((_evenements, type) => {
        let racine = type;
        while (racine._item !== null && racine._item.parent instanceof Y.AbstractType) {
          racine = racine._item.parent;
        }
        const nom = [...doc.share].find(([, partage]) => partage === racine)?.[0] ?? "inconnu";
        if (nom !== "contenu") {
          horsDuFragment.push(nom);
        }
      });
    };
    doc.on("afterTransaction", noter);
    entrerDansLEditeur();

    taper("# Titre");
    presser("Enter");
    taper("paragraphe");
    presser("Enter");
    taper("- puce");
    presser("Enter");
    presser("Enter");
    taper("numéro");
    selectionnerLeBloc();
    act(() => commande("Liste numérotée").click());
    placerLeCurseurApres("numéro");
    presser("Enter");
    presser("Enter");
    collerDuHtml("<p>collé</p>");
    taper("x");
    annuler();
    retablir();
    doc.off("afterTransaction", noter);

    const contenu = contenuLu(doc).toLowerCase();
    for (const type of ["<heading", "<paragraph>", "<bulletlist>", "<orderedlist"]) {
      expect(contenu, type).toContain(type);
    }
    expect(contenu).toContain("collé");
    expect(lireVersionPage(doc)).toBe(1);
    expect(horsDuFragment).toEqual([]);
    expect(typesRacineEcrits(doc)).toEqual(["contenu"]);
  });
});

describe("contenu hors du schéma dans un document de version prise en charge", () => {
  it("F-003-AC17 un titre de niveau 9 et un attribut inconnu sont affichés sans exception et sans mise à jour à l'ouverture, et aucune commande n'est marquée pour ce niveau", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      (() => {
        const source = new Y.Doc();
        source
          .getXmlFragment("contenu")
          .insert(0, [
            bloc("heading", "Niveau neuf", { level: 9 }),
            bloc("paragraph", "avec attribut", { inconnu: "x" }),
          ]);
        return Y.encodeStateAsUpdate(source);
      })(),
    );
    const avant = etatEncodeDe(doc);

    const { emises } = monterLEditeur(doc);
    entrerDansLEditeur();
    placerLeCurseurApres("Niveau neuf");
    selectionnerLeBloc();

    const zone = zoneDeSaisie();
    expect(zone.textContent).toContain("Niveau neuf");
    expect(zone.textContent).toContain("avec attribut");
    expect(emises).toEqual([]);
    expect(etatEncodeDe(doc)).toEqual(avant);
    const marquees = ["Titre 1", "Titre 2", "Titre 3"].filter(
      (nom) => commande(nom as "Titre 1").getAttribute("aria-pressed") === "true",
    );
    expect(marquees).toEqual([]);
  });

  it("F-003-AC17 un nœud et une marque absents du schéma n'empêchent pas d'afficher le reste, sans exception", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      (() => {
        const source = new Y.Doc();
        const marque = new Y.XmlElement("paragraph");
        const texte = new Y.XmlText();
        texte.insert(0, "gras", { bold: true });
        marque.insert(0, [texte]);
        source
          .getXmlFragment("contenu")
          .insert(0, [bloc("paragraph", "connu"), bloc("blocFutur", "inconnu"), marque]);
        return Y.encodeStateAsUpdate(source);
      })(),
    );

    expect(() => monterLEditeur(doc)).not.toThrow();

    expect(zoneDeSaisie().querySelector("p")?.textContent).toBe("connu");
    expect(porteUnEditeurVivant(zoneDeSaisie())).toBe(true);
  });

  it("F-003-AC17 les six commandes de la barre n'écrivent que des nœuds, des attributs et des niveaux du schéma", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();
    const lus: string[] = [];

    for (const nom of [
      "Titre 1",
      "Titre 2",
      "Titre 3",
      "Liste à puces",
      "Liste numérotée",
      "Paragraphe",
    ] as const) {
      act(() => commande(nom).click());
      lus.push(contenuLu(doc).toLowerCase());
    }

    expect(lus).toEqual([
      '<heading level="1">texte</heading>',
      '<heading level="2">texte</heading>',
      '<heading level="3">texte</heading>',
      "<bulletlist><listitem><paragraph>texte</paragraph></listitem></bulletlist>",
      '<orderedlist start="1"><listitem><paragraph>texte</paragraph></listitem></orderedlist>',
      "<paragraph>texte</paragraph>",
    ]);
  });
});
