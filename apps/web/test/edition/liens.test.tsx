// Liens : panneau, Mod+K, collage, clic et commande de lien de l'éditeur (F-028-AC6 à AC10, AC12 à
// AC14, AC17, AC31, AC32).
import { lireVersionPage } from "@notionlike/document";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import { contenuLu, documentForge, inventaireDuContenu } from "../aides-facade-page.ts";
import { ADRESSES_ACCEPTEES, ADRESSES_REFUSEES, paragrapheAvecLien } from "./aides-adresses.ts";
import {
  appelerLaCommandeDeLien,
  cliquerDansLeTexte,
  collerDuHtml,
  collerDuTexte,
  commande,
  couperLeReseau,
  deplacerLeTexte,
  entrerDansLEditeur,
  laisserRelireLaSelection,
  monterLEditeur,
  placerLeCurseurDans,
  presser,
  presserAvecMod,
  selectionnerDansLeNavigateur,
  selectionnerDe,
  selectionnerLeTexte,
  selectionVueParLEditeur,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const CHAMP = { name: "Adresse du lien" } as const;

function champ(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", CHAMP);
}

/** Une valeur écrite dans un attribut entre guillemets d'un texte HTML. */
function attribut(valeur: string): string {
  return valeur.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function panneau(): HTMLElement | null {
  return screen.queryByRole("form", { name: "Lien" });
}

function ouvrirParModK(): boolean {
  return presserAvecMod(RACCOURCIS.lien.touche);
}

async function saisirDansLeChamp(texte: string): Promise<void> {
  const utilisateur = userEvent.setup();
  await utilisateur.clear(champ());
  await utilisateur.type(champ(), `${texte}{Enter}`);
}

function paragrapheAvecLienRefuse(avant: string, lien: string, adresse: unknown): Y.XmlElement {
  return paragrapheAvecLien(avant, lien, { href: adresse });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("panneau de lien", () => {
  it("F-028-AC6 Mod+K sur une sélection non vide d'un seul bloc ouvre le panneau, focus dans le champ ; Entrée sur une adresse acceptée pose le lien normalisé, ferme le panneau et rend le focus à l'éditeur", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");

    const traitee = ouvrirParModK();
    const focusALOuverture = document.activeElement;
    const champALOuverture = champ();
    await saisirDansLeChamp("exemple.fr/a");

    expect(traitee).toBe(true);
    expect(focusALOuverture).toBe(champALOuverture);
    expect(contenuLu(doc)).toBe(
      '<paragraph>voir le <link href="https://exemple.fr/a">site</link></paragraph>',
    );
    expect(panneau()).toBeNull();
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(window.getSelection()?.toString()).toBe("site");
  });

  it("F-028-AC6 la commande « Lien » de la barre ouvre le même panneau, et « Appliquer » pose le lien", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");

    act(() => commande("Lien").click());
    const focus = document.activeElement;
    const champALOuverture = champ();
    await utilisateur.type(champ(), "exemple.fr");
    await utilisateur.click(screen.getByRole("button", { name: "Appliquer" }));

    expect(focus).toBe(champALOuverture);
    expect(contenuLu(doc)).toContain('<link href="https://exemple.fr/">site</link>');
    expect(panneau()).toBeNull();
  });

  it("F-028-AC6 sur une sélection vide hors d'un lien, Mod+K ne fait rien et laisse la combinaison à la palette ; « Lien » est indisponible", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    const lienDansUnBlocVide = commande("Lien").getAttribute("aria-disabled");
    taper("texte");
    const avant = [contenuLu(doc), emises.length];

    const traitee = ouvrirParModK();

    expect(lienDansUnBlocVide).toBe("true");
    expect(traitee).toBe(false);
    expect(panneau()).toBeNull();
    expect([contenuLu(doc), emises.length]).toEqual(avant);
  });

  it("F-028-AC6 sur une sélection qui s'étend sur plusieurs blocs, Mod+K est retenu mais n'ouvre rien et ne modifie rien ; « Lien » est indisponible", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("premier");
    presser("Enter");
    taper("second");
    selectionnerDe("premier", "second");
    const avant = [contenuLu(doc), emises.length];

    const traitee = ouvrirParModK();
    act(() => commande("Lien").click());

    expect(traitee).toBe(true);
    expect(commande("Lien").getAttribute("aria-disabled")).toBe("true");
    expect(panneau()).toBeNull();
    expect([contenuLu(doc), emises.length]).toEqual(avant);
  });

  // F-028-AC30 sous macOS : Chromium livre `selectionchange` après une frappe qui suit de près une
  // Maj+flèche, et l'éditeur ne relit la sélection du navigateur qu'à cet événement.
  it("F-028-AC6 F-028-AC30 Mod+K pressé avant que l'éditeur n'ait relu la sélection du navigateur ouvre le panneau sur la sélection affichée, et le lien porte sur elle", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerDansLeNavigateur("site");
    const vueAvantLaFrappe = selectionVueParLEditeur();

    const traitee = ouvrirParModK();
    const champALOuverture = screen.queryByRole("textbox", CHAMP);
    const focusALOuverture = document.activeElement;
    await saisirDansLeChamp("exemple.fr");

    expect(vueAvantLaFrappe).toBe("");
    expect(traitee).toBe(true);
    expect(focusALOuverture).toBe(champALOuverture);
    expect(contenuLu(doc)).toBe(
      '<paragraph>voir le <link href="https://exemple.fr/">site</link></paragraph>',
    );
  });

  it("F-028-AC6 témoin : la même sélection, une fois relue par l'éditeur à son événement, ouvre le même panneau", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerDansLeNavigateur("site");
    await laisserRelireLaSelection();
    const vueAvantLaFrappe = selectionVueParLEditeur();

    const traitee = ouvrirParModK();
    await saisirDansLeChamp("exemple.fr");

    expect(vueAvantLaFrappe).toBe("site");
    expect(traitee).toBe(true);
    expect(contenuLu(doc)).toBe(
      '<paragraph>voir le <link href="https://exemple.fr/">site</link></paragraph>',
    );
  });

  it("F-028-AC7 dans un lien, Mod+K affiche l'adresse enregistrée comme du texte ; Appliquer la remplace sur toute l'étendue du lien", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("le site");
    ouvrirParModK();
    await saisirDansLeChamp("exemple.fr");
    placerLeCurseurDans("site", 2);

    act(() => commande("Lien").click());
    const affichee = champ().value;
    await saisirDansLeChamp("autre.example/b");

    expect(affichee).toBe("https://exemple.fr/");
    expect(contenuLu(doc)).toBe(
      '<paragraph>voir <link href="https://autre.example/b">le site</link></paragraph>',
    );
  });

  it("F-028-AC7 « Retirer le lien » retire le lien en conservant le texte et ses autres marques", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    presserAvecMod("b");
    ouvrirParModK();
    await saisirDansLeChamp("exemple.fr");
    placerLeCurseurDans("site", 2);

    ouvrirParModK();
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le lien" }));

    expect(contenuLu(doc)).toBe("<paragraph>voir le <bold>site</bold></paragraph>");
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-028-AC7 F-028-AC27 Échap ferme le panneau sans rien modifier et rend le focus à l'éditeur, sélection conservée", async () => {
    const utilisateur = userEvent.setup();
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    const avant = [contenuLu(doc), emises.length];

    ouvrirParModK();
    await utilisateur.type(champ(), "exemple.fr");
    await utilisateur.keyboard("{Escape}");

    expect(panneau()).toBeNull();
    expect([contenuLu(doc), emises.length]).toEqual(avant);
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(window.getSelection()?.toString()).toBe("site");
  });

  it("F-028-AC27 le panneau est atteignable au clavier seul : champ étiqueté, Appliquer, Ouvrir le lien et Retirer le lien nommés en français, l'indisponible exposé comme tel", async () => {
    const utilisateur = userEvent.setup();
    monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");

    ouvrirParModK();
    const etiquette = document.querySelector(`label[for="${champ().id}"]`)?.textContent;
    await utilisateur.tab();
    const apresChamp = document.activeElement;
    await utilisateur.tab();
    const ensuite = document.activeElement;
    await utilisateur.tab();
    const dernier = document.activeElement;

    expect(etiquette).toBe("Adresse du lien");
    expect(apresChamp).toBe(screen.getByRole("button", { name: "Appliquer" }));
    expect(ensuite).toBe(screen.getByRole("button", { name: "Ouvrir le lien" }));
    expect(ensuite?.getAttribute("aria-disabled")).toBe("true");
    expect(dernier).toBe(screen.getByRole("button", { name: "Retirer le lien" }));
    expect(dernier?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("adresse refusée à la saisie", () => {
  it.each(["javascript:alert(1)", "/chemin", "", "ftp://exemple.fr", "localhost:3000"])(
    "F-028-AC12 « %s » : aucune mise à jour, le texte reste dans le champ, le panneau reste ouvert, un message rattaché au champ et annoncé cite les trois schémas",
    async (saisie) => {
      const utilisateur = userEvent.setup();
      const { doc, emises } = monterLEditeur();
      entrerDansLEditeur();
      taper("voir le site");
      selectionnerLeTexte("site");
      const avant = [contenuLu(doc), emises.length];

      ouvrirParModK();
      if (saisie !== "") {
        await utilisateur.type(champ(), saisie);
      }
      await utilisateur.keyboard("{Enter}");

      const message = screen.getByRole("alert");
      expect([contenuLu(doc), emises.length]).toEqual(avant);
      expect(panneau()).not.toBeNull();
      expect(champ().value).toBe(saisie);
      expect(champ().getAttribute("aria-invalid")).toBe("true");
      expect(champ().getAttribute("aria-describedby")).toBe(message.id);
      expect(message.textContent).toMatch(/https.*http.*mailto/);
    },
  );
});

describe("collage d'une adresse", () => {
  it("F-028-AC9 une adresse https seule collée sur une sélection d'un seul bloc y pose le lien sans remplacer le texte", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");

    collerDuTexte("  HTTPS://Exemple.fr/a  ");

    expect(contenuLu(doc)).toBe(
      '<paragraph>voir le <link href="https://exemple.fr/a">site</link></paragraph>',
    );
  });

  it.each([
    ["une adresse mailto", "mailto:prenom@exemple.fr"],
    ["une adresse sans schéma", "exemple.fr"],
    ["une adresse refusée", "javascript:alert(1)"],
    ["une adresse parmi d'autres mots", "voir https://exemple.fr/a"],
  ])(
    "F-028-AC9 %s collée sur une sélection remplace le texte comme un collage ordinaire",
    (_nom, texte) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("voir le site");
      selectionnerLeTexte("site");

      collerDuTexte(texte);

      expect(contenuLu(doc)).toBe(`<paragraph>voir le ${texte}</paragraph>`);
    },
  );
});

describe("aucun lien automatique", () => {
  it.each([
    [
      "une adresse saisie suivie d'une espace",
      () => {
        taper("https://exemple.fr/a ");
      },
    ],
    [
      "une adresse collée sans sélection",
      () => {
        collerDuTexte("https://exemple.fr/a");
      },
    ],
    [
      "un texte qui contient une adresse parmi d'autres caractères",
      () => {
        collerDuTexte("voir https://exemple.fr/a et la suite");
      },
    ],
  ])(
    "F-028-AC31 %s : aucun lien, la version n'est pas élevée, le texte est inscrit tel quel",
    (_nom, geste) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      geste();

      expect(inventaireDuContenu(doc).marques).toEqual([]);
      expect(contenuLu(doc)).toContain("https://exemple.fr/a");
      expect(lireVersionPage(doc)).toBe(1);
    },
  );
});

describe("collage d'un contenu riche", () => {
  it("F-028-AC13 strong et b deviennent du gras, em et i de l'italique ; un a d'adresse acceptée devient un lien qui ne porte que sa forme normalisée", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    collerDuHtml(
      '<p><b>b</b> <strong>strong</strong> <i>i</i> <em>em</em> <a href="HTTPS://Exemple.fr/x" target="_self" rel="opener" class="fixed" title="t" style="color:red" onclick="alert(1)">lien</a></p>',
    );

    expect(contenuLu(doc)).toBe(
      '<paragraph><bold>b</bold> <bold>strong</bold> <italic>i</italic> <italic>em</italic> <link href="https://exemple.fr/x">lien</link></paragraph>',
    );
  });

  it.each(ADRESSES_REFUSEES.filter(([, valeur]) => typeof valeur === "string"))(
    "F-028-AC13 un a collé d'adresse refusée (%s) garde son texte sans lien",
    (_nom, adresse) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      collerDuHtml(`<p><a href="${attribut(adresse as string)}">texte</a></p>`);

      expect(inventaireDuContenu(doc).marques).toEqual([]);
      expect(contenuLu(doc)).toBe("<paragraph>texte</paragraph>");
    },
  );

  it.each(ADRESSES_ACCEPTEES)(
    "F-028-AC13 un a collé d'adresse acceptée (%s) devient un lien de forme normalisée",
    (_nom, adresse, normalisee) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      collerDuHtml(`<p><a href="${attribut(adresse)}">texte</a></p>`);

      expect(contenuLu(doc)).toBe(`<paragraph><link href="${normalisee}">texte</link></paragraph>`);
    },
  );

  it("F-028-AC14 un contenu collé qui, exécuté, écrirait une valeur témoin n'exécute ni ne charge rien, et n'inscrit que du texte, dans le document comme dans le DOM de l'éditeur", async () => {
    const appels = couperLeReseau();
    const temoin = window as Window & { temoinF028?: string };
    delete temoin.temoinF028;
    const { doc } = monterLEditeur();
    entrerDansLEditeur();

    collerDuHtml(
      [
        "<p>avant</p>",
        "<script>window.temoinF028 = 'script'</script>",
        '<img src="https://exemple.invalid/i.png" onerror="window.temoinF028 = \'image\'">',
        "<a href=\"javascript:window.temoinF028 = 'lien'\">lien piégé</a>",
        "<iframe src=\"javascript:window.temoinF028 = 'cadre'\"></iframe>",
        '<svg onload="window.temoinF028 = \'svg\'"><circle r="1"></circle></svg>',
        "<style>@import url(https://exemple.invalid/s.css); p { color: red }</style>",
        '<link rel="stylesheet" href="https://exemple.invalid/l.css">',
        '<p onclick="window.temoinF028 = \'clic\'" style="background:url(https://exemple.invalid/f.png)">après</p>',
      ].join(""),
    );
    await act(() => new Promise((suite) => setTimeout(suite, 20)));

    const zone = zoneDeSaisie();
    expect(temoin.temoinF028).toBeUndefined();
    expect(appels).toEqual([]);
    expect(
      zone.querySelectorAll("script, img, iframe, svg, style, link, object, embed"),
    ).toHaveLength(0);
    expect(
      [...zone.querySelectorAll("*")].flatMap((element) =>
        element.getAttributeNames().filter((nom) => /^on|^style$|^src$|^href$/.test(nom)),
      ),
    ).toEqual([]);
    expect(Object.keys(inventaireDuContenu(doc).noeuds)).toEqual(["paragraph"]);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
    expect(contenuLu(doc)).not.toMatch(/temoin|script|onerror|onload|onclick|javascript/);
  });
});

describe("clic dans un lien", () => {
  it("F-028-AC10 un clic simple dans un lien n'ouvre aucun onglet et n'active aucun élément a ; Mod+clic l'ouvre par l'activation d'un élément a aux attributs imposés, et par rien d'autre", async () => {
    const ouvertures = vi.fn();
    vi.stubGlobal("open", ouvertures);
    const activations: Element[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      activations.push(this);
    });
    monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    ouvrirParModK();
    await saisirDansLeChamp("exemple.fr");

    const simple = cliquerDansLeTexte("site", false);
    const apresLeClicSimple = activations.length;
    const avecMod = cliquerDansLeTexte("site", true);

    expect(simple).toBe(false);
    expect(apresLeClicSimple).toBe(0);
    expect(avecMod).toBe(true);
    expect(ouvertures).not.toHaveBeenCalled();
    expect(
      activations.map((a) =>
        a.getAttributeNames().map((nom) => `${nom}=${a.getAttribute(nom) ?? ""}`),
      ),
    ).toEqual([["href=https://exemple.fr/", "rel=noopener noreferrer", "target=_blank"]]);
  });

  it("F-028-AC10 « Ouvrir le lien » est un élément a aux attributs imposés ; il est indisponible sur un lien neutralisé, que Mod+clic n'ouvre pas", () => {
    const activations = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    monterLEditeur(
      documentForge(paragrapheAvecLienRefuse("voir ", "piège", "javascript:alert(1)")),
    );
    entrerDansLEditeur();
    placerLeCurseurDans("piège", 2);

    const avecMod = cliquerDansLeTexte("piège", true);
    ouvrirParModK();
    const ouvrir = screen.getByRole("button", { name: "Ouvrir le lien" });

    expect(avecMod).toBe(false);
    expect(activations).not.toHaveBeenCalled();
    expect(ouvrir.tagName).toBe("BUTTON");
    expect(ouvrir.getAttribute("aria-disabled")).toBe("true");
  });

  it("F-028-AC10 F-028-AC16 sur un lien d'adresse acceptée, « Ouvrir le lien » est un élément a qui porte exactement href, rel et target imposés", async () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("voir le site");
    selectionnerLeTexte("site");
    ouvrirParModK();
    await saisirDansLeChamp("exemple.fr");
    placerLeCurseurDans("site", 2);

    ouvrirParModK();
    const ouvrir = screen.getByRole("link", { name: "Ouvrir le lien" });

    expect(
      ["href", "rel", "target"].map((nom) => `${nom}=${ouvrir.getAttribute(nom) ?? ""}`),
    ).toEqual(["href=https://exemple.fr/", "rel=noopener noreferrer", "target=_blank"]);
  });
});

describe("lien neutralisé", () => {
  it("F-028-AC17 dans un lien neutralisé, « Lien » est activé ; le panneau montre l'adresse refusée comme du texte et permet de corriger l'adresse", async () => {
    const { doc } = monterLEditeur(
      documentForge(paragrapheAvecLienRefuse("voir ", "piège", "javascript:alert(1)")),
    );
    entrerDansLEditeur();
    placerLeCurseurDans("piège", 2);

    const lienActive = commande("Lien").getAttribute("aria-pressed");
    ouvrirParModK();
    const affichee = champ().value;
    const elementsInterpretes = panneau()?.querySelectorAll("a, script").length;
    await saisirDansLeChamp("exemple.fr");

    expect(lienActive).toBe("true");
    expect(affichee).toBe("javascript:alert(1)");
    expect(elementsInterpretes).toBe(0);
    expect(contenuLu(doc)).toBe(
      '<paragraph>voir <link href="https://exemple.fr/">piège</link></paragraph>',
    );
  });

  it("F-028-AC17 dans un lien neutralisé, « Retirer le lien » retire le lien et garde le texte", async () => {
    const utilisateur = userEvent.setup();
    const { doc } = monterLEditeur(
      documentForge(paragrapheAvecLienRefuse("voir ", "piège", "javascript:alert(1)")),
    );
    entrerDansLEditeur();
    placerLeCurseurDans("piège", 2);

    ouvrirParModK();
    await utilisateur.click(screen.getByRole("button", { name: "Retirer le lien" }));

    expect(contenuLu(doc)).toBe("<paragraph>voir piège</paragraph>");
  });
});

describe("commande de lien de l'éditeur appelée directement", () => {
  it.each(ADRESSES_REFUSEES)(
    "F-028-AC32 F-028-AC18 %s est refusée par setLink, toggleLink et setMark sans aucune mise à jour Yjs",
    (_nom, adresse) => {
      const { doc, emises } = monterLEditeur();
      entrerDansLEditeur();
      taper("texte");
      selectionnerLeTexte("texte");
      const avant = emises.length;

      const rendus = (["setLink", "toggleLink", "setMark"] as const).map((nom) =>
        appelerLaCommandeDeLien(nom, adresse),
      );

      // setLink valide l'adresse par la règle ; toggleLink et setMark passent par la garde des liens,
      // qui refuse la transaction : leur rendu ne dit pas qu'elle a été écartée.
      expect(rendus[0]).toBe(false);
      expect(emises.length).toBe(avant);
      expect(inventaireDuContenu(doc).marques).toEqual([]);
    },
  );

  it.each(ADRESSES_ACCEPTEES.filter(([, adresse, normalisee]) => adresse === normalisee))(
    "F-028-AC32 %s, forme normalisée d'une adresse acceptée, est posée par setLink",
    (_nom, adresse) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("texte");
      selectionnerLeTexte("texte");

      const rendu = appelerLaCommandeDeLien("setLink", adresse);

      expect(rendu).toBe(true);
      expect(contenuLu(doc)).toBe(`<paragraph><link href="${adresse}">texte</link></paragraph>`);
    },
  );

  it("F-028-AC32 F-028-AC18 une adresse acceptée mais non normalisée n'est pas inscrite par la commande directe : seule la forme normalisée entre dans le document", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeTexte("texte");

    const rendu = appelerLaCommandeDeLien("setLink", "HTTPS://Exemple.FR");
    appelerLaCommandeDeLien("setMark", "HTTPS://Exemple.FR");

    expect(rendu).toBe(false);
    expect(inventaireDuContenu(doc).marques).toEqual([]);
  });
});

describe("texte saisi dans un lien neutralisé", () => {
  it("F-028-AC18 H5 le texte saisi dans l'étendue d'un lien neutralisé reçu n'en hérite jamais : il sort du lien, qui garde son étendue ; aucune mise à jour émise ne le pose sur ce texte, et aucun autre lien refusé n'entre", () => {
    const doc = documentForge(paragrapheAvecLienRefuse("voir ", "piège", REFUSEE));
    const { emises } = monterLEditeur(doc);
    entrerDansLEditeur();
    placerLeCurseurDans("piège", 2);
    const etatAvant = Y.encodeStateAsUpdate(doc);
    const avant = emises.length;

    taper("x");
    const parLaFrappe = emises.slice(avant);
    selectionnerLeTexte("voir");
    const refuseeParLaCommande = appelerLaCommandeDeLien("setLink", REFUSEE);

    expect(refuseeParLaCommande).toBe(false);
    expect(contenuLu(doc)).toBe(
      `<paragraph>voir <link href="${REFUSEE}">pi</link>x<link href="${REFUSEE}">ège</link></paragraph>`,
    );
    expect(parLaFrappe.length).toBeGreaterThan(0);
    expect(etatsRejoues(etatAvant, parLaFrappe).filter((lu) => X_DANS_UN_LIEN.test(lu))).toEqual(
      [],
    );
  });

  it.each([
    ["au début", 0],
    ["à la fin", "piège".length],
  ])(
    "F-028-AC18 H5 le texte saisi %s d'un lien neutralisé reçu reste hors du lien",
    (_cas, decalage) => {
      const doc = documentForge(paragrapheAvecLienRefuse("voir ", "piège", REFUSEE));
      monterLEditeur(doc);
      entrerDansLEditeur();
      placerLeCurseurDans("piège", decalage);

      taper("x");

      expect(contenuLu(doc)).toContain(`<link href="${REFUSEE}">piège</link>`);
      expect(contenuLu(doc)).not.toMatch(X_DANS_UN_LIEN);
    },
  );

  it("F-028-AC18 H5 le texte qui remplace une partie sélectionnée d'un lien neutralisé reçu sort du lien ; le reste du lien garde son adresse", () => {
    const doc = documentForge(paragrapheAvecLienRefuse("voir ", "piège", REFUSEE));
    monterLEditeur(doc);
    entrerDansLEditeur();
    selectionnerLeTexte("èg");

    taper("x");

    expect(contenuLu(doc)).toBe(
      `<paragraph>voir <link href="${REFUSEE}">pi</link>x<link href="${REFUSEE}">e</link></paragraph>`,
    );
  });

  it("F-028-AC18 H5 un lien neutralisé reçu déplacé dans la page garde son adresse : le déplacer ne l'efface pas et n'en crée pas d'autre", () => {
    const doc = documentForge(paragrapheAvecLienRefuse("voir ", "piège", REFUSEE));
    monterLEditeur(doc);
    entrerDansLEditeur();

    deplacerLeTexte("piège", "voir");

    expect(contenuLu(doc)).toBe(`<paragraph><link href="${REFUSEE}">piège</link>voir </paragraph>`);
  });
});

const REFUSEE = "javascript:alert(1)";
/** Un « x » dans l'étendue d'un lien, dans le contenu lu. */
const X_DANS_UN_LIEN = /<link[^>]*>[^<]*x/;

/** Le contenu lu après chacune de ces mises à jour, rejouées sur l'état de départ. */
function etatsRejoues(depart: Uint8Array, misesAJour: readonly Uint8Array[]): string[] {
  const rejoue = new Y.Doc();
  Y.applyUpdate(rejoue, depart);
  return misesAJour.map((miseAJour) => {
    Y.applyUpdate(rejoue, miseAJour);
    return contenuLu(rejoue);
  });
}
