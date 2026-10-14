// F-007 : écran de la corbeille, restauration et suppression définitive dans l'application.
import { act, screen, waitFor, within } from "@testing-library/react";
import { ErreurDocument } from "@notionlike/document";
import { describe, expect, it, vi } from "vitest";

import { messageErreur } from "../src/interface/messages.ts";
import {
  activerActionDeRangee,
  type CoquilleRendue,
  docDe,
  fermerLOnglet,
  ouvrirCoquille,
  recevoir,
  recharger,
  tabulerJusqua,
} from "./aides-coquille.tsx";
import { creerUnePage } from "./aides-page.tsx";
import {
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import { nomDeLaBaseDePage } from "./aides-session-page.tsx";

const CONTENU_NON_EFFACE =
  "La suppression est faite, mais le contenu de ces pages n'a pas pu être effacé de cet appareil.";
const PIEGE = '<img src="x" onerror="alert(1)">';

type SessionEspace = CoquilleRendue["session"];
type Operations = Extract<ReturnType<SessionEspace["lireEtat"]>, { phase: "pret" }>["operations"];

function operations(session: SessionEspace): Operations {
  const etat = session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return etat.operations;
}

function corbeilleLue(session: SessionEspace): string[] {
  const etat = session.lireEtat();
  return etat.phase === "pret" ? etat.arborescence.corbeille.map((page) => page.titre) : [];
}

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function entreeCorbeille(): HTMLElement {
  return within(barreLaterale()).getByRole("button", { name: "Corbeille" });
}

function dansLaPrincipale(): ReturnType<typeof within> {
  return within(screen.getByRole("main"));
}

function liste(): HTMLElement {
  return screen.getByRole("region", { name: "Pages de la corbeille" });
}

/** Titres affichés par la liste de la corbeille, dans l'ordre, avec leur détail. */
function lignes(): string[] {
  return within(liste())
    .queryAllByRole("listitem")
    .map((element) => element.firstElementChild?.firstElementChild?.textContent ?? "");
}

function liensDePages(): string[] {
  return within(barreLaterale())
    .queryAllByRole("link")
    .map((lien) => lien.textContent);
}

async function ouvrirLaCorbeille(coquille: CoquilleRendue): Promise<void> {
  await coquille.utilisateur.click(entreeCorbeille());
  await screen.findByRole("heading", { level: 1, name: "Corbeille" });
}

/** Racine > Parent > (Fille > Petite), Seconde ; Parent à la corbeille. */
async function espaceAvecCorbeille(): Promise<
  CoquilleRendue & Record<"racine" | "parent" | "fille" | "petite" | "seconde", string>
> {
  const coquille = await ouvrirCoquille();
  const ops = operations(coquille.session);
  let ids = { racine: "", parent: "", fille: "", petite: "", seconde: "" };
  act(() => {
    const racine = ops.creerPage("Racine");
    const parent = ops.creerPage("Parent", { parent: racine });
    const fille = ops.creerPage("Fille", { parent });
    const petite = ops.creerPage("Petite", { parent: fille });
    const seconde = ops.creerPage("Seconde", { parent: racine });
    ops.mettreALaCorbeille(parent);
    ids = { racine, parent, fille, petite, seconde };
  });
  return { ...coquille, ...ids };
}

function compterLesMisesAJour(session: SessionEspace): () => number {
  let nombre = 0;
  const compter = (): void => {
    nombre += 1;
  };
  docDe(session).on("update", compter);
  return () => {
    docDe(session).off("update", compter);
    return nombre;
  };
}

describe("écran de la corbeille", () => {
  it("F-007-AC1 l'entrée « Corbeille » affiche l'écran, inscrit #/corbeille, est marquée courante et aucune page n'est sélectionnée", async () => {
    const coquille = await espaceAvecCorbeille();
    await coquille.utilisateur.click(within(barreLaterale()).getByRole("link", { name: "Racine" }));
    expect(window.location.hash).toBe(`#/page/${coquille.racine}`);

    await ouvrirLaCorbeille(coquille);

    expect(window.location.hash).toBe("#/corbeille");
    expect(entreeCorbeille().getAttribute("aria-current")).toBe("page");
    expect(barreLaterale().querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 }).textContent).toBe(
      "Corbeille",
    );
  });

  it("F-007-AC1 ouverte ou rechargée à l'adresse #/corbeille, l'application affiche l'écran de la corbeille", async () => {
    window.location.hash = "#/corbeille";
    const coquille = await espaceAvecCorbeille();
    await screen.findByRole("heading", { level: 1, name: "Corbeille" });
    expect(lignes()).toContain("Parent");

    await recharger(coquille);

    expect(await screen.findByRole("heading", { level: 1, name: "Corbeille" })).toBeTruthy();
    expect(entreeCorbeille().getAttribute("aria-current")).toBe("page");
    expect(lignes()).toEqual(["Parent", "Fille", "Petite"]);
  });

  it("F-007-AC2 les racines dans l'ordre du document, « Sans titre » pour un titre vide, leur descendance dessous et le nombre de sous-pages", async () => {
    const coquille = await espaceAvecCorbeille();
    act(() => {
      const ops = operations(coquille.session);
      const vide = ops.creerPage("");
      ops.mettreALaCorbeille(vide);
    });
    await ouvrirLaCorbeille(coquille);

    const racines = within(liste())
      .getAllByRole("listitem")
      .filter((element) => {
        return element.parentElement?.parentElement === liste();
      });
    expect(
      racines.map((racine) => racine.firstElementChild?.firstElementChild?.textContent),
    ).toEqual(corbeilleLue(coquille.session).map((titre) => (titre === "" ? "Sans titre" : titre)));
    const parent = racines.find((racine) => racine.textContent.startsWith("Parent"));
    expect(parent?.textContent).toContain("2 sous-pages");
    expect(
      within(parent as HTMLElement)
        .getAllByRole("listitem")
        .map((ligne) => ligne.getAttribute("aria-level")),
    ).toEqual(["2", "3"]);
    expect(lignes()).toEqual(["Parent", "Fille", "Petite", "Sans titre"]);
    expect(racines.at(-1)?.textContent).toContain("Aucune sous-page");
  });

  it("F-007-AC3 corbeille vide : « La corbeille est vide », ni restauration ni suppression", async () => {
    const coquille = await ouvrirCoquille();
    await ouvrirLaCorbeille(coquille);

    expect(liste().textContent).toBe("La corbeille est vide");
    const principale = screen.getByRole("main");
    expect(within(principale).queryAllByRole("button")).toEqual([]);
  });

  it("F-007-AC4 la liste suit la corbeille sans rechargement : mise à la corbeille depuis la barre latérale, puis mise à jour reçue", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);

    await activerActionDeRangee(coquille.utilisateur, "mettre-a-la-corbeille", "Seconde");
    await waitFor(() => expect(lignes()).toContain("Seconde"));
    recevoir(coquille.session, (espace) => espace.restaurerPage(coquille.parent));

    expect(lignes()).toEqual(["Seconde"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Corbeille");
  });
});

describe("restaurer", () => {
  it("F-007-AC5 F-007-AC6 la racine restaurée revient sous son parent, à sa place, avec sa descendance non jetée ; on reste sur l'écran, « Page restaurée » est annoncé", async () => {
    const coquille = await espaceAvecCorbeille();
    act(() => {
      const ops = operations(coquille.session);
      ops.restaurerPage(coquille.parent);
      ops.mettreALaCorbeille(coquille.petite);
      ops.mettreALaCorbeille(coquille.parent);
    });
    await ouvrirLaCorbeille(coquille);

    await coquille.utilisateur.click(screen.getByRole("button", { name: "Restaurer « Parent »" }));

    expect(window.location.hash).toBe("#/corbeille");
    expect(dansLaPrincipale().getByRole("status").textContent).toBe("Page restaurée");
    expect(liensDePages()).toEqual(["Racine", "Parent", "Fille", "Seconde"]);
    expect(lignes()).toEqual(["Petite"]);
    expect(within(liste()).getByRole("button", { name: "Restaurer « Petite »" })).toBeTruthy();
  });

  it("F-007-AC8 restaurer n'est proposé que sur une racine ; supprimer l'est sur toute page de la corbeille", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);

    const noms = within(liste())
      .getAllByRole("button")
      .map((bouton) => bouton.getAttribute("aria-label"));
    expect(noms).toEqual([
      "Restaurer « Parent »",
      "Supprimer définitivement « Parent »",
      "Supprimer définitivement « Fille »",
      "Supprimer définitivement « Petite »",
    ]);
  });
});

describe("supprimer définitivement", () => {
  it("F-007-AC9 la confirmation cite le titre, le nombre de sous-pages et l'irréversibilité, et rien n'est modifié avant ; Annuler et Échap la ferment sans rien modifier, focus rendu", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);
    const misesAJour = compterLesMisesAJour(coquille.session);
    const origine = screen.getByRole("button", { name: "Supprimer définitivement « Parent »" });

    await coquille.utilisateur.click(origine);
    const boite = screen.getByRole("alertdialog", {
      name: "Supprimer définitivement « Parent » ?",
    });
    expect(boite.textContent).toContain(
      "Cette page et ses 2 sous-pages seront supprimées de l'application et de cet appareil.",
    );
    expect(boite.textContent).toContain("irréversible");
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    await coquille.utilisateur.click(within(boite).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(origine);

    await coquille.utilisateur.click(origine);
    await coquille.utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(origine);
    expect(misesAJour()).toBe(0);
    expect(lignes()).toEqual(["Parent", "Fille", "Petite"]);
  });

  it("F-007-AC10 confirmée, la suppression retire la page et sa descendance de la corbeille et de l'arborescence, et l'adresse de chacune affiche « Page introuvable »", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);

    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );
    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « Parent »",
      }),
    );

    expect(liste().textContent).toBe("La corbeille est vide");
    expect(dansLaPrincipale().getByRole("status").textContent).toBe(
      "Page supprimée définitivement",
    );
    expect(corbeilleLue(coquille.session)).toEqual([]);
    for (const id of [coquille.parent, coquille.fille, coquille.petite]) {
      act(() => {
        window.location.hash = `#/page/${id}`;
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Page introuvable");
    }
  });

  it("F-007-AC11 F-007-AC12 F-007-AC25 après suppression et rechargement : même arborescence et même corbeille, et aucune base de page des pages supprimées sur l'appareil", async () => {
    const coquille = await ouvrirCoquille();
    const jetee = await creerUnePage(coquille, "À jeter");
    const gardee = await creerUnePage(coquille, "Gardée");
    act(() => operations(coquille.session).mettreALaCorbeille(jetee.idPage));
    await ouvrirLaCorbeille(coquille);
    const baseJetee = nomDeLaBaseDePage(jetee);
    expect(await nomsDesBases()).toContain(baseJetee);

    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « À jeter »" }),
    );
    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « À jeter »",
      }),
    );
    await act(() => laisserIndexedDbTravailler());
    const avant = coquille.session.lireEtat();
    const rechargee = await recharger(coquille);

    const apres = rechargee.session.lireEtat();
    expect(apres.phase === "pret" && avant.phase === "pret").toBe(true);
    if (apres.phase === "pret" && avant.phase === "pret") {
      expect(apres.arborescence).toEqual(avant.arborescence);
    }
    const bases = await nomsDesBases();
    expect(bases).not.toContain(baseJetee);
    expect(bases).toContain(nomDeLaBaseDePage(gardee));
    expect(dansLaPrincipale().queryByRole("alert")).toBeNull();
  });

  it("F-007-AC12 après une restauration et un rechargement, même arborescence et même corbeille", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);
    await coquille.utilisateur.click(screen.getByRole("button", { name: "Restaurer « Parent »" }));
    await act(() => laisserIndexedDbTravailler());

    await recharger(coquille);

    expect(liensDePages()).toEqual(["Racine", "Parent", "Fille", "Petite", "Seconde"]);
    expect(liste().textContent).toBe("La corbeille est vide");
  });
});

describe("accessibilité", () => {
  it("F-007-AC17 au clavier seul : l'entrée, la restauration, la suppression ; boîte d'alerte qui retient le focus, puis le rend à la liste quand la commande a disparu", async () => {
    const coquille = await espaceAvecCorbeille();
    const { utilisateur } = coquille;
    await tabulerJusqua(utilisateur, entreeCorbeille);
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("heading", { level: 1, name: "Corbeille" });

    const supprimer = (): HTMLElement =>
      screen.getByRole("button", { name: "Supprimer définitivement « Petite »" });
    await tabulerJusqua(utilisateur, supprimer);
    await utilisateur.keyboard("{Enter}");
    const boite = screen.getByRole("alertdialog");
    const [annuler, confirmer] = within(boite).getAllByRole("button");
    expect(document.activeElement).toBe(annuler);
    await utilisateur.tab();
    expect(document.activeElement).toBe(confirmer);
    await utilisateur.tab();
    expect(document.activeElement).toBe(annuler);
    await utilisateur.tab({ shift: true });
    expect(document.activeElement).toBe(confirmer);
    await utilisateur.keyboard("{Enter}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(liste());
    expect(lignes()).toEqual(["Parent", "Fille"]);

    const restaurer = (): HTMLElement =>
      screen.getByRole("button", { name: "Restaurer « Parent »" });
    await tabulerJusqua(utilisateur, restaurer);
    await utilisateur.keyboard("{Enter}");
    expect(liensDePages()).toContain("Parent");
    expect(document.activeElement).toBe(liste());
  });

  it("F-007-AC17 le reste de la page est inerte tant que la boîte est ouverte", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);

    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );

    expect(barreLaterale().closest("[inert]")).not.toBeNull();
    expect(liste().closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("alertdialog").closest("[inert]")).toBeNull();
  });
});

describe("erreurs et limites", () => {
  it("F-007-AC20 une suppression refusée parce qu'une mise à jour reçue a restauré la page : message français sans code, liste conforme, écran utilisable", async () => {
    const coquille = await espaceAvecCorbeille();
    act(() => operations(coquille.session).mettreALaCorbeille(coquille.seconde));
    await ouvrirLaCorbeille(coquille);
    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );
    recevoir(coquille.session, (espace) => espace.restaurerPage(coquille.parent));

    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « Parent »",
      }),
    );

    const alerte = dansLaPrincipale().getByRole("alert");
    expect(alerte.textContent).toBe(messageErreur("page-hors-corbeille"));
    expect(alerte.textContent).not.toMatch(/page-hors-corbeille|[a-z]+-[a-z]+-[a-z]+/);
    expect(lignes()).toEqual(["Seconde"]);
    await coquille.utilisateur.click(screen.getByRole("button", { name: "Restaurer « Seconde »" }));
    expect(liste().textContent).toBe("La corbeille est vide");
  });

  it("F-007-AC20 une restauration refusée par le document : message français sans code, liste conforme à la corbeille lue", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);
    vi.spyOn(operations(coquille.session), "restaurerPage").mockImplementation(() => {
      throw new ErreurDocument("page-introuvable", "Aucune page.");
    });

    await coquille.utilisateur.click(screen.getByRole("button", { name: "Restaurer « Parent »" }));

    expect(dansLaPrincipale().getByRole("alert").textContent).toBe(
      messageErreur("page-introuvable"),
    );
    expect(dansLaPrincipale().queryByRole("status")).toBeNull();
    expect(lignes()).toEqual(["Parent", "Fille", "Petite"]);
  });

  it("F-007-AC21 un effacement en échec maintient la suppression et affiche l'avertissement, sans erreur non interceptée", async () => {
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);
    vi.spyOn(indexedDB, "deleteDatabase").mockImplementation(() => {
      throw new DOMException("refus", "UnknownError");
    });

    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );
    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « Parent »",
      }),
    );

    expect((await dansLaPrincipale().findByRole("alert")).textContent).toBe(CONTENU_NON_EFFACE);
    expect(corbeilleLue(coquille.session)).toEqual([]);
    expect(dansLaPrincipale().getByRole("status").textContent).toBe(
      "Page supprimée définitivement",
    );
  });

  it("F-007-AC21 persistance de l'espace coupée : l'effacement n'est pas tenté, la suppression est maintenue et l'avertissement affiché", async () => {
    const connexions = suivreLesConnexionsTenues();
    const coquille = await espaceAvecCorbeille();
    await ouvrirLaCorbeille(coquille);
    const suppression = vi.spyOn(indexedDB, "deleteDatabase");
    const deLEspace = connexions.find((connexion) =>
      connexion.name.startsWith("notionlike:espace:"),
    );
    act(() => fermerDeForce(deLEspace as IDBDatabase));
    await waitFor(() => expect(coquille.session.lireEtat()).toMatchObject({ enregistre: false }));

    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );
    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « Parent »",
      }),
    );

    expect((await dansLaPrincipale().findByRole("alert")).textContent).toBe(CONTENU_NON_EFFACE);
    expect(suppression).not.toHaveBeenCalled();
    expect(corbeilleLue(coquille.session)).toEqual([]);
  });

  it("F-007-AC22 un titre fait de balisage s'affiche comme du texte dans la liste, les noms accessibles et la confirmation", async () => {
    const coquille = await ouvrirCoquille();
    act(() => {
      const ops = operations(coquille.session);
      ops.mettreALaCorbeille(ops.creerPage(PIEGE));
    });
    await ouvrirLaCorbeille(coquille);

    expect(lignes()).toEqual([PIEGE]);
    const supprimer = screen.getByRole("button", { name: `Supprimer définitivement « ${PIEGE} »` });
    expect(screen.getByRole("button", { name: `Restaurer « ${PIEGE} »` })).toBeTruthy();
    await coquille.utilisateur.click(supprimer);
    expect(
      screen.getByRole("alertdialog", { name: `Supprimer définitivement « ${PIEGE} » ?` }),
    ).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("F-007-AC23 aucune requête réseau : restaurer, supprimer et effacer fonctionnent réseau coupé", async () => {
    const requetes = vi.fn(() => {
      throw new TypeError("réseau coupé");
    });
    vi.stubGlobal("fetch", requetes);
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(requetes);
    vi.stubGlobal("WebSocket", requetes);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const coquille = await espaceAvecCorbeille();
    act(() => operations(coquille.session).mettreALaCorbeille(coquille.seconde));
    await ouvrirLaCorbeille(coquille);

    await coquille.utilisateur.click(screen.getByRole("button", { name: "Restaurer « Seconde »" }));
    await coquille.utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement « Parent »" }),
    );
    await coquille.utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Supprimer définitivement « Parent »",
      }),
    );
    await act(() => laisserIndexedDbTravailler());

    expect(requetes).not.toHaveBeenCalled();
    expect(liste().textContent).toBe("La corbeille est vide");
    expect(dansLaPrincipale().queryByRole("alert")).toBeNull();
    fermerLOnglet(coquille);
  });
});
