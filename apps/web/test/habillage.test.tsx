// Habillage des écrans et des états de F-002 par les composants de F-004 (F-004-AC14, AC16), sous
// jsdom : chaque état passe par son composant de présentation, et ses textes restent ceux de F-002
// (F-004-AC17). Les styles eux-mêmes ne se voient que dans un navigateur.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import * as messages from "../src/interface/messages.ts";
import {
  docDe,
  ouvrirCoquille,
  recevoir,
  rendreApplication,
  versionInconnueVenueDAilleurs,
} from "./aides-coquille.tsx";
import { lire } from "./aides-disque.ts";
import { controlerAnimationsDeBase } from "./aides-styles.ts";

/** Les trois animations de base de F-004-AC14 : apparition, dépliage, indicateur de chargement. */
const ANIMATIONS_DE_BASE = ["apparition", "depliage", "indicateur-chargement"];

function classesDe(element: Element | null | undefined): string[] {
  return [...(element?.classList ?? [])];
}

describe("états habillés", () => {
  it("F-004-AC14 F-004-AC16 l'état de chargement porte l'indicateur à trois points et le seul texte « Chargement… »", async () => {
    rendreApplication();

    const etat = screen.getByRole("status");
    expect(etat.textContent).toBe("Chargement…");
    const points = etat.querySelectorAll(".indicateur-chargement");
    expect(points).toHaveLength(3);
    expect(points[0]?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(etat.closest("main")).not.toBeNull();
    await screen.findByRole("button", { name: "Nouvelle page" });
  });

  it("F-004-AC16 F-004-AC17 l'écran hors contexte sécurisé est habillé, son titre et son explication sont ceux de F-002", () => {
    vi.stubGlobal("crypto", {});

    rendreApplication();

    const alerte = screen.getByRole("alert");
    expect(within(alerte).getByRole("heading", { level: 1 }).textContent).toBe(
      "Adresse non sécurisée",
    );
    expect(alerte.querySelector("p")?.textContent).toBe(messages.EXPLICATION_CONTEXTE_NON_SECURISE);
    expect(classesDe(alerte)).toContain("bg-surface-relief");
    expect(classesDe(alerte.closest("main"))).toContain("min-h-dvh");
  });

  it("F-004-AC16 F-004-AC17 l'écran bloquant de version est habillé, son titre et son explication sont ceux de F-002", async () => {
    const { session } = await ouvrirCoquille();
    const miseAJour = versionInconnueVenueDAilleurs(session);

    act(() => Y.applyUpdate(docDe(session), miseAJour));

    const alerte = screen.getByRole("alert");
    expect(within(alerte).getByRole("heading", { level: 1 }).textContent).toBe(
      "Mise à jour nécessaire",
    );
    expect(alerte.querySelector("p")?.textContent).toBe(
      messages.EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
    );
    expect(classesDe(alerte)).toContain("bg-surface-relief");
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("F-004-AC16 l'avertissement de persistance est habillé, avec son repère, au-dessus de la barre du haut", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await ouvrirCoquille();

    const alerte = screen.getByRole("alert");
    expect(alerte.textContent).toBe(messages.AVERTISSEMENT_NON_ENREGISTRE);
    expect(classesDe(alerte)).toContain("text-texte-avertissement");
    expect(alerte.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(
      alerte.compareDocumentPosition(screen.getByRole("banner")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("F-004-AC14 F-004-AC16 F-004-AC48 la zone principale porte le halo et l'apparition, rejouée quand la page sélectionnée change ; accueil et page introuvable gardent leurs textes", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const zone = screen.getByRole("main");
    expect(within(zone).getByRole("heading", { level: 1 }).textContent).toBe("notionLike");
    expect(zone.textContent).toContain(messages.INVITATION_PREMIERE_PAGE);
    recevoir(session, (espace) => {
      espace.creerPage("Une");
      espace.creerPage("Autre");
    });
    expect(zone.textContent).toContain(messages.INVITATION_CHOISIR_UNE_PAGE);

    await utilisateur.click(screen.getByRole("link", { name: "Une" }));
    await waitFor(() => expect(zone.querySelector("h1")?.textContent).toBe("Une"));
    const premiere = zone.querySelector(".apparition");
    expect(premiere?.querySelector("h1")?.textContent).toBe("Une");
    const halo = zone.querySelector(".fond-halo");
    expect(halo?.getAttribute("aria-hidden")).toBe("true");
    expect(classesDe(halo)).toContain("pointer-events-none");

    await utilisateur.click(screen.getByRole("link", { name: "Autre" }));
    await waitFor(() => expect(zone.querySelector("h1")?.textContent).toBe("Autre"));
    expect(zone.querySelector(".apparition")).not.toBe(premiere);

    window.location.hash = "#/page/5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
    await waitFor(() => expect(zone.querySelector("h1")?.textContent).toBe("Page introuvable"));
    expect(zone.textContent).toContain(messages.EXPLICATION_PAGE_INTROUVABLE);
  });

  it("F-004-AC14 la descendance d'une page se déplie avec la classe nommée du dépliage, que les racines ne portent pas", async () => {
    const { session } = await ouvrirCoquille();
    recevoir(session, (espace) => {
      const mere = espace.creerPage("Mère");
      espace.creerPage("Fille", { parent: mere });
    });

    const [mere, fille] = screen.getAllByRole("listitem");
    expect(classesDe(mere)).not.toContain("depliage");
    expect(classesDe(fille)).toContain("depliage");
  });

  it("F-004-AC14 chacune des trois animations de base est une classe nommée déclarée une seule fois", () => {
    expect(controlerAnimationsDeBase(lire("src/styles/entree.css"), ANIMATIONS_DE_BASE)).toEqual(
      [],
    );
  });

  it("F-004-AC21 F-004-AC14 une animation de base déclarée deux fois, ou qui n'est plus déclarée, est nommée", () => {
    const conforme =
      "@utility apparition {\n}\n@utility depliage {\n}\n@utility indicateur-chargement {\n}\n/* @utility depliage { */";
    expect(controlerAnimationsDeBase(conforme, ANIMATIONS_DE_BASE)).toEqual([]);
    expect(
      controlerAnimationsDeBase(`${conforme}\n@utility depliage {\n}`, ANIMATIONS_DE_BASE),
    ).toEqual(["src/styles/entree.css : la classe depliage est déclarée 2 fois, une attendue"]);
    expect(
      controlerAnimationsDeBase(conforme.replace("@utility apparition {", ""), ANIMATIONS_DE_BASE),
    ).toEqual(["src/styles/entree.css : la classe apparition est déclarée 0 fois, une attendue"]);
  });

  it("F-004-AC17 F-004-AC52 les textes des états de F-002 n'ont pas changé", () => {
    expect([
      messages.NOM_APPLICATION,
      messages.NOM_BARRE_LATERALE,
      messages.NOUVELLE_PAGE,
      messages.CHARGEMENT,
      messages.PAGE_INTROUVABLE,
      messages.TITRE_DE_LA_PAGE,
      messages.titreAffiche(" "),
      messages.TITRE_CONTEXTE_NON_SECURISE,
      messages.TITRE_VERSION_NON_PRISE_EN_CHARGE,
    ]).toEqual([
      "notionLike",
      "Pages",
      "Nouvelle page",
      "Chargement…",
      "Page introuvable",
      "Titre de la page",
      "Sans titre",
      "Adresse non sécurisée",
      "Mise à jour nécessaire",
    ]);
    expect(messages.AVERTISSEMENT_NON_ENREGISTRE).toBe(
      "Vos modifications ne sont pas enregistrées sur cet appareil : le stockage du navigateur est indisponible. Elles seront perdues à la fermeture ou au rechargement de l'onglet.",
    );
    expect(messages.messageErreur("titre-trop-long")).toBe(
      "Le titre est trop long : la limite est de 200 caractères.",
    );
  });
});
