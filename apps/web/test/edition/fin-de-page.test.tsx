// Sortie du bloc code et ligne de fin de page (F-040-AC1 à AC10) : la zone sous le dernier bloc, le
// clic et le toucher qui y créent un seul paragraphe, Entrée trois fois en fin de bloc code, la
// lecture seule, la convergence de deux répliques et les annonces ; jouées par l'éditeur monté
// comme l'application le monte, document lu par `yjs` seul.
import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  AIDE_DU_BLOC_CODE,
  PARAGRAPHE_AJOUTE_APRES_LE_CODE,
  PARAGRAPHE_AJOUTE_EN_FIN_DE_PAGE,
} from "../../src/interface/messages.ts";
import { lire, lireDossier } from "../aides-disque.ts";
import { ajouter, bloc, contenuLu, documentForge } from "../aides-facade-page.ts";
import { documentDeLaLigne, VERSIONS_DE_LA_TABLE } from "../aides-lignes.ts";
import {
  annuler,
  barreDeBlocs,
  blocDuCurseur,
  cloreLHistorique,
  demonterLEditeur,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  menuSlash,
  monterLEditeur,
  placerLeCurseurALaFinDe,
  placerLeCurseurAuDebutDe,
  recevoirDUneReplique,
  presser,
  presserAvecMod,
  selectionnerDansLeBloc,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const TEXTE_DE_L_AIDE =
  "Tab indente. Échap puis Tab : quitter l'éditeur. Entrée trois fois en fin de bloc : sortir du bloc.";

function liste(nom: "bulletList" | "orderedList", ...enfants: Y.XmlElement[]): Y.XmlElement {
  const un = new Y.XmlElement(nom);
  const element = new Y.XmlElement("listItem");
  element.insert(0, enfants);
  un.insert(0, [element]);
  return un;
}

/** Un dernier bloc de chacun des types de la dernière ligne de la table qui n'est pas un paragraphe. */
const DERNIERS_BLOCS: readonly (readonly [string, () => Y.XmlElement])[] = [
  ["bloc code", () => bloc("codeBlock", "x")],
  ["titre", () => bloc("heading", "titre", { level: 1 })],
  ["liste à puces", () => liste("bulletList", bloc("paragraph", "puce"))],
  ["liste numérotée", () => liste("orderedList", bloc("paragraph", "un"))],
];

function zoneDeFin(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-fin-de-page]");
}

function laZone(): HTMLElement {
  const zone = zoneDeFin();
  if (zone === null) {
    throw new Error("La zone de fin de page est absente.");
  }
  return zone;
}

function ligneDeFin(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-ligne-de-fin]");
}

function regionDEtat(): string | undefined {
  return document.querySelector('p[role="status"]')?.textContent;
}

/** La séquence d'un clic de souris : pointeur, souris, clic. */
function cliquer(): void {
  const cible = laZone();
  act(() => {
    fireEvent.pointerDown(cible, { pointerType: "mouse" });
    fireEvent.mouseDown(cible);
    fireEvent.pointerUp(cible, { pointerType: "mouse" });
    fireEvent.mouseUp(cible);
    fireEvent.click(cible);
  });
}

/** Celle d'un toucher : pointeur de type `touch`, puis les événements de souris que le navigateur émule. */
function toucher(): void {
  const cible = laZone();
  act(() => {
    fireEvent.pointerDown(cible, { pointerType: "touch" });
    fireEvent.pointerUp(cible, { pointerType: "touch" });
    fireEvent.mouseDown(cible);
    fireEvent.mouseUp(cible);
    fireEvent.click(cible);
  });
}

function lu(doc: Y.Doc): string {
  return contenuLu(doc).toLowerCase();
}

describe("la ligne de fin (F-040-AC1)", () => {
  it.each(DERNIERS_BLOCS)(
    "F-040-AC1 dernier bloc : %s : la ligne de fin est sous lui, masquée aux technologies d'assistance, non focalisable, sans texte, sans écriture",
    (_nom, fabriquer) => {
      const { doc, emises } = monterLEditeur(
        documentForge(bloc("paragraph", "avant"), fabriquer()),
      );
      entrerDansLEditeur();

      const ligne = ligneDeFin();
      expect(ligne).not.toBeNull();
      expect(ligne?.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(ligne?.hasAttribute("tabindex")).toBe(false);
      expect(ligne?.textContent).toBe("");
      expect(zoneDeSaisie().contains(ligne)).toBe(false);
      expect(zoneDeSaisie().querySelector("[data-ligne-de-fin]")).toBeNull();
      expect(emises).toEqual([]);
      expect(doc.share.size).toBeGreaterThan(0);
    },
  );

  it("F-040-AC1 la ligne disparaît quand le dernier bloc devient un paragraphe, et revient quand il n'en est plus un (mise à jour reçue)", () => {
    const { doc } = monterLEditeur(documentForge(bloc("codeBlock", "x")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("x");
    expect(ligneDeFin()).not.toBeNull();

    presserAvecMod("Enter");
    expect(ligneDeFin()).toBeNull();

    // Une mise à jour reçue ajoute un bloc code : il redevient le dernier.
    recevoirDUneReplique(doc, (replique) => ajouter(replique, bloc("codeBlock", "z")));
    expect(lu(doc)).toBe("<codeblock>x</codeblock><paragraph></paragraph><codeblock>z</codeblock>");
    expect(ligneDeFin()).not.toBeNull();
  });

  it("F-040-AC1 l'habillage tient en classes de l'application : hauteur d'au moins la cible tactile, curseur de texte, jetons seuls", () => {
    const classes = lire("src/interface/composants/edition.classes.ts");
    const finDePage = /finDePage:\s*"([^"]*)"/.exec(classes)?.[1]?.split(/\s+/) ?? [];
    const ligne = /ligneDeFin:\s*"([^"]*)"/.exec(classes)?.[1]?.split(/\s+/) ?? [];

    expect(finDePage).toEqual(expect.arrayContaining(["min-h-cible", "cursor-text"]));
    expect(ligne).toContain("min-h-cible");
    expect([...finDePage, ...ligne].filter((c) => /\[|transition|animate/.test(c))).toEqual([]);
  });
});

describe("clic ou toucher dans la zone (F-040-AC2, AC3)", () => {
  it.each(DERNIERS_BLOCS)(
    "F-040-AC2 dernier bloc : %s : un clic ajoute un paragraphe vide après le dernier bloc de premier niveau, curseur dedans, focus à l'éditeur, une seule mise à jour",
    (_nom, fabriquer) => {
      const { doc, emises } = monterLEditeur(documentForge(fabriquer()));
      entrerDansLEditeur();
      const avant = lu(doc);
      const compte = emises.length;

      cliquer();

      expect(lu(doc)).toBe(`${avant}<paragraph></paragraph>`);
      expect(emises.length - compte).toBe(1);
      expect(blocDuCurseur()).toEqual({ noeud: "paragraph", texte: "" });
      expect(document.activeElement).toBe(zoneDeSaisie());
      taper("suite");
      expect(lu(doc)).toBe(`${avant}<paragraph>suite</paragraph>`);
    },
  );

  it("F-040-AC2 un second clic avant toute frappe n'ajoute pas de second paragraphe", () => {
    const { doc, emises } = monterLEditeur(documentForge(bloc("codeBlock", "x")));
    entrerDansLEditeur();

    cliquer();
    const compte = emises.length;
    cliquer();

    expect(lu(doc)).toBe("<codeblock>x</codeblock><paragraph></paragraph>");
    expect(emises.length).toBe(compte);
  });

  it.each([
    ["non vide", "texte", "texte"],
    ["vide", "", ""],
  ])(
    "F-040-AC2 dernier bloc paragraphe %s : le clic place le curseur à sa fin et donne le focus, sans rien écrire ni annoncer",
    (_nom, contenu, attendu) => {
      const { doc, emises } = monterLEditeur(
        documentForge(bloc("paragraph", "premier"), bloc("paragraph", contenu)),
      );
      placerLeCurseurAuDebutDe("premier");

      cliquer();

      expect(emises).toEqual([]);
      expect(lu(doc)).toBe(`<paragraph>premier</paragraph><paragraph>${attendu}</paragraph>`);
      expect(blocDuCurseur().texte).toBe(attendu);
      expect(document.activeElement).toBe(zoneDeSaisie());
      expect(regionDEtat()).toBe("");
    },
  );

  it("F-040-AC3 la séquence d'un clic de souris n'ajoute qu'un seul paragraphe, en une seule mise à jour", () => {
    const { doc, emises } = monterLEditeur(documentForge(bloc("codeBlock", "x")));
    entrerDansLEditeur();

    cliquer();

    expect([lu(doc), emises.length]).toEqual([
      "<codeblock>x</codeblock><paragraph></paragraph>",
      1,
    ]);
  });

  it("F-040-AC3 la séquence d'un toucher (pointeur `touch`, puis événements de souris émulés) n'ajoute qu'un seul paragraphe, en une seule mise à jour", () => {
    const { doc, emises } = monterLEditeur(documentForge(bloc("codeBlock", "y")));
    entrerDansLEditeur();

    toucher();

    expect([lu(doc), emises.length]).toEqual([
      "<codeblock>y</codeblock><paragraph></paragraph>",
      1,
    ]);
  });
});

describe("Entrée trois fois en fin de bloc code (F-040-AC4, AC5)", () => {
  /** Un bloc code seul, curseur à sa fin. */
  function dansUnBloc(texte: string, lectureSeule = false) {
    const montage = monterLEditeur(documentForge(bloc("codeBlock", texte)), { lectureSeule });
    entrerDansLEditeur();
    placerLeCurseurALaFinDe(texte);
    return montage;
  }

  it("F-040-AC4 `{ test }` puis Entrée trois fois : les deux lignes vides sont retirées, un paragraphe suit, curseur dedans, en une seule mise à jour", () => {
    const { doc, emises } = dansUnBloc("{ test }");
    presser("Enter");
    presser("Enter");
    expect(lu(doc)).toBe("<codeblock>{ test }\n\n</codeblock>");
    const compte = emises.length;

    presser("Enter");

    expect(lu(doc)).toBe("<codeblock>{ test }</codeblock><paragraph></paragraph>");
    expect(emises.length - compte).toBe(1);
    expect(blocDuCurseur()).toEqual({ noeud: "paragraph", texte: "" });
    expect(document.activeElement).toBe(zoneDeSaisie());
    taper("suite");
    expect(lu(doc)).toBe("<codeblock>{ test }</codeblock><paragraph>suite</paragraph>");
  });

  it("F-040-AC4 l'indentation reprise par F-033-AC18 sur les deux lignes vides part avec elles, aucun autre caractère", () => {
    const { doc } = dansUnBloc("  x");
    presser("Enter");
    presser("Enter");
    expect(lu(doc)).toBe("<codeblock>  x\n  \n  </codeblock>");

    presser("Enter");

    expect(lu(doc)).toBe("<codeblock>  x</codeblock><paragraph></paragraph>");
  });

  it("F-040-AC4 Mod+Z remet le texte et retire le paragraphe en une seule étape", () => {
    const { doc } = dansUnBloc("ab");
    presser("Enter");
    presser("Enter");
    cloreLHistorique();
    presser("Enter");
    expect(lu(doc)).toBe("<codeblock>ab</codeblock><paragraph></paragraph>");

    annuler();

    expect(lu(doc)).toBe("<codeblock>ab\n\n</codeblock>");
  });

  it("F-040-AC4 dans un bloc code d'un élément de liste, le paragraphe est dans cet élément, l'élément n'est pas coupé", () => {
    const { doc } = monterLEditeur(
      documentForge(liste("bulletList", bloc("paragraph", "puce"), bloc("codeBlock", "ab"))),
    );
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("ab");

    presser("Enter");
    presser("Enter");
    presser("Enter");

    expect(lu(doc)).toBe(
      "<bulletlist><listitem><paragraph>puce</paragraph><codeblock>ab</codeblock><paragraph></paragraph></listitem></bulletlist>",
    );
    expect(blocDuCurseur()).toEqual({ noeud: "paragraph", texte: "" });
  });

  it("F-040-AC5 `a` + Entrée + Entrée : les deux sauts restent dans le bloc, aucun bloc créé ; une seule ligne vide finale ou aucune : Entrée insère un saut de ligne", () => {
    const { doc } = dansUnBloc("a");

    presser("Enter");
    expect(lu(doc)).toBe("<codeblock>a\n</codeblock>");
    presser("Enter");
    expect(lu(doc)).toBe("<codeblock>a\n\n</codeblock>");
  });

  it("F-040-AC5 un bloc qui contient une ligne vide au milieu, curseur à la fin d'une ligne non vide : Entrée insère un saut de ligne", () => {
    const { doc } = dansUnBloc("a\n\nb");

    presser("Enter");

    expect(lu(doc)).toBe("<codeblock>a\n\nb\n</codeblock>");
  });

  it("F-040-AC5 curseur hors de la toute fin du bloc : Entrée garde F-033-AC18, sans créer de bloc", () => {
    const { doc } = dansUnBloc("ab\n\n");
    placerLeCurseurAuDebutDe("ab\n\n");

    presser("Enter");

    expect(lu(doc)).toBe("<codeblock>\nab\n\n</codeblock>");
  });

  it("F-040-AC5 sélection non vide en fin de texte : Entrée la remplace par un saut de ligne, sans créer de bloc", () => {
    const { doc } = dansUnBloc("ab\n\n");
    selectionnerDansLeBloc("ab\n\n", 2, 4);
    const avant = lu(doc);

    presser("Enter");

    expect(avant).toBe("<codeblock>ab\n\n</codeblock>");
    expect(lu(doc)).toBe("<codeblock>ab\n</codeblock>");
  });

  it("F-040-AC5 le menu slash ne s'ouvre pas dans un bloc code : Entrée n'y choisit rien, et la sortie reste celle du texte", async () => {
    const { doc } = dansUnBloc("/");
    await laisserLeMenuSuivre();
    expect(menuSlash()).toBeNull();

    presser("Enter");
    presser("Enter");
    presser("Enter");

    expect(lu(doc)).toBe("<codeblock>/</codeblock><paragraph></paragraph>");
  });

  it("F-040-AC5 menu slash ouvert dans un paragraphe : Entrée choisit la commande, rien n'est ajouté du fait de la sortie", async () => {
    const { doc } = monterLEditeur(documentForge(bloc("paragraph", "")));
    entrerDansLEditeur();
    taper("/zzz");
    await laisserLeMenuSuivre();
    expect(menuSlash()).not.toBeNull();

    presser("Enter");
    await laisserLeMenuSuivre();

    expect(lu(doc)).toBe("<paragraph>/zzz</paragraph>");
  });

  it("F-040-AC5 composition en cours : Entrée n'est prise ni pour sortir ni pour insérer", () => {
    const { doc } = dansUnBloc("ab\n\n");
    const editeur = zoneDeSaisie();
    act(() => {
      editeur.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });

    const traitee = presser("Enter", { isComposing: true });

    expect(traitee).toBe(false);
    expect(lu(doc)).toBe("<codeblock>ab\n\n</codeblock>");
  });

  it("F-040-AC5 F-040-AC6 éditeur en lecture seule : Entrée n'est pas prise et rien n'est écrit", () => {
    const { doc, emises } = dansUnBloc("ab\n\n", true);

    expect(presser("Enter")).toBe(false);
    expect(lu(doc)).toBe("<codeblock>ab\n\n</codeblock>");
    expect(emises).toEqual([]);
  });
});

describe("lecture seule et aucune écriture sans geste (F-040-AC6)", () => {
  it("F-040-AC6 en lecture seule, la zone de fin de page n'est pas active : aucun élément à cliquer, aucun focus, aucune écriture", () => {
    const { doc, emises } = monterLEditeur(documentForge(bloc("codeBlock", "x")), {
      lectureSeule: true,
    });

    expect(zoneDeFin()).toBeNull();
    expect(ligneDeFin()).toBeNull();
    expect(emises).toEqual([]);
    expect(lu(doc)).toBe("<codeblock>x</codeblock>");
  });

  it.each(VERSIONS_DE_LA_TABLE)(
    "F-040-AC6 ligne %i de la table des versions : ouvrir, afficher, donner le focus et défiler n'écrivent rien, octet pour octet (`yjs` seul)",
    (version) => {
      const doc = documentDeLaLigne(version);
      const avant = Y.encodeStateAsUpdate(doc);
      const { emises } = monterLEditeur(doc);

      entrerDansLEditeur();
      act(() => void zoneDeSaisie().dispatchEvent(new Event("scroll", { bubbles: true })));

      expect(emises).toEqual([]);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(avant);
    },
  );

  it("F-040-AC6 une mise à jour reçue d'une autre réplique ne fait rien écrire à la ligne de fin", () => {
    const { doc, emises } = monterLEditeur(documentForge(bloc("paragraph", "a")));
    entrerDansLEditeur();
    const autre = new Y.Doc();
    Y.applyUpdate(autre, Y.encodeStateAsUpdate(doc));
    const depart = Y.encodeStateVector(autre);
    autre.getXmlFragment("contenu").insert(1, [bloc("codeBlock", "z")]);

    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(autre, depart)));

    expect(ligneDeFin()).not.toBeNull();
    expect(emises.length).toBe(1);
    expect(lu(doc)).toBe("<paragraph>a</paragraph><codeblock>z</codeblock>");
  });
});

describe("convergence de deux répliques (F-040-AC8)", () => {
  /** Deux répliques d'un même départ ; chacune, par son éditeur, fait `geste` ; échange dans les deux ordres. */
  function converger(depart: Y.Doc, geste: () => void): readonly Y.Doc[] {
    const commun = Y.encodeStateAsUpdate(depart);
    const vecteur = Y.encodeStateVector(depart);
    const modifiee = (identifiant: number): Uint8Array => {
      const doc = new Y.Doc();
      doc.clientID = identifiant;
      Y.applyUpdate(doc, commun);
      monterLEditeur(doc);
      entrerDansLEditeur();
      geste();
      demonterLEditeur();
      return Y.encodeStateAsUpdate(doc, vecteur);
    };
    const [deA, deB] = [modifiee(1), modifiee(2)];
    return [
      [deA, deB],
      [deB, deA],
    ].map((ordre, rang) => {
      const doc = new Y.Doc();
      doc.clientID = 10 + rang;
      [commun, ...ordre].forEach((miseAJour) => Y.applyUpdate(doc, miseAJour));
      return doc;
    });
  }

  it.each([
    [
      "le clic dans la zone",
      () => documentForge(bloc("codeBlock", "x")),
      () => cliquer(),
      /^<codeblock>x<\/codeblock>(<paragraph><\/paragraph>){1,2}$/,
    ],
    [
      "Entrée trois fois",
      () => documentForge(bloc("codeBlock", "a\n\n")),
      () => {
        placerLeCurseurALaFinDe("a\n\n");
        presser("Enter");
      },
      /^<codeblock>a<\/codeblock>(<paragraph><\/paragraph>){1,2}$/,
    ],
  ])(
    "F-040-AC8 %s sur deux répliques : même contenu dans les deux ordres, aucun texte perdu, au plus deux paragraphes vides, rien n'est réécrit à la convergence, la ligne de fin est cohérente",
    (_nom, depart, geste, attendu) => {
      const [premier, second] = converger(depart(), geste);

      expect(lu(premier as Y.Doc)).toBe(lu(second as Y.Doc));
      expect(lu(premier as Y.Doc)).toMatch(attendu);

      const { emises } = monterLEditeur(premier as Y.Doc);
      entrerDansLEditeur();
      expect(emises).toEqual([]);
      expect(ligneDeFin()).toBeNull();
      expect(lu(premier as Y.Doc)).toBe(lu(second as Y.Doc));
    },
  );
});

describe("annonces (F-040-AC9)", () => {
  it("F-040-AC9 les textes sont des constantes de messages.ts, en français", () => {
    expect(PARAGRAPHE_AJOUTE_APRES_LE_CODE).toBe("Paragraphe ajouté après le bloc de code");
    expect(PARAGRAPHE_AJOUTE_EN_FIN_DE_PAGE).toBe("Paragraphe ajouté en fin de page");
  });

  it.each([
    ["bloc code", () => bloc("codeBlock", "x"), PARAGRAPHE_AJOUTE_APRES_LE_CODE],
    ["titre", () => bloc("heading", "t", { level: 2 }), PARAGRAPHE_AJOUTE_EN_FIN_DE_PAGE],
  ])(
    "F-040-AC9 clic dans la zone, dernier bloc : %s : l'annonce est dite dans la région d'état, le focus reste dans l'éditeur",
    (_nom, fabriquer, attendu) => {
      monterLEditeur(documentForge(fabriquer()));
      entrerDansLEditeur();

      cliquer();

      expect(regionDEtat()).toBe(attendu);
      expect(document.activeElement).toBe(zoneDeSaisie());
    },
  );

  it("F-040-AC9 Entrée trois fois annonce « après le bloc de code » ; rien n'est annoncé quand rien n'est ajouté", () => {
    monterLEditeur(documentForge(bloc("codeBlock", "ab")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("ab");
    presser("Enter");
    presser("Enter");
    expect(regionDEtat()).toBe("");

    presser("Enter");

    expect(regionDEtat()).toBe(PARAGRAPHE_AJOUTE_APRES_LE_CODE);
  });
});

describe("la sortie reste découvrable (F-040-AC10)", () => {
  it("F-040-AC10 curseur dans un bloc code : l'aide de la barre dit les trois sorties au clavier en une phrase de plus, désignée par aria-describedby", () => {
    monterLEditeur(documentForge(bloc("codeBlock", "ab")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("ab");

    const aide = barreDeBlocs()?.querySelector(
      `[id="${zoneDeSaisie().getAttribute("aria-describedby") ?? ""}"]`,
    );

    expect(AIDE_DU_BLOC_CODE).toBe(TEXTE_DE_L_AIDE);
    expect(aide?.textContent).toBe(TEXTE_DE_L_AIDE);
  });

  it("F-040-AC10 Mod+Entrée garde sa sortie (F-005-AC4)", () => {
    const { doc } = monterLEditeur(documentForge(bloc("codeBlock", "ab")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("ab");

    presserAvecMod("Enter");

    expect(lu(doc)).toBe("<codeblock>ab</codeblock><paragraph></paragraph>");
  });
});

// ——— Couture : appelants et consommateurs d'Entrée et de la sortie du bloc code (F-040-AC7) ———

/** Chaque consommateur, ses fichiers, et le titre du test de ce fichier qui l'exerce, sortie active. */
const CONSOMMATEURS = {
  "les touches de bloc-code.ts": {
    fichiers: ["src/edition/bloc-code.ts", "src/edition/fin-de-page.ts"],
    test: "F-040-AC4 `{ test }` puis Entrée trois fois",
  },
  "l'élément de liste qui neutralise ses raccourcis dans un bloc code": {
    fichiers: ["src/edition/schema.ts"],
    test: "F-040-AC4 dans un bloc code d'un élément de liste",
  },
  "la reprise de l'indentation de F-033-AC18": {
    fichiers: ["src/edition/indentation.ts"],
    test: "F-040-AC4 l'indentation reprise par F-033-AC18",
  },
  "le menu slash de F-005-AC18": {
    fichiers: ["src/edition/menu-slash.ts"],
    test: "F-040-AC5 le menu slash ne s'ouvre pas dans un bloc code",
  },
  "la barre de blocs": {
    fichiers: ["src/edition/barre.ts", "src/edition/EditeurDePage.tsx"],
    test: "F-040-AC10 curseur dans un bloc code",
  },
  "le déplacement de bloc de F-006": {
    fichiers: ["src/edition/deplacement-de-bloc.ts"],
    test: "F-040-AC1 la ligne disparaît quand le dernier bloc devient un paragraphe",
  },
} as const;

/** Les fichiers de `src/edition` qui lisent la touche Entrée ou la sortie du bloc code. */
const LIT_ENTREE = /["']Enter["']|\bEnter:|exitCode|sortieParEntree|activerLaFinDePage/;

describe("couture : Entrée et sortie du bloc code (F-040-AC7)", () => {
  it("F-040-AC7 chaque fichier du module d'édition qui lit Entrée ou sort du bloc code est inscrit à un consommateur, et chaque consommateur a un test de ce fichier", () => {
    const sources = lireDossier("src/edition");
    const inscrits = new Set<string>(Object.values(CONSOMMATEURS).flatMap((c) => c.fichiers));
    const nonInscrits = [...sources]
      .filter(([chemin, texte]) => /\.tsx?$/.test(chemin) && LIT_ENTREE.test(texte))
      .map(([chemin]) => chemin)
      .filter((chemin) => !inscrits.has(chemin));
    const fichierDeTest = lire("test/edition/fin-de-page.test.tsx");
    const sansTest = Object.values(CONSOMMATEURS)
      .map((c) => c.test)
      .filter(
        (titre) => !fichierDeTest.includes(`it("${titre}`) && !fichierDeTest.includes(`"${titre}`),
      );

    expect(nonInscrits).toEqual([]);
    expect([...inscrits].filter((chemin) => !sources.has(chemin))).toEqual([]);
    expect(sansTest).toEqual([]);
  });

  it("F-040-AC7 cas fautif : un fichier nouveau qui lit Entrée sans être inscrit est nommé", () => {
    const sources = new Map([["nouveau.ts", 'if (evenement.key === "Enter") {}']]);
    const inscrits = new Set<string>(Object.values(CONSOMMATEURS).flatMap((c) => c.fichiers));

    expect(
      [...sources].filter(([c, t]) => LIT_ENTREE.test(t) && !inscrits.has(`src/edition/${c}`)),
    ).toHaveLength(1);
  });

  it("F-040-AC7 le format ne change pas : la sortie n'ajoute ni nœud, ni attribut, ni marque", () => {
    expect(lire("src/edition/schema.ts")).not.toMatch(/finDePage|fin-de-page/);
  });
});
