// Choix de colonne de date sans espace connu (F-021-AC6) : ni lu ni écrit sur l'appareil, tenu en
// mémoire ; l'espace connu, le choix enregistré sous sa clé est relu.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useColonneChoisie } from "../../src/vues-de-table/use-reglages-calendrier.ts";

const ESPACE = "3f2b8c1e-5a4d-4e6f-8a7b-9c0d1e2f3a4b";
const TABLE = "7a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

describe("réglages du calendrier sans espace connu (F-021-AC6)", () => {
  beforeEach(() => localStorage.clear());

  it("F-021-AC6 sans espace connu, rien n'est lu ni écrit ; l'espace connu, le choix enregistré est relu", () => {
    const { result, rerender } = renderHook(
      ({ idEspace }: { idEspace: string | undefined }) =>
        useColonneChoisie({ idEspace, idTable: TABLE }),
      { initialProps: { idEspace: undefined as string | undefined } },
    );
    expect(result.current[0]).toBeUndefined();
    act(() => result.current[1]("colonne-de-date"));
    expect(result.current[0]).toBe("colonne-de-date");
    expect(localStorage.length).toBe(0);

    rerender({ idEspace: ESPACE });
    expect(result.current[0]).toBeUndefined();
    act(() => result.current[1]("autre-colonne"));
    expect(localStorage.length).toBe(1);

    const relu = renderHook(() => useColonneChoisie({ idEspace: ESPACE, idTable: TABLE }));
    expect(relu.result.current[0]).toBe("autre-colonne");
  });
});
