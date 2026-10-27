// Interface du module de glisser-déposer pour des éléments répartis en plusieurs conteneurs (F-020-AC25,
// AC12, AC21) : trois piles dont une vide, le geste au pointeur sous jsdom avec une mise en page
// bouchonnée (veille du 2026-10-27, H6), la nature de la cible et la pile rendues au lâcher, les
// annonces en français, l'abandon par Échap. Aucun type de la bibliothèque n'apparaît ici.
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  type AnnoncesDesPiles,
  type DepotSurUnePile,
  PileGlissable,
  PilesGlissables,
  useElementGlissable,
} from "../src/glisser/index.ts";

// ——— Mise en page bouchonnée : piles de 180 de large espacées de 200, cartes de 40 de haut espacées de 44 ———

const PILES = ["A", "B", "C"] as const;
type Pile = (typeof PILES)[number];

function rectangleDe(element: Element): DOMRect | null {
  const [gauche, haut, largeur, hauteur] = (element.getAttribute("data-rect") ?? "")
    .split(",")
    .map(Number);
  if (
    gauche === undefined ||
    haut === undefined ||
    largeur === undefined ||
    hauteur === undefined
  ) {
    return null;
  }
  return {
    left: gauche,
    top: haut,
    width: largeur,
    height: hauteur,
    right: gauche + largeur,
    bottom: haut + hauteur,
    x: gauche,
    y: haut,
    toJSON: () => ({}),
  } as DOMRect;
}

const originale = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectangleDe(this) ?? originale.call(this);
  };
  for (const propriete of ["offsetHeight", "offsetWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, propriete, {
      configurable: true,
      get(this: HTMLElement) {
        const rectangle = rectangleDe(this);
        return rectangle === null
          ? 0
          : propriete === "offsetHeight"
            ? rectangle.height
            : rectangle.width;
      },
    });
  }
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originale;
  for (const propriete of ["offsetHeight", "offsetWidth"] as const) {
    Reflect.deleteProperty(HTMLElement.prototype, propriete);
  }
});
afterEach(cleanup);

// ——— Montage ———

const CONTENU: Record<Pile, readonly string[]> = { A: ["a1", "a2"], B: ["b1"], C: [] };

function Carte({
  id,
  rang,
  pile,
}: {
  readonly id: string;
  readonly rang: number;
  readonly pile: Pile;
}) {
  const element = useElementGlissable(id);
  return (
    <li
      ref={element.ref}
      id={id}
      data-rect={`${String(PILES.indexOf(pile) * 200)},${String(rang * 44 + 30)},180,40`}
      data-zone={element.zone ?? ""}
      aria-describedby={element.idDesInstructions}
      {...element.ecouteursDuPointeur}
    >
      {id}
    </li>
  );
}

function ZoneDePile({ pile }: { readonly pile: Pile }) {
  return (
    <PileGlissable id={pile} identifiants={CONTENU[pile]} desactivee={false}>
      {(zone) => (
        <ul
          ref={zone.ref}
          id={`pile-${pile}`}
          data-rect={`${String(PILES.indexOf(pile) * 200)},0,180,400`}
          data-survolee={String(zone.survolee)}
        >
          {CONTENU[pile].map((id, rang) => (
            <Carte key={id} id={id} rang={rang} pile={pile} />
          ))}
        </ul>
      )}
    </PileGlissable>
  );
}

const annonces = (): AnnoncesDesPiles => ({
  instructions: "Glissez la carte avec la souris.",
  saisie: (actif) => `Carte ${actif} saisie.`,
  survol: (actif, depot) =>
    `Carte ${actif} irait ${depot?.sorte === "pile" ? "dans" : (depot?.zone ?? "?")} la pile ${depot?.pile ?? "?"}.`,
  depot: (actif, depot) => `Carte ${actif} déposée, pile ${depot?.pile ?? "aucune"}.`,
  abandon: (actif) => `Geste de la carte ${actif} abandonné.`,
});

function monter(
  options: { readonly desactivee?: boolean; readonly identifiants?: readonly string[] } = {},
) {
  const surLacher = vi.fn<(depot: DepotSurUnePile) => void>();
  const textes = annonces();
  const tout = [...PILES, ...Object.values(CONTENU).flat()];
  const rendu = render(
    <StrictMode>
      <PilesGlissables
        identifiants={options.identifiants ?? tout}
        desactivee={options.desactivee ?? false}
        surLacher={surLacher}
        annonces={textes}
      >
        {PILES.map((pile) => (
          <ZoneDePile key={pile} pile={pile} />
        ))}
      </PilesGlissables>
    </StrictMode>,
  );
  return { surLacher, ...rendu };
}

// ——— Gestes au pointeur ———

const attendre = () => act(() => new Promise<void>((suite) => setTimeout(suite, 40)));

function evenement(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    isPrimary: true,
  });
}

async function glisser(depart: Element, ...points: readonly (readonly [number, number])[]) {
  await act(async () => {
    depart.dispatchEvent(evenement("pointerdown", 10, 80));
  });
  for (const [x, y] of [[20, 80] as const, ...points]) {
    await act(async () => {
      document.dispatchEvent(evenement("pointermove", x, y));
    });
    await attendre();
  }
}

async function lacher(x: number, y: number) {
  await act(async () => {
    document.dispatchEvent(evenement("pointerup", x, y));
  });
  await attendre();
}

const region = (): string => document.querySelector("[aria-live]")?.textContent ?? "";

describe("tri entre plusieurs conteneurs (F-020-AC25)", () => {
  it("F-020-AC25 F-020-AC12 lâcher sur une carte d'une autre pile : nature « carte », pile, carte et moitié survolée (haut : avant, bas : après)", async () => {
    const { container, surLacher } = monter();
    const a2 = container.querySelector("#a2") as Element;

    await glisser(a2, [220, 40]);
    expect(container.querySelector("#b1")?.getAttribute("data-zone")).toBe("avant");
    await lacher(220, 40);
    expect(surLacher).toHaveBeenCalledWith({
      sorte: "carte",
      actif: "a2",
      pile: "B",
      cible: "b1",
      zone: "avant",
    });

    surLacher.mockClear();
    await glisser(a2, [220, 66]);
    expect(container.querySelector("#b1")?.getAttribute("data-zone")).toBe("apres");
    await lacher(220, 66);
    expect(surLacher).toHaveBeenCalledWith({
      sorte: "carte",
      actif: "a2",
      pile: "B",
      cible: "b1",
      zone: "apres",
    });
  });

  it("F-020-AC25 F-020-AC12 lâcher sur une pile vide, ou sous les cartes d'une pile : nature « pile » ; le repère de la pile est posé pendant le survol", async () => {
    const { container, surLacher } = monter();
    const a2 = container.querySelector("#a2") as Element;

    await glisser(a2, [410, 100]);
    expect(container.querySelector("#pile-C")?.getAttribute("data-survolee")).toBe("true");
    expect(container.querySelector("#pile-B")?.getAttribute("data-survolee")).toBe("false");
    await lacher(410, 100);
    expect(surLacher).toHaveBeenCalledTimes(1);
    expect(surLacher).toHaveBeenCalledWith({
      sorte: "pile",
      actif: "a2",
      pile: "C",
      cible: undefined,
      zone: undefined,
    });
    expect(container.querySelector("#pile-C")?.getAttribute("data-survolee")).toBe("false");

    surLacher.mockClear();
    await glisser(a2, [220, 300]);
    await lacher(220, 300);
    expect(surLacher).toHaveBeenCalledWith({
      sorte: "pile",
      actif: "a2",
      pile: "B",
      cible: undefined,
      zone: undefined,
    });
  });

  it("F-020-AC25 F-020-AC12 lâcher sur une carte de sa propre pile : pile d'origine ; sur sa propre place ou hors de toute pile : rien", async () => {
    const { container, surLacher } = monter();
    const a2 = container.querySelector("#a2") as Element;

    await glisser(a2, [20, 52]);
    await lacher(20, 52);
    expect(surLacher).toHaveBeenCalledWith({
      sorte: "carte",
      actif: "a2",
      pile: "A",
      cible: "a1",
      zone: "apres",
    });

    surLacher.mockClear();
    await glisser(a2, [20, 100]);
    await lacher(20, 100);
    await glisser(a2, [700, 100]);
    await lacher(700, 100);
    expect(surLacher).not.toHaveBeenCalled();
  });

  it("F-020-AC12 Échap abandonne le geste sans rien écrire et le dit", async () => {
    const { container, surLacher } = monter();
    await glisser(container.querySelector("#a2") as Element, [220, 52]);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    await attendre();
    await lacher(220, 52);

    expect(surLacher).not.toHaveBeenCalled();
    expect(region()).toBe("Geste de la carte a2 abandonné.");
    expect(container.querySelector("#b1")?.getAttribute("data-zone")).toBe("");
  });

  it("F-020-AC12 une carte ou une pile qui n'est plus affichée n'est plus une cible : le lâcher n'écrit rien", async () => {
    const { container, surLacher } = monter({ identifiants: ["A", "B", "C", "a1", "a2"] });
    await glisser(container.querySelector("#a2") as Element, [220, 52]);
    await lacher(220, 52);
    expect(surLacher).not.toHaveBeenCalled();
  });

  it("F-020-AC25 désactivée (lecture seule, saisie ouverte) : aucun geste ne démarre", async () => {
    const { container, surLacher } = monter({ desactivee: true });
    await glisser(container.querySelector("#a2") as Element, [220, 52]);
    await lacher(220, 52);
    expect(surLacher).not.toHaveBeenCalled();
    expect(container.querySelector("#b1")?.getAttribute("data-zone")).toBe("");
  });
});

const TEXTES_PAR_DEFAUT =
  /draggable|droppable|space bar|arrow keys|press escape|picked up|was moved|was dropped|cancelled|sortable/i;

describe("annonces des piles en français (F-020-AC21)", () => {
  it("F-020-AC21 saisie, survol et dépôt sont annoncés par les textes de l'application, qui reçoivent la pile ; les instructions sont jointes à la carte ; aucun texte par défaut de la bibliothèque", async () => {
    const { container } = monter();
    const lues: string[] = [];
    const a2 = container.querySelector("#a2") as Element;

    await glisser(a2, [220, 40]);
    lues.push(region());
    await lacher(220, 40);
    lues.push(region());

    expect(lues).toEqual(["Carte a2 irait avant la pile B.", "Carte a2 déposée, pile B."]);
    const instructions = document.getElementById(
      (a2.getAttribute("aria-describedby") ?? "").split(" ").at(-1) ?? "",
    );
    expect(instructions?.textContent).toBe("Glissez la carte avec la souris.");
    const lus = [
      ...lues,
      instructions?.textContent ?? "",
      ...[...document.querySelectorAll("[id^='DndDescribedBy'], [id^='DndLiveRegion']")].map(
        (un) => un.textContent ?? "",
      ),
      ...[...a2.attributes].map((attribut) => attribut.value),
    ];
    expect(lus.filter((texte) => TEXTES_PAR_DEFAUT.test(texte))).toEqual([]);
    expect(a2.hasAttribute("aria-roledescription")).toBe(false);
  });
});
