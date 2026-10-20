// Gras et italique : commandes, raccourcis, règles de saisie, état de la barre et rendu (F-028-AC1 à
// AC5, AC25, AC27).
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import { contenuLu } from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  commande,
  entrerDansLEditeur,
  marquesSousLeCurseur,
  monterLEditeur,
  placerLeCurseurDans,
  presserAvecMod,
  selectionnerDansLeNavigateur,
  selectionnerDe,
  selectionnerLeTexte,
  selectionVueParLEditeur,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

type Geste = "commande" | "raccourci";
const MARQUES = [
  { nom: "Gras", marque: "bold", touche: "b", balise: "strong" },
  { nom: "Italique", marque: "italic", touche: "i", balise: "em" },
] as const;
const CAS = MARQUES.flatMap((marque) =>
  (["commande", "raccourci"] as const).map((geste) => [marque.nom, geste, marque] as const),
);

function basculer(geste: Geste, { nom, touche }: (typeof MARQUES)[number]): void {
  if (geste === "commande") {
    act(() => commande(nom).click());
  } else {
    presserAvecMod(touche);
  }
}

describe("gras et italique sur une sélection", () => {
  it.each(CAS)(
    "F-028-AC1 « %s » par %s donne la marque à tout le texte sélectionné, puis la retire quand tout le porte ; le texte, les blocs et les autres marques ne changent pas",
    (_nom, geste, marque) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("un deux trois");
      selectionnerLeTexte("deux");
      const autre = marque.marque === "bold" ? "italic" : "bold";
      act(() => commande(autre === "bold" ? "Gras" : "Italique").click());
      selectionnerLeTexte("un deux");

      basculer(geste, marque);
      const pose = contenuLu(doc);
      selectionnerLeTexte("un deux");
      basculer(geste, marque);

      expect(pose).toMatch(
        new RegExp(`^<paragraph><${marque.marque}>un .*deux.*</${marque.marque}>`),
      );
      expect(pose).toContain(`<${autre}>`);
      expect(contenuLu(doc)).toBe(`<paragraph>un <${autre}>deux</${autre}> trois</paragraph>`);
    },
  );

  it("F-028-AC1 une sélection sur plusieurs blocs reçoit la marque dans chacun, sans changer les blocs", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("# Titre");
    presserEntree();
    taper("corps");
    selectionnerDe("Titre", "corps");

    presserAvecMod("b");

    expect(contenuLu(doc)).toBe(
      '<heading level="1"><bold>Titre</bold></heading><paragraph><bold>corps</bold></paragraph>',
    );
  });
  // F-028-AC30 sous macOS : Chromium livre `selectionchange` après une frappe qui suit de près une
  // Maj+flèche, et l'éditeur ne relit la sélection du navigateur qu'à cet événement.
  it.each(MARQUES)(
    "F-028-AC1 F-028-AC30 « $nom » par Mod+$touche, pressé avant que l'éditeur n'ait relu la sélection du navigateur, marque la sélection affichée",
    (marque) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("un deux trois");
      selectionnerDansLeNavigateur("deux");
      const vueAvantLaFrappe = selectionVueParLEditeur();

      presserAvecMod(marque.touche);

      expect(vueAvantLaFrappe).toBe("");
      expect(contenuLu(doc)).toBe(
        `<paragraph>un <${marque.marque}>deux</${marque.marque}> trois</paragraph>`,
      );
    },
  );
});

function presserEntree(): void {
  const evenement = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  act(() => void zoneDeSaisie().dispatchEvent(evenement));
}

describe("gras et italique sans sélection", () => {
  it.each(MARQUES)(
    "F-028-AC2 $nom par Mod+$touche sans sélection n'émet rien, puis s'applique au texte saisi ensuite à cet endroit ; une seconde fois, cesse de l'appliquer",
    (marque) => {
      const { doc, emises } = monterLEditeur();
      entrerDansLEditeur();
      taper("avant ");
      const emisesAvant = emises.length;

      basculer("raccourci", marque);
      const emisesParLActivation = emises.length - emisesAvant;
      taper("marqué");
      basculer("raccourci", marque);
      taper(" après");

      expect(emisesParLActivation).toBe(0);
      expect(contenuLu(doc)).toBe(
        `<paragraph>avant <${marque.marque}>marqué</${marque.marque}> après</paragraph>`,
      );
    },
  );

  it.each(MARQUES)(
    "F-028-AC2 dans un bloc vide, où la barre n'est plus affichée depuis le menu slash (F-005 H11), $nom par Mod+$touche n'émet rien, puis s'applique au texte saisi ; dans le bloc suivant, qui hérite de la marque, il cesse de l'appliquer",
    (marque) => {
      const { doc, emises } = monterLEditeur();
      entrerDansLEditeur();
      taper("avant");
      presserEntree();
      const emisesAvant = emises.length;
      const barreDansLeBlocVide = barreDeBlocs();

      basculer("raccourci", marque);
      const emisesParLActivation = emises.length - emisesAvant;
      taper("marqué");
      presserEntree();
      basculer("raccourci", marque);
      taper("simple");

      expect(barreDansLeBlocVide).toBeNull();
      expect(emisesParLActivation).toBe(0);
      expect(contenuLu(doc)).toBe(
        `<paragraph>avant</paragraph><paragraph><${marque.marque}>marqué</${marque.marque}></paragraph><paragraph>simple</paragraph>`,
      );
    },
  );
});

describe("règles de saisie", () => {
  it.each([
    ["**texte**", "bold"],
    ["*texte*", "italic"],
  ])(
    "F-028-AC3 la saisie de %s met « texte » en %s et retire les astérisques",
    (saisie, marque) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      taper(`voici ${saisie}`);

      expect(contenuLu(doc)).toBe(`<paragraph>voici <${marque}>texte</${marque}></paragraph>`);
    },
  );

  it("F-028-AC3 un texte vide entre les astérisques ne pose aucune marque", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    taper("****");

    expect(contenuLu(doc)).not.toMatch(/<bold>|<italic>/);
  });

  it.each(["** texte**", "**texte **", "* texte*", "*texte *"])(
    "F-028-AC3 %s, texte précédé ou suivi d'une espace, ne pose aucune marque et garde ses astérisques",
    (saisie) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      taper(`voici ${saisie}`);

      expect(contenuLu(doc)).toBe(`<paragraph>voici ${saisie}</paragraph>`);
    },
  );
});

describe("marques cumulées et état de la barre", () => {
  it("F-028-AC4 gras, italique et lien se cumulent sur une même étendue, et la barre marque les trois commandes quand le curseur y est", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("un mot ici");
    selectionnerLeTexte("mot");
    presserAvecMod("b");
    presserAvecMod("i");
    presserAvecMod(RACCOURCIS.lien.touche);
    await utilisateur.type(
      screen.getByRole("textbox", { name: "Adresse du lien" }),
      "exemple.fr{Enter}",
    );
    placerLeCurseurDans("mot", 1);

    const pressees = ["Gras", "Italique", "Lien"].map((nom) =>
      commande(nom as "Gras").getAttribute("aria-pressed"),
    );

    expect(contenuLu(doc)).toBe(
      '<paragraph>un <bold><italic><link href="https://exemple.fr/">mot</link></italic></bold> ici</paragraph>',
    );
    expect(marquesSousLeCurseur().sort()).toEqual(["bold", "italic", "link"]);
    expect(pressees).toEqual(["true", "true", "true"]);
  });

  it("F-028-AC4 hors de toute marque, aucune des trois commandes n'est marquée", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("simple");
    selectionnerLeTexte("simple");

    expect(
      ["Gras", "Italique", "Lien"].map((nom) =>
        commande(nom as "Gras").getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "false", "false"]);
  });

  it("F-028-AC5 le gras est rendu par strong, l'italique par em, un lien d'adresse acceptée par a", async () => {
    const utilisateur = userEvent.setup();
    monterLEditeur();
    entrerDansLEditeur();
    taper("gras italique lien");
    selectionnerLeTexte("gras");
    presserAvecMod("b");
    selectionnerLeTexte("italique");
    presserAvecMod("i");
    selectionnerLeTexte("lien");
    presserAvecMod(RACCOURCIS.lien.touche);
    await utilisateur.type(
      screen.getByRole("textbox", { name: "Adresse du lien" }),
      "exemple.fr{Enter}",
    );

    const zone = zoneDeSaisie();
    expect(zone.querySelector("strong")?.textContent).toBe("gras");
    expect(zone.querySelector("em")?.textContent).toBe("italique");
    expect(zone.querySelector("a")?.textContent).toBe("lien");
    expect(zone.querySelector("a")?.getAttribute("href")).toBe("https://exemple.fr/");
  });
});

describe("bloc code", () => {
  it("F-028-AC25 F-005-AC29 le bloc code livré n'accepte aucune marque : Gras, Italique et Lien y sont indisponibles, leurs raccourcis et les règles de saisie n'y posent rien", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("``` mot");
    const indisponibles = MARQUES.map(({ nom }) => commande(nom).getAttribute("aria-disabled"));
    selectionnerLeTexte("mot");
    const avant = emises.length;

    MARQUES.forEach((marque) => {
      basculer("commande", marque);
      basculer("raccourci", marque);
    });
    act(() => commande("Lien").click());
    presserAvecMod(RACCOURCIS.lien.touche);
    placerLeCurseurDans("mot", 3);
    taper(" **fort** *penche*");

    expect(indisponibles).toEqual(["true", "true"]);
    expect(commande("Lien").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("textbox", { name: "Adresse du lien" })).toBeNull();
    expect(emises.length - avant).toBe(" **fort** *penche*".length);
    expect(contenuLu(doc).toLowerCase()).toBe("<codeblock>mot **fort** *penche*</codeblock>");
  });
});

describe("accessibilité des commandes de mise en forme", () => {
  it("F-028-AC27 Gras, Italique et Lien sont des boutons nommés en français, atteignables et déclenchables au clavier seul, avec leur état « activé » ou « indisponible » lisible ; le focus revient dans l'éditeur, sélection conservée", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    // Bloc code (F-005) : la barre est affichée, « Lien » y est indisponible.
    taper("``` code");
    const lienSansSelection = commande("Lien").getAttribute("aria-disabled");
    presserAvecMod("Enter");
    taper("mot");
    selectionnerLeTexte("mot");
    const selectionAvant = window.getSelection()?.toString();

    act(() => void zoneDeSaisie().dispatchEvent(altF10()));
    // F-006 : Descendre le bloc et Monter le bloc suivent Lien, en dernier.
    await utilisateur.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    const atteinte = document.activeElement;
    await utilisateur.keyboard("{Enter}");

    expect(lienSansSelection).toBe("true");
    expect(commande("Lien").getAttribute("aria-disabled")).toBeNull();
    expect(atteinte).toBe(commande("Gras"));
    expect(commande("Gras").getAttribute("aria-label")).toBe("Gras");
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<codeblock>code</codeblock><paragraph><bold>mot</bold></paragraph>",
    );
    expect(commande("Gras").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(window.getSelection()?.toString()).toBe(selectionAvant);
  });
});

function altF10(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: RACCOURCIS.barreDeBlocs.touche,
    altKey: true,
    bubbles: true,
    cancelable: true,
  });
}
