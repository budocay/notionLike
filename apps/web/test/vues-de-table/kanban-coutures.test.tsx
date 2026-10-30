// Coutures de la vue kanban (F-020-AC4, AC24, AC25, AC27, AC28) : colonne de regroupement choisie sur
// l'appareil, section `kanban` des réglages, appelants du module de glisser-déposer, absence de
// réseau et d'animation dans les sources. Chaque contrôle statique reçoit ses données et a son cas
// fautif à côté de lui.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { Bouton } from "../../src/interface/composants/Espaces.tsx";
import { VUES } from "../../src/vues-de-table/vues.ts";
import { type Aretes, atteintsDepuis, graphe } from "../aides-graphe.ts";
import { lire, lireDossier } from "../aides-disque.ts";
import { carte, CLE_DES_REGLAGES, nomsDesPiles, rendreLeKanban } from "./aides-ecran-kanban.tsx";

const REPARTITION = [
  ["Écrire", 0],
  ["Livrer", 2],
] as const;

function enregistre(): unknown {
  return JSON.parse(localStorage.getItem(CLE_DES_REGLAGES) ?? "null");
}

describe("colonne de regroupement (F-020-AC4, AC27)", () => {
  function avecDeuxColonnes(autres: Record<string, unknown> = {}) {
    return rendreLeKanban(REPARTITION, {
      remplir: ({ table, lignes }) => {
        const priorite = table.creerColonne("Priorité", "selection");
        table.ajouterOption(priorite, "Haute");
        table.ajouterOption(priorite, "Basse");
        const ligne = lignes.get("Écrire");
        if (ligne !== undefined) {
          table.ecrireCellule(ligne, priorite, table.lire().colonnes[2]?.options[1]?.id ?? "");
        }
        if (Object.keys(autres).length > 0) {
          localStorage.setItem(
            CLE_DES_REGLAGES,
            JSON.stringify({
              version: 1,
              sections: { vue: { active: "kanban", tri: "f-019" }, ...autres },
            }),
          );
        }
      },
    });
  }

  it("F-020-AC4 par défaut la première colonne `selection` ; « Regrouper par » est offert dès deux colonnes `selection`, le choix est gardé par identifiant de colonne dans la section `kanban`, et le document ne change pas", async () => {
    const { utilisateur, table } = avecDeuxColonnes();
    expect(nomsDesPiles()).toEqual([
      "Sans valeur, 0 carte",
      "À faire, 1 carte",
      "En cours, 0 carte",
      "Fait, 1 carte",
    ]);
    const avant = Y.encodeStateAsUpdate(table.doc);
    const choix = screen.getByRole("combobox", { name: "Regrouper par" });
    const priorite = table.lire().colonnes[2]?.id ?? "";
    await utilisateur.selectOptions(choix, priorite);

    expect(nomsDesPiles()).toEqual(["Sans valeur, 1 carte", "Haute, 0 carte", "Basse, 1 carte"]);
    expect(enregistre()).toEqual({
      version: 1,
      sections: { vue: { active: "kanban" }, kanban: { regroupement: priorite } },
    });
    expect(Buffer.from(Y.encodeStateAsUpdate(table.doc)).equals(Buffer.from(avant))).toBe(true);
  });

  it("F-020-AC4 une table à une seule colonne `selection` n'offre pas « Regrouper par »", () => {
    rendreLeKanban(REPARTITION);
    expect(screen.queryByRole("combobox", { name: "Regrouper par" })).toBeNull();
  });

  it("F-020-AC4 un choix enregistré pour une colonne qui n'est plus une colonne `selection` de la table revient à la première", () => {
    avecDeuxColonnes({ kanban: { regroupement: "colonne-disparue" } });
    expect(nomsDesPiles()[1]).toBe("À faire, 1 carte");
  });

  it("F-020-AC27 écrire la section `kanban` laisse intactes les autres sections, et rien n'entre dans un document Yjs", async () => {
    const { utilisateur, table } = avecDeuxColonnes({
      tableau: { largeurs: { x: 200 }, gelees: 2 },
      kanban: { autre: true },
    });
    const avant = Y.encodeStateAsUpdate(table.doc);
    const priorite = table.lire().colonnes[2]?.id ?? "";
    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: "Regrouper par" }),
      priorite,
    );
    expect(enregistre()).toEqual({
      version: 1,
      sections: {
        vue: { active: "kanban", tri: "f-019" },
        tableau: { largeurs: { x: 200 }, gelees: 2 },
        kanban: { autre: true, regroupement: priorite },
      },
    });
    expect(Buffer.from(Y.encodeStateAsUpdate(table.doc)).equals(Buffer.from(avant))).toBe(true);
    expect(carte("Écrire")).toBeDefined();
  });

  it("F-020-AC27 « Kanban » vient après « Tableau » dans la liste des vues, « Calendrier » (F-021) après eux", () => {
    expect(VUES.map(({ id, libelle }) => [id, libelle])).toEqual([
      ["tableau", "Tableau"],
      ["kanban", "Kanban"],
      ["calendrier", "Calendrier"],
    ]);
  });
});

// ——— F-020-AC25 : appelants du module de glisser-déposer ———

const MODULE_DE_GLISSER = /^src\/glisser\//;

/** Modules hors du module de glisser-déposer qui importent son interface. */
function appelantsDuModule(aretes: Aretes): string[] {
  return [...aretes]
    .filter(
      ([module, dependances]) =>
        module.startsWith("src/") &&
        !MODULE_DE_GLISSER.test(module) &&
        dependances.some((une) => MODULE_DE_GLISSER.test(une)),
    )
    .map(([module]) => module)
    .sort();
}

/** Les appelants qu'aucun des tests donnés n'atteint par ses imports. */
function appelantsNonCouverts(
  aretes: Aretes,
  appelants: readonly string[],
  tests: readonly string[],
): string[] {
  const atteints = new Set(tests.flatMap((test) => [...atteintsDepuis(aretes, test)]));
  return appelants.filter((appelant) => !atteints.has(appelant));
}

const TESTS_DES_APPELANTS = [
  "test/deplacement-de-page.test.tsx",
  "test/vues-de-table/kanban-clavier-geste.test.tsx",
];

describe("appelants du module de glisser-déposer (F-020-AC25)", () => {
  it("F-020-AC25 les appelants sont la barre latérale (F-006) et la vue kanban (dont les types du module), et chacun est atteint par un test du geste", async () => {
    const aretes = await graphe();
    const appelants = appelantsDuModule(aretes);
    expect(appelants).toEqual([
      "src/interface/BarreLaterale.tsx",
      "src/interface/RangeePage.tsx",
      "src/vues-de-table/kanban/PilesDuKanban.tsx",
      "src/vues-de-table/kanban/actions-de-carte.ts",
      "src/vues-de-table/kanban/annonces.ts",
      "src/vues-de-table/kanban/use-vue-kanban.ts",
    ]);
    expect(appelantsNonCouverts(aretes, appelants, TESTS_DES_APPELANTS)).toEqual([]);
  }, 60_000);

  it("F-020-AC25 un appelant qu'aucun test n'atteint est nommé", () => {
    const aretes: Aretes = new Map([
      ["src/a.tsx", ["src/glisser/index.ts"]],
      ["src/b.tsx", ["src/glisser/index.ts", "src/glisser/element.ts"]],
      ["src/glisser/index.ts", []],
      ["src/glisser/element.ts", []],
      ["test/a.test.tsx", ["src/a.tsx"]],
    ]);
    const appelants = appelantsDuModule(aretes);
    expect(appelants).toEqual(["src/a.tsx", "src/b.tsx"]);
    expect(appelantsNonCouverts(aretes, appelants, ["test/a.test.tsx"])).toEqual(["src/b.tsx"]);
  });
});

// ——— F-020-AC27 : appelants des briques que la vue kanban partage avec la vue « Tableau » ———
//
// `BoiteNouvelleColonne` prend `{ ajouter, fermerLaBoite, typeInitial? }` au lieu de `{ vue }`, et
// `Confirmation` et `useAnnonce` sont exportés par leur module : leurs appelants sont énumérés, un
// nouvel appelant fait échouer le test, et chacun est atteint par un test de son écran.

// Le module des vues de table : `EcranDeLaCorbeille` a sa propre `Confirmation`, sans rapport.
const SOURCES = new Map(
  [...lireDossier("src")].filter(([chemin]) => chemin.startsWith("src/vues-de-table/")),
);

/** Fichiers de `src/` qui rendent ce composant ou appellent cette fonction, hors sa définition. */
function appelantsDe(nom: string, sources: ReadonlyMap<string, string>): string[] {
  const appel = new RegExp(`(<${nom}[\\s/>])|((?<!function )\\b${nom}\\()`);
  return [...sources]
    .filter(([, texte]) => appel.test(texte.replace(/\/\/.*$/gm, "")))
    .map(([chemin]) => chemin)
    .sort();
}

const TESTS_DES_ECRANS = [
  "test/vues-de-table/colonnes.test.tsx",
  "test/vues-de-table/kanban-ecran.test.tsx",
];

const BRIQUES_PARTAGEES: Readonly<Record<string, readonly string[]>> = {
  BoiteNouvelleColonne: [
    "src/vues-de-table/Boites.tsx",
    "src/vues-de-table/VueCalendrier.tsx",
    "src/vues-de-table/kanban/VueKanban.tsx",
  ],
  Confirmation: [
    "src/vues-de-table/Boites.tsx",
    "src/vues-de-table/VueCalendrier.tsx",
    "src/vues-de-table/kanban/VueKanban.tsx",
  ],
  useAnnonce: [
    "src/vues-de-table/kanban/use-vue-kanban.ts",
    "src/vues-de-table/use-vue-calendrier.ts",
    "src/vues-de-table/use-vue-tableau.ts",
  ],
};

describe("appelants des briques partagées (F-020-AC27)", () => {
  it.each(Object.entries(BRIQUES_PARTAGEES))(
    "F-020-AC27 les appelants de %s sont exactement ceux qui sont déclarés, et chacun est atteint par un test d'écran",
    async (nom, attendus) => {
      expect(appelantsDe(nom, SOURCES)).toEqual(attendus);
      const aretes = await graphe();
      const hors = appelantsNonCouverts(aretes, attendus, TESTS_DES_ECRANS);
      expect(hors).toEqual([]);
    },
    60_000,
  );

  it("F-020-AC27 cas fautif : un nouvel appelant est vu, une simple définition ne l'est pas", () => {
    const sources = new Map([
      ["src/a.tsx", "export function Confirmation() { return null; }"],
      ["src/b.tsx", 'const x = <Confirmation titre="" />;'],
      ["src/c.ts", "const [a] = useAnnonce();"],
      ["src/d.ts", "// useAnnonce() cité en commentaire"],
    ]);
    expect(appelantsDe("Confirmation", sources)).toEqual(["src/b.tsx"]);
    expect(appelantsDe("useAnnonce", sources)).toEqual(["src/c.ts"]);
  });
});

// ——— F-020-AC24, AC28 : ni réseau ni animation dans les sources ———

const RESEAU = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
const ANIMATION = /\b(transition|animate|animation|duration|ease)\b|@keyframes/;

/** Fichiers dont le texte (commentaires retirés) correspond au motif. */
function fautes(fichiers: ReadonlyMap<string, string>, motif: RegExp): string[] {
  return [...fichiers]
    .filter(([, texte]) => motif.test(texte.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "")))
    .map(([chemin]) => chemin);
}

const sourcesDuKanban = new Map([
  ...lireDossier("src/vues-de-table/kanban"),
  ["src/interface/composants/Kanban.tsx", lire("src/interface/composants/Kanban.tsx")],
  [
    "src/interface/composants/kanban.classes.ts",
    lire("src/interface/composants/kanban.classes.ts"),
  ],
]);

describe("ni réseau ni animation (F-020-AC24, AC28)", () => {
  it("F-020-AC24 aucun fichier de la vue kanban ne parle au réseau", () => {
    expect(fautes(sourcesDuKanban, RESEAU)).toEqual([]);
  });

  it("F-020-AC28 la vue kanban ne déclare aucune animation : ni transition, ni durée, ni courbe ; la carte glissée ne porte que `transform` en ligne", () => {
    expect(fautes(sourcesDuKanban, ANIMATION)).toEqual([]);
    expect(lire("src/interface/composants/Kanban.tsx")).toContain(
      "{ transform: glisser.deplacement }",
    );
  });

  it("F-020-AC24 F-020-AC28 cas fautifs : un appel réseau et une transition sont vus", () => {
    const fichiers = new Map([
      ["a.ts", "const r = await fetch(url);"],
      ["b.ts", 'const c = "transition-all duration-200";'],
      ["c.ts", "// fetch et transition cités en commentaire seulement"],
    ]);
    expect(fautes(fichiers, RESEAU)).toEqual(["a.ts"]);
    expect(fautes(fichiers, ANIMATION)).toEqual(["b.ts"]);
  });
});

// ——— F-020-AC27 : le composant partagé `Bouton` gagne trois propriétés facultatives ———
//
// `tabIndex`, `surFocus` et `arret` servent aux arrêts du plateau (F-020-AC15). Tout autre appelant
// ne les passe pas : sans elles, le bouton est celui d'avant (dans l'ordre de tabulation, sans
// identifiant d'arrêt, sans rappel de focus).

const PROPRIETES_DES_ARRETS = /\b(tabIndex|surFocus|arret)=|\{\.\.\./;

/** Les éléments `<Bouton … />` d'un texte source. */
function boutonsDe(texte: string): string[] {
  return texte.match(/<Bouton[\s/>][^]*?\/>/g) ?? [];
}

/** Fichiers de `src/` qui rendent `<Bouton`, avec ceux dont un élément passe l'une des propriétés. */
function appelantsDeBouton(sources: ReadonlyMap<string, string>) {
  const appelants = [...sources].filter(([, texte]) => boutonsDe(texte).length > 0);
  return {
    appelants: appelants.map(([chemin]) => chemin).sort(),
    quiPassent: appelants
      .filter(([, texte]) => boutonsDe(texte).some((un) => PROPRIETES_DES_ARRETS.test(un)))
      .map(([chemin]) => chemin)
      .sort(),
  };
}

const APPELANTS_DE_BOUTON = [
  "src/demonstration/PageDemonstration.tsx",
  "src/interface/ActionsDeLEspace.tsx",
  "src/interface/AdoptionDeLEspace.tsx",
  "src/interface/ConfirmationDeChangement.tsx",
  "src/interface/EchecOuChargement.tsx",
  "src/interface/EcranDInvitation.tsx",
  "src/interface/EcranDUnEspace.tsx",
  "src/interface/EcranDeLaCorbeille.tsx",
  "src/interface/EcranDesEspaces.tsx",
  "src/interface/EcranDuCompte.tsx",
  "src/interface/EffacementDeLaCopie.tsx",
  "src/interface/EspacesDeLAppareil.tsx",
  "src/interface/InvitationsDeLEspace.tsx",
  "src/interface/MembresDeLEspace.tsx",
  "src/interface/MotDePasseDuCompte.tsx",
  "src/interface/OuvertureDUnEspace.tsx",
  "src/interface/RetraitDeLAppareil.tsx",
  "src/interface/RevocationDeSession.tsx",
  "src/interface/SessionsDuCompte.tsx",
  "src/interface/ZoneDeSynchronisation.tsx",
  "src/vues-de-table/BarreDesTris.tsx",
  "src/vues-de-table/BarresDeDefinition.tsx",
  "src/vues-de-table/Boites.tsx",
  "src/vues-de-table/PanneauDesOptions.tsx",
  "src/vues-de-table/PanneauSansDate.tsx",
  "src/vues-de-table/VueCalendrier.tsx",
  "src/vues-de-table/VueTableau.tsx",
  "src/vues-de-table/kanban/PilesDuKanban.tsx",
  "src/vues-de-table/kanban/VueKanban.tsx",
];

describe("appelants du composant partagé Bouton (F-020-AC27)", () => {
  it("F-020-AC27 les appelants de Bouton sont exactement ceux qui sont déclarés, et seuls les arrêts du plateau passent tabIndex, surFocus ou arret", () => {
    const { appelants, quiPassent } = appelantsDeBouton(new Map([...lireDossier("src")]));
    expect(appelants).toEqual(APPELANTS_DE_BOUTON);
    expect(quiPassent).toEqual(["src/vues-de-table/kanban/PilesDuKanban.tsx"]);
  });

  it("F-020-AC27 cas fautif : un appelant qui passe une des propriétés est vu, un autre non", () => {
    const sources = new Map([
      ["src/a.tsx", '<Bouton libelle="a" tabIndex={-1} />'],
      ["src/b.tsx", '<Bouton libelle="b" surActivation={f} />'],
      ["src/c.tsx", '<Bouton\n {...arret("x")}\n libelle="c" />'],
    ]);
    expect(appelantsDeBouton(sources)).toEqual({
      appelants: ["src/a.tsx", "src/b.tsx", "src/c.tsx"],
      quiPassent: ["src/a.tsx", "src/c.tsx"],
    });
  });

  it("F-020-AC27 sans les trois propriétés le bouton est celui d'avant ; avec elles il est un arrêt du plateau", () => {
    const surFocus = vi.fn();
    render(<Bouton libelle="Seul" />);
    const seul = screen.getByRole("button", { name: "Seul" });
    expect(seul.tabIndex).toBe(0);
    expect(seul.hasAttribute("data-arret")).toBe(false);
    seul.focus();
    expect(document.activeElement).toBe(seul);

    render(<Bouton libelle="Arrêt" tabIndex={-1} arret="a" surFocus={surFocus} />);
    const arret = screen.getByRole("button", { name: "Arrêt" });
    expect(arret.tabIndex).toBe(-1);
    expect(arret.getAttribute("data-arret")).toBe("a");
    arret.focus();
    expect(surFocus).toHaveBeenCalledTimes(1);
  });
});

// ——— F-020-AC16 : les appelants de la destination d'une commande et du déplacement passent le tri ———
//
// `destinationDeLaCommande` et `deplacerUneCarte` gagnent `triActif` (obligatoire pour le déplacement, faux par défaut pour la destination) :
// un appelant qui l'oublierait offrirait « Monter » sous un tri. Leurs appelants sont énumérés.

const SOURCES_DU_KANBAN = new Map(
  [...lireDossier("src")].filter(([chemin]) => chemin.startsWith("src/vues-de-table/kanban/")),
);

describe("appelants qui passent le tri (F-020-AC16)", () => {
  it.each([
    ["destinationDeLaCommande", /destinationDeLaCommande\([^)]*triActif/, 2],
    ["deplacerUneCarte", /deplacerUneCarte\([^)]*triActif/, 1],
  ] as const)(
    "F-020-AC16 chaque appelant de %s dans la vue kanban passe triActif",
    (nom, passe, nombre) => {
      const appelants = appelantsDe(nom, SOURCES_DU_KANBAN);
      expect(appelants).toHaveLength(nombre);
      for (const chemin of appelants) {
        expect(SOURCES_DU_KANBAN.get(chemin)).toMatch(passe);
      }
    },
  );
});
