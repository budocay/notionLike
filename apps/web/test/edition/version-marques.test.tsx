// Version du document de page et montée de version par la première marque (F-028-AC20 à AC23),
// jouées par la session de page et la zone principale, comme l'application les monte.
import {
  lireVersionPage,
  TABLE_DES_VERSIONS_PAGE,
  VERSION_PAGE_PRISE_EN_CHARGE,
} from "@notionlike/document";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import {
  contenuLu,
  fragmentBrut,
  inventaireDuContenu,
  miseAJourDUneReplique,
} from "../aides-facade-page.ts";
import {
  documentDeLaLigne,
  documentDeVersionInconnue,
  textesDeLaLigne,
  VERSION_INCONNUE,
  VERSIONS_DE_LA_TABLE,
  VERSIONS_REMPLIES,
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
  collerDuHtml,
  collerDuTexte,
  commande,
  deposerDuHtml,
  entrerDansLEditeur,
  placerLeCurseurApres,
  presserAvecMod,
  selectionnerLeTexte,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const VERSION_DES_MARQUES = 2;
const LIGNES_ANTERIEURES = TABLE_DES_VERSIONS_PAGE.filter(
  (ligne) => ligne.version < VERSION_PAGE_PRISE_EN_CHARGE,
).map((ligne) => ligne.version);

/** Après chaque mise à jour, rejouée dans l'ordre sur l'état de départ : marques et version lues. */
function lecturesSuccessives(depart: Uint8Array, misesAJour: readonly Uint8Array[]) {
  const rejoue = new Y.Doc();
  Y.applyUpdate(rejoue, depart);
  return misesAJour.map((miseAJour) => {
    Y.applyUpdate(rejoue, miseAJour);
    return { marques: inventaireDuContenu(rejoue).marques, version: lireVersionPage(rejoue) };
  });
}

const CHAMP = { name: "Adresse du lien" } as const;

/** Chaque chemin qui inscrit une marque, joué sur le mot « mot » d'un paragraphe. */
const CHEMINS: readonly (readonly [string, () => Promise<void>])[] = [
  [
    "la commande « Gras »",
    async () => {
      selectionnerLeTexte("mot");
      act(() => commande("Gras").click());
      await Promise.resolve();
    },
  ],
  [
    "le raccourci Mod+I",
    async () => {
      selectionnerLeTexte("mot");
      presserAvecMod("i");
      await Promise.resolve();
    },
  ],
  [
    "la règle de saisie **texte**",
    async () => {
      placerLeCurseurApres("un mot");
      taper(" **fort**");
      await Promise.resolve();
    },
  ],
  [
    "le panneau de lien",
    async () => {
      selectionnerLeTexte("mot");
      presserAvecMod(RACCOURCIS.lien.touche);
      await userEvent.setup().type(screen.getByRole("textbox", CHAMP), "exemple.fr{Enter}");
    },
  ],
  [
    "le collage d'un contenu riche",
    async () => {
      selectionnerLeTexte("mot");
      collerDuHtml("<strong>collé</strong>");
      await Promise.resolve();
    },
  ],
  [
    "le collage d'une adresse sur une sélection",
    async () => {
      selectionnerLeTexte("mot");
      collerDuTexte("https://exemple.fr/");
      await Promise.resolve();
    },
  ],
  [
    "le dépôt d'un contenu riche",
    async () => {
      deposerDuHtml("<em>déposé</em>", "mot");
      await Promise.resolve();
    },
  ],
];

describe("écriture de la version", () => {
  it.each(CHEMINS)(
    "F-028-AC21 par %s, la version est élevée à 2 avant toute mise à jour qui porte une marque, et une annulation retire la marque sans abaisser la version",
    async (_nom, poser) => {
      const { doc, emises } = await afficherUnePage();
      entrerDansLEditeur();
      taper("un mot");
      const depart = Y.encodeStateAsUpdate(doc);
      const avant = emises.length;

      await poser();
      const lectures = lecturesSuccessives(depart, emises.slice(avant));
      const marquee = inventaireDuContenu(doc).marques;
      annuler();

      expect(marquee.length).toBeGreaterThan(0);
      expect(
        lectures.filter((lu) => lu.marques.length > 0 && lu.version < VERSION_DES_MARQUES),
      ).toEqual([]);
      expect(lectures.at(-1)?.version).toBe(VERSION_DES_MARQUES);
      expect(inventaireDuContenu(doc).marques).toEqual([]);
      expect(lireVersionPage(doc)).toBe(VERSION_DES_MARQUES);
    },
  );

  it("F-028-AC21 la version élevée est la version de la marque, et non la plus haute connue ; l'élévation part avant, dans sa propre mise à jour, qui ne porte aucune marque", async () => {
    const { doc, emises } = await afficherUnePage();
    entrerDansLEditeur();
    taper("un mot");
    const depart = Y.encodeStateAsUpdate(doc);
    const avant = emises.length;

    selectionnerLeTexte("mot");
    presserAvecMod("b");
    const lectures = lecturesSuccessives(depart, emises.slice(avant));

    expect(lectures).toEqual([
      { marques: [], version: VERSION_DES_MARQUES },
      { marques: ["bold"], version: VERSION_DES_MARQUES },
    ]);
  });
});

describe("la version ne baisse jamais", () => {
  it("F-028-AC22 une marque posée sur un document de version 1, puis l'historique épuisé : plus de marque, la version lue reste 2, ici et sur un document vierge qui reçoit les mises à jour", async () => {
    const { doc } = await afficherUnePage();
    entrerDansLEditeur();
    taper("un mot");
    selectionnerLeTexte("mot");
    presserAvecMod("b");
    presserAvecMod("i");
    const avantLesAnnulations = lireVersionPage(doc);

    for (let essai = 0; essai < 10; essai += 1) {
      annuler();
    }
    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, Y.encodeStateAsUpdate(doc));

    expect(avantLesAnnulations).toBe(VERSION_DES_MARQUES);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(lireVersionPage(doc)).toBe(VERSION_DES_MARQUES);
    expect(inventaireDuContenu(vierge).marques).toEqual([]);
    expect(lireVersionPage(vierge)).toBe(VERSION_DES_MARQUES);
  });

  it("F-028-AC22 deux répliques élèvent ensemble à deux valeurs différentes : les deux lisent la plus haute, et l'application la refuse si elle dépasse la version prise en charge", async () => {
    const { doc, session } = await afficherUnePage();
    entrerDansLEditeur();
    taper("un mot");
    const autre = new Y.Doc();
    Y.applyUpdate(autre, Y.encodeStateAsUpdate(doc));
    const vecteur = Y.encodeStateVector(doc);
    selectionnerLeTexte("mot");
    presserAvecMod("b");
    const versLAutre = Y.encodeStateAsUpdate(doc, vecteur);
    const deLAutre = miseAJourDUneReplique(autre, (replique) =>
      replique.eleverVersion(VERSION_INCONNUE),
    );

    Y.applyUpdate(autre, deLAutre);
    Y.applyUpdate(autre, versLAutre);
    act(() => Y.applyUpdate(doc, deLAutre));
    await act(() => attendrePhase(session, "version-non-prise-en-charge"));

    expect([lireVersionPage(doc), lireVersionPage(autre)]).toEqual([
      VERSION_INCONNUE,
      VERSION_INCONNUE,
    ]);
    expect(chercherLaZoneDeSaisie()).toBeNull();
  });
});

describe("lecture d'une version antérieure", () => {
  it("F-028-AC20 F-028-AC28 la table n'a pas de ligne que les aides ne savent pas remplir", () => {
    expect(VERSIONS_REMPLIES).toEqual(VERSIONS_DE_LA_TABLE);
  });

  it.each(LIGNES_ANTERIEURES)(
    "F-028-AC20 un document de la ligne %s s'affiche entier, sans mise à jour à l'ouverture ni version écrite, même après une frappe sans marque",
    async (version) => {
      const doc = documentDeLaLigne(version);
      const depart = Y.encodeStateAsUpdate(doc);

      const { emises } = await afficherUnePage(doc);
      const aLOuverture = emises.length;
      const affiche = zoneDeSaisie().textContent;
      const etatALOuverture = Y.encodeStateAsUpdate(doc);
      entrerDansLEditeur();
      placerLeCurseurApres(textesDeLaLigne(version)[1] ?? "");
      taper(" et la suite");

      expect(aLOuverture).toBe(0);
      expect([...etatALOuverture]).toEqual([...depart]);
      for (const texte of textesDeLaLigne(version)) {
        expect(affiche).toContain(texte);
      }
      expect(emises.length).toBeGreaterThan(0);
      expect(contenuLu(doc)).toContain("et la suite");
      expect(lireVersionPage(doc)).toBe(version);
    },
  );
});

describe("refus d'une version supérieure", () => {
  it("F-028-AC23 un document de la version prise en charge plus un, avec un nœud et une marque absents du schéma : aucun éditeur, aucune mise à jour, l'état encodé inchangé à l'octet près", async () => {
    const doc = documentDeVersionInconnue();
    const avant = [...Y.encodeStateAsUpdate(doc)];

    const { session, emises } = demarrerUneSession(undefined, doc);
    rendreLaSession(session);
    await act(() => attendrePhase(session, "version-non-prise-en-charge"));

    expect(chercherLaZoneDeSaisie()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/Mettez l'application à jour/);
    expect(emises).toEqual([]);
    expect([...Y.encodeStateAsUpdate(doc)]).toEqual(avant);
    expect(fragmentBrut(doc).toString()).toContain("blocfutur");
  });
});
