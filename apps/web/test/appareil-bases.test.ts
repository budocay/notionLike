// F-032-AC20, H8 : les bases d'un espace, énumérées par leur nom et reconnues par la fonction de
// nommage, et rien d'autre ; réglages de vue de ses tables ; relevé d'une base sans énumération.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  basesDeLEspace,
  ecrireReglagesDeVue,
  effacerLesReglagesDeLEspace,
  lireReglagesDeVue,
  releverLaBase,
} from "../src/persistance/index.ts";
import {
  E_ALPHA,
  E_APPAREIL,
  P_DEUX,
  P_UN,
  poserUneBase,
  rendreLEnumeration,
  retirerLEnumeration,
} from "./aides-appareil.ts";
import { nomsDesBases } from "./aides-persistance.ts";

describe("bases d'un espace (F-032-AC20, H8)", () => {
  it("F-032-AC20 l'énumération rend la base d'espace, les bases de page et de table de cet espace, et aucune autre : ni d'un autre espace, ni un nom que la fonction de nommage ne reconnaît pas", async () => {
    const reconnues = [
      `notionlike:espace:${E_ALPHA}`,
      `notionlike:page:${E_ALPHA}:${P_UN}`,
      `notionlike:table:${E_ALPHA}:${P_DEUX}`,
    ];
    const autres = [
      `notionlike:espace:${E_APPAREIL}`,
      `notionlike:page:${E_APPAREIL}:${P_UN}`,
      `notionlike:page:${E_ALPHA}:${P_UN}:suite`,
      `notionlike:page:${E_ALPHA}:${P_UN.toUpperCase()}`,
      `notionlike:espace:${E_ALPHA}x`,
      `notionlike:images:${E_ALPHA}`,
      `notionlike:espace:${E_ALPHA}:${P_UN}`,
      `autre:espace:${E_ALPHA}`,
      `notionlike:espace:${E_ALPHA} `,
      "notionlike:appareil",
    ];
    for (const nom of [...reconnues, ...autres]) {
      await poserUneBase(nom);
    }

    expect(await basesDeLEspace(E_ALPHA)).toEqual(
      expect.arrayContaining([
        { type: "espace", idEspace: E_ALPHA },
        { type: "page", idEspace: E_ALPHA, idPage: P_UN },
        { type: "table", idEspace: E_ALPHA, idTable: P_DEUX },
      ]),
    );
    expect(await basesDeLEspace(E_ALPHA)).toHaveLength(3);
    expect(await basesDeLEspace("pas-un-uuid")).toEqual([]);
  });

  it("F-032-AC20 H7 sans énumération, `undefined` : le retrait se replie sur la lecture de l'arborescence", async () => {
    await poserUneBase(`notionlike:espace:${E_ALPHA}`);
    retirerLEnumeration();
    expect(await basesDeLEspace(E_ALPHA)).toBeUndefined();
    rendreLEnumeration();
  });

  it("F-032-AC20 F-018-AC49 les réglages de vue de toutes les tables de l'espace sont retirés, ceux d'un autre espace et toute autre clé restent", () => {
    ecrireReglagesDeVue({ idEspace: E_ALPHA, idTable: P_UN }, { vue: { largeur: 1 } });
    ecrireReglagesDeVue({ idEspace: E_ALPHA, idTable: P_DEUX }, { vue: { largeur: 2 } });
    ecrireReglagesDeVue({ idEspace: E_APPAREIL, idTable: P_UN }, { vue: { largeur: 3 } });
    localStorage.setItem(`notionlike:vue:${E_ALPHA}:pas-un-uuid`, "{}");

    effacerLesReglagesDeLEspace(E_ALPHA);

    expect(lireReglagesDeVue({ idEspace: E_ALPHA, idTable: P_UN })).toEqual({});
    expect(lireReglagesDeVue({ idEspace: E_ALPHA, idTable: P_DEUX })).toEqual({});
    expect(lireReglagesDeVue({ idEspace: E_APPAREIL, idTable: P_UN })).toEqual({
      vue: { largeur: 3 },
    });
    expect(localStorage.getItem(`notionlike:vue:${E_ALPHA}:pas-un-uuid`)).toBe("{}");
    localStorage.clear();
  });

  it("F-032-AC20 le relevé d'une base absente ne la crée pas ; celui d'une base présente rend un témoin", async () => {
    expect(await releverLaBase({ type: "espace", idEspace: E_ALPHA })).toBeUndefined();
    expect(await nomsDesBases()).toEqual([]);
    expect(await releverLaBase({ type: "espace", idEspace: "pas-un-uuid" })).toBeUndefined();

    await poserUneBase(`notionlike:espace:${E_ALPHA}`);
    const temoin = await releverLaBase({ type: "espace", idEspace: E_ALPHA });
    expect(temoin).toBeInstanceOf(Y.Doc);
    temoin?.destroy();
  });
});
