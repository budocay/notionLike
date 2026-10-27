// Arithmétique des jours du calendrier (F-021-AC3, AC4, AC15 à AC19), sans DOM : confrontée à un
// oracle `Date.UTC` qui n'existe que dans ce test, jamais dans les sources.
import { creerDocumentTable } from "@notionlike/document";
import { describe, expect, it } from "vitest";

import { aujourdhuiDe } from "../../src/vues-de-table/aujourdhui.ts";
import {
  decaler,
  decomposer,
  DERNIER_JOUR,
  dimancheDeLaSemaine,
  ecrireLeJour,
  estBissextile,
  estUnJour,
  grilleDuMois,
  jourDeLaSemaine,
  joursDuMois,
  lundiDeLaSemaine,
  memeQuantiemeAilleurs,
  moisPrecedent,
  moisSuivant,
  PREMIER_JOUR,
} from "../../src/vues-de-table/jours.ts";
import { lire, lister } from "../aides-disque.ts";
import { ecrit, oracle, verifierLEnumeration } from "./aides-enumeration-jours.ts";

describe("arithmétique des jours (F-021-AC16)", () => {
  const jours = oracle();

  it("F-021-AC16 chaque jour de 1899-12-25 à 2101-01-07 se décompose, se réécrit et a le même lendemain, la même veille et le même jour de semaine que l'oracle", () => {
    verifierLEnumeration(jours);
  });

  it("F-021-AC16 décaler de n jours retombe sur l'oracle, sept jours font une semaine pleine", () => {
    for (const pas of [-400, -31, -7, 7, 30, 365, 366, 1461]) {
      for (let rang = 500; rang < 600; rang += 1) {
        const attendu = jours[rang + pas]?.texte;
        expect(decaler(jours[rang]?.texte ?? "", pas), `${String(rang)} ${String(pas)}`).toBe(
          attendu,
        );
      }
    }
  });

  it("F-021-AC16 le lendemain d'un 31 décembre est le 1er janvier suivant", () => {
    for (let annee = 1900; annee <= 2100; annee += 1) {
      expect(decaler(`${String(annee)}-12-31`, 1)).toBe(`${String(annee + 1)}-01-01`);
    }
  });

  it("F-021-AC16 1900 et 2100 ne sont pas bissextiles, 2000 et 2024 le sont ; février a 28 ou 29 jours", () => {
    expect([1900, 2100, 2000, 2024, 2026, 4, 100, 400].map(estBissextile)).toEqual([
      false,
      false,
      true,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(joursDuMois(1900, 2)).toBe(28);
    expect(joursDuMois(2000, 2)).toBe(29);
    expect(decaler("2100-02-28", 1)).toBe("2100-03-01");
    expect(decaler("2000-02-28", 1)).toBe("2000-02-29");
    expect(decaler("1900-02-28", 1)).toBe("1900-03-01");
  });

  it("F-021-AC16 les années à moins de quatre chiffres restent écrites sur quatre : 0099-12-31, 0001-01-01", () => {
    expect(decaler("0099-12-31", 1)).toBe("0100-01-01");
    expect(decaler("0100-02-28", 1)).toBe("0100-03-01");
    expect(decomposer("0099-12-31")).toEqual({ annee: 99, mois: 12, quantieme: 31 });
    expect(ecrireLeJour({ annee: 7, mois: 3, quantieme: 9 })).toBe("0007-03-09");
    expect(estUnJour("99-12-31")).toBe(false);
  });

  it("F-021-AC16 le jeudi 2026-10-08 est un jeudi ; le 0001-01-01 est un lundi ; le 9999-12-31 un vendredi", () => {
    expect(jourDeLaSemaine("2026-10-08")).toBe(3);
    expect(jourDeLaSemaine(PREMIER_JOUR)).toBe(0);
    expect(jourDeLaSemaine(DERNIER_JOUR)).toBe(4);
    expect(lundiDeLaSemaine("2026-10-08")).toBe("2026-10-05");
    expect(dimancheDeLaSemaine("2026-10-08")).toBe("2026-10-11");
  });

  it("F-021-AC16 une valeur qui n'est pas un jour de calendrier est refusée : 2026-02-30, 2026-13-01, 0000-01-01, texte, nombre", () => {
    for (const faux of ["2026-02-30", "2026-13-01", "0000-01-01", "2026-1-1", "", "x", 20260101]) {
      expect(estUnJour(faux), String(faux)).toBe(false);
    }
    expect(estUnJour("2026-02-28")).toBe(true);
    expect(estUnJour("2027-02-29")).toBe(false);
  });
});

describe("bornes du calendrier (F-021-AC3)", () => {
  it("F-021-AC3 aucun décalage ne sort des bornes : avant le 0001-01-01 et après le 9999-12-31, il n'y a rien", () => {
    expect(decaler(PREMIER_JOUR, -1)).toBeUndefined();
    expect(decaler(DERNIER_JOUR, 1)).toBeUndefined();
    expect(decaler(PREMIER_JOUR, 1)).toBe("0001-01-02");
    expect(decaler(DERNIER_JOUR, -1)).toBe("9999-12-30");
    expect(moisPrecedent({ annee: 1, mois: 1 })).toBeUndefined();
    expect(moisSuivant({ annee: 9999, mois: 12 })).toBeUndefined();
    expect(moisPrecedent({ annee: 2026, mois: 1 })).toEqual({ annee: 2025, mois: 12 });
    expect(moisSuivant({ annee: 2026, mois: 12 })).toEqual({ annee: 2027, mois: 1 });
    expect(memeQuantiemeAilleurs("0001-01-15", -1)).toBeUndefined();
    expect(memeQuantiemeAilleurs("9999-12-15", 1)).toBeUndefined();
    expect(memeQuantiemeAilleurs("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("F-021-AC3 la grille de janvier 1 et celle de décembre 9999 ne présentent aucune case hors des bornes", () => {
    const premiere = grilleDuMois({ annee: 1, mois: 1 });
    const derniere = grilleDuMois({ annee: 9999, mois: 12 });
    expect(premiere[0]).toBe(PREMIER_JOUR);
    expect(derniere.at(-1)).toBe(DERNIER_JOUR);
    for (const jour of [...premiere, ...derniere]) {
      expect(estUnJour(jour), jour).toBe(true);
    }
  });
});

describe("grille du mois (F-021-AC17)", () => {
  it("F-021-AC17 chaque mois de 1900 à 2100 : une grille de semaines entières du lundi au dimanche, 28 à 42 cases, tous les jours du mois sans trou", () => {
    for (let annee = 1900; annee <= 2100; annee += 1) {
      for (let mois = 1; mois <= 12; mois += 1) {
        const grille = grilleDuMois({ annee, mois });
        const nom = `${String(annee)}-${String(mois)}`;
        expect(grille.length % 7, nom).toBe(0);
        expect(grille.length, nom).toBeGreaterThanOrEqual(28);
        expect(grille.length, nom).toBeLessThanOrEqual(42);
        expect(jourDeLaSemaine(grille[0] ?? ""), nom).toBe(0);
        expect(jourDeLaSemaine(grille.at(-1) ?? ""), nom).toBe(6);
        grille.forEach((jour, rang) => {
          if (rang > 0) {
            expect(jour, nom).toBe(decaler(grille[rang - 1] ?? "", 1));
          }
        });
        const avant = grille.findIndex((jour) => decomposer(jour)?.mois === mois);
        const apres =
          grille.length - 1 - grille.findLastIndex((jour) => decomposer(jour)?.mois === mois);
        expect(avant, nom).toBeLessThan(7);
        expect(apres, nom).toBeLessThan(7);
        const duMois = grille.filter((jour) => decomposer(jour)?.mois === mois);
        expect(duMois.length, nom).toBe(joursDuMois(annee, mois));
        expect(duMois[0], nom).toBe(ecrit(annee, mois, 1));
      }
    }
  });

  it("F-021-AC17 février 2027 tient en quatre semaines (28 cases, le 1er est un lundi), février 2026 en cinq (le 1er est un dimanche)", () => {
    expect(grilleDuMois({ annee: 2027, mois: 2 })).toHaveLength(28);
    expect(grilleDuMois({ annee: 2026, mois: 2 })).toHaveLength(35);
    expect(grilleDuMois({ annee: 2026, mois: 2 })[0]).toBe("2026-01-26");
    expect(grilleDuMois({ annee: 2026, mois: 10 })[0]).toBe("2026-09-28");
  });

  it("F-021-AC17 janvier 1 : 35 cases du lundi au dimanche ; décembre 9999 s'arrête au vendredi 31 (33 cases) faute de jour valide ensuite, AC3 l'emporte", () => {
    const premiere = grilleDuMois({ annee: 1, mois: 1 });
    expect(premiere).toHaveLength(35);
    expect(premiere[0]).toBe("0001-01-01");
    const derniere = grilleDuMois({ annee: 9999, mois: 12 });
    expect(derniere).toHaveLength(33);
    expect(derniere[0]).toBe("9999-11-29");
    expect(derniere.at(-1)).toBe("9999-12-31");
    expect(derniere.length % 7).toBe(5);
  });
});

describe("aujourd'hui (F-021-AC4)", () => {
  it("F-021-AC4 le jour est celui de l'horloge locale, la seconde avant minuit et minuit passé compris", () => {
    expect(aujourdhuiDe(() => new Date(2026, 9, 8, 23, 59, 59, 999))).toBe("2026-10-08");
    expect(aujourdhuiDe(() => new Date(2026, 9, 9, 0, 0, 0, 0))).toBe("2026-10-09");
    expect(aujourdhuiDe(() => new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    expect(aujourdhuiDe(() => new Date(2027, 0, 1, 0, 0, 0))).toBe("2027-01-01");
    const ancienne = new Date(2000, 0, 1);
    ancienne.setFullYear(99, 11, 31);
    expect(aujourdhuiDe(() => ancienne)).toBe("0099-12-31");
  });
});

describe("sources de l'arithmétique (F-021-AC15)", () => {
  const sans = (texte: string): string => texte.replace(/\/\/.*$|\/\*[^]*?\*\//gm, "");

  it("F-021-AC15 jours.ts n'emploie ni Date, ni Intl, ni toLocale, ni navigator, ni fuseau", () => {
    expect(sans(lire("src/vues-de-table/jours.ts"))).not.toMatch(
      /\bDate\b|\bIntl\b|toLocale|navigator|timezone|getTimezoneOffset|Temporal|performance\./i,
    );
  });

  it("F-021-AC15 seul aujourdhui.ts lit l'horloge parmi les fichiers du calendrier, et le module n'importe aucune bibliothèque de dates", () => {
    const calendrier = lister("src/vues-de-table").filter((chemin) =>
      /calendrier|jours|aujourdhui|repartition|repli|textes-calendrier|clavier-calendrier/.test(
        chemin,
      ),
    );
    expect(calendrier.length).toBeGreaterThan(10);
    for (const chemin of calendrier) {
      const texte = sans(lire(chemin));
      if (!chemin.endsWith("/aujourdhui.ts")) {
        expect(texte, chemin).not.toMatch(/\bnew Date\b|Date\.now|\bIntl\b|toLocale/);
      }
      expect(texte, chemin).not.toMatch(/from "(date-fns|dayjs|moment|luxon|@internationalized)/);
    }
  });
});

describe("façade et jours (F-021-AC19)", () => {
  it("F-021-AC19 chaque jour énuméré, et les deux bornes, s'écrit dans une cellule de date et se relit identique", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("Échéance", "date");
    const ligne = table.creerLigne();
    const jours = oracle().map(({ texte }) => texte);
    for (const jour of [PREMIER_JOUR, ...jours, DERNIER_JOUR]) {
      table.ecrireCellule(ligne, colonne, jour);
      expect(table.lire().lignes[0]?.cellules[0], jour).toBe(jour);
    }
    table.fermer();
  });
});
