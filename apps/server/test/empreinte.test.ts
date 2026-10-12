import crypto from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { correspond, empreinteDe } from "../src/empreinte.ts";

const MOT_DE_PASSE = "un mot de passe d'essai";
const FORME_PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Reglages {
  readonly memoire: number;
  readonly passes: number;
  readonly fils?: number;
  readonly sel?: Buffer;
  readonly taille?: number;
  readonly algorithme?: "argon2id" | "argon2i" | "argon2d";
}

// Une empreinte PHC calculée par le test, sans passer par le module : ses paramètres sont libres.
function empreinteCalculeeIci(motDePasse: string, reglages: Reglages): string {
  const { memoire, passes, fils = 1, taille = 32, algorithme = "argon2id" } = reglages;
  const sel = reglages.sel ?? crypto.randomBytes(16);
  const cle = crypto.argon2Sync(algorithme, {
    message: motDePasse,
    nonce: sel,
    memory: memoire,
    passes,
    parallelism: fils,
    tagLength: taille,
  });
  const base64 = (octets: Buffer): string => octets.toString("base64").replace(/=+$/, "");
  return `$${algorithme}$v=19$m=${memoire},t=${passes},p=${fils}$${base64(sel)}$${base64(cle)}`;
}

function morceauxDe(empreinte: string): { sel: Buffer; cle: Buffer } {
  const [, sel = "", cle = ""] = FORME_PHC.exec(empreinte) ?? [];
  return { sel: Buffer.from(sel, "base64"), cle: Buffer.from(cle, "base64") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calcul de l'empreinte", () => {
  it("F-009-AC5 l'empreinte est une chaîne PHC Argon2id m=19456, t=2, p=1, sel de 16 octets et clé de 32 octets", async () => {
    const empreinte = await empreinteDe(MOT_DE_PASSE);
    const { sel, cle } = morceauxDe(empreinte);

    expect(empreinte).toMatch(FORME_PHC);
    expect(sel).toHaveLength(16);
    expect(cle).toHaveLength(32);
    expect(empreinte).not.toContain(MOT_DE_PASSE);
  });

  it("F-009-AC5 la clé est celle qu'Argon2id de node:crypto rend pour ce sel et ces paramètres", async () => {
    const empreinte = await empreinteDe(MOT_DE_PASSE);
    const { sel } = morceauxDe(empreinte);

    expect(empreinteCalculeeIci(MOT_DE_PASSE, { memoire: 19_456, passes: 2, sel })).toBe(empreinte);
  });

  it("F-009-AC5 deux empreintes du même mot de passe diffèrent par le sel et par la clé", async () => {
    const premiere = morceauxDe(await empreinteDe(MOT_DE_PASSE));
    const seconde = morceauxDe(await empreinteDe(MOT_DE_PASSE));

    expect(premiere.sel.equals(seconde.sel)).toBe(false);
    expect(premiere.cle.equals(seconde.cle)).toBe(false);
  });
});

describe("vérification d'un mot de passe", () => {
  it("F-009-AC6 le bon mot de passe correspond, un autre non", async () => {
    const empreinte = await empreinteDe(MOT_DE_PASSE);

    expect(await correspond(MOT_DE_PASSE, empreinte)).toBe(true);
    expect(await correspond(`${MOT_DE_PASSE}.`, empreinte)).toBe(false);
    expect(await correspond("", empreinte)).toBe(false);
  });

  it("F-009-AC6 la clé est recalculée avec les paramètres lus dans la chaîne stockée", async () => {
    const reglages = {
      memoire: 32_768,
      passes: 3,
      fils: 2,
      taille: 48,
      sel: crypto.randomBytes(24),
    };
    const empreinte = empreinteCalculeeIci(MOT_DE_PASSE, reglages);
    const calcul = vi.spyOn(crypto, "argon2");

    expect(await correspond(MOT_DE_PASSE, empreinte)).toBe(true);
    expect(calcul.mock.calls.map(([algorithme, lus]) => ({ algorithme, ...lus }))).toEqual([
      {
        algorithme: "argon2id",
        message: MOT_DE_PASSE,
        nonce: reglages.sel,
        memory: 32_768,
        passes: 3,
        parallelism: 2,
        tagLength: 48,
      },
    ]);
  });

  it("F-009-AC6 les deux clés sont comparées par crypto.timingSafeEqual, que le mot de passe soit bon ou faux", async () => {
    const empreinte = await empreinteDe(MOT_DE_PASSE);
    const comparaison = vi.spyOn(crypto, "timingSafeEqual");

    await correspond(MOT_DE_PASSE, empreinte);
    await correspond("un autre mot de passe", empreinte);

    expect(comparaison.mock.results.map((resultat) => resultat.value)).toEqual([true, false]);
    expect(comparaison.mock.calls.map(([, stockee]) => stockee)).toEqual([
      morceauxDe(empreinte).cle,
      morceauxDe(empreinte).cle,
    ]);
  });

  it.each<[string, Reglages]>([
    ["une mémoire sous le minimum", { memoire: 19_452, passes: 2 }],
    ["une seule passe", { memoire: 19_456, passes: 1 }],
    ["un sel de 15 octets", { memoire: 19_456, passes: 2, sel: crypto.randomBytes(15) }],
    ["une clé de 31 octets", { memoire: 19_456, passes: 2, taille: 31 }],
    ["l'algorithme argon2i", { memoire: 19_456, passes: 2, algorithme: "argon2i" }],
    ["l'algorithme argon2d", { memoire: 19_456, passes: 2, algorithme: "argon2d" }],
  ])(
    "F-009-AC6 une empreinte exacte mais avec %s est refusée sans calcul",
    async (_cas, reglages) => {
      const empreinte = empreinteCalculeeIci(MOT_DE_PASSE, reglages);
      const calcul = vi.spyOn(crypto, "argon2");

      expect(await correspond(MOT_DE_PASSE, empreinte)).toBe(false);
      expect(calcul).not.toHaveBeenCalled();
    },
  );

  it("F-009-AC6 une empreinte aux bornes hautes acceptées reste vérifiable", async () => {
    const empreinte = empreinteCalculeeIci(MOT_DE_PASSE, {
      memoire: 19_456,
      passes: 10,
      fils: 4,
      taille: 64,
      sel: crypto.randomBytes(64),
    });

    expect(await correspond(MOT_DE_PASSE, empreinte)).toBe(true);
  });

  it("F-009-AC6 la chaîne témoin des cas mal formés, elle, est lue : le calcul a lieu et la clé diffère", async () => {
    const temoin = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"A".repeat(43)}`;
    const calcul = vi.spyOn(crypto, "argon2");

    expect(await correspond(MOT_DE_PASSE, temoin)).toBe(false);
    expect(calcul).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["vide", ""],
    ["le format scrypt de better-auth", `${"ab".repeat(16)}:${"cd".repeat(64)}`],
    [
      "une mémoire au-delà du plafond",
      `$argon2id$v=19$m=262145,t=2,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    ],
    ["onze passes", `$argon2id$v=19$m=19456,t=11,p=1$${"A".repeat(22)}$${"A".repeat(43)}`],
    ["cinq fils", `$argon2id$v=19$m=19456,t=2,p=5$${"A".repeat(22)}$${"A".repeat(43)}`],
    ["une autre version", `$argon2id$v=16$m=19456,t=2,p=1$${"A".repeat(22)}$${"A".repeat(43)}`],
    ["un sel hors base64", `$argon2id$v=19$m=19456,t=2,p=1$${"*".repeat(22)}$${"A".repeat(43)}`],
    [
      "un base64 non canonique",
      `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(21)}B$${"A".repeat(43)}`,
    ],
    ["une clé absente", `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}`],
    ["une suite en trop", `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"A".repeat(43)}$x`],
    ["un sel de 65 octets", `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(87)}$${"A".repeat(43)}`],
  ])(
    "F-009-AC6 une chaîne stockée mal formée (%s) est refusée sans erreur ni calcul",
    async (_cas, stockee) => {
      const calcul = vi.spyOn(crypto, "argon2");

      await expect(correspond(MOT_DE_PASSE, stockee)).resolves.toBe(false);
      expect(calcul).not.toHaveBeenCalled();
    },
  );
});
