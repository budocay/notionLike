// Barre latérale, ouverture, corbeille et suppression d'une table dans l'application (F-018-AC10 à
// AC12, AC15, AC17, AC48, AC49), rendue par le point d'entrée de l'interface sur fake-indexeddb.
import type { PageLue } from "@notionlike/document";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import {
  activerActionDeRangee,
  activerActionDeRangeeAuClavier,
  boutonNouvellePage,
  ouvrirCoquille,
  recevoir,
  saisirTitre,
} from "./aides-coquille.tsx";
import { aller, titrePrincipal } from "./aides-espaces.tsx";
import { enregistrements, laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";
import { ecouterLesErreursNonInterceptees, refuserLOuvertureDe } from "./aides-reprise.ts";
import {
  cleDesReglages,
  type DesignationDeTableDEssai,
  enregistrerDansLaBaseDeTable,
  nomDeLaBaseDeTable,
} from "./aides-table.ts";

const REGLAGES = JSON.stringify({ version: 1, sections: { tableau: { largeurs: { c: 300 } } } });

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function etatPret(session: SessionEspace) {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error(`La session n'est pas prête : ${etat.phase}.`);
  }
  return etat;
}

function racines(session: SessionEspace): readonly PageLue[] {
  return etatPret(session).arborescence.racines;
}

function designation(session: SessionEspace, idTable: string): DesignationDeTableDEssai {
  const { idEspace } = etatPret(session);
  if (idEspace === undefined) {
    throw new Error("L'espace n'est pas encore connu.");
  }
  return { idEspace, idTable };
}

/** Une table reçue d'une autre réplique, à la racine, et son identifiant. */
function recevoirUneTable(session: SessionEspace, titre: string): string {
  let id = "";
  recevoir(session, (espace) => {
    id = espace.creerTable(titre);
  });
  return id;
}

describe("créer une table depuis la barre latérale (F-018-AC10)", () => {
  it("F-018-AC10 « Nouvelle table » crée à la racine une table au titre vide, l'affiche « Sans titre », la sélectionne et ouvre la saisie de son titre", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle table" }));

    const champ = await screen.findByRole("textbox", { name: "Titre de la page" });
    expect(document.activeElement).toBe(champ);
    const [table] = racines(session);
    expect(table).toMatchObject({ titre: "", type: "table", enfants: [] });
    expect(window.location.hash).toBe(`#/page/${table?.id ?? ""}`);
    await utilisateur.keyboard("{Escape}");
    const lien = await within(barreLaterale()).findByRole("link", { name: "Table Sans titre" });
    expect(lien.getAttribute("aria-current")).toBe("page");
  });

  it("F-018-AC10 « Ajouter une table » sur une page crée la table en dernière position sous elle et déplie la page", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const mere = espace.creerPage("Projets");
      espace.creerPage("Notes", { parent: mere });
    });
    await utilisateur.click(screen.getByRole("button", { name: "Sous-pages de « Projets »" }));
    expect(screen.queryByRole("link", { name: "Notes" })).toBeNull();

    await utilisateur.click(
      await screen.findByRole("button", { name: "Actions de la page « Projets »" }),
    );
    await utilisateur.click(screen.getByRole("menuitem", { name: "Ajouter une table" }));
    await saisirTitre(utilisateur, "Budget");

    const [mere] = racines(session);
    expect(mere?.enfants.map(({ titre, type }) => [titre, type])).toEqual([
      ["Notes", undefined],
      ["Budget", "table"],
    ]);
    expect(await screen.findByRole("link", { name: "Notes" })).toBeDefined();
    const table = await screen.findByRole("link", { name: "Table Budget" });
    expect(table.getAttribute("aria-current")).toBe("page");
  });
});

describe("marque d'une table (F-018-AC11)", () => {
  it("F-018-AC11 dans la barre latérale, une table porte un pictogramme et un nom accessible qui commence par « Table » ; une page, ni l'un ni l'autre", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Journal");
      espace.creerTable("Budget");
    });

    const barre = within(barreLaterale());
    const table = await barre.findByRole("link", { name: "Table Budget" });
    const page = barre.getByRole("link", { name: "Journal" });
    expect(table.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(page.querySelector("svg")).toBeNull();
    expect(barre.getAllByRole("link").map((lien) => lien.textContent)).toEqual([
      "Journal",
      "Table Budget",
    ]);
  });

  it("F-018-AC11 les actions d'une rangée restent offertes sur une table, au clavier seul : renommer, ajouter une sous-page, mettre à la corbeille", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoirUneTable(session, "Budget");
    await screen.findByRole("link", { name: "Table Budget" });

    await activerActionDeRangeeAuClavier(utilisateur, "renommer", "Budget");
    await saisirTitre(utilisateur, "Dépenses");
    expect(await screen.findByRole("link", { name: "Table Dépenses" })).toBeDefined();
    await activerActionDeRangeeAuClavier(utilisateur, "ajouter-une-sous-page", "Dépenses");
    await saisirTitre(utilisateur, "Annexe");
    expect(racines(session)[0]?.enfants.map(({ titre }) => titre)).toEqual(["Annexe"]);

    await activerActionDeRangeeAuClavier(utilisateur, "mettre-a-la-corbeille", "Dépenses");
    await waitFor(() => expect(racines(session)).toEqual([]));
    expect(etatPret(session).arborescence.corbeille.map(({ type }) => type)).toEqual(["table"]);
  });

  it("F-018-AC11 dans l'écran de la corbeille, une table porte la même marque", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.mettreALaCorbeille(espace.creerTable("Budget"));
      espace.mettreALaCorbeille(espace.creerPage("Journal"));
    });
    aller("#/corbeille");

    const liste = await screen.findByRole("region", { name: "Pages de la corbeille" });
    const lignes = within(liste)
      .getAllByRole("listitem")
      .map((ligne) => ligne.textContent ?? "");
    expect(lignes.some((texte) => texte.startsWith("Table Budget"))).toBe(true);
    expect(lignes.some((texte) => texte.startsWith("Journal"))).toBe(true);
    expect(liste.querySelectorAll("svg[aria-hidden]")).toHaveLength(1);
  });
});

describe("ouvrir une table (F-018-AC12, AC15, AC17)", () => {
  it("F-018-AC12 F-018-AC17 la table sélectionnée affiche son titre et l'écran de table, sous #/page/<id> : ni éditeur, ni base de page ; sans colonne, l'invitation", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const id = recevoirUneTable(session, "Budget");

    await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));
    expect(await screen.findByText(/Cette table n'a encore aucune colonne/)).toBeDefined();
    await act(() => laisserIndexedDbTravailler());

    expect(window.location.hash).toBe(`#/page/${id}`);
    expect((await titrePrincipal()).textContent).toBe("Budget");
    expect(screen.queryByRole("textbox", { name: "Contenu de la page" })).toBeNull();
    const bases = await nomsDesBases();
    expect(bases.filter((nom) => nom.includes(":page:"))).toEqual([]);
    expect(bases).toContain(nomDeLaBaseDeTable(designation(session, id)));
  });

  it("F-018-AC12 une page sélectionnée n'ouvre aucune base de table, une table aucune base de page", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Journal");
      espace.creerTable("Budget");
    });
    await utilisateur.click(await screen.findByRole("link", { name: "Journal" }));
    await screen.findByRole("textbox", { name: "Contenu de la page" });
    await act(() => laisserIndexedDbTravailler());
    const apresLaPage = await nomsDesBases();

    await utilisateur.click(screen.getByRole("link", { name: "Table Budget" }));
    await screen.findByText(/Cette table n'a encore aucune colonne/);
    await act(() => laisserIndexedDbTravailler());

    expect(apresLaPage.filter((nom) => nom.includes(":table:"))).toEqual([]);
    expect((await nomsDesBases()).filter((nom) => nom.includes(":page:"))).toHaveLength(1);
  });

  it.each([
    [
      "une version de format non prise en charge",
      (doc: Y.Doc) => doc.getArray<unknown>("versions").push([2]),
      "Cette table demande une version plus récente de l'application.",
    ],
    [
      "un document d'un autre genre",
      (doc: Y.Doc) => doc.getText("contenu").insert(0, "x"),
      "Cette table est illisible.",
    ],
  ])(
    "F-018-AC15 %s : un message sans code technique à la place de la grille, rien d'écrit dans la base, la barre latérale utilisable",
    async (_cas, ecrire, message) => {
      const { session, utilisateur } = await ouvrirCoquille();
      const id = recevoirUneTable(session, "Ancienne");
      const table = designation(session, id);
      await enregistrerDansLaBaseDeTable(table, ecrire);
      const avant = await enregistrements(nomDeLaBaseDeTable(table));

      await utilisateur.click(await screen.findByRole("link", { name: "Table Ancienne" }));

      expect((await screen.findByRole("alert", { name: "" })).textContent).toBe(message);
      expect(screen.queryByText(/aucune colonne/)).toBeNull();
      await act(() => laisserIndexedDbTravailler());
      expect(await enregistrements(nomDeLaBaseDeTable(table))).toEqual(avant);
      await utilisateur.click(await boutonNouvellePage());
      expect(await screen.findByRole("textbox", { name: "Titre de la page" })).toBeDefined();
    },
  );
});

describe("table dont la persistance échoue (F-018-AC14)", () => {
  it("F-018-AC14 la base de la table refusée : l'avertissement de F-002-AC16 est affiché et annoncé, la barre du haut dit « Non enregistré », la table reste affichée, sans erreur non interceptée", async () => {
    const relevees = ecouterLesErreursNonInterceptees();
    const { session, utilisateur } = await ouvrirCoquille();
    const id = recevoirUneTable(session, "Budget");
    refuserLOuvertureDe(nomDeLaBaseDeTable(designation(session, id)));

    await utilisateur.click(await screen.findByRole("link", { name: "Table Budget" }));

    expect(await screen.findByText(/Stockage de l'appareil indisponible/)).toBeDefined();
    expect(within(screen.getByRole("banner")).getByRole("status").textContent).toBe(
      "Non enregistré sur cet appareil",
    );
    expect(screen.getByText(/aucune colonne/)).toBeDefined();
    expect(relevees()).toEqual([]);
  });
});

describe("corbeille et suppression définitive d'une table (F-018-AC48, AC49)", () => {
  it("F-018-AC48 mise à la corbeille puis restaurée comme une page : son adresse dit « Page introuvable » entre les deux, et ni sa base ni ses réglages de vue ne changent", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const id = recevoirUneTable(session, "Budget");
    const table = designation(session, id);
    await enregistrerDansLaBaseDeTable(table, (doc) => doc.getArray<unknown>("lignes"));
    localStorage.setItem(cleDesReglages(table), REGLAGES);
    const base = await enregistrements(nomDeLaBaseDeTable(table));

    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Budget");
    aller(`#/page/${id}`);
    expect((await titrePrincipal()).textContent).toBe("Page introuvable");
    aller("#/corbeille");
    await utilisateur.click(await screen.findByRole("button", { name: "Restaurer « Budget »" }));

    expect(racines(session).map(({ type }) => type)).toEqual(["table"]);
    await act(() => laisserIndexedDbTravailler());
    expect(await enregistrements(nomDeLaBaseDeTable(table))).toEqual(base);
    expect(localStorage.getItem(cleDesReglages(table))).toBe(REGLAGES);
    localStorage.clear();
  });

  it("F-018-AC49 supprimée définitivement depuis l'écran de la corbeille, une table perd sa base de table et ses réglages de vue", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const id = recevoirUneTable(session, "Budget");
    const table = designation(session, id);
    await enregistrerDansLaBaseDeTable(table, (doc) => doc.getArray<unknown>("lignes"));
    localStorage.setItem(cleDesReglages(table), REGLAGES);
    recevoir(session, (espace) => espace.mettreALaCorbeille(id));
    aller("#/corbeille");

    await utilisateur.click(
      await screen.findByRole("button", { name: "Supprimer définitivement « Budget »" }),
    );
    const boite = await screen.findByRole("alertdialog");
    await utilisateur.click(
      within(boite).getByRole("button", { name: "Supprimer définitivement « Budget »" }),
    );

    expect(await screen.findByText("Page supprimée définitivement")).toBeDefined();
    await waitFor(async () =>
      expect(await nomsDesBases()).not.toContain(nomDeLaBaseDeTable(table)),
    );
    expect(localStorage.getItem(cleDesReglages(table))).toBeNull();
    expect(etatPret(session).arborescence.corbeille).toEqual([]);
  });
});
