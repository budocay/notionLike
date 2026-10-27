// F-032 : ce que la base de l'appareil retient des espaces de l'appareil (AC19), sans migration ni
// montée de version, lu par le code du registre de F-013 inchangé ; échéances et pannes (AC31).
import { describe, expect, it, vi } from "vitest";

import {
  ajouterALAppareil,
  inscrireAuRegistre,
  inscrireLEspaceRetenu,
  lireLAppareil,
  lireLeRegistre,
  noterLesNoms,
  retirerDuRegistre,
  retirerLaMarque,
} from "../src/persistance/index.ts";
import {
  BASE_DE_L_APPAREIL,
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
  versionDeLAppareil,
} from "./aides-appareil.ts";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";
import {
  creerUneBase,
  ecouterLesErreursNonInterceptees,
  refuserLOuvertureDe,
  simulerLHorloge,
} from "./aides-reprise.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Un appareil déjà lancé : sa base, à sa première version, porte l'identifiant de son espace. */
async function appareilLance(): Promise<void> {
  await poserDansLAppareil({ "espace-local": E_APPAREIL });
}

describe("ce que l'appareil retient (F-032-AC19)", () => {
  it("F-032-AC19 l'ajout écrit l'entrée à deux champs exactement, lue `lu` par la lecture du registre de F-013 ; nom, marque et espace retenu vivent sous d'autres clés, sans montée de version", async () => {
    await appareilLance();

    expect(await ajouterALAppareil(E_ALPHA, LECTURE, "Alpha")).toBe(true);
    expect(await inscrireLEspaceRetenu(E_ALPHA)).toBe(true);

    expect(await lireLeRegistre(E_ALPHA)).toEqual({ issue: "lu", entree: LECTURE });
    expect(await contenuDeLAppareil()).toEqual({
      "espace-local": E_APPAREIL,
      "espace-retenu": E_ALPHA,
      [`nom:${E_ALPHA}`]: "Alpha",
      [`premiere-synchronisation:${E_ALPHA}`]: true,
      [`registre:${E_ALPHA}`]: { rattachement: "adopte", droit: "lecture" },
    });
    expect(Object.keys((await contenuDeLAppareil())[`registre:${E_ALPHA}`] as object)).toEqual([
      "rattachement",
      "droit",
    ]);
    expect(await versionDeLAppareil()).toBe(1);
  });

  it("F-032-AC19 une entrée écrite par F-013, sans nom ni marque, est relue sans migration ni perte ; une clé inconnue et une valeur d'une autre forme sont ignorées, rien n'est réécrit", async () => {
    await appareilLance();
    expect(await inscrireAuRegistre(E_ALPHA, ECRITURE)).toBe(true);
    await poserDansLAppareil({
      "cle-d-une-version-future": { quelque: "chose" },
      [`nom:${E_BETA}`]: 42,
      [`registre:${E_BETA}`]: { rattachement: "adopte", droit: "ecriture", nom: "forgé" },
      [`premiere-synchronisation:${E_ALPHA}`]: "oui",
      "espace-retenu": E_ALPHA.toUpperCase(),
    });
    const avant = await contenuDeLAppareil();

    expect(await lireLAppareil()).toEqual({
      issue: "lue",
      idEspaceLocal: E_APPAREIL,
      inscrits: [{ idEspace: E_ALPHA, entree: ECRITURE, nom: undefined, marque: false }],
      retenu: undefined,
    });
    expect(await contenuDeLAppareil()).toEqual(avant);
  });

  it("F-032-AC19 F-010-AC19 après ajout, noms, marque, retenu et retrait, le magasin ne porte que des identifiants d'espace, des noms d'espace, la marque et des entrées à deux champs : ni courriel, ni compte, ni jeton", async () => {
    await appareilLance();
    await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha");
    await ajouterALAppareil(E_BETA, LECTURE, "Bêta");
    await noterLesNoms(new Map([[E_ALPHA, "Alpha renommé"]]));
    await retirerLaMarque(E_ALPHA);
    await inscrireLEspaceRetenu(E_BETA);

    const contenu = await contenuDeLAppareil();
    for (const [cle, valeur] of Object.entries(contenu)) {
      const [sorte, idEspace] = cle.split(/:(.*)/s);
      if (cle === "espace-local" || cle === "espace-retenu") {
        expect(valeur).toMatch(UUID);
        continue;
      }
      expect(idEspace).toMatch(UUID);
      expect(["registre", "nom", "premiere-synchronisation"]).toContain(sorte);
      if (sorte === "registre") {
        expect(Object.keys(valeur as object).sort()).toEqual(["droit", "rattachement"]);
      } else if (sorte === "nom") {
        expect(["Alpha renommé", "Bêta"]).toContain(valeur);
      } else {
        expect(valeur).toBe(true);
      }
    }
    expect(Object.keys(contenu).sort()).toEqual([
      "espace-local",
      "espace-retenu",
      `nom:${E_ALPHA}`,
      `nom:${E_BETA}`,
      `premiere-synchronisation:${E_BETA}`,
      `registre:${E_ALPHA}`,
      `registre:${E_BETA}`,
    ]);
  });

  it("F-032-AC3 un nom n'est inscrit que pour un espace qui a une entrée au registre, relue dans la même transaction", async () => {
    await appareilLance();
    await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha");

    expect(
      await noterLesNoms(
        new Map([
          [E_ALPHA, "Alpha 2"],
          [E_BETA, "Pas sur l'appareil"],
          ["pas-un-uuid", "Rien"],
        ]),
      ),
    ).toBe(true);

    const contenu = await contenuDeLAppareil();
    expect(contenu[`nom:${E_ALPHA}`]).toBe("Alpha 2");
    expect(Object.keys(contenu).filter((cle) => cle.startsWith("nom:"))).toEqual([
      `nom:${E_ALPHA}`,
    ]);
  });

  it("F-032-AC20 F-032-AC17 le retrait du registre emporte l'entrée, le nom, la marque et l'espace retenu qui le désigne, et rien d'un autre espace", async () => {
    await appareilLance();
    await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha");
    await ajouterALAppareil(E_BETA, ECRITURE, "Bêta");
    await inscrireLEspaceRetenu(E_ALPHA);

    expect(await retirerDuRegistre(E_BETA, false)).toBe(true);
    expect(Object.keys(await contenuDeLAppareil()).sort()).toEqual([
      "espace-local",
      "espace-retenu",
      `nom:${E_ALPHA}`,
      `premiere-synchronisation:${E_ALPHA}`,
      `registre:${E_ALPHA}`,
    ]);

    expect(await retirerDuRegistre(E_ALPHA, false)).toBe(true);
    expect(await contenuDeLAppareil()).toEqual({ "espace-local": E_APPAREIL });
  });

  it("F-032-AC21 F-013-AC24 l'oubli de l'espace de l'appareil retire aussi l'identifiant de l'espace local et l'espace retenu ; l'oubli d'un autre espace ne touche pas l'identifiant", async () => {
    await appareilLance();
    await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha");
    await inscrireAuRegistre(E_APPAREIL, ECRITURE);
    await inscrireLEspaceRetenu(E_ALPHA);

    expect(await retirerDuRegistre(E_ALPHA, true)).toBe(true);
    expect((await contenuDeLAppareil())["espace-local"]).toBe(E_APPAREIL);

    await inscrireLEspaceRetenu(E_BETA);
    expect(await retirerDuRegistre(E_APPAREIL, true)).toBe(true);
    expect(await contenuDeLAppareil()).toEqual({});
  });

  it("F-032-AC17 R1 retenir l'espace de l'appareil retire la clé `espace-retenu`, sans y inscrire son identifiant ; un identifiant mal formé n'est pas inscrit", async () => {
    await appareilLance();
    await inscrireLEspaceRetenu(E_ALPHA);

    expect(await inscrireLEspaceRetenu(undefined)).toBe(true);
    expect(await contenuDeLAppareil()).toEqual({ "espace-local": E_APPAREIL });
    expect(await inscrireLEspaceRetenu("pas-un-uuid")).toBe(false);
    expect(await contenuDeLAppareil()).toEqual({ "espace-local": E_APPAREIL });
  });
});

describe("échéances et pannes de la base de l'appareil (F-032-AC6, AC31)", () => {
  it("F-032-AC6 F-032-AC31 l'échéance tombe avant que la base réponde : l'ajout rend un échec, et la connexion obtenue ensuite est refermée sans rien écrire", async () => {
    await appareilLance();
    simulerLHorloge();

    const ajout = ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha");
    vi.advanceTimersByTime(10_000);

    expect(await ajout).toBe(false);
    vi.useRealTimers();
    await laisserIndexedDbTravailler();
    expect(await contenuDeLAppareil()).toEqual({ "espace-local": E_APPAREIL });
  });

  it("F-032-AC6 F-032-AC31 l'échéance tombe pendant la transaction de l'ajout : elle est annulée, aucune entrée, aucun nom ni marque ne reste", async () => {
    await appareilLance();
    simulerLHorloge();
    const ecrire = IDBObjectStore.prototype.put;
    let premiere = true;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...arguments_: Parameters<IDBObjectStore["put"]>
    ) {
      if (premiere) {
        premiere = false;
        // Après la fin du gestionnaire en cours, avant la validation de la transaction.
        queueMicrotask(() => vi.advanceTimersByTime(10_000));
      }
      return ecrire.apply(this, arguments_);
    });

    expect(await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha")).toBe(false);
    vi.restoreAllMocks();
    vi.useRealTimers();
    await laisserIndexedDbTravailler();
    expect(await contenuDeLAppareil()).toEqual({ "espace-local": E_APPAREIL });
    expect(await lireLeRegistre(E_ALPHA)).toEqual({ issue: "lu", entree: undefined });
  });

  it.each([
    ["absente", async (): Promise<void> => undefined],
    ["coupée", async (): Promise<void> => refuserLOuvertureDe(BASE_DE_L_APPAREIL)],
    [
      "d'une version supérieure à 2",
      async (): Promise<void> => {
        const demande = indexedDB.open(BASE_DE_L_APPAREIL, 3);
        demande.onupgradeneeded = () => demande.result.createObjectStore("reglages");
        await new Promise((resoudre) => {
          demande.onsuccess = resoudre;
        });
        demande.result.close();
      },
    ],
    ["sans son magasin", async (): Promise<void> => creerUneBase(BASE_DE_L_APPAREIL, ["autre"])],
  ])(
    "F-032-AC31 base de l'appareil %s : chaque opération rend son échec, sans rejet ni erreur non interceptée, et la base n'est ni créée ni modifiée",
    async (_cas, preparer) => {
      const relever = ecouterLesErreursNonInterceptees();
      await preparer();
      const bases = await nomsDesBases();

      expect(await lireLAppareil()).toEqual({ issue: "illisible" });
      expect(await ajouterALAppareil(E_ALPHA, ECRITURE, "Alpha")).toBe(false);
      expect(await noterLesNoms(new Map([[E_ALPHA, "Alpha"]]))).toBe(false);
      expect(await retirerLaMarque(E_ALPHA)).toBe(false);
      expect(await inscrireLEspaceRetenu(E_ALPHA)).toBe(false);
      expect(await inscrireLEspaceRetenu(undefined)).toBe(false);
      expect(await retirerDuRegistre(E_ALPHA, false)).toBe(false);
      expect(await lireLeRegistre(E_ALPHA)).toEqual({ issue: "illisible" });

      vi.restoreAllMocks();
      await laisserIndexedDbTravailler();
      expect(await nomsDesBases()).toEqual(bases);
      expect(relever()).toEqual([]);
    },
  );
});
