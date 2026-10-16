// Liens reçus d'un autre client, forme des marques dans le fragment et convergence (F-028-AC15,
// AC16, AC24, AC26).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { adresseAcceptee } from "../../src/edition/index.ts";
import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import {
  ajouter,
  bloc,
  contenuLu,
  documentForge,
  fragmentBrut,
  inventaireDuContenu,
} from "../aides-facade-page.ts";
import {
  ADRESSES_REFUSEES,
  liensDuFragment,
  paragrapheAvecLien,
  paragrapheDeMorceaux,
} from "./aides-adresses.ts";
import {
  appelerLaCommandeDeLien,
  collerDuHtml,
  collerDuTexte,
  demonterLEditeur,
  deposerDuHtml,
  entrerDansLEditeur,
  monterLEditeur,
  placerLeCurseurDans,
  presserAvecMod,
  recevoirDUneReplique,
  selectionnerLeTexte,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

type Situation = "avant l'ouverture" | "pendant l'affichage";
const SITUATIONS: readonly Situation[] = ["avant l'ouverture", "pendant l'affichage"];

/** Monte l'éditeur sur un document qui reçoit ce paragraphe, avant ou après le montage. */
function recevoir(situation: Situation, paragraphe: () => Y.XmlElement) {
  if (situation === "avant l'ouverture") {
    return { ...monterLEditeur(documentForge(paragraphe())), recues: 0 };
  }
  const montage = monterLEditeur(documentForge(bloc("paragraph", "déjà là")));
  recevoirDUneReplique(montage.doc, (replique) => ajouter(replique, paragraphe()));
  return { ...montage, recues: 1 };
}

/** Tout élément `a` et tout élément qui porte `href` dans le DOM de l'éditeur. */
function ciblesDuDom(): Element[] {
  return [...zoneDeSaisie().querySelectorAll("a, [href]")];
}

const CAS_REFUSES: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
  ...ADRESSES_REFUSEES.map(([nom, valeur]) => [nom, { href: valeur }] as const),
  ["une adresse absente", {}],
];

describe("lien reçu d'adresse refusée", () => {
  it.each(
    SITUATIONS.flatMap((situation) =>
      CAS_REFUSES.map(([nom, attributs]) => [situation, nom, attributs] as const),
    ),
  )(
    "F-028-AC15 %s, %s : texte affiché comme un lien neutralisé, sans a ni href, target ou rel ; aucune mise à jour émise ; l'adresse refusée reste dans le document",
    (situation, _nom, attributs) => {
      const { doc, emises, recues } = recevoir(situation, () =>
        paragrapheAvecLien("voir ", "piège", attributs),
      );

      const neutralise = zoneDeSaisie().querySelector("[data-lien-neutralise]");
      expect(neutralise?.textContent).toBe("piège");
      expect(neutralise?.tagName).not.toBe("A");
      expect(
        ["href", "target", "rel"].filter((nom) => neutralise?.hasAttribute(nom) === true),
      ).toEqual([]);
      expect(ciblesDuDom()).toEqual([]);
      expect(emises).toHaveLength(recues);
      expect(liensDuFragment(fragmentBrut(doc))).toEqual([attributs]);
      expect(zoneDeSaisie().textContent).toContain("voir piège");
    },
  );

  it.each(SITUATIONS)(
    "F-028-AC15 %s : à côté d'un lien refusé, un lien accepté est rendu par un a dont le href est une adresse acceptée, et le reste du contenu est affiché",
    (situation) => {
      recevoir(situation, () =>
        paragrapheDeMorceaux(
          ["voir "],
          ["piège", { link: { href: "javascript:alert(1)" } }],
          [" et "],
          ["bon", { link: { href: "HTTPS://Exemple.FR" } }],
        ),
      );

      const cibles = ciblesDuDom();
      expect(cibles.map((cible) => cible.getAttribute("href"))).toEqual(["https://exemple.fr/"]);
      expect(
        cibles.every((cible) => adresseAcceptee(cible.getAttribute("href")) !== undefined),
      ).toBe(true);
      expect(zoneDeSaisie().textContent).toContain("voir piège et bon");
    },
  );
});

describe("attributs imposés au rendu", () => {
  it.each(SITUATIONS)(
    "F-028-AC16 %s : un lien qui porte en plus target, rel, class, style, title et onclick est rendu avec exactement href, rel et target imposés",
    (situation) => {
      recevoir(situation, () =>
        paragrapheAvecLien("voir ", "site", {
          href: "https://exemple.fr/",
          target: "_self",
          rel: "opener",
          class: "fixed inset-0",
          style: "position:fixed",
          title: "titre forgé",
          onclick: "alert(1)",
        }),
      );

      const [lien] = ciblesDuDom();
      expect(lien?.tagName).toBe("A");
      expect(
        lien?.getAttributeNames().map((nom) => `${nom}=${lien.getAttribute(nom) ?? ""}`),
      ).toEqual(["href=https://exemple.fr/", "rel=noopener noreferrer", "target=_blank"]);
    },
  );
});

const CHAMP = { name: "Adresse du lien" } as const;

/** Chaque chemin qui pose un lien (F-028-AC18), joué sur le mot « site » d'un paragraphe. */
const CHEMINS: readonly (readonly [string, () => Promise<void>])[] = [
  [
    "le panneau, ouvert par Mod+K",
    async () => {
      selectionnerLeTexte("site");
      presserAvecMod(RACCOURCIS.lien.touche);
      await userEvent.setup().type(screen.getByRole("textbox", CHAMP), "exemple.fr{Enter}");
    },
  ],
  [
    "le collage d'une adresse sur une sélection",
    async () => {
      selectionnerLeTexte("site");
      collerDuTexte("https://exemple.fr/");
      await Promise.resolve();
    },
  ],
  [
    "le collage d'un contenu riche",
    async () => {
      selectionnerLeTexte("site");
      collerDuHtml('<a href="https://exemple.fr/" target="_self" class="c" title="t">site</a>');
      await Promise.resolve();
    },
  ],
  [
    "le dépôt d'un contenu riche",
    async () => {
      deposerDuHtml('<a href="https://exemple.fr/" rel="opener">déposé</a>', "site");
      await Promise.resolve();
    },
  ],
  [
    "la commande de lien de l'éditeur",
    async () => {
      selectionnerLeTexte("site");
      appelerLaCommandeDeLien("setLink", "https://exemple.fr/");
      await Promise.resolve();
    },
  ],
];

describe("forme des marques dans le fragment", () => {
  it.each(CHEMINS)(
    "F-028-AC24 F-028-AC18 par %s, le lien est inscrit sous le nom link, avec href pour seule clé, à sa forme normalisée",
    async (_nom, poser) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("voir le site");

      await poser();

      const liens = liensDuFragment(fragmentBrut(doc));
      expect(liens.length).toBeGreaterThan(0);
      expect(liens.map((lien) => Object.keys(lien))).toEqual(liens.map(() => ["href"]));
      expect(liens.map((lien) => lien.href)).toEqual(liens.map(() => "https://exemple.fr/"));
    },
  );

  it("F-028-AC24 gras et italique sont inscrits sous les noms bold et italic, sans nouveau type racine", () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("gras italique");
    selectionnerLeTexte("gras");
    presserAvecMod("b");
    selectionnerLeTexte("italique");
    presserAvecMod("i");

    expect(inventaireDuContenu(doc).marques).toEqual(["bold", "italic"]);
    expect([...doc.share.keys()].sort()).toEqual(["contenu", "versions"]);
  });
});

function docDuClient(identifiant: number): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = identifiant;
  return doc;
}

/** Contenu lu de chaque réplique après échange, et de deux documents vierges dans les deux ordres. */
async function apresConvergence(
  depart: string,
  surA: () => void | Promise<void>,
  surB: () => void | Promise<void>,
): Promise<string[]> {
  const a = docDuClient(1);
  monterLEditeur(a);
  entrerDansLEditeur();
  taper(depart);
  const commun = Y.encodeStateAsUpdate(a);
  const vecteur = Y.encodeStateVector(a);
  const b = docDuClient(2);
  Y.applyUpdate(b, commun);
  await surA();
  const deA = Y.encodeStateAsUpdate(a, vecteur);
  demonterLEditeur();
  monterLEditeur(b);
  entrerDansLEditeur();
  await surB();
  const deB = Y.encodeStateAsUpdate(b, vecteur);
  demonterLEditeur();
  Y.applyUpdate(a, deB);
  Y.applyUpdate(b, deA);
  const tiers = [
    [deA, deB],
    [deB, deA],
  ].map((ordre, rang) => {
    const vierge = docDuClient(10 + rang);
    [commun, ...ordre].forEach((miseAJour) => Y.applyUpdate(vierge, miseAJour));
    return vierge;
  });
  return [a, b, ...tiers].map(contenuLu);
}

async function lier(texte: string, adresse: string): Promise<void> {
  selectionnerLeTexte(texte);
  presserAvecMod(RACCOURCIS.lien.touche);
  await userEvent.setup().type(screen.getByRole("textbox", CHAMP), `${adresse}{Enter}`);
}

describe("convergence", () => {
  it("F-028-AC26 l'une met une étendue en gras pendant que l'autre insère du texte à l'intérieur : même contenu partout, avec le texte inséré et le gras", async () => {
    const lectures = await apresConvergence(
      "abcdef",
      () => {
        selectionnerLeTexte("bcde");
        presserAvecMod("b");
      },
      () => {
        placerLeCurseurDans("abcdef", 3);
        taper("X");
      },
    );

    expect(new Set(lectures).size).toBe(1);
    expect(lectures[0]).toContain("X");
    expect(lectures[0]).toContain("<bold>");
  });

  it("F-028-AC26 gras d'un côté, italique de l'autre, sur deux étendues qui se chevauchent : même contenu partout, avec les deux marques", async () => {
    const lectures = await apresConvergence(
      "abcdef",
      () => {
        selectionnerLeTexte("abcd");
        presserAvecMod("b");
      },
      () => {
        selectionnerLeTexte("cdef");
        presserAvecMod("i");
      },
    );

    expect(new Set(lectures).size).toBe(1);
    expect(lectures[0]).toContain("<bold>");
    expect(lectures[0]).toContain("<italic>");
  });

  it("F-028-AC26 deux liens d'adresses différentes sur la même étendue : même contenu partout, l'une des deux adresses", async () => {
    const lectures = await apresConvergence(
      "voir le site",
      () => lier("site", "a.example"),
      () => lier("site", "b.example"),
    );

    expect(new Set(lectures).size).toBe(1);
    const adresses = [...(lectures[0] ?? "").matchAll(/href="([^"]*)"/g)].map(([, href]) => href);
    expect(new Set(adresses).size).toBe(1);
    expect(["https://a.example/", "https://b.example/"]).toContain(adresses[0]);
  });
});
