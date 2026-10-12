import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { recharger } from "./aides-coquille.tsx";
import { contenuEnregistre, ouvrirUnePage } from "./aides-page.tsx";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";
import { attendreLaZoneDeSaisie, entrerDansLEditeur, taper } from "./edition/aides-edition.tsx";

describe("ouverture d'une page", () => {
  it("F-003-AC1 la page sélectionnée affiche son éditeur sous son titre, lié à la base notionlike:page:<idEspace>:<idPage>", async () => {
    const page = await ouvrirUnePage("Carnet");

    const titre = screen.getByRole("heading", { level: 1, name: "Carnet" });
    const editeur = await attendreLaZoneDeSaisie();

    expect(titre.compareDocumentPosition(editeur) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(await nomsDesBases()).toContain(`notionlike:page:${page.idEspace}:${page.idPage}`);
  });

  it("F-003-AC3 le contenu saisi est retrouvé tel quel après rechargement", async () => {
    const page = await ouvrirUnePage("Carnet");
    entrerDansLEditeur();
    taper("# Titre");
    await act(() => laisserIndexedDbTravailler());
    const avant = await contenuEnregistre(page.idEspace, page.idPage);

    await recharger(page);
    const editeur = await attendreLaZoneDeSaisie();

    expect(avant).toBe('<heading level="1">Titre</heading>');
    await waitFor(() => expect(editeur.querySelector("h1")?.textContent).toBe("Titre"));
  });
});
