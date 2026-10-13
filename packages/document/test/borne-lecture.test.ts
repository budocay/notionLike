// F-029, lecture : un rang de plus de 1024 unités rend l'entrée mal formée, ignorée sans exception.
// La lecture bornée est celle de `lirePlace`, dans `src/format.ts`, seul lecteur des types racines.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirDocumentEspaceBorne } from "../src/document-espace.ts";
import {
  BORNE,
  codeDuRefus,
  ecrireEntrees,
  ecrirePlaceBrute,
  type Entree,
  id,
  identifiantsLus,
  idsDe,
  misesAJourPendant,
  trouver,
} from "./aides-borne.ts";
import { creerReplique, livrer } from "./aides.ts";
import { ETAT_V1_DE_F001, LECTURE_V1_DE_F001 } from "./etat-v1-f001.ts";

const LONGUEURS_HORS_BORNE = [BORNE + 1, 100_000, 5_000_000];
const NOMBRE_D_ENTREES = 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un rang conforme à la règle des rangs, de la longueur demandée : seule la longueur peut l'écarter. */
function rangDeLongueur(longueur: number): string {
  return "V".repeat(longueur - 1) + "k";
}

// La façade publique est `ouvrirDocumentEspaceBorne(doc, 1024)` (une ligne, `document-espace.ts`) :
// l'appeler directement ouvre une façade sur un `Y.Doc` sans écouteur `update`, qui encoderait sinon
// des milliers de rangs géants à chaque écriture du test.
function lireAvecLaBorne(
  doc: Y.Doc,
): ReturnType<ReturnType<typeof ouvrirDocumentEspaceBorne>["lire"]> {
  return ouvrirDocumentEspaceBorne(doc, BORNE).lire();
}

describe("borne à la lecture", () => {
  it.each([
    { longueur: BORNE, retenue: true },
    ...LONGUEURS_HORS_BORNE.map((longueur) => ({ longueur, retenue: false })),
  ])(
    "F-029-AC1 seule, une entrée de rang de $longueur unités est retenue : $retenue ; ses filles et les autres pages restent lues",
    ({ longueur, retenue }) => {
      const doc = new Y.Doc();
      ecrireEntrees(
        doc,
        new Map<string, Entree>([
          [id(1), { rang: "F" }],
          [id(2), { rang: rangDeLongueur(longueur) }],
          [id(3), { rang: "V", parent: id(2) }],
          [id(4), { rang: "k" }],
        ]),
      );

      const lue = lireAvecLaBorne(doc);

      expect(identifiantsLus(lue).includes(id(2))).toBe(retenue);
      if (retenue) {
        expect(idsDe(lue.racines)).toEqual([id(1), id(2), id(4)]);
        expect(idsDe(trouver(lue.racines, id(2))?.enfants ?? [])).toEqual([id(3)]);
      } else {
        // La fille d'une entrée ignorée est exposée à la racine (F-001-AC17), à la place de son rang.
        expect(idsDe(lue.racines)).toEqual([id(1), id(3), id(4)]);
      }
      expect(lue.corbeille).toEqual([]);
    },
  );

  it.each([BORNE, ...LONGUEURS_HORS_BORNE])(
    "F-029-AC1 sur 1 000 entrées du même document portant un rang de %i unités, la lecture rend sans exception, longueur contrôlée avant tout parcours",
    (longueur) => {
      const doc = new Y.Doc();
      const rang = rangDeLongueur(longueur);
      const entrees = new Map<string, Entree>([[id(1), { rang: "1" }]]);
      for (let numero = 2; numero <= NOMBRE_D_ENTREES + 1; numero += 1) {
        entrees.set(id(numero), { rang, corbeille: numero % 2 === 0 });
      }
      entrees.set(id(NOMBRE_D_ENTREES + 2), { rang: "z", parent: id(2) });
      ecrireEntrees(doc, entrees);
      const debut = performance.now();

      const lue = lireAvecLaBorne(doc);

      const duree = performance.now() - debut;
      const lus = identifiantsLus(lue);
      if (longueur <= BORNE) {
        expect(lus).toHaveLength(NOMBRE_D_ENTREES + 2);
        expect(lue.corbeille).toHaveLength(NOMBRE_D_ENTREES / 2);
      } else {
        expect(idsDe(lue.racines)).toEqual([id(1), id(NOMBRE_D_ENTREES + 2)]);
        expect(lue.corbeille).toEqual([]);
        // Parcourir cinq milliards d'unités prendrait des secondes : la longueur seule les écarte.
        expect(duree).toBeLessThan(1000);
      }
    },
  );
});

describe("rang hors borne reçu pendant l'usage", () => {
  it.each([BORNE + 1, 100_000])(
    "F-029-AC2 un rang de %i unités reçu par Y.applyUpdate retire la page sans exception, notifie une fois, et un rang admis reçu ensuite la remet à sa place",
    (longueur) => {
      const emettrice = creerReplique(1);
      const receptrice = creerReplique(2);
      const [premiere, seconde, troisieme] = ["Un", "Deux", "Trois"].map((titre) =>
        emettrice.espace.creerPage(titre),
      );
      emettrice.emises.forEach((miseAJour) => livrer(receptrice, miseAJour));
      const avant = emettrice.emises.length;
      const rappel = vi.fn();
      receptrice.espace.abonner(rappel);

      ecrirePlaceBrute(emettrice.espace.doc, seconde ?? "", null, rangDeLongueur(longueur));
      const horsBorne = emettrice.emises.slice(avant);
      expect(() => horsBorne.forEach((miseAJour) => livrer(receptrice, miseAJour))).not.toThrow();

      expect(idsDe(receptrice.espace.lire().racines)).toEqual([premiere, troisieme]);
      expect(rappel).toHaveBeenCalledTimes(1);

      const rendue = emettrice.emises.length;
      ecrirePlaceBrute(emettrice.espace.doc, seconde ?? "", null, "0V");
      emettrice.emises.slice(rendue).forEach((miseAJour) => livrer(receptrice, miseAJour));

      expect(idsDe(receptrice.espace.lire().racines)).toEqual([seconde, premiere, troisieme]);
      expect(rappel).toHaveBeenCalledTimes(2);
    },
  );
});

describe("une page ignorée se comporte comme une page absente", () => {
  const IGNOREE = id(2);

  function documentAvecUneIgnoree(): ReturnType<typeof creerReplique> {
    const replique = creerReplique(3);
    ecrireEntrees(
      replique.espace.doc,
      new Map<string, Entree>([
        [id(1), { rang: "F" }],
        [IGNOREE, { rang: rangDeLongueur(BORNE + 1) }],
        [id(3), { rang: "V", parent: IGNOREE }],
      ]),
    );
    return replique;
  }

  it.each<[string, (espace: ReturnType<typeof creerReplique>["espace"]) => unknown]>([
    ["un renommage", (espace) => espace.renommerPage(IGNOREE, "Nouveau titre")],
    ["une mise à la corbeille", (espace) => espace.mettreALaCorbeille(IGNOREE)],
    ["un déplacement de la page", (espace) => espace.deplacerPage(IGNOREE, { parent: null })],
    ["un déplacement sous elle", (espace) => espace.deplacerPage(id(1), { parent: IGNOREE })],
    ["une création sous elle", (espace) => espace.creerPage("Fille", { parent: IGNOREE })],
  ])(
    "F-029-AC3 %s visant une entrée de rang hors borne est refusé par page-introuvable, sans mise à jour",
    (_cas, operation) => {
      const { espace } = documentAvecUneIgnoree();
      const etat = Y.encodeStateAsUpdate(espace.doc);

      const emises = misesAJourPendant(espace.doc, () => {
        expect(codeDuRefus(() => operation(espace))).toBe("page-introuvable");
      });

      expect(emises).toEqual([]);
      expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etat);
    },
  );
});

describe("même lecture d'un rang hors borne partout", () => {
  it("F-029-AC12 deux répliques qui reçoivent une entrée hors borne écrite par un client non conforme, dans des ordres différents parmi d'autres mises à jour, lisent la même arborescence, sans elle", () => {
    const auteur = creerReplique(4);
    const pages = ["A", "B", "C"].map((titre) => auteur.espace.creerPage(titre));
    const [a = "", b = "", c = ""] = pages;
    auteur.espace.creerPage("Fille de B", { parent: b });
    const deLAuteur = [...auteur.emises];

    const fautif = new Y.Doc();
    fautif.clientID = 5;
    deLAuteur.forEach((miseAJour) => Y.applyUpdate(fautif, miseAJour));
    const avant = Y.encodeStateVector(fautif);
    ecrirePlaceBrute(fautif, b, null, rangDeLongueur(100_000));
    ecrireEntrees(fautif, new Map([[id(9), { rang: "z".repeat(BORNE + 1) }]]));
    const horsBorne = Y.encodeStateAsUpdate(fautif, avant);

    const autre = creerReplique(6);
    deLAuteur.forEach((miseAJour) => livrer(autre, miseAJour));
    autre.espace.renommerPage(a, "A renommée");
    autre.espace.mettreALaCorbeille(c);
    const deLAutre = [...autre.emises];

    const premiere = creerReplique(7);
    const seconde = creerReplique(8);
    [...deLAuteur, horsBorne, ...deLAutre].forEach((miseAJour) => livrer(premiere, miseAJour));
    [horsBorne, ...deLAutre.slice().reverse(), ...deLAuteur.slice().reverse()].forEach(
      (miseAJour) => livrer(seconde, miseAJour),
    );

    const lue = premiere.espace.lire();
    expect(seconde.espace.lire()).toEqual(lue);
    expect(identifiantsLus(lue)).not.toContain(b);
    expect(identifiantsLus(lue)).not.toContain(id(9));
    expect(idsDe(lue.racines)).toHaveLength(2);
    expect(idsDe(lue.corbeille)).toEqual([c]);
  });
});

describe("format de version 1 inchangé", () => {
  it("F-029-AC13 un état V1 produit par le code de F-001 (7e99266) se lit avec l'arborescence et la corbeille consignées avec lui", () => {
    const replique = creerReplique(9);

    livrer(replique, new Uint8Array(Buffer.from(ETAT_V1_DE_F001, "base64")));

    expect(replique.espace.lire()).toEqual(LECTURE_V1_DE_F001);
    expect(replique.espace.doc.getMap("meta").get("version")).toBe(1);
    expect([...replique.espace.doc.share.keys()].sort()).toEqual(["meta", "pages"]);
  });

  it("F-029-AC13 un document créé après F-029 porte toujours la version 1, et ses entrées les trois mêmes champs", () => {
    const replique = creerReplique(10);
    livrer(replique, new Uint8Array(Buffer.from(ETAT_V1_DE_F001, "base64")));

    replique.espace.creerPage("Nouvelle");

    const champs = new Set<string>();
    replique.espace.doc.getMap("pages").forEach((valeur) => {
      (valeur as Y.Map<unknown>).forEach((_contenu, champ) => champs.add(champ));
    });
    expect([...champs].sort()).toEqual(["corbeille", "place", "titre"]);
    expect(replique.espace.doc.getMap("meta").get("version")).toBe(1);
  });
});
