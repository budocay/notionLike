// Menu slash (F-005-AC12 à AC20, AC22), joué par des frappes, des touches et des mises à jour
// reçues, sur l'éditeur monté comme l'application le monte. La position du menu n'est prouvée que
// dans un navigateur (F-005-AC34, H14).
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { bloc, contenuLu, documentForge, miseAJourDUneReplique } from "../aides-facade-page.ts";
import {
  attributDeLEditeur,
  blocDuCurseur,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  menuSlash,
  monterLEditeur,
  NOMS_DES_COMMANDES,
  nomsDuMenu,
  optionDuMenu,
  optionsDuMenu,
  demonterLEditeur,
  effacerAvantLeCurseur,
  placerLeCurseurALaFinDe,
  placerLeCurseurApres,
  placerLeCurseurDans,
  placerLeCurseurDansLeDernierBloc,
  presser,
  recevoirDUneReplique,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const SEPT = [...NOMS_DES_COMMANDES];

function commandeActive(): string | undefined {
  return optionsDuMenu().find((option) => option.active)?.nom;
}

function annonce(): string | null | undefined {
  return screen.queryByRole("status")?.textContent;
}

/** Un élément de liste à deux paragraphes : « un », puis ce texte. */
function documentAvecDeuxParagraphesDansUnElement(second: string): Y.Doc {
  const liste = new Y.XmlElement("bulletList");
  const element = new Y.XmlElement("listItem");
  element.insert(0, [bloc("paragraph", "un"), bloc("paragraph", second)]);
  liste.insert(0, [element]);
  return documentForge(liste);
}

describe("ouverture du menu slash", () => {
  it.each([
    ["en tête d'un paragraphe vide", "", "/"],
    ["après une espace", "abc ", "abc /"],
    ["en tête d'un titre", "# ", "/"],
  ])(
    "F-005-AC12 `/` %s s'inscrit dans le texte et ouvre le menu : les sept commandes, dans l'ordre, la première active",
    async (_cas, avant, texte) => {
      monterLEditeur();
      entrerDansLEditeur();
      taper(avant);

      taper("/");
      await laisserLeMenuSuivre();

      expect(blocDuCurseur().texte).toBe(texte);
      expect(nomsDuMenu()).toEqual(SEPT);
      expect(commandeActive()).toBe("Paragraphe");
    },
  );

  it("F-005-AC12 F-005-AC11 `/` en tête du paragraphe d'un élément de liste ouvre le menu, sans « Bloc code », que le schéma y refuse", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("- ");

    taper("/");
    await laisserLeMenuSuivre();

    expect(nomsDuMenu()).toEqual(SEPT.filter((nom) => nom !== "Bloc code"));
    expect(commandeActive()).toBe("Paragraphe");
  });

  it.each([
    ["juste après un caractère", "abc"],
    ["juste après du gras", "x **ab**"],
    ["après une espace insécable", "abc "],
    ["dans un bloc code", "``` code "],
  ])("F-005-AC13 `/` %s n'ouvre pas le menu", async (_cas, avant) => {
    monterLEditeur();
    entrerDansLEditeur();
    taper(avant);

    taper("/");
    await laisserLeMenuSuivre();

    expect(menuSlash()).toBeNull();
    expect(blocDuCurseur().texte).toContain("/");
  });
});

describe("filtre du menu slash", () => {
  it.each([
    ["tit", ["Titre 1", "Titre 2", "Titre 3"]],
    ["TÎT", ["Titre 1", "Titre 2", "Titre 3"]],
    ["h2", ["Titre 2"]],
    ["numero", ["Liste numérotée"]],
    ["liste", ["Liste à puces", "Liste numérotée"]],
    ["code", ["Bloc code"]],
    ["pre", ["Bloc code"]],
    ["texte", ["Paragraphe"]],
  ])(
    "F-005-AC14 « /%s » ne liste que les commandes dont le nom ou un mot-clé contient le texte, sans casse ni accents, dans l'ordre, la première active",
    async (saisie, attendues) => {
      monterLEditeur();
      entrerDansLEditeur();

      taper(`/${saisie}`);
      await laisserLeMenuSuivre();

      expect(nomsDuMenu()).toEqual(attendues);
      expect(commandeActive()).toBe(attendues[0]);
    },
  );

  it("F-005-AC14 effacer du texte de la séquence élargit la liste, et la première redevient active", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("/titr");
    await laisserLeMenuSuivre();
    presser("ArrowDown");
    const filtree = [nomsDuMenu(), commandeActive()];

    effacerAvantLeCurseur();
    effacerAvantLeCurseur();
    effacerAvantLeCurseur();
    effacerAvantLeCurseur();
    await laisserLeMenuSuivre();

    expect(filtree).toEqual([["Titre 1", "Titre 2", "Titre 3"], "Titre 2"]);
    expect(nomsDuMenu()).toEqual(SEPT);
    expect(commandeActive()).toBe("Paragraphe");
  });

  it("F-005-AC18 dans un paragraphe de premier niveau, si aucune commande ne correspond (`/zzz`), le menu affiche « Aucune commande » ; Entrée n'y fait rien : ni coupure, ni mise à jour Yjs, menu ouvert, séquence gardée ; Échap puis Entrée coupent le bloc", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("abc /zzz");
    await laisserLeMenuSuivre();
    const vide = [menuSlash()?.parentElement?.textContent, nomsDuMenu()];
    const avant = emises.length;

    const traitee = presser("Enter");
    await laisserLeMenuSuivre();
    const apresEntree = {
      traitee,
      ouvert: menuSlash() !== null,
      contenu: contenuLu(doc),
      emises: emises.length - avant,
    };
    presser("Escape");
    presser("Enter");

    expect(vide).toEqual(["Aucune commande", []]);
    expect(apresEntree).toEqual({
      traitee: true,
      ouvert: true,
      contenu: "<paragraph>abc /zzz</paragraph>",
      emises: 0,
    });
    expect(menuSlash()).toBeNull();
    expect(contenuLu(doc)).toBe("<paragraph>abc /zzz</paragraph><paragraph></paragraph>");
  });
});

describe("navigation et application", () => {
  it("F-005-AC15 Flèche bas et Flèche haut parcourent les commandes en boucle, sans déplacer le curseur ni modifier le document", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("/");
    await laisserLeMenuSuivre();
    const avant = [contenuLu(doc), emises.length, blocDuCurseur()] as const;
    const actives: (string | undefined)[] = [];

    for (const touche of ["ArrowDown", "ArrowDown", "ArrowUp", "ArrowUp", "ArrowUp"]) {
      const traitee = presser(touche);
      expect(traitee).toBe(true);
      actives.push(commandeActive());
    }

    expect(actives).toEqual(["Titre 1", "Titre 2", "Titre 1", "Paragraphe", "Bloc code"]);
    expect([contenuLu(doc), emises.length, blocDuCurseur()]).toEqual(avant);
  });

  it("F-005-AC16 Entrée retire la séquence, donne le type en gardant le reste du texte, ferme le menu et laisse le curseur dans le bloc : une transaction, une mise à jour Yjs", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("abc /ti");
    await laisserLeMenuSuivre();
    presser("ArrowDown");
    const avant = emises.length;

    const traitee = presser("Enter");
    await laisserLeMenuSuivre();

    expect(traitee).toBe(true);
    expect(contenuLu(doc)).toBe('<heading level="2">abc </heading>');
    expect(emises.length - avant).toBe(1);
    expect(menuSlash()).toBeNull();
    expect(blocDuCurseur()).toEqual({ noeud: "heading", texte: "abc " });
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-005-AC16 un clic sur une commande l'applique de même, sans retirer le focus de l'éditeur", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("/num");
    await laisserLeMenuSuivre();
    const avant = emises.length;

    const option = optionDuMenu("Liste numérotée");
    const pression = fireEvent.mouseDown(option);
    act(() => option.click());
    await laisserLeMenuSuivre();

    expect(pression).toBe(false);
    expect(contenuLu(doc).toLowerCase()).toBe(
      '<orderedlist start="1"><listitem><paragraph></paragraph></listitem></orderedlist>',
    );
    expect(emises.length - avant).toBe(1);
    expect(menuSlash()).toBeNull();
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-005-AC16 F-005-AC11 une commande qui n'est plus disponible au moment du clic (mise à jour reçue avant le rendu) ferme le menu et ne modifie rien", async () => {
    const { doc, emises } = monterLEditeur(documentAvecDeuxParagraphesDansUnElement(""));
    entrerDansLEditeur();
    placerLeCurseurDansLeDernierBloc();
    taper("/");
    await laisserLeMenuSuivre();
    presser("ArrowUp");
    const listee = [nomsDuMenu().includes("Bloc code"), commandeActive()];
    const option = optionDuMenu("Bloc code");
    // Une autre réplique retire le premier paragraphe : le bloc du curseur devient le premier de
    // son élément, où le schéma refuse un bloc code ; l'interface n'est pas encore rendue.
    const miseAJour = miseAJourDUneReplique(doc, (replique) =>
      ((replique.contenu.get(0) as Y.XmlElement).get(0) as Y.XmlElement).delete(0, 1),
    );
    const avant = emises.length;

    Y.applyUpdate(doc, miseAJour);
    act(() => option.click());
    await laisserLeMenuSuivre();

    expect(listee).toEqual([true, "Bloc code"]);
    expect(contenuLu(doc).toLowerCase()).toBe(
      "<bulletlist><listitem><paragraph>/</paragraph></listitem></bulletlist>",
    );
    expect(emises.length - avant).toBe(1);
    expect(menuSlash()).toBeNull();
  });
});

describe("fermeture du menu slash", () => {
  it("F-005-AC17 Échap ferme le menu en laissant le texte, et le menu ne se rouvre pas pour ce `/`", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("/ti");
    await laisserLeMenuSuivre();
    const avant = emises.length;

    presser("Escape");
    await laisserLeMenuSuivre();
    const apresEchap = menuSlash();
    taper("t");
    await laisserLeMenuSuivre();

    expect(apresEchap).toBeNull();
    expect(menuSlash()).toBeNull();
    expect(contenuLu(doc)).toBe("<paragraph>/tit</paragraph>");
    expect(emises.length - avant).toBe(1);
  });

  it("F-005-AC17 effacer le `/` ferme le menu ; un nouveau `/` le rouvre", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("abc /");
    await laisserLeMenuSuivre();

    effacerAvantLeCurseur();
    await laisserLeMenuSuivre();
    const efface = menuSlash();
    taper("/");
    await laisserLeMenuSuivre();

    expect(efface).toBeNull();
    expect(menuSlash()).not.toBeNull();
  });

  it("F-005-AC17 déplacer le curseur hors de la séquence ferme le menu en laissant le texte", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("abc /ti");
    await laisserLeMenuSuivre();

    placerLeCurseurApres("abc /ti");
    placerLeCurseurDans("abc /ti", 1);
    await laisserLeMenuSuivre();

    expect(menuSlash()).toBeNull();
    expect(contenuLu(doc)).toBe("<paragraph>abc /ti</paragraph>");
  });

  it("F-005-AC17 un clic hors du menu et de l'éditeur ferme le menu", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("/ti");
    await laisserLeMenuSuivre();
    const ailleurs = document.createElement("button");
    document.body.append(ailleurs);

    act(() => void ailleurs.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await laisserLeMenuSuivre();
    ailleurs.remove();

    expect(menuSlash()).toBeNull();
    expect(contenuLu(doc)).toBe("<paragraph>/ti</paragraph>");
  });

  it("F-005-AC17 changer de page, qui démonte l'éditeur, ferme le menu", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("/ti");
    await laisserLeMenuSuivre();
    const ouvert = menuSlash();

    demonterLEditeur();

    expect(ouvert).not.toBeNull();
    expect(menuSlash()).toBeNull();
  });
});

describe("mises à jour reçues, menu ouvert", () => {
  it("F-005-AC19 une insertion reçue avant la séquence la laisse ouverte, et la commande appliquée ensuite retire la séquence à sa nouvelle place, et elle seule", async () => {
    const { doc } = monterLEditeur(documentForge(bloc("paragraph", "abc ")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("abc ");
    taper("/ti");
    await laisserLeMenuSuivre();

    recevoirDUneReplique(doc, (replique) =>
      ((replique.contenu.get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(1, "ZZ"),
    );
    await laisserLeMenuSuivre();
    const ouvert = nomsDuMenu();
    presser("Enter");

    expect(ouvert).toEqual(["Titre 1", "Titre 2", "Titre 3"]);
    expect(contenuLu(doc)).toBe('<heading level="1">aZZbc </heading>');
  });

  it.each([
    ["modifie l'intérieur de la séquence", (texte: Y.XmlText) => texte.insert(6, "X")],
    ["retire le dernier caractère de la séquence", (texte: Y.XmlText) => texte.delete(6, 1)],
    ["retire toute la séquence", (texte: Y.XmlText) => texte.delete(4, 3)],
    ["retire le seul `/`", (texte: Y.XmlText) => texte.delete(4, 1)],
  ])(
    "F-005-AC19 une mise à jour reçue qui %s ferme le menu, sans exception, en gardant la saisie faite ailleurs",
    async (_cas, modifier) => {
      const { doc } = monterLEditeur(
        documentForge(bloc("paragraph", "abc "), bloc("paragraph", "ailleurs")),
      );
      entrerDansLEditeur();
      placerLeCurseurALaFinDe("ailleurs");
      taper(" saisi");
      placerLeCurseurALaFinDe("abc ");
      taper("/ti");
      await laisserLeMenuSuivre();
      const ouvert = menuSlash();

      recevoirDUneReplique(doc, (replique) =>
        modifier((replique.contenu.get(0) as Y.XmlElement).get(0) as Y.XmlText),
      );
      await laisserLeMenuSuivre();

      expect(ouvert).not.toBeNull();
      expect(menuSlash()).toBeNull();
      expect(contenuLu(doc)).toContain("<paragraph>ailleurs saisi</paragraph>");
    },
  );

  it("F-005-AC19 le remplacement reçu du bloc de la séquence ferme le menu sans exception", async () => {
    const { doc } = monterLEditeur(documentForge(bloc("paragraph", "abc ")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("abc ");
    taper("/ti");
    await laisserLeMenuSuivre();

    recevoirDUneReplique(doc, (replique) => {
      replique.contenu.delete(0, 1);
      replique.contenu.insert(0, [bloc("heading", "abc /ti", { level: 1 })]);
    });
    await laisserLeMenuSuivre();

    expect(menuSlash()).toBeNull();
  });
});

describe("le menu ne vit pas dans le document", () => {
  it("F-005-AC20 ouvrir, filtrer, parcourir et fermer le menu n'émet que les mises à jour du texte saisi", async () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    const avant = emises.length;

    taper("/");
    await laisserLeMenuSuivre();
    taper("ti");
    await laisserLeMenuSuivre();
    presser("ArrowDown");
    presser("ArrowUp");
    effacerAvantLeCurseur();
    await laisserLeMenuSuivre();
    presser("Escape");
    await laisserLeMenuSuivre();

    // Trois caractères saisis, un effacé : quatre mises à jour, toutes du texte.
    expect(emises.length - avant).toBe(4);
    expect(contenuLu(doc)).toBe("<paragraph>/t</paragraph>");
    // Rien d'autre n'est écrit : ni version, ni état du menu, dans aucun type du document.
    expect(
      [...doc.share].filter(
        ([nom, type]) => nom !== "contenu" && (type._start !== null || type._map.size > 0),
      ),
    ).toEqual([]);
  });
});

describe("accessibilité du menu slash", () => {
  it("F-005-AC22 le menu est une liste d'options « Commandes de bloc », chaque option a un identifiant, un nom et son état ; l'éditeur garde le focus et désigne la liste et l'option active, retirées à la fermeture", async () => {
    monterLEditeur();
    entrerDansLEditeur();

    taper("/");
    await laisserLeMenuSuivre();
    const liste = menuSlash();
    const options = [...(liste?.querySelectorAll("[role=option]") ?? [])];
    const etats = options.map((option) => option.getAttribute("aria-selected"));
    const designation = [
      attributDeLEditeur("aria-controls"),
      attributDeLEditeur("aria-activedescendant"),
    ];
    presser("ArrowDown");
    const apresFleche = attributDeLEditeur("aria-activedescendant");
    presser("Escape");
    await laisserLeMenuSuivre();

    expect(liste?.getAttribute("aria-label")).toBe("Commandes de bloc");
    expect(options.map((option) => option.id).every((id) => id !== "")).toBe(true);
    expect(new Set(options.map((option) => option.id)).size).toBe(SEPT.length);
    expect(etats).toEqual(["true", ...SEPT.slice(1).map(() => "false")]);
    expect(designation).toEqual([liste?.id, options[0]?.id]);
    expect(apresFleche).toBe(options[1]?.id);
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(zoneDeSaisie().getAttribute("role")).toBe("textbox");
    expect(zoneDeSaisie().getAttribute("aria-multiline")).toBe("true");
    expect(attributDeLEditeur("aria-controls")).toBeNull();
    expect(attributDeLEditeur("aria-activedescendant")).toBeNull();
  });

  it("F-005-AC22 le nombre de commandes listées, ou « Aucune commande », est annoncé à chaque changement du filtre", async () => {
    monterLEditeur();
    entrerDansLEditeur();

    taper("/");
    await laisserLeMenuSuivre();
    const sept = annonce();
    taper("tit");
    await laisserLeMenuSuivre();
    const trois = annonce();
    taper("x");
    await laisserLeMenuSuivre();
    const aucune = annonce();

    expect([sept, trois, aucune]).toEqual(["7 commandes", "3 commandes", "Aucune commande"]);
  });

  it("F-005-AC22 « Aucune commande » laisse l'éditeur désigner la liste, sans option active", async () => {
    monterLEditeur();
    entrerDansLEditeur();

    taper("/zz");
    await laisserLeMenuSuivre();

    expect(attributDeLEditeur("aria-controls")).toBe(menuSlash()?.id);
    expect(attributDeLEditeur("aria-activedescendant")).toBeNull();
  });
});
