// Langage du bloc code (F-005-AC9, AC35, AC36) : la liste fermée de l'application, à la lecture
// comme à l'écriture, et le collage depuis un éditeur de code. Les valeurs sont écrites et relues
// par `yjs` seul, comme un autre client les écrirait.
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import { bloc, documentForge, fragmentBrut } from "../aides-facade-page.ts";
import {
  appelerUneCommandeDuBlocCode,
  choisirLeLangage,
  collerLesDonnees,
  deposerDuHtml,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurALaFinDe,
  presser,
  recevoirDUneReplique,
  selecteurDeLangage,
  selectionnerLeBloc,
  selectionnerLeBlocEntier,
  taper,
  toutSelectionner,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const FORGEE = "x fixed inset-0";
const INJECTEE = '"><script>alert(1)</script>';
const LONGUE = "a".repeat(10_000);
const NOMBRE = 5;
const VALEURS_HORS_LISTE: readonly (readonly [string, unknown])[] = [
  ["des classes utilitaires", FORGEE],
  ["un balisage", INJECTEE],
  ["10 000 caractères", LONGUE],
  ["un nombre", NOMBRE],
];

/** Les langages des blocs code du fragment, lus par `yjs` seul ; `undefined` : aucun langage. */
function langagesLus(doc: Y.Doc): unknown[] {
  const lus: unknown[] = [];
  const visiter = (element: unknown): void => {
    if (element instanceof Y.XmlElement) {
      if (element.nodeName === "codeBlock") {
        lus.push(element.getAttribute("language"));
      }
      element.toArray().forEach(visiter);
    }
  };
  fragmentBrut(doc).toArray().forEach(visiter);
  return lus;
}

/** Les attributs de tous les éléments de l'éditeur, par « élément.attribut=valeur ». */
function attributsDeLEditeur(): string[] {
  return [zoneDeSaisie(), ...zoneDeSaisie().querySelectorAll("*")].flatMap((element) =>
    [...element.attributes].map(
      (attribut) => `${element.tagName}.${attribut.name}=${attribut.value}`,
    ),
  );
}

function trace(valeur: unknown): string {
  return typeof valeur === "string" ? valeur : `=${String(valeur)}`;
}

/** Un document dont l'unique bloc code porte ce langage, écrit par `yjs` seul. */
function documentAuLangage(langage: unknown): Y.Doc {
  const code = bloc("codeBlock", "print(1)");
  code.setAttribute("language", langage as string);
  return documentForge(code);
}

describe("langage hors de la liste, à la lecture", () => {
  it.each(VALEURS_HORS_LISTE)(
    "F-005-AC9 un bloc code reçu à l'ouverture avec %s s'affiche en « Texte brut », sans mise à jour, et sa valeur n'entre dans aucun attribut de l'éditeur",
    (_cas, valeur) => {
      const doc = documentAuLangage(valeur);
      const avant = [...Y.encodeStateAsUpdate(doc)];
      const { emises } = monterLEditeur(doc);
      entrerDansLEditeur();
      placerLeCurseurALaFinDe("print(1)");

      expect(zoneDeSaisie().querySelector("pre code")?.textContent).toBe("print(1)");
      expect(zoneDeSaisie().querySelector("pre code")?.hasAttribute("class")).toBe(false);
      expect(selecteurDeLangage()?.value).toBe("");
      expect(attributsDeLEditeur().filter((un) => un.includes(trace(valeur)))).toEqual([]);
      expect(emises).toEqual([]);
      expect([...Y.encodeStateAsUpdate(doc)]).toEqual(avant);
    },
  );

  it.each(VALEURS_HORS_LISTE)(
    "F-005-AC9 un langage avec %s reçu pendant l'affichage : « Texte brut », aucune mise à jour émise de ce fait, aucune trace dans les attributs",
    (_cas, valeur) => {
      const { doc, emises } = monterLEditeur(documentAuLangage("python"));
      entrerDansLEditeur();
      placerLeCurseurALaFinDe("print(1)");
      const classeAvant = zoneDeSaisie().querySelector("pre code")?.getAttribute("class");

      recevoirDUneReplique(doc, (replique) =>
        (replique.contenu.get(0) as Y.XmlElement).setAttribute("language", valeur as string),
      );

      expect(classeAvant).toBe("language-python");
      expect(langagesLus(doc)).toEqual([valeur]);
      expect(zoneDeSaisie().querySelector("pre code")?.hasAttribute("class")).toBe(false);
      expect(selecteurDeLangage()?.value).toBe("");
      expect(attributsDeLEditeur().filter((un) => un.includes(trace(valeur)))).toEqual([]);
      expect(emises).toHaveLength(1);
    },
  );

  it("F-005-AC9 le texte tapé dans un bloc code reçu avec un langage hors liste ne réécrit pas ce langage", () => {
    const { doc } = monterLEditeur(documentAuLangage(FORGEE));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("print(1)");

    taper(" # suite");

    expect(langagesLus(doc)).toEqual([FORGEE]);
    expect(attributsDeLEditeur().filter((un) => un.includes("fixed"))).toEqual([]);
  });
});

/**
 * Chaque chemin qui écrit un langage, joué avec cette valeur, depuis un paragraphe « mot », et s'il
 * inscrit un identifiant de la liste : la règle de saisie, le sélecteur et les commandes, oui ; le
 * collage et le dépôt, jamais, le langage n'étant pas tiré du presse-papiers (F-005-AC7, AC36).
 */
const CHEMINS: readonly (readonly [string, (valeur: string) => void, boolean])[] = [
  [
    "la règle de saisie",
    (valeur) => {
      placerLeCurseurALaFinDe("mot");
      presser("Enter");
      taper(`\`\`\`${valeur} `);
    },
    true,
  ],
  [
    "le sélecteur",
    (valeur) => {
      selectionnerLeBloc();
      appelerUneCommandeDuBlocCode("setCodeBlock", null);
      const selecteur = selecteurDeLangage();
      const option = document.createElement("option");
      option.value = valeur;
      selecteur?.append(option);
      choisirLeLangage(valeur);
    },
    true,
  ],
  [
    "la commande setCodeBlock",
    (valeur) => void appelerUneCommandeDuBlocCode("setCodeBlock", valeur),
    true,
  ],
  ["la commande setNode", (valeur) => void appelerUneCommandeDuBlocCode("setNode", valeur), true],
  [
    "la commande updateAttributes",
    (valeur) => {
      appelerUneCommandeDuBlocCode("setCodeBlock", null);
      appelerUneCommandeDuBlocCode("updateAttributes", valeur);
    },
    true,
  ],
  [
    "le collage d'un `pre`",
    (valeur) => {
      placerLeCurseurALaFinDe("mot");
      presser("Enter");
      collerLesDonnees({
        "text/plain": "colle",
        "text/html": `<pre><code class="language-${valeur}">colle</code></pre>`,
      });
    },
    false,
  ],
  [
    "le collage depuis un éditeur de code",
    (valeur) => {
      placerLeCurseurALaFinDe("mot");
      presser("Enter");
      collerLesDonnees({
        "text/plain": "colle",
        "vscode-editor-data": JSON.stringify({ version: 1, mode: valeur }),
      });
    },
    false,
  ],
  [
    "le dépôt d'un `pre`",
    (valeur) => deposerDuHtml(`<pre><code class="language-${valeur}">depose</code></pre>`, "mot"),
    false,
  ],
];

describe("langage hors de la liste, à l'écriture", () => {
  it.each(
    CHEMINS.flatMap(([chemin, jouer, inscrit]) =>
      [FORGEE, "zz", "python"].map((valeur) => [chemin, valeur, jouer, inscrit] as const),
    ),
  )(
    "F-005-AC35 par %s, la valeur « %s » n'est inscrite que si elle est dans la liste, et par ce chemin seulement s'il inscrit un langage",
    (_chemin, valeur, jouer, inscrit) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("mot");

      jouer(valeur);

      const lus = langagesLus(doc);
      const attendu = inscrit && valeur === "python" ? "python" : undefined;
      expect(lus.length).toBeGreaterThan(0);
      expect(lus).toEqual(lus.map(() => attendu));
    },
  );

  it("F-005-AC35 la règle de saisie et la commande gardent un identifiant de la liste", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("```python ");
    taper("x");

    expect(langagesLus(doc)).toEqual(["python"]);
  });

  it("F-005-AC35 un bloc code reçu avec un langage hors liste, puis déplacé par l'éditeur, est réinscrit sans langage", () => {
    const code = bloc("codeBlock", "forge");
    code.setAttribute("language", FORGEE);
    const { doc } = monterLEditeur(documentForge(code, bloc("paragraph", "apres")));
    entrerDansLEditeur();
    placerLeCurseurALaFinDe("forge");

    presser(RACCOURCIS.descendreLeBloc.touche, { altKey: true, shiftKey: true });

    expect(fragmentBrut(doc).toString()).toBe(
      "<paragraph>apres</paragraph><codeblock>forge</codeblock>",
    );
    expect(langagesLus(doc)).toEqual([undefined]);
  });
});

describe("collage depuis un éditeur de code", () => {
  const erreurs: string[] = [];
  const noter = (evenement: ErrorEvent): void => void erreurs.push(String(evenement.message));
  afterEach(() => {
    window.removeEventListener("error", noter);
    erreurs.splice(0);
  });

  it.each([
    ["un langage forgé", JSON.stringify({ version: 1, mode: FORGEE })],
    ["un langage de la liste", JSON.stringify({ version: 1, mode: "python" })],
    ["un objet sans langage", "{}"],
  ])(
    "F-005-AC36 des données d'un éditeur de code avec %s donnent un bloc code sans langage qui porte le texte, sans exception",
    (_cas, donnees) => {
      window.addEventListener("error", noter);
      const consoleErreur = vi.spyOn(console, "error");
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      collerLesDonnees({ "text/plain": "def f():\r\n    return 1", "vscode-editor-data": donnees });

      expect(fragmentBrut(doc).toString()).toBe("<codeblock>def f():\n    return 1</codeblock>");
      expect(langagesLus(doc)).toEqual([undefined]);
      expect(erreurs).toEqual([]);
      expect(consoleErreur).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["un JSON invalide", "{mode: python"],
    ["une valeur nulle", "null"],
    ["un nombre", "123"],
    ["un tableau", '["python"]'],
    ["une chaîne", '"python"'],
  ])(
    "F-005-AC36 des données malformées (%s) laissent le collage au chemin du texte, sans exception ni collage perdu",
    (_cas, donnees) => {
      window.addEventListener("error", noter);
      const consoleErreur = vi.spyOn(console, "error");
      const { doc } = monterLEditeur();
      entrerDansLEditeur();

      collerLesDonnees({ "text/plain": "un\ndeux", "vscode-editor-data": donnees });

      expect(fragmentBrut(doc).toString()).toBe(
        "<paragraph>un</paragraph><paragraph>deux</paragraph>",
      );
      expect(langagesLus(doc)).toEqual([]);
      expect(erreurs).toEqual([]);
      expect(consoleErreur).not.toHaveBeenCalled();
    },
  );

  it("F-005-AC36 F-005-AC11 dans le premier paragraphe d'un élément de liste, où le schéma refuse un bloc code, le collage reste un collage de texte et la liste demeure", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("- ");

    collerLesDonnees({ "text/plain": "x", "vscode-editor-data": '{"mode":"python"}' });

    expect(fragmentBrut(doc).toString()).toBe(
      "<bulletlist><listitem><paragraph>x</paragraph></listitem></bulletlist>",
    );
  });

  it("F-005-AC36 F-005-AC7 dans un bloc code, des données d'un éditeur de code ne créent pas de bloc : le texte entre dans le bloc courant", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("``` a");
    act(() => undefined);

    collerLesDonnees({ "text/plain": "b", "vscode-editor-data": '{"mode":"python"}' });

    expect(fragmentBrut(doc).toString()).toBe("<codeblock>ab</codeblock>");
  });

  // Le début de ces sélections est à la profondeur 0 : aucun bloc de texte ne le porte.
  it.each([
    [
      "de tout le document (Mod+A)",
      () => toutSelectionner(),
      "<codeblock>def f():\n    return 1</codeblock>",
    ],
    [
      "de nœud d'un bloc vide (poignée du curseur)",
      () => selectionnerLeBlocEntier(1),
      "<paragraph>un</paragraph><codeblock>def f():\n    return 1</codeblock>",
    ],
  ])(
    "F-005-AC36 F-005-AC7 après une sélection %s, des données d'un éditeur de code valides remplacent la sélection par un bloc code sans langage qui porte le texte, sans exception",
    (_cas, selectionner, attendu) => {
      window.addEventListener("error", noter);
      const consoleErreur = vi.spyOn(console, "error");
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("un");
      presser("Enter");
      selectionner();

      collerLesDonnees({
        "text/plain": "def f():\r\n    return 1",
        "vscode-editor-data": JSON.stringify({ version: 1, mode: "python" }),
      });

      expect(fragmentBrut(doc).toString()).toBe(attendu);
      expect(langagesLus(doc)).toEqual([undefined]);
      expect(erreurs).toEqual([]);
      expect(consoleErreur).not.toHaveBeenCalled();
    },
  );
});
