// Barre du haut de F-004 dans l'application réelle, sous jsdom : fil d'Ariane (F-004-AC39) et zone
// d'état de l'enregistrement local, qui ne dit que l'échec (F-004-AC40).
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  type CoquilleRendue,
  creerPageNommee,
  ouvrirCoquille,
  recevoir,
  rendreApplication,
} from "./aides-coquille.tsx";
import { simulerLaLargeur } from "./aides-largeur.ts";
import {
  fermerDeForce,
  refuserLesOuverturesParUneErreur,
  refuserLesOuverturesParUneException,
  suivreLesConnexions,
} from "./aides-persistance.ts";

const ECHEC = "Non enregistré sur cet appareil";
const INTERMEDIAIRES = "Afficher les pages intermédiaires";

function barreDuHaut(): HTMLElement {
  return screen.getByRole("banner");
}

function fil(): HTMLElement {
  return within(barreDuHaut()).getByRole("navigation", { name: "Fil d'Ariane" });
}

function zoneDEtat(): HTMLElement {
  return within(barreDuHaut()).getByRole("status");
}

function lienDeBarre(titre: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Pages" })).getByRole("link", {
    name: titre,
  });
}

/** Ce que le fil affiche, dans l'ordre : « lien » ou « courante », et le texte. */
function contenuDuFil(): string[] {
  return within(fil())
    .getAllByRole("listitem")
    .map((element) => {
      const lien = element.querySelector("a");
      const courante = element.querySelector('[aria-current="page"]');
      const commande = element.querySelector("button");
      if (lien !== null) {
        return `lien ${lien.textContent}`;
      }
      return courante === null
        ? `commande ${commande?.getAttribute("aria-label")}`
        : `courante ${courante.textContent}`;
    });
}

async function selectionner(coquille: CoquilleRendue, titre: string): Promise<void> {
  await coquille.utilisateur.click(lienDeBarre(titre));
  await waitFor(() => expect(lienDeBarre(titre).getAttribute("aria-current")).toBe("page"));
}

/** Une lignée de pages « Niveau 1 » à « Niveau n », et une page « Ailleurs » à la racine. */
async function ouvrirUneLignee(niveaux: number): Promise<CoquilleRendue> {
  const coquille = await ouvrirCoquille();
  recevoir(coquille.session, (espace) => {
    let parent: string | null = null;
    for (let niveau = 1; niveau <= niveaux; niveau += 1) {
      parent = espace.creerPage(`Niveau ${niveau}`, { parent });
    }
    espace.creerPage("Ailleurs");
  });
  return coquille;
}

describe("fil d'Ariane", () => {
  it("F-004-AC39 sans page sélectionnée, le fil n'est pas affiché ; la barre du haut et sa zone d'état le sont", async () => {
    await ouvrirUneLignee(3);

    expect(within(barreDuHaut()).queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Fil d'Ariane" })).toBeNull();
    expect(zoneDEtat()).toBeDefined();
  });

  it("F-004-AC39 page sélectionnée : ses ancêtres de la racine à la page, chacun un lien vers l'adresse de sa rangée, la page courante en dernier, non activable", async () => {
    const coquille = await ouvrirUneLignee(3);

    await selectionner(coquille, "Niveau 3");

    expect(contenuDuFil()).toEqual(["lien Niveau 1", "lien Niveau 2", "courante Niveau 3"]);
    for (const titre of ["Niveau 1", "Niveau 2"]) {
      expect(within(fil()).getByRole("link", { name: titre }).getAttribute("href")).toBe(
        lienDeBarre(titre).getAttribute("href"),
      );
    }
    const courante = within(fil()).getByText("Niveau 3");
    expect(courante.getAttribute("aria-current")).toBe("page");
    expect(courante.closest("a, button")).toBeNull();
    expect(within(fil()).queryByRole("button")).toBeNull();
  });

  it("F-004-AC39 suivre le lien d'un ancêtre sélectionne cette page, à la même adresse que sa rangée", async () => {
    const coquille = await ouvrirUneLignee(3);
    await selectionner(coquille, "Niveau 3");

    await coquille.utilisateur.click(within(fil()).getByRole("link", { name: "Niveau 2" }));

    await waitFor(() => expect(contenuDuFil()).toEqual(["lien Niveau 1", "courante Niveau 2"]));
    expect(window.location.hash).toBe(lienDeBarre("Niveau 2").getAttribute("href"));
    expect(lienDeBarre("Niveau 2").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Niveau 2");
  });

  it("F-004-AC39 le fil suit sans rechargement un renommage et un déplacement, et dit « Sans titre » pour un titre sans caractère visible", async () => {
    const coquille = await ouvrirUneLignee(3);
    await selectionner(coquille, "Niveau 3");

    recevoir(coquille.session, (espace) => {
      const racine = espace.lire().racines[0];
      espace.renommerPage(racine?.id ?? "", "   ");
      espace.renommerPage(racine?.enfants[0]?.id ?? "", "Renommée");
    });
    expect(contenuDuFil()).toEqual(["lien Sans titre", "lien Renommée", "courante Niveau 3"]);

    recevoir(coquille.session, (espace) => {
      const [racine, ailleurs] = espace.lire().racines;
      const troisieme = racine?.enfants[0]?.enfants[0]?.id ?? "";
      espace.deplacerPage(troisieme, { parent: ailleurs?.id ?? "" });
    });
    expect(contenuDuFil()).toEqual(["lien Ailleurs", "courante Niveau 3"]);

    recevoir(coquille.session, (espace) => {
      const troisieme = espace.lire().racines[1]?.enfants[0]?.id ?? "";
      espace.renommerPage(troisieme, "");
    });
    expect(contenuDuFil()).toEqual(["lien Ailleurs", "courante Sans titre"]);
  });

  it("F-004-AC39 quand les ancêtres sont trop nombreux, les intermédiaires passent derrière « Afficher les pages intermédiaires », la racine et la page courante restant affichées", async () => {
    const coquille = await ouvrirUneLignee(12);
    await selectionner(coquille, "Niveau 12");

    expect(contenuDuFil()).toEqual([
      "lien Niveau 1",
      `commande ${INTERMEDIAIRES}`,
      "courante Niveau 12",
    ]);
    const commande = within(fil()).getByRole("button", { name: INTERMEDIAIRES });
    expect(commande.getAttribute("aria-expanded")).toBe("false");

    await coquille.utilisateur.click(commande);

    expect(commande.getAttribute("aria-expanded")).toBe("true");
    const liste = document.getElementById(commande.getAttribute("aria-controls") ?? "");
    expect(liste).not.toBeNull();
    const intermediaires = within(liste as HTMLElement).getAllByRole("link");
    expect(intermediaires.map((lien) => lien.textContent)).toEqual(
      Array.from({ length: 10 }, (_, rang) => `Niveau ${rang + 2}`),
    );
    expect(intermediaires[4]?.getAttribute("href")).toBe(
      lienDeBarre("Niveau 6").getAttribute("href"),
    );

    await coquille.utilisateur.keyboard("{Escape}");
    expect(commande.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(commande);
    expect(within(fil()).getAllByRole("link")).toHaveLength(1);

    await coquille.utilisateur.click(commande);
    await coquille.utilisateur.click(within(fil()).getByRole("link", { name: "Niveau 6" }));
    await waitFor(() => expect(lienDeBarre("Niveau 6").getAttribute("aria-current")).toBe("page"));
    expect(contenuDuFil()).toEqual([
      "lien Niveau 1",
      `commande ${INTERMEDIAIRES}`,
      "courante Niveau 6",
    ]);
    expect(
      within(fil()).getByRole("button", { name: INTERMEDIAIRES }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("F-004-AC39 la liste des pages intermédiaires se ferme par Échap quand le focus est sur body, et quand le focus passe dans un autre conteneur", async () => {
    const coquille = await ouvrirUneLignee(12);
    await selectionner(coquille, "Niveau 12");
    const commande = within(fil()).getByRole("button", { name: INTERMEDIAIRES });

    await coquille.utilisateur.click(commande);
    expect(document.activeElement?.textContent).toBe("Niveau 2");
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(commande.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(commande);

    await coquille.utilisateur.click(commande);
    expect(commande.getAttribute("aria-expanded")).toBe("true");
    act(() => lienDeBarre("Ailleurs").focus());
    expect(commande.getAttribute("aria-expanded")).toBe("false");
    expect(within(fil()).getAllByRole("link")).toHaveLength(1);
    expect(document.activeElement).toBe(lienDeBarre("Ailleurs"));
  });

  it("F-004-AC39 la page courante change par l'adresse, liste ouverte : le nouveau fil est fermé, et le premier clic qui suit atteint ce qu'il vise", async () => {
    const coquille = await ouvrirUneLignee(12);
    await selectionner(coquille, "Niveau 12");
    await coquille.utilisateur.click(within(fil()).getByRole("button", { name: INTERMEDIAIRES }));
    expect(within(fil()).getAllByRole("link")).toHaveLength(11);

    act(() => {
      window.location.hash = lienDeBarre("Niveau 11").getAttribute("href") ?? "";
    });
    await waitFor(() => expect(contenuDuFil()).toContain("courante Niveau 11"));

    expect(
      within(fil()).getByRole("button", { name: INTERMEDIAIRES }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(within(fil()).getAllByRole("link")).toHaveLength(1);
    // L'écoute du dehors a cessé avec l'ancien fil : le clic n'est pas retenu.
    await coquille.utilisateur.click(lienDeBarre("Ailleurs"));
    await waitFor(() => expect(lienDeBarre("Ailleurs").getAttribute("aria-current")).toBe("page"));
  });

  it("F-004-AC39 sur écran étroit, la place manque dès deux ancêtres : la racine, la commande et la page courante", async () => {
    simulerLaLargeur(360);
    await ouvrirUneLignee(3);
    window.location.hash = lienDeBarre("Niveau 3").getAttribute("href") ?? "";

    await waitFor(() =>
      expect(contenuDuFil()).toEqual([
        "lien Niveau 1",
        `commande ${INTERMEDIAIRES}`,
        "courante Niveau 3",
      ]),
    );
    window.location.hash = lienDeBarre("Niveau 2").getAttribute("href") ?? "";
    await waitFor(() => expect(contenuDuFil()).toEqual(["lien Niveau 1", "courante Niveau 2"]));
    document.documentElement.style.removeProperty("--breakpoint-etroit");
  });

  it("F-004-AC39 sur écran large, avec exactement trois ancêtres, le fil les montre tous, sans commande de repli", async () => {
    simulerLaLargeur(1280);
    const coquille = await ouvrirUneLignee(4);

    await selectionner(coquille, "Niveau 4");

    expect(contenuDuFil()).toEqual([
      "lien Niveau 1",
      "lien Niveau 2",
      "lien Niveau 3",
      "courante Niveau 4",
    ]);
    expect(within(fil()).queryByRole("button")).toBeNull();
    document.documentElement.style.removeProperty("--breakpoint-etroit");
  });

  it("F-004-AC39 sur écran large, avec exactement quatre ancêtres, le fil se replie : la racine, la commande et la page courante, les trois autres ancêtres dans la liste", async () => {
    simulerLaLargeur(1280);
    const coquille = await ouvrirUneLignee(5);

    await selectionner(coquille, "Niveau 5");

    expect(contenuDuFil()).toEqual([
      "lien Niveau 1",
      `commande ${INTERMEDIAIRES}`,
      "courante Niveau 5",
    ]);
    const commande = within(fil()).getByRole("button", { name: INTERMEDIAIRES });
    await coquille.utilisateur.click(commande);
    const liste = document.getElementById(commande.getAttribute("aria-controls") ?? "");
    expect(
      within(liste as HTMLElement)
        .getAllByRole("link")
        .map((lien) => lien.textContent),
    ).toEqual(["Niveau 2", "Niveau 3", "Niveau 4"]);
    document.documentElement.style.removeProperty("--breakpoint-etroit");
  });

  it("F-004-AC39 sur écran étroit, avec exactement un ancêtre, le fil le montre sans commande de repli", async () => {
    simulerLaLargeur(360);
    await ouvrirUneLignee(2);
    window.location.hash = lienDeBarre("Niveau 2").getAttribute("href") ?? "";

    await waitFor(() => expect(contenuDuFil()).toEqual(["lien Niveau 1", "courante Niveau 2"]));
    expect(within(fil()).queryByRole("button")).toBeNull();
    document.documentElement.style.removeProperty("--breakpoint-etroit");
  });
});

function sansAffirmation(): void {
  expect(document.body.textContent).not.toMatch(/nregistr/);
  for (const element of document.body.querySelectorAll("[aria-label], [title]")) {
    expect(element.getAttribute("aria-label") ?? "").not.toMatch(/nregistr/);
    expect(element.getAttribute("title") ?? "").not.toMatch(/nregistr/);
  }
}

/** Textes successifs de la zone d'état, relevés à chacune de ses mutations. */
function suivreLaZone(): { readonly textes: string[]; arreter(): void } {
  const zone = zoneDEtat();
  const textes: string[] = [];
  const observateur = new MutationObserver(() => {
    if (textes.at(-1) !== zone.textContent) {
      textes.push(zone.textContent);
    }
  });
  observateur.observe(zone, { childList: true, subtree: true, characterData: true });
  return { textes, arreter: () => observateur.disconnect() };
}

describe("zone d'état de l'enregistrement local", () => {
  it("F-004-AC40 quand la persistance réussit, la zone est présente et vide, et rien dans le document ne dit ni ne laisse entendre « enregistré »", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Page écrite");

    const zone = zoneDEtat();
    expect(zone.textContent).toBe("");
    expect(zone.childElementCount).toBe(0);
    expect(zone.getAttribute("aria-label")).toBeNull();
    expect(zone.getAttribute("title")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    sansAffirmation();
  });

  it.each([
    ["sans IndexedDB", (): void => void vi.stubGlobal("indexedDB", undefined)],
    ["ouverture refusée par une exception", refuserLesOuverturesParUneException],
    ["ouverture refusée par une erreur", refuserLesOuverturesParUneErreur],
  ])(
    "F-004-AC40 persistance coupée (%s) : la zone dit « Non enregistré sur cet appareil » avec un repère non textuel, l'avertissement de F-002 reste affiché",
    async (_cas, couper) => {
      couper();

      await ouvrirCoquille();

      const zone = zoneDEtat();
      expect(zone.textContent).toBe(ECHEC);
      const repere = zone.querySelector("span");
      expect(repere?.getAttribute("aria-hidden")).toBe("true");
      expect(repere?.textContent).toBe("");
      const alerte = screen.getByRole("alert");
      expect(alerte.textContent).toMatch(/^Vos modifications ne sont pas enregistrées/);
      expect(document.body.textContent).not.toMatch(/Enregistré|Modifications enregistrées/);
    },
  );

  it("F-004-AC40 pendant la saisie d'un titre, la zone ne change pas tant que la persistance réussit", async () => {
    const { utilisateur } = await ouvrirCoquille();
    const suivi = suivreLaZone();

    await creerPageNommee(utilisateur, "Un titre saisi lettre à lettre");
    await act(async () => {
      await Promise.resolve();
    });

    suivi.arreter();
    expect(suivi.textes).toEqual([]);
    expect(zoneDEtat().textContent).toBe("");
  });

  it("F-004-AC40 coupure en cours de saisie (connexion fermée par le navigateur) : la zone change une seule fois, de vide au texte d'échec, et n'est pas réécrite à chaque frappe", async () => {
    const connexions = suivreLesConnexions();
    const { utilisateur } = await ouvrirCoquille();
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));
    const champ = await screen.findByRole("textbox", { name: "Titre de la page" });
    const suivi = suivreLaZone();
    await utilisateur.type(champ, "Avant");
    const connexion = connexions.at(-1);
    if (connexion === undefined) {
      throw new Error("Aucune connexion ouverte par la session.");
    }

    act(() => fermerDeForce(connexion));
    await waitFor(() => expect(zoneDEtat().textContent).toBe(ECHEC));
    await utilisateur.type(champ, " et après la coupure{Enter}");
    await screen.findByRole("link", { name: "Avant et après la coupure" });

    suivi.arreter();
    expect(suivi.textes).toEqual([ECHEC]);
    expect(screen.getByRole("alert").textContent).toMatch(/^Vos modifications/);
  });

  it("F-004-AC40 pendant le chargement, seul l'état de chargement de F-002 est affiché", async () => {
    rendreApplication();

    expect(screen.getAllByRole("status").map((etat) => etat.textContent)).toEqual(["Chargement…"]);
    expect(screen.queryByRole("banner")).toBeNull();
    await screen.findByRole("button", { name: "Nouvelle page" });
  });
});
