// Composants de présentation de F-004, sous jsdom : structure, rôles, noms accessibles et ordre de
// tabulation. Les styles et les dimensions ne se voient que dans un navigateur.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarreDuHaut, FilAriane, ZoneEtat } from "../src/interface/composants/BarreDuHaut.tsx";
import { CadreDeBarre, TeteDeBarre } from "../src/interface/composants/BarreLaterale.tsx";
import { ChampTitre } from "../src/interface/composants/ChampTitre.tsx";
import { Chargement, EntetePage } from "../src/interface/composants/Etats.tsx";
import { MenuActions } from "../src/interface/composants/MenuActions.tsx";
import { type ProprietesRangee, Rangee } from "../src/interface/composants/Rangee.tsx";

const TITRE_DE_200 = "x".repeat(200);

afterEach(cleanup);

function rangee(proprietes: Partial<ProprietesRangee> = {}): ProprietesRangee {
  return {
    niveau: 1,
    titre: "Carnet",
    adresse: "#/page/a",
    courante: false,
    ajout: { nom: "Ajouter une sous-page à « Carnet »", surActivation: vi.fn() },
    actions: { nom: "Actions de la page « Carnet »", surActivation: vi.fn() },
    menuOuvert: false,
    ...proprietes,
  };
}

function rendreRangee(proprietes: Partial<ProprietesRangee> = {}): ProprietesRangee {
  const completes = rangee(proprietes);
  render(
    <ul>
      <Rangee {...completes} />
    </ul>,
  );
  return completes;
}

describe("Rangee", () => {
  it("F-004-AC24 le nom accessible du lien est le titre complet, même de 200 caractères", () => {
    rendreRangee({ titre: TITRE_DE_200 });
    const lien = screen.getByRole("link", { name: TITRE_DE_200 });
    expect(lien.getAttribute("href")).toBe("#/page/a");
    expect(lien.textContent).toBe(TITRE_DE_200);
  });

  it("F-004-AC25 une rangée ne porte que deux boutons d'action, sans libellé visible", () => {
    rendreRangee();
    const boutons = screen.getAllByRole("button");
    expect(boutons.map((bouton) => bouton.getAttribute("aria-label"))).toEqual([
      "Ajouter une sous-page à « Carnet »",
      "Actions de la page « Carnet »",
    ]);
    for (const bouton of boutons) {
      expect(bouton.textContent).toBe("");
      expect(bouton.getAttribute("tabindex")).toBeNull();
    }
  });

  it("F-004-AC25 au repos, la tabulation passe par le repli, le lien, puis les deux actions", async () => {
    const clavier = userEvent.setup();
    const repli = { nom: "Sous-pages de « Carnet »", deplie: true, surBascule: vi.fn() };
    const proprietes = rendreRangee({ repli });
    const noms: (string | null)[] = [];
    for (let rang = 0; rang < 4; rang += 1) {
      await clavier.tab();
      noms.push(
        document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent ??
          null,
      );
    }
    expect(noms).toEqual([repli.nom, "Carnet", proprietes.ajout.nom, proprietes.actions.nom]);

    await clavier.keyboard("{Enter}");
    expect(proprietes.actions.surActivation).toHaveBeenCalledTimes(1);
    expect(proprietes.ajout.surActivation).not.toHaveBeenCalled();
  });

  it("F-004-AC28 seule la rangée courante porte aria-current et le repère non textuel", () => {
    const { container } = render(
      <ul>
        <Rangee {...rangee({ titre: "Une", courante: true })} />
        <Rangee {...rangee({ titre: "Autre" })} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Une" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Autre" }).getAttribute("aria-current")).toBeNull();
    const reperes = container.querySelectorAll("span.fond-accent");
    expect(reperes).toHaveLength(1);
    expect(reperes[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(reperes[0]?.textContent).toBe("");
    expect(reperes[0]?.closest("li")?.textContent).toBe("Une");
  });

  it("F-004-AC56 la commande de repli garde son nom, son état est porté par aria-expanded", async () => {
    const repli = { nom: "Sous-pages de « Carnet »", deplie: false, surBascule: vi.fn() };
    const { rerender } = render(
      <ul>
        <Rangee {...rangee({ repli })} />
      </ul>,
    );
    const commande = screen.getByRole("button", { name: repli.nom });
    expect(commande.getAttribute("aria-expanded")).toBe("false");
    expect(commande.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await userEvent.click(commande);
    expect(repli.surBascule).toHaveBeenCalledTimes(1);

    rerender(
      <ul>
        <Rangee {...rangee({ repli: { ...repli, deplie: true } })} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: repli.nom }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("F-004-AC55 la liste reste plate : un li au niveau donné, aucun rôle d'arbre", () => {
    const { container } = render(
      <ul>
        <Rangee {...rangee({ niveau: 3 })} />
      </ul>,
    );
    expect(screen.getByRole("listitem").getAttribute("aria-level")).toBe("3");
    expect(container.querySelector('[role="tree"], [role="treeitem"], [role="group"]')).toBeNull();
    expect(container.querySelectorAll("li ul")).toHaveLength(0);
  });

  it("F-004-AC27 la saisie du titre prend la place du lien, dans la rangée même", () => {
    rendreRangee({
      saisie: <ChampTitre nom="Titre de la page" erreur={undefined} defaultValue="Carnet" />,
    });
    expect(screen.queryByRole("link")).toBeNull();
    const champ = screen.getByRole("textbox", { name: "Titre de la page" });
    expect(champ.closest("li")).toBe(screen.getByRole("listitem"));
    expect(champ.getAttribute("aria-invalid")).toBe("false");
  });
});

describe("ChampTitre", () => {
  it("F-004-AC27 un titre refusé marque le champ et le relie à son message", () => {
    render(<ChampTitre nom="Titre de la page" erreur="Le titre est trop long." defaultValue="x" />);
    const champ = screen.getByRole("textbox", { name: "Titre de la page" });
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    const message = screen.getByRole("alert");
    expect(message.textContent).toBe("Le titre est trop long.");
    expect(champ.getAttribute("aria-describedby")).toBe(message.id);
  });
});

describe("MenuActions", () => {
  const entrees = [
    { libelle: "Renommer", touches: ["F2"], surActivation: vi.fn() },
    { libelle: "Ajouter une sous-page", surActivation: vi.fn() },
    { libelle: "Mettre à la corbeille", surActivation: vi.fn() },
  ];

  it("F-004-AC26 un menu nommé d'après la page, trois entrées dans l'ordre, nommées par leur libellé", async () => {
    render(<MenuActions nom="Actions de la page « Carnet »" entrees={entrees} />);
    const menu = screen.getByRole("menu", { name: "Actions de la page « Carnet »" });
    const libelles = within(menu)
      .getAllByRole("menuitem")
      .map((entree) => entree.firstChild?.textContent);
    expect(libelles).toEqual(["Renommer", "Ajouter une sous-page", "Mettre à la corbeille"]);
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    expect(within(menu).getByRole("menuitem", { name: "Renommer" })).toBeDefined();
    expect(within(menu).getByRole("menuitem", { name: "Ajouter une sous-page" })).toBeDefined();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Mettre à la corbeille" }));
    expect(entrees[2]?.surActivation).toHaveBeenCalledTimes(1);
    expect(entrees[0]?.surActivation).not.toHaveBeenCalled();
  });

  it("F-004-AC31 le raccourci s'affiche dans un kbd et n'entre pas dans le nom accessible", () => {
    render(<MenuActions nom="Actions" entrees={entrees} />);
    const renommer = screen.getByRole("menuitem", { name: "Renommer" });
    const touche = renommer.querySelector("kbd");
    expect(touche?.getAttribute("aria-hidden")).toBe("true");
    expect(touche?.textContent).toBe("F2");
    expect(
      screen.getByRole("menuitem", { name: "Ajouter une sous-page" }).querySelector("kbd"),
    ).toBeNull();
  });

  it("F-004-AC14 F-004-AC49 le menu porte la classe nommée de son ouverture", () => {
    render(<MenuActions nom="Actions" entrees={entrees} />);
    expect(screen.getByRole("menu").classList.contains("depliage")).toBe(true);
  });
});

describe("barre latérale", () => {
  function tete(touches?: readonly string[]): ReactElement {
    return (
      <TeteDeBarre
        nomEspace="Espace"
        libelleNouvellePage="Nouvelle page"
        touches={touches}
        surNouvellePage={vi.fn()}
      />
    );
  }

  it("F-004-AC29 la tête porte le sceau, sans texte, et la seule entrée « Nouvelle page »", () => {
    const { container } = render(<CadreDeBarre nom="Pages" tete={tete()} />);
    const barre = screen.getByRole("navigation", { name: "Pages" });
    expect(
      within(barre)
        .getAllByRole("button")
        .map((bouton) => bouton.textContent),
    ).toEqual(["Nouvelle page"]);
    const sceau = container.querySelector("span.fond-accent");
    expect(sceau?.getAttribute("aria-hidden")).toBe("true");
    expect(sceau?.textContent).toBe("");
    expect(within(barre).queryByText("Rechercher")).toBeNull();
    expect(barre.querySelector("kbd")).toBeNull();
  });

  it("F-004-AC31 un raccourci déclaré s'affiche à côté de « Nouvelle page » sans entrer dans son nom", () => {
    render(<CadreDeBarre nom="Pages" tete={tete(["Mod", "N"])} />);
    const bouton = screen.getByRole("button", { name: "Nouvelle page" });
    expect(bouton.querySelectorAll("kbd kbd")).toHaveLength(2);
  });

  it("F-004-AC30 sans entrée, le pied n'est pas rendu ; avec une entrée, il suit l'arborescence", () => {
    const { container, rerender } = render(
      <CadreDeBarre nom="Pages" tete={tete()}>
        <Rangee {...rangee()} />
      </CadreDeBarre>,
    );
    expect(container.querySelectorAll("nav > div")).toHaveLength(2);
    rerender(
      <CadreDeBarre nom="Pages" tete={tete()} pied={<a href="#/corbeille">Corbeille</a>}>
        <Rangee {...rangee()} />
      </CadreDeBarre>,
    );
    const zones = container.querySelectorAll("nav > div");
    expect(zones).toHaveLength(3);
    expect(zones[2]?.textContent).toBe("Corbeille");
    expect(zones[1]?.querySelector("li")).not.toBeNull();
    expect(zones[1]?.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("F-004-AC16 le message d'une opération refusée s'annonce dans la barre", () => {
    render(<CadreDeBarre nom="Pages" tete={tete()} erreur="Cette page n'existe plus." />);
    expect(screen.getByRole("alert").textContent).toBe("Cette page n'existe plus.");
  });
});

describe("barre du haut", () => {
  const ancetres = [
    { titre: "Racine", adresse: "#/page/a" },
    { titre: "Milieu", adresse: "#/page/b" },
    { titre: "Mère", adresse: "#/page/c" },
  ];

  it("F-004-AC39 le fil liste les ancêtres de la racine à la page, la page courante non activable", () => {
    render(<FilAriane nom="Fil d'Ariane" ancetres={ancetres} courante="Page" />);
    const fil = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    const liens = within(fil).getAllByRole("link");
    expect(liens.map((lien) => [lien.textContent, lien.getAttribute("href")])).toEqual([
      ["Racine", "#/page/a"],
      ["Milieu", "#/page/b"],
      ["Mère", "#/page/c"],
    ]);
    const courante = within(fil).getByText("Page");
    expect(courante.getAttribute("aria-current")).toBe("page");
    expect(courante.closest("a")).toBeNull();
    expect(within(fil).getAllByRole("listitem").at(-1)?.textContent).toBe("Page");
  });

  it("F-004-AC39 replié, le fil garde la racine et la page, et passe le reste derrière une commande", async () => {
    const surOuverture = vi.fn();
    render(
      <FilAriane
        nom="Fil d'Ariane"
        ancetres={ancetres}
        courante="Page"
        repli={{ nom: "Afficher les pages intermédiaires", surOuverture }}
      />,
    );
    expect(screen.getAllByRole("link").map((lien) => lien.textContent)).toEqual(["Racine"]);
    expect(screen.getByText("Page").getAttribute("aria-current")).toBe("page");
    await userEvent.click(
      screen.getByRole("button", { name: "Afficher les pages intermédiaires" }),
    );
    expect(surOuverture).toHaveBeenCalledTimes(1);
  });

  it("F-004-AC39 un seul ancêtre ne se replie pas", () => {
    render(
      <FilAriane
        nom="Fil d'Ariane"
        ancetres={ancetres.slice(0, 1)}
        courante="Page"
        repli={{ nom: "Afficher les pages intermédiaires", surOuverture: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("F-004-AC40 la zone d'état est présente et vide tant que rien n'a échoué", () => {
    render(<BarreDuHaut etat={<ZoneEtat echec={undefined} />} />);
    const zone = screen.getByRole("status");
    expect(zone.textContent).toBe("");
    expect(zone.childElementCount).toBe(0);
    expect(zone.getAttribute("aria-label")).toBeNull();
    expect(zone.getAttribute("title")).toBeNull();
    expect(document.body.textContent).not.toMatch(/nregistr/);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("F-004-AC40 en échec, la zone dit « Non enregistré sur cet appareil » avec un repère non textuel", () => {
    render(<BarreDuHaut etat={<ZoneEtat echec="Non enregistré sur cet appareil" />} />);
    const zone = screen.getByRole("status");
    expect(zone.textContent).toBe("Non enregistré sur cet appareil");
    const repere = zone.querySelector("span");
    expect(repere?.getAttribute("aria-hidden")).toBe("true");
    expect(repere?.textContent).toBe("");
  });
});

describe("états", () => {
  it("F-004-AC14 l'indicateur de chargement et la tête de zone portent leurs classes nommées", () => {
    const { container } = render(
      <>
        <Chargement texte="Chargement…" />
        <EntetePage titre="Page" />
      </>,
    );
    const etat = screen.getByRole("status");
    expect(etat.textContent).toBe("Chargement…");
    const points = etat.querySelectorAll(".indicateur-chargement");
    expect(points).toHaveLength(3);
    expect(points[0]?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".apparition h1")?.textContent).toBe("Page");
  });

  it("F-004-AC48 le halo est décoratif et précède le titre sans l'envelopper", () => {
    const { container } = render(<EntetePage titre="Page" explication="Phrase." />);
    const halo = container.querySelector(".fond-halo");
    expect(halo?.getAttribute("aria-hidden")).toBe("true");
    expect(halo?.classList.contains("pointer-events-none")).toBe(true);
    expect(halo?.childElementCount).toBe(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page");
    expect(screen.getByText("Phrase.")).toBeDefined();
  });
});
