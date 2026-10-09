// F-030 : ce que l'onglet déclenche de lui-même (retour de visibilité, AC2), et ce qu'une
// persistance fermée ne déclenche plus (AC11).
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  docDe,
  ouvrirCoquille,
  rendreApplication,
  versionInconnueVenueDAilleurs,
} from "./aides-coquille.tsx";
import {
  laisserIndexedDbTravailler,
  refuserLesOuverturesParUneException,
} from "./aides-persistance.ts";
import { instantsDesOuvertures, rendreLOnglet, simulerLHorloge } from "./aides-reprise.ts";

const DIX_MINUTES_MS = 600_000;

describe("retour de visibilité de l'onglet", () => {
  it("F-030-AC2 l'onglet redevient visible pendant une coupure : une tentative est lancée aussitôt, sans attendre la cadence ; un passage à l'état masqué sans modification n'en lance pas", async () => {
    simulerLHorloge();
    vi.setSystemTime(0);
    refuserLesOuverturesParUneException();
    const instants = instantsDesOuvertures();
    rendreApplication();
    await act(() => laisserIndexedDbTravailler());
    act(() => void vi.advanceTimersByTime(6_000));
    expect(instants).toEqual([0, 2_000, 6_000]);

    act(() => void vi.advanceTimersByTime(3_000));
    rendreLOnglet("hidden");
    expect(instants).toEqual([0, 2_000, 6_000]);
    rendreLOnglet("visible");

    expect(instants).toEqual([0, 2_000, 6_000, 9_000]);
    rendreLOnglet("visible");
    expect(instants).toEqual([0, 2_000, 6_000, 9_000]);
  });

  it("F-030-AC2 retour de visibilité sans coupure : aucune demande d'ouverture", async () => {
    await ouvrirCoquille();
    const instants = instantsDesOuvertures();

    rendreLOnglet("hidden");
    rendreLOnglet("visible");

    expect(instants).toEqual([]);
  });
});

describe("persistance fermée : plus aucun signal de l'onglet n'est suivi", () => {
  it("F-030-AC11 session fermée pendant une coupure : ni dix minutes de cadence ni un retour de visibilité ne demandent d'ouverture, et l'écouteur de visibilité est retiré", async () => {
    simulerLHorloge();
    refuserLesOuverturesParUneException();
    const retraits = vi.spyOn(document, "removeEventListener");
    const instants = instantsDesOuvertures();
    const { session } = rendreApplication();
    await act(() => laisserIndexedDbTravailler());
    expect(session.lireEtat()).toMatchObject({ phase: "pret", enregistre: false });
    const avant = instants.length;

    act(() => session.fermer());
    act(() => void vi.advanceTimersByTime(DIX_MINUTES_MS));
    rendreLOnglet("visible");

    expect(instants).toHaveLength(avant);
    expect(vi.getTimerCount()).toBe(0);
    expect(retraits.mock.calls.map(([type]) => type)).toContain("visibilitychange");
  });

  it("F-030-AC11 document de version non prise en charge : la persistance est fermée par le refus, ni dix minutes de cadence ni un retour de visibilité ne demandent d'ouverture", async () => {
    const { session } = await ouvrirCoquille();
    const miseAJour = versionInconnueVenueDAilleurs(session);
    simulerLHorloge();
    act(() => Y.applyUpdate(docDe(session), miseAJour));
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(screen.getByRole("alert").textContent).toContain("à jour");
    const instants = instantsDesOuvertures();

    act(() => void vi.advanceTimersByTime(DIX_MINUTES_MS));
    rendreLOnglet("visible");
    await act(() => laisserIndexedDbTravailler());

    expect(instants).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
