// Ce que l'écran dit de l'enregistrement local pendant une coupure et à la reprise (F-030).
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { rendreApplication } from "./aides-coquille.tsx";
import { laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { annulerLesProchainsAjouts } from "./aides-reprise.ts";

describe("écran : jamais « enregistré » sans la preuve d'écriture", () => {
  it("F-030-AC26 (1) ouverture de l'application dont l'écriture de l'état complet est annulée : la session n'est jamais dite enregistrée, l'avertissement est affiché", async () => {
    annulerLesProchainsAjouts(1);
    const { session } = rendreApplication();
    const dites: boolean[] = [];
    session.abonner(() => {
      const etat = session.lireEtat();
      if (etat.phase === "pret") {
        dites.push(etat.enregistre);
      }
    });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("enregistrées"));
    await laisserIndexedDbTravailler();

    expect(dites).toEqual([false]);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
