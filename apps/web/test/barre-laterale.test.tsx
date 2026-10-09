import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  boutonNouvellePage,
  creerPageNommee,
  etatEncode,
  ouvrirCoquille,
  recevoir,
  saisirTitre,
  titresParFratrie,
} from "./aides-coquille.tsx";

const CHAMP_TITRE = { name: "Titre de la page" };

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function titresDesListes(): string[][] {
  return titresParFratrie(barreLaterale());
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

describe("barre latérale", () => {
  it("F-002-AC5 « Ajouter une sous-page » crée en dernière position sous la page, déplie le parent et ouvre la saisie", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Parent");
    recevoir(session, (espace) => {
      const parent = espace.lire().racines[0]?.id ?? "";
      espace.creerPage("Aînée", { parent });
    });
    await utilisateur.click(bouton("Replier « Parent »"));
    expect(screen.queryByRole("link", { name: "Aînée" })).toBeNull();

    await utilisateur.click(bouton("Ajouter une sous-page à « Parent »"));

    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect(document.activeElement).toBe(champ);
    expect((champ as HTMLInputElement).value).toBe("");
    expect(bouton("Replier « Parent »").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Aînée" })).toBeDefined();
    expect(bouton("Renommer « Sans titre »")).toBeDefined();

    await utilisateur.keyboard("Cadette{Enter}");

    await waitFor(() => expect(titresDesListes()).toEqual([["Parent"], ["Aînée", "Cadette"]]));
  });

  it("F-002-AC5 la saisie du titre s'ouvre à la création d'une page à la racine, le champ a le focus", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await utilisateur.click(await boutonNouvellePage());

    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect(document.activeElement).toBe(champ);
    expect(bouton("Renommer « Sans titre »")).toBeDefined();
  });

  it("F-002-AC6 Entrée valide le titre, une seule fois, et le focus revient au lien de la page", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await utilisateur.click(await boutonNouvellePage());
    const avant = etatEncode(session).length;

    await utilisateur.keyboard("Compte rendu{Enter}");

    const lien = await screen.findByRole("link", { name: "Compte rendu" });
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(document.activeElement).toBe(lien);
    const apresValidation = etatEncode(session);
    expect(apresValidation.length).toBeGreaterThan(avant);

    await utilisateur.tab();
    await utilisateur.click(document.body);

    expect(etatEncode(session)).toEqual(apresValidation);
    expect(screen.getByRole("link", { name: "Compte rendu" })).toBeDefined();
  });

  it("F-002-AC6 la sortie du champ valide le titre saisi, sans reprendre le focus", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Brouillon");
    await utilisateur.click(bouton("Renommer « Brouillon »"));
    const champ = await screen.findByRole("textbox", CHAMP_TITRE);
    expect((champ as HTMLInputElement).value).toBe("Brouillon");

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Version finale");
    await utilisateur.tab();

    expect(await screen.findByRole("link", { name: "Version finale" })).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(document.activeElement).toBe(bouton("Renommer « Version finale »"));
  });

  it("F-002-AC6 Échap conserve l'ancien titre, et la sortie du champ qui suit ne renomme rien", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Inchangé");
    const avant = etatEncode(session);
    await utilisateur.click(bouton("Renommer « Inchangé »"));
    const champ = await screen.findByRole("textbox", CHAMP_TITRE);

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Abandonné");
    await utilisateur.keyboard("{Escape}");

    const lien = await screen.findByRole("link", { name: "Inchangé" });
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(document.activeElement).toBe(lien);
    await utilisateur.click(document.body);
    expect(screen.queryByRole("link", { name: "Abandonné" })).toBeNull();
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-002-AC7 la mise à la corbeille retire la page et toute sa descendance, le focus va à « Nouvelle page »", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Gardée");
    await creerPageNommee(utilisateur, "Dossier");
    await utilisateur.click(bouton("Ajouter une sous-page à « Dossier »"));
    await saisirTitre(utilisateur, "Fille");
    await screen.findByRole("link", { name: "Fille" });
    await utilisateur.click(bouton("Ajouter une sous-page à « Fille »"));
    await saisirTitre(utilisateur, "Petite-fille");
    await screen.findByRole("link", { name: "Petite-fille" });

    await utilisateur.click(bouton("Mettre « Dossier » à la corbeille"));

    await waitFor(() => expect(titresDesListes()).toEqual([["Gardée"]]));
    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();
    expect(document.activeElement).toBe(await boutonNouvellePage());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("F-002-AC8 replier et déplier masque et affiche la descendance sans modifier le document", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      const fille = espace.creerPage("Fille", { parent });
      espace.creerPage("Petite-fille", { parent: fille });
      espace.creerPage("Feuille");
    });
    const avant = etatEncode(session);
    const repli = bouton("Replier « Parent »");
    expect(repli.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Petite-fille" })).toBeDefined();

    await utilisateur.click(repli);

    const depli = bouton("Déplier « Parent »");
    expect(depli.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(depli);
    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();
    expect(screen.getByRole("link", { name: "Parent" })).toBeDefined();
    expect(etatEncode(session)).toEqual(avant);

    await utilisateur.click(depli);

    expect(screen.getByRole("link", { name: "Fille" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Petite-fille" })).toBeDefined();
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-002-AC8 une page sans sous-page ne propose ni repli ni dépli", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("Fille", { parent });
      espace.creerPage("Feuille");
    });

    expect(screen.queryByRole("button", { name: /(Replier|Déplier) « Feuille »/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /(Replier|Déplier) « Fille »/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^(Replier|Déplier) / })).toHaveLength(1);
  });

  it("F-002-AC10 créer, renommer, ajouter une sous-page, replier, déplier et mettre à la corbeille au clavier seul", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await utilisateur.tab();
    expect(document.activeElement).toBe(await boutonNouvellePage());
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("textbox", CHAMP_TITRE);
    await utilisateur.keyboard("Agenda{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Agenda" }));

    await utilisateur.tab();
    expect(document.activeElement).toBe(bouton("Renommer « Agenda »"));
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("textbox", CHAMP_TITRE);
    await utilisateur.keyboard("Planning{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Planning" }));

    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement).toBe(bouton("Ajouter une sous-page à « Planning »"));
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("textbox", CHAMP_TITRE);
    await utilisateur.keyboard("Lundi{Enter}");
    expect(document.activeElement).toBe(await screen.findByRole("link", { name: "Lundi" }));

    await utilisateur.tab({ shift: true });
    await utilisateur.tab({ shift: true });
    await utilisateur.tab({ shift: true });
    await utilisateur.tab({ shift: true });
    await utilisateur.tab({ shift: true });
    expect(document.activeElement).toBe(bouton("Replier « Planning »"));
    await utilisateur.keyboard("{Enter}");
    expect(screen.queryByRole("link", { name: "Lundi" })).toBeNull();
    expect(document.activeElement).toBe(bouton("Déplier « Planning »"));
    await utilisateur.keyboard(" ");
    expect(screen.getByRole("link", { name: "Lundi" })).toBeDefined();

    await utilisateur.tab();
    await utilisateur.tab();
    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement).toBe(bouton("Mettre « Planning » à la corbeille"));
    await utilisateur.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryAllByRole("link")).toEqual([]));
    expect(document.activeElement).toBe(await boutonNouvellePage());
  });

  it("F-002-AC10 chaque commande de la barre latérale est native et porte un nom accessible français", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("", { parent });
    });

    const noms = within(barreLaterale())
      .getAllByRole("button")
      .map((commande) => {
        expect(commande.tagName).toBe("BUTTON");
        expect((commande as HTMLButtonElement).type).toBe("button");
        expect(commande.tabIndex).toBe(0);
        return commande.getAttribute("aria-label") ?? commande.textContent;
      });

    expect(noms).toEqual([
      "Nouvelle page",
      "Replier « Parent »",
      "Renommer « Parent »",
      "Ajouter une sous-page à « Parent »",
      "Mettre « Parent » à la corbeille",
      "Renommer « Sans titre »",
      "Ajouter une sous-page à « Sans titre »",
      "Mettre « Sans titre » à la corbeille",
    ]);
    expect(
      within(barreLaterale())
        .getAllByRole("link")
        .map((lien) => lien.textContent),
    ).toEqual(["Parent", "Sans titre"]);
  });
});

const PROFONDEUR_EPROUVEE = 2_000;

describe("barre latérale : profondeur", () => {
  // Garde-fou : le rendu imbriqué d'origine vidait l'écran dans Chromium dès 1 000 niveaux
  // (« Maximum call stack size exceeded ») et gelait le DOM simulé bien avant.
  it(`F-002-AC5 F-002-AC10 un arbre de ${PROFONDEUR_EPROUVEE} niveaux s'affiche en entier, se sélectionne et se replie`, async () => {
    const { session, utilisateur } = await ouvrirCoquille();

    recevoir(session, (espace) => {
      let parent: string | null = null;
      for (let niveau = 1; niveau <= PROFONDEUR_EPROUVEE; niveau += 1) {
        parent = espace.creerPage(`Niveau ${niveau}`, { parent });
      }
    });

    const liens = within(barreLaterale()).getAllByRole("link");
    expect(liens).toHaveLength(PROFONDEUR_EPROUVEE);
    const derniere = liens.at(-1);
    expect(derniere?.textContent).toBe(`Niveau ${PROFONDEUR_EPROUVEE}`);
    expect(derniere?.closest("li")?.getAttribute("aria-level")).toBe(String(PROFONDEUR_EPROUVEE));

    await utilisateur.click(liens[PROFONDEUR_EPROUVEE - 1] as HTMLElement);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        `Niveau ${PROFONDEUR_EPROUVEE}`,
      ),
    );

    await utilisateur.click(bouton("Replier « Niveau 1 »"));

    expect(titresDesListes()).toEqual([["Niveau 1"]]);
  }, 60_000);
});
