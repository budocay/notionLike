import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type * as Y from "yjs";

import {
  activerActionDeRangee,
  boutonNouvellePage,
  creerPageNommee,
  ouvrirCoquille,
  recevoir,
  recharger,
  saisirTitre,
} from "./aides-coquille.tsx";
import { FORMES_REFUSEES, UUID_AVEC_LETTRES } from "./aides-identifiants.ts";

const PREFIXE_PAGE = "#/page/";
const NOM_APPLICATION = "notionLike";

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
  return window.location.hash.slice(PREFIXE_PAGE.length);
}

function allerAuFragment(fragment: string): void {
  window.location.hash = fragment;
}

function commandeDeRepli(nom: string): HTMLElement {
  return screen.getByRole("button", { name: nom });
}

// Une navigation est asynchrone (`hashchange`), et ce qu'elle change n'est pas rendu dans le même
// tour : le titre de la zone principale vient au premier rendu, les ancêtres dépliés et le titre de
// l'onglet après lui. Aucune lecture du DOM ne suit donc une navigation sans attendre ce qu'elle
// lit : ces deux aides attendent ensemble tout ce qu'une sélection, ou son absence, affiche.
async function attendreLaSelection(titre: string): Promise<void> {
  await waitFor(() => {
    expect(titrePrincipal()).toBe(titre);
    expect(liensCourants()).toEqual([titre]);
    expect(document.title).toBe(`${titre} · ${NOM_APPLICATION}`);
  });
}

async function attendreSansSelection(titreAffiche: string): Promise<void> {
  await waitFor(() => {
    expect(titrePrincipal()).toBe(titreAffiche);
    expect(liensCourants()).toEqual([]);
    expect(document.title).toBe(NOM_APPLICATION);
  });
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

    await attendreLaSelection("Bêta");
    expect(window.location.hash).toMatch(/^#\/page\/[0-9a-f-]{36}$/);
    expect(lien("Bêta").getAttribute("href")).toBe(window.location.hash);
    expect(lien("Bêta").getAttribute("aria-current")).toBe("page");
    expect(lien("Alpha").hasAttribute("aria-current")).toBe(false);

    await utilisateur.click(lien("Alpha"));

    await attendreLaSelection("Alpha");
    expect(lien("Alpha").getAttribute("href")).toBe(window.location.hash);
  });

  it("F-002-AC5 une page créée est sélectionnée : adresse, page courante, zone principale", async () => {
    const { utilisateur } = await ouvrirCoquille();

    await utilisateur.click(await boutonNouvellePage());

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/page\/[0-9a-f-]{36}$/));
    await waitFor(() => expect(titrePrincipal()).toBe("Sans titre"));
    await utilisateur.keyboard("{Escape}");
    await attendreLaSelection("Sans titre");
    const idRacine = idDansLAdresse();

    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Sans titre");
    await saisirTitre(utilisateur, "Sous-page");

    await attendreLaSelection("Sous-page");
    expect(idDansLAdresse()).not.toBe(idRacine);
  });

  it("F-002-AC6 le titre validé s'affiche dans la zone principale et dans l'onglet ; Échap les laisse inchangés", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Premier jet");
    await attendreLaSelection("Premier jet");

    await activerActionDeRangee(utilisateur, "renommer", "Premier jet");
    await saisirTitre(utilisateur, "Titre définitif");

    await attendreLaSelection("Titre définitif");

    await activerActionDeRangee(utilisateur, "renommer", "Titre définitif");
    await utilisateur.keyboard("Abandonné{Escape}");

    await attendreLaSelection("Titre définitif");
    expect(screen.queryByRole("link", { name: "Abandonné" })).toBeNull();
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
    await attendreLaSelection("Petite-fille");

    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Parent");

    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await attendreSansSelection(NOM_APPLICATION);
    expect(zonePrincipale().textContent).not.toContain("Page introuvable");

    await utilisateur.click(lien("Autre"));
    await attendreLaSelection("Autre");
    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Autre");
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await attendreSansSelection(NOM_APPLICATION);
    expect(zonePrincipale().textContent).toContain("Créez-en une");
  });

  it("F-002-AC7 mettre à la corbeille une autre page que la sélection ne change pas l'adresse", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Gardée");
      espace.creerPage("Jetée");
    });
    await utilisateur.click(lien("Gardée"));
    await attendreLaSelection("Gardée");
    const adresse = window.location.hash;

    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Jetée");

    await waitFor(() => expect(screen.queryByRole("link", { name: "Jetée" })).toBeNull());
    expect(window.location.hash).toBe(adresse);
    await attendreLaSelection("Gardée");
  });

  it("F-002-AC10 sélectionner une page au clavier seul", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => void espace.creerPage("Au clavier"));

    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement).toBe(lien("Au clavier"));
    expect(lien("Au clavier").tagName).toBe("A");
    await utilisateur.keyboard("{Enter}");

    await attendreLaSelection("Au clavier");
    expect(document.activeElement).toBe(lien("Au clavier"));
  });

  it("F-002-AC12 rechargement avec une adresse de page : page sélectionnée", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Retrouvée");
    await attendreLaSelection("Retrouvée");
    const adresse = window.location.hash;

    await recharger(premiere);

    expect(window.location.hash).toBe(adresse);
    await attendreLaSelection("Retrouvée");
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
    await utilisateur.click(commandeDeRepli("Replier « Fille »"));
    await utilisateur.click(commandeDeRepli("Replier « Parent »"));
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();

    allerAuFragment(`${PREFIXE_PAGE}${idPetiteFille}`);

    await attendreLaSelection("Petite-fille");
    expect(commandeDeRepli("Replier « Parent »").getAttribute("aria-expanded")).toBe("true");
    expect(commandeDeRepli("Replier « Fille »").getAttribute("aria-expanded")).toBe("true");

    await utilisateur.click(lien("Autre"));
    await attendreLaSelection("Autre");
    await utilisateur.click(commandeDeRepli("Replier « Parent »"));
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();

    window.history.back();

    await attendreLaSelection("Petite-fille");
    await waitFor(() =>
      expect(commandeDeRepli("Replier « Parent »").getAttribute("aria-expanded")).toBe("true"),
    );

    window.history.forward();

    await attendreLaSelection("Autre");
  });

  it("F-002-AC12 replier un ancêtre de la page sélectionnée reste possible tant que la page désignée ne change pas", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const parent = espace.creerPage("Parent");
      espace.creerPage("Fille", { parent });
    });
    await utilisateur.click(lien("Fille"));
    await attendreLaSelection("Fille");

    await utilisateur.click(commandeDeRepli("Replier « Parent »"));
    recevoir(session, (espace) => void espace.creerPage("Arrivée ensuite"));

    expect(screen.queryByRole("link", { name: "Fille" })).toBeNull();
    expect(titrePrincipal()).toBe("Fille");
  });

  it("F-002-AC13 identifiant absent du document : « Page introuvable », aucune sélection, barre latérale utilisable", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => void espace.creerPage("Présente"));

    allerAuFragment(`${PREFIXE_PAGE}${UUID_AVEC_LETTRES}`);

    await attendreSansSelection("Page introuvable");

    await utilisateur.click(lien("Présente"));
    await attendreLaSelection("Présente");
    await creerPageNommee(utilisateur, "Créée ensuite");
    await attendreLaSelection("Créée ensuite");
  });

  it("F-002-AC13 adresse d'une page à la corbeille, retrouvée par le bouton précédent : « Page introuvable », aucune sélection, barre latérale utilisable", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Jetée ensuite");
      espace.creerPage("Restante");
    });
    await utilisateur.click(lien("Jetée ensuite"));
    await attendreLaSelection("Jetée ensuite");
    const adresseDeLaPageJetee = window.location.hash;
    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Jetée ensuite");
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await attendreSansSelection(NOM_APPLICATION);

    window.history.back();

    await waitFor(() => expect(window.location.hash).toBe(adresseDeLaPageJetee));
    await attendreSansSelection("Page introuvable");
    expect(screen.getAllByRole("link").map((element) => element.textContent)).toEqual(["Restante"]);

    await utilisateur.click(lien("Restante"));
    await attendreLaSelection("Restante");
  });

  it("F-002-AC13 page mise à la corbeille par une mise à jour reçue : « Page introuvable », adresse inchangée", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      espace.creerPage("Éphémère");
      espace.creerPage("Restante");
    });
    await utilisateur.click(lien("Éphémère"));
    await attendreLaSelection("Éphémère");
    const adresse = window.location.hash;

    recevoir(session, (espace) => {
      espace.mettreALaCorbeille(espace.lire().racines[0]?.id ?? "");
    });

    await attendreSansSelection("Page introuvable");
    expect(window.location.hash).toBe(adresse);
    expect(screen.getAllByRole("link").map((element) => element.textContent)).toEqual(["Restante"]);
    expect(await boutonNouvellePage()).toBeDefined();
  });

  it.each(FORMES_REFUSEES)(
    "F-002-AC27 F-002-AC13 à la place de l'identifiant de page, un identifiant %s : « Page introuvable », aucune sélection, rien de la chaîne dans la page ni dans l'onglet, barre latérale utilisable",
    async (_cas, valeur) => {
      const { session, utilisateur } = await ouvrirCoquille();
      recevoir(session, (espace) => void espace.creerPage("Présente"));

      allerAuFragment(`${PREFIXE_PAGE}${valeur}`);

      await waitFor(() => expect(window.location.hash.startsWith(PREFIXE_PAGE)).toBe(true));
      await attendreSansSelection("Page introuvable");
      // Ni la chaîne soumise, ni ce que le navigateur en a gardé dans l'adresse.
      const documentRendu = document.documentElement.outerHTML;
      for (const chaine of [valeur, idDansLAdresse()]) {
        if (chaine !== "") {
          expect(documentRendu).not.toContain(chaine);
          expect(document.title).not.toContain(chaine);
        }
      }

      await utilisateur.click(lien("Présente"));
      await attendreLaSelection("Présente");
      await creerPageNommee(utilisateur, "Créée ensuite");
      await attendreLaSelection("Créée ensuite");
    },
  );

  it("F-002-AC27 un identifiant de forme refusée n'est pas cherché dans le document : la page qui le porte, venue d'une mise à jour forgée, n'est pas sélectionnée par son adresse", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const idForge = UUID_AVEC_LETTRES.toUpperCase();
    recevoir(session, (espace) => {
      const modele = espace.creerPage("Forgée");
      const pages = espace.doc.getMap("pages");
      pages.set(idForge, (pages.get(modele) as Y.Map<unknown>).clone());
      pages.delete(modele);
    });
    expect(lien("Forgée").getAttribute("href")).toBe(`${PREFIXE_PAGE}${idForge}`);

    await utilisateur.click(lien("Forgée"));

    await waitFor(() => expect(idDansLAdresse()).toBe(idForge));
    await attendreSansSelection("Page introuvable");
    expect(zonePrincipale().textContent).not.toContain("Forgée");
    expect(zonePrincipale().textContent).not.toContain(idForge);
  });

  it("F-002-AC18 un titre fait de balisage s'affiche comme du texte dans la zone principale et dans l'onglet", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const titre = "<b>gras</b><script>window.piege = 1</script>";
    recevoir(session, (espace) => void espace.creerPage(titre));

    await utilisateur.click(lien(titre));

    await attendreLaSelection(titre);
    expect(zonePrincipale().querySelector("b, script")).toBeNull();
    expect(document.head.querySelector("b, script")).toBeNull();
    expect("piege" in window).toBe(false);
  });
});
