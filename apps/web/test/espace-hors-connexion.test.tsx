// F-036 : « Ouvrir cet espace » sur l'écran d'un espace que l'appareil ne détient pas, hors
// connexion (F-032-AC2, D-040) : la commande reste, désactivée avec sa raison (AC5), et redevient
// la commande active au retour de la connexion et de la lecture (AC6). Onglet lancé comme l'entrée
// le lance, persistance réelle sur l'appareil simulé, serveur simulé.
//
// Critères de portée de la feature, prouvés ailleurs et cités ici :
// - F-036-AC7 : aucun écran bloquant de plus et les tests existants passent sans modification, hors
//   les assertions d'absence de la commande de `espace-ecrans.test.tsx` (ce fichier, ci-dessous, le
//   prouve avec F-032-AC2) ; la suite entière d'`apps/web` en est la preuve.
// - F-036-AC11 : liste fermée des fichiers touchés, prouvée par `git diff --name-only origin/main...HEAD`.
// - F-036-AC12 : la signature d'`OuvertureHorsConnexion` change (`{ idEspace }` devient
//   `{ idEspace, raison }`) et `EspaceNonLu` gagne `idEspace` : la couture « signatures des
//   composants privés d'EcranDUnEspace » ci-dessous énumère leurs appels, leurs props et leur
//   absence d'export. `demarrerSessionEspace` et `ContenuDuServeur` ne sont pas touchés.
// - F-036-AC13 : la traçabilité des dettes (STATE, PROJECT_LOG) n'est pas faite par ce fichier ni
//   par le producteur ; elle est écrite à la fusion de la feature.
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { serveurDesEspaces, sourceDuCompte } from "../src/interface/branchement-synchronisation.ts";
import { ESPACES } from "../src/interface/composants/compte.classes.ts";
import { demarrerSynchronisation, type Environnement } from "../src/synchronisation/index.ts";
import {
  CONNECTEZ_VOUS,
  DEMANDE_UNE_CONNEXION,
  NOM_INCONNU_SUR_CET_APPAREIL,
  nomOuvrirCetEspace,
} from "../src/interface/messages-espaces.ts";
import { Bouton } from "../src/interface/composants/Espaces.tsx";
import { lire, lireDossier } from "./aides-disque.ts";
import { contenuDeLAppareil, E_ALPHA, E_GAMMA } from "./aides-appareil.ts";
import { enveloppe, moi200, moi401, ROUTES, serveurSimule } from "./aides-compte.tsx";
import {
  GAMMA_SERVEUR,
  listerAuServeur,
  poserLAppareil,
  routesDesEspaces,
  TEMOIN_DE_L_APPAREIL,
} from "./aides-ecrans-des-espaces.tsx";
import {
  aller,
  descriptionDe,
  espace200,
  espace,
  membre,
  membres200,
  R,
} from "./aides-espaces.tsx";
import { APPAREIL, lancerLOnglet, ouvertMaintenant } from "./aides-onglet.tsx";
import { nomsDesBases } from "./aides-persistance.ts";
import { couples } from "./aides-jetons.ts";
import { rendreLOnglet } from "./aides-reprise.ts";
import { FICHIER_DES_JETONS } from "./aides-styles.ts";

const COMMANDE = nomOuvrirCetEspace(NOM_INCONNU_SUR_CET_APPAREIL);

function commandeDesactivee(): HTMLElement {
  return screen.getByRole("button", { name: COMMANDE });
}

function verifierDesactivee(raison: string): void {
  const commande = commandeDesactivee();
  expect(commande.getAttribute("aria-disabled")).toBe("true");
  expect(descriptionDe(commande)).toBe(raison);
  // La raison est visible : l'élément que `aria-describedby` désigne existe, n'est ni caché ni
  // réservé aux lecteurs d'écran.
  const description = document.getElementById(commande.getAttribute("aria-describedby") ?? "");
  expect(description).not.toBeNull();
  expect(description?.textContent).toBe(raison);
  expect(description?.hidden).toBe(false);
  expect(description?.closest(".sr-only, [hidden], [aria-hidden='true']")).toBeNull();
}

/** Une WebSocket qui ne s'établit jamais, et le nombre de celles qu'on a tenté d'ouvrir. */
function priseMuette(): { readonly constructeur: Environnement["WebSocket"]; nombre(): number } {
  let nombre = 0;
  class PriseMuette extends EventTarget {
    readonly url: string;
    readyState = 0;
    binaryType = "arraybuffer";
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(adresse: string) {
      super();
      this.url = adresse;
      nombre += 1;
    }
    send(): void {
      return undefined;
    }
    close(): void {
      return undefined;
    }
  }
  return {
    constructeur: PriseMuette as unknown as Environnement["WebSocket"],
    nombre: () => nombre,
  };
}

/** L'onglet avec la vraie synchronisation du compte, dont la WebSocket est la prise comptée. */
function lancerAvecSynchronisation(serveur: ReturnType<typeof serveurSimule>) {
  const prise = priseMuette();
  const onglet = lancerLOnglet({
    serveur,
    synchronisationDuCompte: (compte) => (espace) =>
      demarrerSynchronisation({
        ...espace,
        environnement: {
          WebSocket: prise.constructeur,
          adresse: "ws://localhost/synchro",
          horloge: {
            maintenant: () => Date.now(),
            programmer: (rappel, delaiMs) => {
              const minuterie = setTimeout(rappel, delaiMs);
              return () => clearTimeout(minuterie);
            },
          },
          alea: () => 0.5,
          ecouter: () => () => undefined,
          ouvrirUnCanal: () => ({
            postMessage: () => undefined,
            close: () => undefined,
            onmessage: null,
          }),
        },
        compte: sourceDuCompte(compte.suivi),
        serveur: serveurDesEspaces(compte.espaces),
      }),
  });
  return { onglet, prise };
}

describe("commande désactivée hors connexion (F-036-AC5)", () => {
  it.each([
    ["compte déconnecté", () => moi401(), CONNECTEZ_VOUS],
    ["compte inconnu, serveur injoignable", undefined, DEMANDE_UNE_CONNEXION],
  ] as const)(
    "F-036-AC5 F-032-AC2 %s : l'espace que l'appareil ne détient pas montre « Ouvrir cet espace » désactivée (aria-disabled), sa raison visible et décrite, atteignable au clavier ; ni requête d'espace, ni écriture sur l'appareil, ni écran bloquant, ni changement d'espace",
    async (_cas, moi, raison) => {
      await poserLAppareil();
      const serveur = moi === undefined ? serveurSimule() : serveurSimule({ [ROUTES.moi]: moi });
      const { onglet, prise } = lancerAvecSynchronisation(serveur);
      await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
      const basesAvant = await nomsDesBases();
      const appareilAvant = await contenuDeLAppareil();

      aller(`#/espaces/${E_GAMMA}`);

      const commande = await screen.findByRole("button", { name: COMMANDE });
      await waitFor(() => verifierDesactivee(raison));
      commande.focus();
      expect(document.activeElement).toBe(commande);
      const prisesAvant = prise.nombre();
      await onglet.utilisateur.click(commande);
      await onglet.utilisateur.keyboard("{Enter}");
      expect(routesDesEspaces(serveur)).toEqual([]);
      // Ni au clic ni à Entrée, l'activation n'ouvre de WebSocket (AC5).
      expect(prise.nombre()).toBe(prisesAvant);
      expect(ouvertMaintenant(onglet.pilote).cible).toEqual(APPAREIL);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(await nomsDesBases()).toEqual(basesAvant);
      expect(await contenuDeLAppareil()).toEqual(appareilAvant);
    },
  );

  it("F-036-AC5 compte connecté, GET /api/v1/espaces et la lecture de l'espace échouent : l'espace que l'appareil ne détient pas montre la commande désactivée, « Demande une connexion au serveur. » ; ni WebSocket de l'activation, ni écriture sur l'appareil", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    // L'écran d'un espace lit l'espace, pas la liste : c'est l'échec de cette lecture qui désactive la
    // commande ; la liste en échec ne la rend pas active.
    serveur.poser(R.espaces, () => enveloppe(500, "erreur-interne"));
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(500, "erreur-interne"));
    const { onglet, prise } = lancerAvecSynchronisation(serveur);
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    const basesAvant = await nomsDesBases();
    const appareilAvant = await contenuDeLAppareil();

    aller(`#/espaces/${E_GAMMA}`);

    const commande = await screen.findByRole("button", { name: COMMANDE });
    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    commande.focus();
    expect(document.activeElement).toBe(commande);
    const prisesAvant = prise.nombre();
    await onglet.utilisateur.click(commande);
    await onglet.utilisateur.keyboard("{Enter}");
    expect(prise.nombre()).toBe(prisesAvant);
    expect(serveur.routesAppelees().filter((route) => route === R.lire(E_GAMMA))).not.toEqual([]);
    expect(serveur.routesAppelees().filter((route) => route.startsWith("POST "))).toEqual([]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(await nomsDesBases()).toEqual(basesAvant);
    expect(await contenuDeLAppareil()).toEqual(appareilAvant);
  });

  it("F-036-AC5 contrôle du compteur : compte connecté, l'activation de la commande active ouvre bien une WebSocket par la même synchronisation (le zéro des autres cas est donc un vrai zéro)", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => espace200(espace("lecteur", "Gamma", E_GAMMA)));
    serveur.poser(R.membres(E_GAMMA), () => membres200([membre("m", "Inès Laurent", "lecteur")]));
    const { onglet, prise } = lancerAvecSynchronisation(serveur);
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    aller(`#/espaces/${E_GAMMA}`);
    const active = await screen.findByRole("button", { name: nomOuvrirCetEspace("Gamma") });
    const prisesAvant = prise.nombre();

    await onglet.utilisateur.click(active);

    await waitFor(() => expect(prise.nombre()).toBeGreaterThan(prisesAvant));
  });

  it("F-036-AC5 F-032-AC2 un espace que l'appareil détient garde la commande active sous son dernier nom connu, sans requête", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi401() });
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_ALPHA}`);

    const commande = await screen.findByRole("button", { name: nomOuvrirCetEspace("Alpha") });
    expect(commande.getAttribute("aria-disabled")).toBeNull();
    expect((commande as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
    await onglet.utilisateur.click(commande);
    await screen.findByRole("link", { name: "Page d'Alpha" });
    expect(routesDesEspaces(serveur)).toEqual([]);
  });
});

function lecturesDeGamma(serveur: ReturnType<typeof serveurSimule>): number {
  return serveur.routesAppelees().filter((route) => route === R.lire(E_GAMMA)).length;
}

describe("retour à la connexion (F-036-AC6)", () => {
  it("F-036-AC6 connecté mais la lecture de l'espace échoue : la commande reste désactivée avec « Demande une connexion au serveur. » et « Réessayer » ; la lecture qui aboutit la remplace par la commande active, sans rechargement", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(500, "erreur-interne"));
    serveur.poser(R.membres(E_GAMMA), () => membres200([membre("m", "Inès Laurent", "lecteur")]));
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_GAMMA}`);

    const reessayer = await screen.findByRole("button", { name: "Réessayer" });
    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    serveur.poser(R.lire(E_GAMMA), () => espace200(espace("lecteur", "Gamma", E_GAMMA)));
    await onglet.utilisateur.click(reessayer);

    const active = await screen.findByRole("button", { name: nomOuvrirCetEspace("Gamma") });
    expect(active.getAttribute("aria-disabled")).toBeNull();
    expect((active as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
  });

  it("F-036-AC6 la lecture échoue encore : la commande reste désactivée et « Réessayer » reste disponible", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.lire(E_GAMMA), () => enveloppe(500, "erreur-interne"));
    const onglet = lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    aller(`#/espaces/${E_GAMMA}`);
    const reessayer = await screen.findByRole("button", { name: "Réessayer" });
    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    const lecturesAvant = lecturesDeGamma(serveur);
    expect(lecturesAvant).toBeGreaterThan(0);

    await onglet.utilisateur.click(reessayer);

    // « Réessayer » relance bien une lecture de l'espace, qui échoue encore.
    await waitFor(() => expect(lecturesDeGamma(serveur)).toBeGreaterThan(lecturesAvant));
    await waitFor(() => verifierDesactivee(DEMANDE_UNE_CONNEXION));
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });

  it("F-036-AC6 F-032-AC2 connecté, la lecture échoue pour un espace que l'appareil détient : « Réessayer » seul, aucune commande « Ouvrir cet espace » sur l'écran d'échec (comportement livré, non régressé)", async () => {
    await poserLAppareil();
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    serveur.poser(R.lire(E_ALPHA), () => enveloppe(500, "erreur-interne"));
    lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });

    aller(`#/espaces/${E_ALPHA}`);

    await screen.findByRole("button", { name: "Réessayer" });
    expect(serveur.routesAppelees()).toContain(R.lire(E_ALPHA));
    expect(screen.queryAllByRole("button", { name: /^Ouvrir cet espace/ })).toEqual([]);
  });

  it("F-036-AC6 le compte passe de déconnecté à connecté : la commande désactivée est remplacée par la commande active, sans rechargement", async () => {
    await poserLAppareil();
    let connecte = false;
    const serveur = serveurSimule({
      [ROUTES.moi]: () => (connecte ? moi200() : moi401()),
    });
    listerAuServeur(serveur, [GAMMA_SERVEUR]);
    serveur.poser(R.membres(E_GAMMA), () => membres200([membre("m", "Inès Laurent", "lecteur")]));
    lancerLOnglet({ serveur });
    await screen.findByRole("link", { name: TEMOIN_DE_L_APPAREIL });
    aller(`#/espaces/${E_GAMMA}`);
    await waitFor(() => verifierDesactivee(CONNECTEZ_VOUS));

    connecte = true;
    rendreLOnglet("visible");

    const active = await screen.findByRole("button", { name: nomOuvrirCetEspace("Gamma") });
    expect(active.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("button", { name: COMMANDE })).toBeNull();
  });
});

/** Un élément JSX `<Nom …>` : ses attributs au premier niveau et la présence d'un `{...spread}`. */
interface Element {
  readonly attributs: readonly string[];
  readonly deploiement: boolean;
}

interface Lecture {
  nu: string;
  profondeur: number;
  delimiteur: string;
  fini: boolean;
}

const OUVRANTS_DE_CHAINE = ['"', "'", "`"];

function accolade(texte: string, rang: number): string {
  return texte.startsWith("...", rang + 1) ? "{...}" : "{}";
}

function poser(lecture: Lecture, morceau: string): void {
  if (lecture.profondeur === 0) {
    lecture.nu += morceau;
  }
}

function lireUnCaractere(texte: string, rang: number, lecture: Lecture): void {
  const c = texte.charAt(rang);
  if (lecture.delimiteur !== "") {
    lecture.delimiteur = c === lecture.delimiteur ? "" : lecture.delimiteur;
  } else if (OUVRANTS_DE_CHAINE.includes(c)) {
    lecture.delimiteur = c;
    poser(lecture, '""');
  } else if (c === "{") {
    poser(lecture, accolade(texte, rang));
    lecture.profondeur += 1;
  } else if (c === "}") {
    lecture.profondeur -= 1;
  } else if (lecture.profondeur === 0 && c === ">") {
    lecture.fini = true;
  } else {
    poser(lecture, c);
  }
}

/**
 * Les éléments `<nom …>` d'un texte, quelle que soit leur mise en ligne : l'ouverture est lue
 * jusqu'au `>` du premier niveau (accolades et chaînes sautées).
 */
function elementsDe(texte: string, nom: string): Element[] {
  const elements: Element[] = [];
  for (const debut of texte.matchAll(new RegExp(String.raw`<${nom}(?=[\s/>])`, "g"))) {
    const lecture: Lecture = { nu: "", profondeur: 0, delimiteur: "", fini: false };
    for (
      let rang = debut.index + debut[0].length;
      rang < texte.length && !lecture.fini;
      rang += 1
    ) {
      lireUnCaractere(texte, rang, lecture);
    }
    elements.push({
      attributs: [...lecture.nu.matchAll(/(?:^|\s)([A-Za-z_][\w-]*)/g)].map(
        ([, nomAttribut = ""]) => nomAttribut,
      ),
      deploiement: lecture.nu.includes("{...}"),
    });
  }
  return elements;
}

const SOURCES = lireDossier("src");
const FOURNISSEURS_D_INDISPONIBLE = ["src/interface/EcranDUnEspace.tsx"];
const DEFINITION_DE_BOUTON = "src/interface/composants/Espaces.tsx";

// Un `{...spread}` sur un `<Bouton>` : la liste fermée des fichiers qui le font. Le type de `Bouton`
// interdit à un spread de porter `indisponible` sans `raison` ; ces fichiers ne nomment pas la prop.
const FOURNISSEURS_PAR_DEPLOIEMENT = ["src/vues-de-table/kanban/PilesDuKanban.tsx"];

function boutonsDe(sources: ReadonlyMap<string, string>, garde: (element: Element) => boolean) {
  return [...sources]
    .filter(([chemin]) => chemin.endsWith(".tsx") && chemin !== DEFINITION_DE_BOUTON)
    .filter(([, texte]) => elementsDe(texte, "Bouton").some(garde))
    .map(([chemin]) => chemin)
    .sort();
}

/** Les fichiers de `src/` qui fournissent la prop `indisponible` à un `<Bouton …>`. */
function fournisseursDIndisponible(sources: ReadonlyMap<string, string>): string[] {
  return boutonsDe(sources, ({ attributs }) => attributs.includes("indisponible"));
}

function deployeursSurBouton(sources: ReadonlyMap<string, string>): string[] {
  return boutonsDe(sources, ({ deploiement }) => deploiement);
}

describe("couture de la prop indisponible de Bouton", () => {
  it("F-036-AC5 F-036-AC11 F-036-AC10 seul EcranDUnEspace fournit `indisponible` à un `<Bouton …>` (une ou plusieurs lignes) ; les `{...spread}` sur un `<Bouton>` sont ceux d'une liste fermée qui ne nomme pas la prop ; un fichier de plus fait échouer ce test en le nommant", () => {
    const compte = [...SOURCES].reduce(
      (total, [chemin, texte]) =>
        chemin === DEFINITION_DE_BOUTON
          ? total
          : total + (texte.match(/<Bouton(?=[\s/>])/g) ?? []).length,
      0,
    );
    const lus = [...SOURCES]
      .filter(([chemin]) => chemin !== DEFINITION_DE_BOUTON)
      .reduce((total, [, texte]) => total + elementsDe(texte, "Bouton").length, 0);
    expect(compte).toBeGreaterThan(50);
    expect(lus).toBe(compte);
    expect(fournisseursDIndisponible(SOURCES)).toEqual(FOURNISSEURS_D_INDISPONIBLE);
    expect(deployeursSurBouton(SOURCES)).toEqual(FOURNISSEURS_PAR_DEPLOIEMENT);
    for (const chemin of FOURNISSEURS_PAR_DEPLOIEMENT) {
      expect(SOURCES.get(chemin), `${chemin} nomme \`indisponible\``).not.toMatch(/indisponible/);
    }
  });

  it("F-036-AC11 F-036-AC10 la détection voit `indisponible` sur une ligne, sur plusieurs lignes et par `{...props}`, et ne se laisse pas tromper par un texte ou une chaîne", () => {
    const fautifs = new Map([
      ["src/a.tsx", '<Bouton libelle="x" raison="y" indisponible />'],
      ["src/b.tsx", '<Bouton\n  libelle="x"\n  indisponible\n/>'],
      ["src/c.tsx", '<Bouton {...props} libelle={f(() => 1) > 0 ? "a" : "b"} />'],
      ["src/d.tsx", '<Bouton libelle="x" indisponible={vrai} />'],
    ]);
    const sains = new Map([
      [
        "src/e.tsx",
        '<Bouton libelle="indisponible" raison={"indisponible"} surActivation={() => 1} />',
      ],
      ["src/f.tsx", "<Texte>indisponible</Texte><Bouton libelle={x}>indisponible</Bouton>"],
    ]);
    expect(fournisseursDIndisponible(fautifs)).toEqual(["src/a.tsx", "src/b.tsx", "src/d.tsx"]);
    expect(deployeursSurBouton(fautifs)).toEqual(["src/c.tsx"]);
    expect(fournisseursDIndisponible(sains)).toEqual([]);
    expect(deployeursSurBouton(sains)).toEqual([]);
  });

  it("F-036-AC11 aucun fichier de src/ n'emploie `Bouton` autrement que par `<Bouton …>` (ni alias, ni espace de noms, ni référence) : tous ses appelants sont vus", () => {
    const autrement = [...SOURCES]
      .filter(([chemin]) => chemin.endsWith(".tsx") && chemin !== DEFINITION_DE_BOUTON)
      .filter(([, texte]) => {
        const sansImports = texte
          .replaceAll(/import\s[^;]*;/g, "")
          .replaceAll(/\/\*[\s\S]*?\*\//g, "")
          .replaceAll(/^\s*\/\/.*$/gm, "")
          .replaceAll(/"[^"\n]*"/g, '""')
          .replaceAll(/<Bouton(?=[\s/>])/g, "")
          .replaceAll(/<\/Bouton>/g, "");
        return /\bBouton\b/.test(sansImports);
      })
      .map(([chemin]) => chemin);
    const espaceDeNoms = [...SOURCES]
      .filter(([, texte]) =>
        /import\s*\*\s*as\s+\w+\s+from\s+"[^"]*composants\/Espaces\.tsx"/.test(texte),
      )
      .map(([chemin]) => chemin);
    expect(autrement).toEqual([]);
    expect(espaceDeNoms).toEqual([]);
  });

  it("F-036-AC5 le type lie `indisponible` à `raison` : l'une sans l'autre ne compile pas ; sans `raison`, la prop est sans effet à l'exécution (bouton actif, jamais aria-disabled)", () => {
    // La moitié « ne compile pas » est prouvée par le check CI `typecheck` (Vitest ne vérifie pas les types).
    // @ts-expect-error `indisponible` sans `raison` est refusé par le type (union discriminée).
    render(<Bouton libelle="Agir" indisponible />);
    const bouton = screen.getByRole("button", { name: "Agir" });
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
    expect(bouton.hasAttribute("disabled")).toBe(false);
  });

  it("F-036-AC5 sans la prop, un Bouton avec raison reste disabled et sans aria-disabled", () => {
    render(<Bouton libelle="Agir" raison="Parce que" />);
    const bouton = screen.getByRole("button", { name: "Agir" });
    expect(bouton.hasAttribute("disabled")).toBe(true);
    expect(bouton.getAttribute("aria-disabled")).toBeNull();
  });

  it("F-036-AC5 avec la prop, le bouton est aria-disabled, atteignable et décrit par sa raison", () => {
    render(<Bouton libelle="Agir" raison="Parce que" indisponible />);
    const bouton = screen.getByRole("button", { name: "Agir" });
    expect(bouton.hasAttribute("disabled")).toBe(false);
    expect(bouton.getAttribute("aria-disabled")).toBe("true");
    expect(bouton.getAttribute("aria-describedby")).not.toBeNull();
  });
});

describe("signatures des composants privés d'EcranDUnEspace (F-036-AC12)", () => {
  const ECRAN = "src/interface/EcranDUnEspace.tsx";
  const texteDeLEcran = lire(ECRAN);
  // Chacun : n'est exporté ni cité hors du fichier, et n'a que les appels écrits ici, avec leurs props.
  const COMPOSANTS: Readonly<Record<string, readonly (readonly string[])[]>> = {
    OuvertureHorsConnexion: [["idEspace", "raison"]],
    OuvertureAbsente: [["idEspace", "raison"]],
    OuvertureDesactivee: [["raison"], ["raison"]],
    EspaceNonLu: [["echec", "relire", "idEspace"]],
  };

  it.each(Object.entries(COMPOSANTS))(
    "F-036-AC12 F-036-AC10 `%s` n'est pas exporté, aucun autre fichier de src/ ne le cite, et ses appels dans EcranDUnEspace.tsx sont exactement ceux de la liste, avec leurs props",
    (nom, attendus) => {
      const exporte = new RegExp(
        String.raw`export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+${nom}\b|export\s*\{[^}]*\b${nom}\b`,
      );
      const citeurs = [...SOURCES]
        .filter(
          ([chemin, texte]) => chemin !== ECRAN && new RegExp(String.raw`\b${nom}\b`).test(texte),
        )
        .map(([chemin]) => chemin);
      const appels = elementsDe(texteDeLEcran, nom).map(({ attributs, deploiement }) => {
        expect(deploiement, `${ECRAN} : ${nom} reçoit un {...spread}`).toBe(false);
        return [...attributs].sort();
      });

      expect(texteDeLEcran).not.toMatch(exporte);
      expect(citeurs).toEqual([]);
      expect(appels).toEqual(attendus.map((props) => [...props].sort()));
    },
  );
});

describe("état désactivé visible de aria-disabled (F-036-AC5, accessibilité)", () => {
  it("F-036-AC5 `ESPACES.bouton` donne à `aria-disabled` les mêmes marques que `disabled` (curseur par défaut, texte discret) sans survol, et garde le contour de focus", () => {
    const classes = ESPACES.bouton.split(/\s+/);
    expect(classes).toContain("disabled:cursor-default");
    expect(classes).toContain("disabled:text-texte-discret");
    expect(classes).toContain("aria-disabled:cursor-default");
    expect(classes).toContain("aria-disabled:text-texte-discret");
    expect(classes).toContain("hover:bg-surface-survol");
    expect(classes).toContain("aria-disabled:hover:bg-surface-active");
    expect(classes).toContain("contour-interieur");
    expect(classes.some((classe) => /(^|:)outline-(none|0)$/.test(classe))).toBe(false);
  });

  it("F-036-AC5 le bouton `indisponible` porte ces classes dans le DOM", () => {
    render(<Bouton libelle="Agir" raison="Parce que" indisponible />);
    const classes = screen.getByRole("button", { name: "Agir" }).className.split(/\s+/);
    expect(classes).toContain("aria-disabled:text-texte-discret");
    expect(classes).toContain("aria-disabled:cursor-default");
  });

  it("F-036-AC5 le texte discret et le texte de la raison sont lisibles (AA, 4,5) sur la surface du bouton et sur chaque surface, dans le seul thème de l'application (sombre)", () => {
    const rapports = couples(lire(FICHIER_DES_JETONS), "texte").filter(({ premier }) =>
      ["--color-texte-discret", "--color-texte-secondaire"].includes(premier),
    );
    expect(rapports.some(({ surface }) => surface === "--color-surface-active")).toBe(true);
    for (const { premier, surface, rapport } of rapports) {
      expect(rapport, `${premier} sur ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
