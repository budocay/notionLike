// Dépli des ancêtres calculé au rendu (F-004-AC54) : l'état du document est relevé à chaque
// validation de rendu de l'application, par un `Profiler` de React posé autour d'elle.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { Profiler, StrictMode } from "react";
import { describe, expect, it } from "vitest";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import { Application } from "../src/interface/Application.tsx";
import { nomDuRepli, recevoir } from "./aides-coquille.tsx";
import { demarrerSession } from "./aides-facade.ts";

interface Releve {
  readonly titre: string | null;
  readonly rangeeCourante: string | null;
  readonly filCourant: string | null;
  readonly rangees: readonly (string | null)[];
}

function texteDe(racine: Element | null, selecteur: string): string | null {
  return racine?.querySelector(selecteur)?.textContent ?? null;
}

function releve(): Releve {
  const barre = document.querySelector('nav[aria-label="Pages"]');
  const fil = document.querySelector('nav[aria-label="Fil d\'Ariane"]');
  return {
    titre: texteDe(document.body, "main h1"),
    rangeeCourante: texteDe(barre, 'a[aria-current="page"]'),
    filCourant: texteDe(fil, '[aria-current="page"]'),
    rangees: [...(barre?.querySelectorAll("li a") ?? [])].map((lien) => lien.textContent),
  };
}

interface Montage {
  readonly session: SessionEspace;
  readonly utilisateur: UserEvent;
  readonly releves: Releve[];
  readonly idPetiteFille: string;
  readonly idFille: string;
}

/** Parent › Fille › Petite-fille et « Autre », reçues ; chaque validation de rendu est relevée. */
async function monter(): Promise<Montage> {
  const session = demarrerSession();
  const releves: Releve[] = [];
  render(
    <StrictMode>
      <Profiler id="application" onRender={() => releves.push(releve())}>
        <Application session={session} />
      </Profiler>
    </StrictMode>,
  );
  await screen.findByRole("button", { name: "Nouvelle page" });
  let idPetiteFille = "";
  let idFille = "";
  recevoir(session, (espace) => {
    const parent = espace.creerPage("Parent");
    idFille = espace.creerPage("Fille", { parent });
    idPetiteFille = espace.creerPage("Petite-fille", { parent: idFille });
    espace.creerPage("Autre");
  });
  return { session, utilisateur: userEvent.setup(), releves, idPetiteFille, idFille };
}

function lien(titre: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Pages" })).getByRole("link", {
    name: titre,
  });
}

function repli(titre: string): HTMLElement {
  return screen.getByRole("button", { name: nomDuRepli(titre) });
}

async function attendreLaSelection(titre: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(titre);
    expect(lien(titre).getAttribute("aria-current")).toBe("page");
    expect(
      screen
        .getByRole("navigation", { name: "Fil d'Ariane" })
        .querySelector('[aria-current="page"]')?.textContent,
    ).toBe(titre);
    expect(document.title).toBe(`${titre} · notionLike`);
  });
}

/** Aucune validation de rendu ne montre le titre de la page sans sa rangée courante ni son fil. */
function constaterLaCoherence(releves: readonly Releve[], titre: string): void {
  const montrent = releves.filter((un) => un.titre === titre);
  expect(montrent.length).toBeGreaterThan(0);
  for (const un of montrent) {
    expect(un.rangees).toContain(titre);
    expect(un.rangeeCourante).toBe(titre);
    expect(un.filCourant).toBe(titre);
  }
}

describe("dépli des ancêtres au rendu", () => {
  it("F-004-AC54 F-004-AC15 fragment changé vers une page de niveau 3 cachée sous sa racine repliée : aucune validation de rendu ne montre son titre sans sa rangée courante", async () => {
    const { utilisateur, releves, idPetiteFille } = await monter();
    await utilisateur.click(lien("Autre"));
    await attendreLaSelection("Autre");
    await utilisateur.click(repli("Parent"));
    expect(screen.queryByRole("link", { name: "Petite-fille" })).toBeNull();
    releves.length = 0;

    window.location.hash = `#/page/${idPetiteFille}`;

    await attendreLaSelection("Petite-fille");
    constaterLaCoherence(releves, "Petite-fille");
    expect(repli("Parent").getAttribute("aria-expanded")).toBe("true");
    expect(repli("Fille").getAttribute("aria-expanded")).toBe("true");
    expect(
      [...screen.getByRole("navigation", { name: "Fil d'Ariane" }).querySelectorAll("a")].map(
        (ancetre) => ancetre.textContent,
      ),
    ).toEqual(["Parent", "Fille"]);
  });

  it("F-004-AC54 retour par l'historique vers une page cachée : même constat, et le repli fait entre-temps est défait", async () => {
    const { utilisateur, releves, idPetiteFille } = await monter();
    window.location.hash = `#/page/${idPetiteFille}`;
    await attendreLaSelection("Petite-fille");
    await utilisateur.click(lien("Autre"));
    await attendreLaSelection("Autre");
    await utilisateur.click(repli("Fille"));
    await utilisateur.click(repli("Parent"));
    releves.length = 0;

    window.history.back();

    await attendreLaSelection("Petite-fille");
    constaterLaCoherence(releves, "Petite-fille");
  });

  it("F-004-AC54 lien du fil d'Ariane vers un ancêtre caché sous une page que l'utilisateur a repliée : même constat", async () => {
    const { utilisateur, releves, idPetiteFille } = await monter();
    window.location.hash = `#/page/${idPetiteFille}`;
    await attendreLaSelection("Petite-fille");
    await utilisateur.click(repli("Parent"));
    expect(screen.queryByRole("link", { name: "Fille" })).not.toBeNull();
    expect(lien("Parent")).toBeDefined();
    releves.length = 0;

    await utilisateur.click(
      within(screen.getByRole("navigation", { name: "Fil d'Ariane" })).getByRole("link", {
        name: "Fille",
      }),
    );

    await attendreLaSelection("Fille");
    constaterLaCoherence(releves, "Fille");
    expect(repli("Parent").getAttribute("aria-expanded")).toBe("true");
  });

  it("F-004-AC54 le repli d'un ancêtre de la page courante reste possible et tient tant que la page désignée ne change pas", async () => {
    const { session, utilisateur, idPetiteFille } = await monter();
    window.location.hash = `#/page/${idPetiteFille}`;
    await attendreLaSelection("Petite-fille");

    await utilisateur.click(repli("Parent"));
    recevoir(session, (espace) => void espace.creerPage("Arrivée ensuite"));

    expect(repli("Parent").getAttribute("aria-expanded")).toBe("false");
    expect(
      within(screen.getByRole("navigation", { name: "Pages" }))
        .getAllByRole("link")
        .map((rangee) => rangee.textContent),
    ).toEqual(["Parent", "Autre", "Arrivée ensuite"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Petite-fille");
  });
});
