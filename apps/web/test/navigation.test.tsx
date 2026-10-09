import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  boutonNouvellePage,
  creerPageNommee,
  ouvrirCoquille,
  recevoir,
  saisirTitre,
} from "./aides-coquille.tsx";

function zonePrincipale(): HTMLElement {
  return screen.getByRole("main");
}

function titrePrincipal(): string | null {
  return within(zonePrincipale()).getByRole("heading", { level: 1 }).textContent;
}

function lien(nom: string): HTMLElement {
  return screen.getByRole("link", { name: nom });
}

function liensCourants(): (string | null)[] {
  return screen
    .queryAllByRole("link")
    .filter((element) => element.getAttribute("aria-current") === "page")
    .map((element) => element.textContent);
}

function idDansLAdresse(): string {
  return decodeURIComponent(window.location.hash.replace("#/page/", ""));
}

function allerAuFragment(fragment: string): void {
  window.location.hash = fragment;
}

describe("sélection et adresse", () => {
  it("F-002-AC11 sélectionner une page la marque courante, affiche son titre et inscrit son identifiant dans l'adresse", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Alpha");
      espace.creerPage("Bêta");
    });
    expect(liensCourants()).toEqual([]);

    await utilisateur.click(lien("Bêta"));

    await waitFor(() => expect(liensCourants()).toEqual(["Bêta"]));
    expect(titrePrincipal()).toBe("Bêta");
    expect(window.location.hash).toMatch(/^#\/page\/[0-9a-f-]{36}$/);
    expect(lien("Bêta").getAttribute("href")).toBe(window.location.hash);
    expect(document.title).toBe("Bêta · notionLike");

    await utilisateur.click(lien("Alpha"));

    await waitFor(() => expect(liensCourants()).toEqual(["Alpha"]));
    expect(titrePrincipal()).toBe("Alpha");
  });

  it("F-002-AC5 une page créée est sélectionnée : adresse, page courante, zone principale", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await utilisateur.click(await boutonNouvellePage());

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/page\/[0-9a-f-]{36}$/));
    await waitFor(() => expect(titrePrincipal()).toBe("Sans titre"));
    await utilisateur.keyboard("{Escape}");
    expect(liensCourants()).toEqual(["Sans titre"]);
    const idRacine = idDansLAdresse();

    await utilisateur.click(
      screen.getByRole("button", { name: "Ajouter une sous-page à « Sans titre »" }),
    );
    await saisirTitre(utilisateur, "Sous-page");

    await waitFor(() => expect(liensCourants()).toEqual(["Sous-page"]));
    expect(titrePrincipal()).toBe("Sous-page");
    expect(idDansLAdresse()).not.toBe(idRacine);
  });

  it("F-002-AC6 le titre validé s'affiche dans la zone principale et dans l'onglet ; Échap les laisse inchangés", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Premier jet");
    await waitFor(() => expect(titrePrincipal()).toBe("Premier jet"));

    await utilisateur.click(screen.getByRole("button", { name: "Renommer « Premier jet »" }));
    await saisirTitre(utilisateur, "Titre définitif");

    await waitFor(() => expect(titrePrincipal()).toBe("Titre définitif"));
    expect(document.title).toBe("Titre définitif · notionLike");

    await utilisateur.click(screen.getByRole("button", { name: "Renommer « Titre définitif »" }));
    await utilisateur.keyboard("Abandonné{Escape}");

    expect(titrePrincipal()).toBe("Titre définitif");
    expect(document.title).toBe("Titre définitif · notionLike");
  });

  it("F-002-AC7 mettre à la corbeille la page sélectionnée, ou l'une de ses ancêtres, ramène à l'accueil", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      const fille = espace.creerPage("Fille", { parent });
      espace.creerPage("Petite-fille", { parent: fille });
      espace.creerPage("Autre");
    });
    await utilisateur.click(lien("Petite-fille"));
    await waitFor(() => expect(titrePrincipal()).toBe("Petite-fille"));

    await utilisateur.click(
      screen.getByRole("button", { name: "Mettre « Parent » à la corbeille" }),
    );

    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await waitFor(() => expect(titrePrincipal()).toBe("notionLike"));
    expect(zonePrincipale().textContent).not.toContain("Page introuvable");
    expect(liensCourants()).toEqual([]);
    expect(document.title).toBe("notionLike");

    await utilisateur.click(lien("Autre"));
    await waitFor(() => expect(titrePrincipal()).toBe("Autre"));
    await utilisateur.click(
      screen.getByRole("button", { name: "Mettre « Autre » à la corbeille" }),
    );
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(zonePrincipale().textContent).toContain("Créez-en une");
  });

  it("F-002-AC7 mettre à la corbeille une autre page que la sélection ne change pas l'adresse", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Gardée");
      espace.creerPage("Jetée");
    });
    await utilisateur.click(lien("Gardée"));
    await waitFor(() => expect(titrePrincipal()).toBe("Gardée"));
    const adresse = window.location.hash;

    await utilisateur.click(
      screen.getByRole("button", { name: "Mettre « Jetée » à la corbeille" }),
    );

    await waitFor(() => expect(screen.queryByRole("link", { name: "Jetée" })).toBeNull());
    expect(window.location.hash).toBe(adresse);
    expect(titrePrincipal()).toBe("Gardée");
  });

  it("F-002-AC10 sélectionner une page au clavier seul", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => void espace.creerPage("Au clavier"));

    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement).toBe(lien("Au clavier"));
    expect(lien("Au clavier").tagName).toBe("A");
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(liensCourants()).toEqual(["Au clavier"]));
    expect(titrePrincipal()).toBe("Au clavier");
    expect(document.activeElement).toBe(lien("Au clavier"));
  });

  it("F-002-AC12 ouverture avec une adresse de page : page sélectionnée", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Retrouvée");
    await waitFor(() => expect(titrePrincipal()).toBe("Retrouvée"));
    const adresse = window.location.hash;
    cleanup();

    expect(window.location.hash).toBe(adresse);
    await ouvrirCoquille();

    await waitFor(() => expect(liensCourants()).toEqual(["Retrouvée"]));
    expect(titrePrincipal()).toBe("Retrouvée");
  });

  it("F-002-AC12 fragment modifié, bouton précédent et suivant : sélection suivie, ancêtres dépliés", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    let idPetiteFille = "";
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      const fille = espace.creerPage("Fille", { parent });
      idPetiteFille = espace.creerPage("Petite-fille", { parent: fille });
      espace.creerPage("Autre");
    });
    await utilisateur.click(screen.getByRole("button", { name: "Replier « Fille »" }));
    await utilisateur.click(screen.getByRole("button", { name: "Replier « Parent »" }));
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();

    allerAuFragment(`#/page/${idPetiteFille}`);

    await waitFor(() => expect(liensCourants()).toEqual(["Petite-fille"]));
    expect(titrePrincipal()).toBe("Petite-fille");
    expect(
      screen.getByRole("button", { name: "Replier « Parent »" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Replier « Fille »" }).getAttribute("aria-expanded"),
    ).toBe("true");

    await utilisateur.click(lien("Autre"));
    await waitFor(() => expect(titrePrincipal()).toBe("Autre"));
    await utilisateur.click(screen.getByRole("button", { name: "Replier « Parent »" }));
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();

    window.history.back();

    await waitFor(() => expect(titrePrincipal()).toBe("Petite-fille"));
    expect(liensCourants()).toEqual(["Petite-fille"]);

    window.history.forward();

    await waitFor(() => expect(titrePrincipal()).toBe("Autre"));
    expect(liensCourants()).toEqual(["Autre"]);
  });

  it("F-002-AC12 replier un ancêtre de la page sélectionnée reste possible tant que la page désignée ne change pas", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("Fille", { parent });
    });
    await utilisateur.click(lien("Fille"));
    await waitFor(() => expect(titrePrincipal()).toBe("Fille"));

    await utilisateur.click(screen.getByRole("button", { name: "Replier « Parent »" }));
    recevoir(session, (espace) => void espace.creerPage("Arrivée ensuite"));

    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(titrePrincipal()).toBe("Fille");
  });

  it.each([
    ["identifiant absent du document", "#/page/00000000-0000-4000-8000-000000000000"],
    ["encodage invalide", "#/page/%E0%A4%A"],
    ["identifiant vide", "#/page/"],
  ])(
    "F-002-AC13 %s : « Page introuvable », aucune sélection, barre latérale utilisable",
    async (_cas, fragment) => {
      const { session, utilisateur } = await ouvrirCoquille();
      recevoir(session, (espace) => void espace.creerPage("Présente"));

      allerAuFragment(fragment);

      await waitFor(() => expect(titrePrincipal()).toBe("Page introuvable"));
      expect(liensCourants()).toEqual([]);
      expect(document.title).toBe("notionLike");

      await utilisateur.click(lien("Présente"));
      await waitFor(() => expect(titrePrincipal()).toBe("Présente"));
      await creerPageNommee(utilisateur, "Créée ensuite");
      expect(titrePrincipal()).toBe("Créée ensuite");
    },
  );

  it("F-002-AC13 page mise à la corbeille par une mise à jour reçue : « Page introuvable », adresse inchangée", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Éphémère");
      espace.creerPage("Restante");
    });
    await utilisateur.click(lien("Éphémère"));
    await waitFor(() => expect(titrePrincipal()).toBe("Éphémère"));
    const adresse = window.location.hash;

    recevoir(session, (espace) => {
      espace.mettreALaCorbeille(espace.lire().racines[0]?.id ?? "");
    });

    expect(titrePrincipal()).toBe("Page introuvable");
    expect(window.location.hash).toBe(adresse);
    expect(liensCourants()).toEqual([]);
    expect(screen.getAllByRole("link").map((element) => element.textContent)).toEqual(["Restante"]);
    expect(await boutonNouvellePage()).toBeDefined();
  });

  it("F-002-AC18 un titre fait de balisage s'affiche comme du texte dans la zone principale et dans l'onglet", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const titre = "<b>gras</b><script>window.piege = 1</script>";
    recevoir(session, (espace) => void espace.creerPage(titre));

    await utilisateur.click(lien(titre));

    await waitFor(() => expect(titrePrincipal()).toBe(titre));
    expect(zonePrincipale().querySelector("b, script")).toBeNull();
    expect(document.title).toBe(`${titre} · notionLike`);
    expect(document.head.querySelector("b, script")).toBeNull();
    expect("piege" in window).toBe(false);
  });
});
