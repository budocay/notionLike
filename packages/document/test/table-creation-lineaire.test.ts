// F-034 : création de lignes de table en temps linéaire (D-041). Le comportement, le format du
// document et les refus restent ceux d'avant ; seul le coût de chaque création cesse de croître avec
// le nombre de lignes déjà présentes.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  creerDocumentTable,
  type DocumentTable,
  ErreurDocument,
  type IdColonne,
  type ValeurDeCellule,
  ouvrirDocumentTable,
} from "../src/index.ts";
import {
  creerRepliqueDeTable,
  echanger,
  fixerDesIdentifiantsDisperses,
  identifiantFixe,
  ORIGINE_RECUE,
  refusDe,
} from "./aides-table.ts";

declare const crypto: { randomUUID(): string };

afterEach(() => {
  vi.restoreAllMocks();
});

// Cinq mille créations, puis les refus : large devant le coût réel, indépendant du défaut de Vitest.
const DELAI_DES_REFUS = 60_000;

const RANG_MAX = "z".repeat(1024);

// Les trois contenus de référence ont été relevés sur `main` (dbb8556), avant la feature.

// Contenu Yjs d'un document de table, clés triées : types partagés, puis champs de chaque entrée.
function contenu(doc: Y.Doc): string {
  const trier = (valeur: unknown): unknown =>
    valeur !== null && typeof valeur === "object"
      ? Object.fromEntries(
          Object.entries(valeur as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([cle, v]) => [cle, trier(v)]),
        )
      : valeur;
  const partages: Record<string, unknown> = {};
  for (const nom of [...doc.share.keys()].sort()) {
    const type = doc.share.get(nom);
    partages[nom] = trier(type instanceof Y.Array ? type.toJSON() : doc.getMap(nom).toJSON());
  }
  return JSON.stringify(partages);
}

function deuxColonnes(table: DocumentTable): { nom: IdColonne; quantite: IdColonne } {
  return { nom: table.creerColonne("Nom", "texte"), quantite: table.creerColonne("Qté", "nombre") };
}

// Suite fixée : fin, tête, milieu, valeurs variées, puis des créations en tête jusqu'à ce que les
// rangs s'allongent, sans atteindre la borne.
function suiteFixee(table: DocumentTable): void {
  const { nom, quantite } = deuxColonnes(table);
  table.creerLigne();
  table.creerLigne(new Map([[nom, "a"]]));
  table.creerLigne(
    new Map<IdColonne, ValeurDeCellule | null>([
      [nom, "b"],
      [quantite, 2],
    ]),
    0,
  );
  table.creerLigne(new Map([[quantite, null]]), 1);
  table.creerLigne(new Map([[nom, "é"]]), 4);
  for (let i = 0; i < 40; i += 1) {
    table.creerLigne(new Map([[quantite, i]]), 0);
  }
  for (let i = 0; i < 20; i += 1) {
    table.creerLigne(undefined, 20 + i);
  }
}

// Une table dont la dernière ligne porte un rang de longueur maximale : toute création en fin, ou
// entre ces rangs, déclenche la réattribution élargie (F-029-AC7).
function documentAuxRangsSaturés(): Y.Doc {
  const doc = new Y.Doc({ gc: true });
  const table = ouvrirDocumentTable(doc);
  table.creerColonne("Nom", "texte");
  table.fermer();
  const lignes = doc.getMap<Y.Map<unknown>>("lignes");
  [
    ["1", "a"],
    ["2", "z"],
    ["3", RANG_MAX],
  ].forEach(([numero, rang]) => {
    const champs = new Y.Map<unknown>();
    champs.set("rang", rang);
    champs.set("supprimee", false);
    champs.set("cellules", new Y.Map<unknown>());
    lignes.set(identifiantFixe(Number(numero)), champs);
  });
  return doc;
}

function suiteElargie(table: DocumentTable): void {
  table.creerLigne(undefined, 1);
  table.creerLigne(undefined);
  table.creerLigne(undefined, 0);
}

const REFERENCE_SUITE =
  '{"colonnes":{"00000000-0000-4000-8000-00003c6ef362":{"nom":"Qté","rang":"k","supprimee":false,"type":"nombre"},"00000000-0000-4000-8000-00009e3779b1":{"nom":"Nom","rang":"V","supprimee":false,"type":"texte"}},"lignes":{"00000000-0000-4000-8000-0000035e2982":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":26},"rang":"000003","supprimee":false},"00000000-0000-4000-8000-000008d12dfd":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":5},"rang":"07","supprimee":false},"00000000-0000-4000-8000-00000c2f577f":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":39},"rang":"00000000F","supprimee":false},"00000000-0000-4000-8000-000011a25bfa":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":18},"rang":"0000V","supprimee":false},"00000000-0000-4000-8000-00001500857c":{"cellules":{},"rang":"0000Ezw","supprimee":false},"00000000-0000-4000-8000-000017156075":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":2,"00000000-0000-4000-8000-00009e3779b1":"b"},"rang":"F","supprimee":false},"00000000-0000-4000-8000-00001a7389f7":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":31},"rang":"0000003","supprimee":false},"00000000-0000-4000-8000-00001fe68e72":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":10},"rang":"007","supprimee":false},"00000000-0000-4000-8000-00002344b7f4":{"cellules":{},"rang":"0000Ek","supprimee":false},"00000000-0000-4000-8000-000028b7bc6f":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":23},"rang":"00000V","supprimee":false},"00000000-0000-4000-8000-00002c15e5f1":{"cellules":{},"rang":"0000Ezzs","supprimee":false},"00000000-0000-4000-8000-00002e2ac0ea":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":2},"rang":"1","supprimee":false},"00000000-0000-4000-8000-00003188ea6c":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":36},"rang":"00000003","supprimee":false},"00000000-0000-4000-8000-000036fbeee7":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":15},"rang":"0007","supprimee":false},"00000000-0000-4000-8000-00003a5a1869":{"cellules":{},"rang":"0000EzV","supprimee":false},"00000000-0000-4000-8000-00003fcd1ce4":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":28},"rang":"000000V","supprimee":false},"00000000-0000-4000-8000-00004540215f":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":7},"rang":"01","supprimee":false},"00000000-0000-4000-8000-0000489e4ae1":{"cellules":{},"rang":"0000D","supprimee":false},"00000000-0000-4000-8000-00004e114f5c":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":20},"rang":"00007","supprimee":false},"00000000-0000-4000-8000-0000516f78de":{"cellules":{},"rang":"0000Ezz","supprimee":false},"00000000-0000-4000-8000-0000538453d7":{"cellules":{"00000000-0000-4000-8000-00009e3779b1":"é"},"rang":"s","supprimee":false},"00000000-0000-4000-8000-000056e27d59":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":33},"rang":"0000000V","supprimee":false},"00000000-0000-4000-8000-00005c5581d4":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":12},"rang":"001","supprimee":false},"00000000-0000-4000-8000-00005fb3ab56":{"cellules":{},"rang":"0000Ew","supprimee":false},"00000000-0000-4000-8000-00006526afd1":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":25},"rang":"000007","supprimee":false},"00000000-0000-4000-8000-00006884d953":{"cellules":{},"rang":"0000Ezzy","supprimee":false},"00000000-0000-4000-8000-00006a99b44c":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":4},"rang":"0F","supprimee":false},"00000000-0000-4000-8000-00006df7ddce":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":38},"rang":"00000000V","supprimee":false},"00000000-0000-4000-8000-0000736ae249":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":17},"rang":"0001","supprimee":false},"00000000-0000-4000-8000-000076c90bcb":{"cellules":{},"rang":"0000Ezs","supprimee":false},"00000000-0000-4000-8000-000078dde6c4":{"cellules":{"00000000-0000-4000-8000-00009e3779b1":"a"},"rang":"k","supprimee":false},"00000000-0000-4000-8000-00007c3c1046":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":30},"rang":"0000007","supprimee":false},"00000000-0000-4000-8000-000081af14c1":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":9},"rang":"00F","supprimee":false},"00000000-0000-4000-8000-0000850d3e43":{"cellules":{},"rang":"0000EV","supprimee":false},"00000000-0000-4000-8000-00008a8042be":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":22},"rang":"00001","supprimee":false},"00000000-0000-4000-8000-00008dde6c40":{"cellules":{},"rang":"0000Ezzk","supprimee":false},"00000000-0000-4000-8000-00008ff34739":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":1},"rang":"3","supprimee":false},"00000000-0000-4000-8000-0000935170bb":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":35},"rang":"00000007","supprimee":false},"00000000-0000-4000-8000-000098c47536":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":14},"rang":"000F","supprimee":false},"00000000-0000-4000-8000-00009c229eb8":{"cellules":{},"rang":"0000Ez","supprimee":false},"00000000-0000-4000-8000-0000a195a333":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":27},"rang":"000001","supprimee":false},"00000000-0000-4000-8000-0000a708a7ae":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":6},"rang":"03","supprimee":false},"00000000-0000-4000-8000-0000aa66d130":{"cellules":{},"rang":"0000B","supprimee":false},"00000000-0000-4000-8000-0000afd9d5ab":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":19},"rang":"0000F","supprimee":false},"00000000-0000-4000-8000-0000b337ff2d":{"cellules":{},"rang":"0000Ezy","supprimee":false},"00000000-0000-4000-8000-0000b54cda26":{"cellules":{},"rang":"N","supprimee":false},"00000000-0000-4000-8000-0000b8ab03a8":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":32},"rang":"0000001","supprimee":false},"00000000-0000-4000-8000-0000be1e0823":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":11},"rang":"003","supprimee":false},"00000000-0000-4000-8000-0000c17c31a5":{"cellules":{},"rang":"0000Es","supprimee":false},"00000000-0000-4000-8000-0000c6ef3620":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":24},"rang":"00000F","supprimee":false},"00000000-0000-4000-8000-0000ca4d5fa2":{"cellules":{},"rang":"0000Ezzw","supprimee":false},"00000000-0000-4000-8000-0000cc623a9b":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":3},"rang":"0V","supprimee":false},"00000000-0000-4000-8000-0000cfc0641d":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":37},"rang":"00000001","supprimee":false},"00000000-0000-4000-8000-0000d5336898":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":16},"rang":"0003","supprimee":false},"00000000-0000-4000-8000-0000d891921a":{"cellules":{},"rang":"0000Ezk","supprimee":false},"00000000-0000-4000-8000-0000daa66d13":{"cellules":{},"rang":"V","supprimee":false},"00000000-0000-4000-8000-0000de049695":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":29},"rang":"000000F","supprimee":false},"00000000-0000-4000-8000-0000e3779b10":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":8},"rang":"00V","supprimee":false},"00000000-0000-4000-8000-0000e6d5c492":{"cellules":{},"rang":"0000E","supprimee":false},"00000000-0000-4000-8000-0000ec48c90d":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":21},"rang":"00003","supprimee":false},"00000000-0000-4000-8000-0000efa6f28f":{"cellules":{},"rang":"0000EzzV","supprimee":false},"00000000-0000-4000-8000-0000f1bbcd88":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":0},"rang":"7","supprimee":false},"00000000-0000-4000-8000-0000f519f70a":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":34},"rang":"0000000F","supprimee":false},"00000000-0000-4000-8000-0000fa8cfb85":{"cellules":{"00000000-0000-4000-8000-00003c6ef362":13},"rang":"000V","supprimee":false},"00000000-0000-4000-8000-0000fdeb2507":{"cellules":{},"rang":"0000Ey","supprimee":false}}}';
const REFERENCE_ELARGIE =
  '{"colonnes":{"00000000-0000-4000-8000-00009e3779b1":{"nom":"Nom","rang":"V","supprimee":false,"type":"texte"}},"lignes":{"00000000-0000-4000-8000-000000000001":{"cellules":{},"rang":"7","supprimee":false},"00000000-0000-4000-8000-000000000002":{"cellules":{},"rang":"V","supprimee":false},"00000000-0000-4000-8000-000000000003":{"cellules":{},"rang":"h","supprimee":false},"00000000-0000-4000-8000-00003c6ef362":{"cellules":{},"rang":"J","supprimee":false},"00000000-0000-4000-8000-000078dde6c4":{"cellules":{},"rang":"3","supprimee":false},"00000000-0000-4000-8000-0000daa66d13":{"cellules":{},"rang":"t","supprimee":false}}}';
const REFERENCE_TIES =
  '{"colonnes":{"00000000-0000-4000-8000-00003c6ef362":{"nom":"Qté","rang":"k","supprimee":false,"type":"nombre"},"00000000-0000-4000-8000-00009e3779b1":{"nom":"Nom","rang":"V","supprimee":false,"type":"texte"}},"lignes":{"00000000-0000-4000-8000-000017156075":{"cellules":{},"rang":"s","supprimee":false},"00000000-0000-4000-8000-00002e2ac0ea":{"cellules":{},"rang":"a","supprimee":false},"00000000-0000-4000-8000-0000538453d7":{"cellules":{},"rang":"c","supprimee":false},"00000000-0000-4000-8000-000078dde6c4":{"cellules":{},"rang":"k","supprimee":false},"00000000-0000-4000-8000-00008ff34739":{"cellules":{},"rang":"g","supprimee":false},"00000000-0000-4000-8000-0000b54cda26":{"cellules":{},"rang":"i","supprimee":false},"00000000-0000-4000-8000-0000daa66d13":{"cellules":{},"rang":"V","supprimee":false},"00000000-0000-4000-8000-0000f1bbcd88":{"cellules":{},"rang":"Y","supprimee":false}}}';

function suiteAvecEgalites(): string {
  const a = creerRepliqueDeTable(11);
  const b = creerRepliqueDeTable(22);
  deuxColonnes(a.table);
  a.table.creerLigne();
  a.table.creerLigne();
  a.table.creerLigne();
  echanger([a, b]);
  a.table.creerLigne(undefined, 1);
  b.table.creerLigne(undefined, 1);
  b.table.creerLigne(undefined, 1);
  echanger([a, b]);
  a.table.creerLigne(undefined, 3);
  a.table.creerLigne(undefined, 2);
  echanger([a, b]);
  expect(contenu(a.table.doc)).toBe(contenu(b.table.doc));
  return contenu(a.table.doc);
}

describe("F-034 format et résultat inchangés", () => {
  it("F-034-AC2 une suite fixée produit le contenu Yjs relevé avant la feature", () => {
    fixerDesIdentifiantsDisperses();
    const table = creerDocumentTable();
    suiteFixee(table);
    const obtenu = contenu(table.doc);
    expect(obtenu).toBe(REFERENCE_SUITE);
    expect(table.lire().lignes).toHaveLength(65);
  });

  it("F-034-AC2 la réattribution élargie produit le contenu relevé avant la feature", () => {
    fixerDesIdentifiantsDisperses();
    const table = ouvrirDocumentTable(documentAuxRangsSaturés());
    suiteElargie(table);
    const obtenu = contenu(table.doc);
    expect(obtenu).toBe(REFERENCE_ELARGIE);
  });

  it("F-034-AC1 AC2 rangs égaux de pairs concurrents : lignes réattribuées comme avant", () => {
    fixerDesIdentifiantsDisperses();
    const obtenu = suiteAvecEgalites();
    expect(obtenu).toBe(REFERENCE_TIES);
  });
});

describe("F-034 refus", () => {
  it(
    "F-034-AC5 chaque refus, sur une table de 5 000 lignes, n'écrit rien",
    () => {
      const table = creerDocumentTable();
      const colonne = table.creerColonne("Nom", "texte");
      for (let i = 0; i < 5000; i += 1) {
        table.creerLigne();
      }
      const avant = contenu(table.doc);
      const inconnue = identifiantFixe(999);
      const refus = (
        valeurs?: Map<IdColonne, string | number | boolean | null>,
        position?: number,
      ) => refusDe(table.doc, () => table.creerLigne(valeurs, position));

      expect(refus(new Map([[inconnue, "x"]]))).toEqual({
        code: "colonne-introuvable",
        misesAJour: 0,
      });
      expect(refus(new Map([[colonne, 3]]))).toEqual({
        code: "valeur-non-conforme",
        misesAJour: 0,
      });
      // Toutes les colonnes avant toutes les valeurs.
      expect(
        refus(
          new Map<IdColonne, string | number | boolean | null>([
            [colonne, 3],
            [inconnue, "x"],
          ]),
        ),
      ).toEqual({ code: "colonne-introuvable", misesAJour: 0 });
      expect(refus(undefined, 5001)).toEqual({ code: "position-invalide", misesAJour: 0 });
      expect(refus(undefined, -1)).toEqual({ code: "position-invalide", misesAJour: 0 });
      expect(refus(undefined, 1.5)).toEqual({ code: "position-invalide", misesAJour: 0 });
      expect(contenu(table.doc)).toBe(avant);
    },
    DELAI_DES_REFUS,
  );

  it("F-034-AC6 un document d'une version non prise en charge refuse sans lire ni écrire", () => {
    const doc = new Y.Doc({ gc: true });
    doc.getArray("versions").push([2]);
    const table = ouvrirDocumentTable(doc);
    const avant = contenu(doc);
    const resultat = refusDe(doc, () => table.creerLigne());
    expect(resultat.code).toBe("version-non-prise-en-charge");
    expect(resultat.misesAJour).toBe(0);
    expect(contenu(doc)).toBe(avant);
    expect(() => table.lire()).toThrow(ErreurDocument);
  });
});

describe("F-034 abonnés, convergence", () => {
  it("F-034-AC4 une notification par création, aucune sans changement", () => {
    const table = creerDocumentTable();
    const colonne = table.creerColonne("Nom", "texte");
    let notifications = 0;
    table.abonner(() => {
      notifications += 1;
    });
    for (let i = 0; i < 25; i += 1) {
      table.creerLigne(new Map([[colonne, String(i)]]), i % 3 === 0 ? 0 : undefined);
    }
    expect(notifications).toBe(25);
    expect(table.lire().lignes).toHaveLength(25);
    table.ecrireCellule(table.lire().lignes[0]!.id, colonne, table.lire().lignes[0]!.cellules[0]!);
    expect(notifications).toBe(25);
  });

  it("F-034-AC4 la lecture reste à jour sans abonné, après des écritures d'un pair", () => {
    const a = creerRepliqueDeTable(1);
    const b = creerRepliqueDeTable(2);
    a.table.creerColonne("Nom", "texte");
    a.table.creerLigne();
    echanger([a, b]);
    expect(b.table.lire().lignes).toHaveLength(1);
    b.table.creerLigne();
    a.table.creerLigne(undefined, 0);
    echanger([a, b]);
    // Le cache d'ordre de chaque façade tient compte de ce que l'autre a écrit.
    a.table.creerLigne(undefined, 1);
    b.table.creerLigne(undefined, 2);
    echanger([a, b]);
    expect(a.table.lire()).toEqual(b.table.lire());
    expect(a.table.lire().lignes).toHaveLength(5);
  });

  it("F-034-AC3 un document écrit avant la feature s'ouvre dans l'autre et converge", () => {
    // Quatre lignes écrites par le code d'avant la feature (identifiant de client 7), relevé sur `main`.
    const REFERENCE =
      "ARgHACcBCGNvbG9ubmVzJDAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMQEoAAcABHJhbmcBdwFWKAAHAAlzdXBwcmltZWUBeSgABwADbm9tAXcDTm9tKAAHAAR0eXBlAXcFdGV4dGUnAQZsaWduZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyASgABwUEcmFuZwF3AVYoAAcFCXN1cHByaW1lZQF5JwAHBQhjZWxsdWxlcwEoAAcIJDAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMQF3AWEnAQZsaWduZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzASgABwoEcmFuZwF3AWsoAAcKCXN1cHByaW1lZQF5JwAHCghjZWxsdWxlcwEoAAcNJDAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMQF3AWInAQZsaWduZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA0ASgABw8EcmFuZwF3AUYoAAcPCXN1cHByaW1lZQF5JwAHDwhjZWxsdWxlcwEoAAcSJDAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMQF3AWMnAQZsaWduZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA1ASgABxQEcmFuZwF3AU4oAAcUCXN1cHByaW1lZQF5JwAHFAhjZWxsdWxlcwEA";
    const octets = Uint8Array.from(atob(REFERENCE), (c) => c.charCodeAt(0));
    const a = creerRepliqueDeTable(1);
    const b = creerRepliqueDeTable(2);
    Y.applyUpdate(a.table.doc, octets, ORIGINE_RECUE);
    Y.applyUpdate(b.table.doc, octets, ORIGINE_RECUE);
    expect(a.table.lire().lignes).toHaveLength(4);
    for (let i = 0; i < 10; i += 1) {
      a.table.creerLigne(undefined, 2);
      b.table.creerLigne(undefined, 2);
    }
    echanger([a, b]);
    expect(a.table.lire()).toEqual(b.table.lire());
    expect(a.table.lire().lignes).toHaveLength(24);
    const neuve = ouvrirDocumentTable(new Y.Doc());
    Y.applyUpdate(neuve.doc, Y.encodeStateAsUpdate(a.table.doc));
    expect(neuve.lire()).toEqual(a.table.lire());
  });

  it("F-034-AC3 deux pairs créent à la même position puis convergent dans des ordres différents", () => {
    fixerDesIdentifiantsDisperses();
    const a = creerRepliqueDeTable(1);
    const b = creerRepliqueDeTable(2);
    const c = creerRepliqueDeTable(3);
    a.table.creerColonne("Nom", "texte");
    for (let i = 0; i < 5; i += 1) {
      a.table.creerLigne();
    }
    echanger([a, b, c]);
    for (let i = 0; i < 30; i += 1) {
      a.table.creerLigne(undefined, 2);
      b.table.creerLigne(undefined, 2);
    }
    echanger([a, b]);
    a.table.creerLigne(undefined, 7);
    echanger([a, b, c]);
    expect(a.table.lire()).toEqual(b.table.lire());
    expect(c.table.lire()).toEqual(a.table.lire());
    expect(a.table.lire().lignes).toHaveLength(66);
    expect(contenu(a.table.doc)).toBe(contenu(c.table.doc));
  });
});

// ── Performance (F-034-AC7) ──────────────────────────────────────────────────────────────────────

function creerN(n: number, placer: (i: number) => number | undefined): number {
  const table = creerDocumentTable();
  table.creerColonne("Nom", "texte");
  const debut = performance.now();
  for (let i = 0; i < n; i += 1) {
    table.creerLigne(undefined, placer(i));
  }
  const duree = performance.now() - debut;
  expect(table.lire().lignes).toHaveLength(n);
  return duree;
}

const mediane = (valeurs: number[]): number => [...valeurs].sort((a, b) => a - b)[1] ?? 0;

// Délai explicite : six séries (3 x 5 000 et 3 x 10 000) puis trois plafonds de 5 000 créations.
const DELAI_DU_TEST = 240_000;

describe("F-034 coût linéaire", () => {
  it(
    "F-034-AC7 dix mille créations en fin coûtent moins de trois fois cinq mille",
    () => {
      const petites: number[] = [];
      const grandes: number[] = [];
      for (let passe = 0; passe < 3; passe += 1) {
        petites.push(creerN(5000, () => undefined));
        grandes.push(creerN(10_000, () => undefined));
      }
      const rapport = mediane(grandes) / mediane(petites);
      console.warn(
        `F-034 mesure : 5 000 = ${mediane(petites).toFixed(0)} ms, 10 000 = ${mediane(grandes).toFixed(0)} ms, rapport ${rapport.toFixed(2)}`,
      );
      expect(rapport).toBeLessThan(3);
    },
    DELAI_DU_TEST,
  );

  it(
    "F-034-AC7 cinq mille créations en fin, en tête, et à positions variées tiennent sous 20 s",
    () => {
      const PLAFOND = 20_000;
      expect(creerN(5000, () => undefined)).toBeLessThan(PLAFOND);
      expect(creerN(5000, () => 0)).toBeLessThan(PLAFOND);
      expect(creerN(5000, (i) => Math.floor((i * 2654435761) % (i + 1)))).toBeLessThan(PLAFOND);
    },
    DELAI_DU_TEST,
  );
});

void crypto;
