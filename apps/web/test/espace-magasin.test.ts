// F-032 : magasin de l'appareil. Composition de l'état (espace de l'appareil, espaces de l'appareil,
// noms, marque), noms montrés avant leur inscription (AC3), mise à jour des autres onglets par le
// canal de l'appareil (AC22), retrait (AC20), et aucune erreur non gérée quand la base de
// l'appareil manque, refuse ou n'a pas son magasin, ni quand le canal lève (AC31).
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANAL_DE_L_APPAREIL,
  type DependancesDuMagasin,
  droitInscrit,
  type MagasinDeLAppareil,
  ouvrirLeMagasinDeLAppareil,
} from "../src/espace/appareil.ts";
import {
  BASE_DE_L_APPAREIL,
  canauxRelies,
  contenuDeLAppareil,
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  E_GAMMA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { laisserIndexedDbTravailler } from "./aides-persistance.ts";
import {
  creerUneBase,
  ecouterLesErreursNonInterceptees,
  refuserLOuvertureDe,
} from "./aides-reprise.ts";

const fermetures: (() => void)[] = [];
afterEach(() => {
  fermetures.splice(0).forEach((fermer) => fermer());
});

function ouvrir(dependances: DependancesDuMagasin = {}): MagasinDeLAppareil {
  const magasin = ouvrirLeMagasinDeLAppareil(dependances);
  fermetures.push(magasin.fermer);
  return magasin;
}

function noms(magasin: MagasinDeLAppareil): Record<string, string | undefined> {
  const { espaceDeLAppareil, autres } = magasin.lireEtat();
  return Object.fromEntries(
    [espaceDeLAppareil, ...autres]
      .filter((espace) => espace !== undefined)
      .map((espace) => [espace.idEspace, espace.nom]),
  );
}

describe("ce que l'onglet sait des espaces de l'appareil (F-032-AC1, AC19)", () => {
  it("F-032-AC1 l'espace de l'appareil adopté reste l'espace de l'appareil, une seule fois ; les autres entrées sont les autres espaces de l'appareil, avec leur nom, leur droit et leur marque", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_APPAREIL}`]: ECRITURE,
      [`nom:${E_APPAREIL}`]: "Le mien",
      [`registre:${E_ALPHA}`]: LECTURE,
      [`nom:${E_ALPHA}`]: "Alpha",
      [`premiere-synchronisation:${E_ALPHA}`]: true,
      [`registre:${E_BETA}`]: ECRITURE,
      "espace-retenu": E_ALPHA,
    });
    const magasin = ouvrir();
    expect(magasin.lireEtat().lu).toBe(false);

    const etat = await magasin.relire();

    expect(etat).toEqual({
      lu: true,
      espaceDeLAppareil: { idEspace: E_APPAREIL, entree: ECRITURE, nom: "Le mien", marque: false },
      autres: [
        { idEspace: E_ALPHA, entree: LECTURE, nom: "Alpha", marque: true },
        { idEspace: E_BETA, entree: ECRITURE, nom: undefined, marque: false },
      ],
      retenu: E_ALPHA,
    });
    expect(droitInscrit(etat, undefined)).toBe("ecriture");
    expect(droitInscrit(etat, E_ALPHA)).toBe("lecture");
    expect(droitInscrit(etat, E_GAMMA)).toBeUndefined();
  });

  it("F-032-AC1 l'espace de l'appareil `local` n'a pas d'entrée ; avant la première lecture, rien n'est connu", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const magasin = ouvrir();

    expect(magasin.lireEtat()).toEqual({
      lu: false,
      espaceDeLAppareil: undefined,
      autres: [],
      retenu: undefined,
    });
    expect((await magasin.relire()).espaceDeLAppareil).toEqual({
      idEspace: E_APPAREIL,
      entree: undefined,
      nom: undefined,
      marque: false,
    });
  });

  it("F-032-AC5 F-032-AC8 l'ajout inscrit l'entrée, le nom et la marque ; le retrait de la marque la retire seule", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const magasin = ouvrir();
    await magasin.relire();

    expect(await magasin.ajouter(E_ALPHA, LECTURE, "Alpha")).toBe(true);
    expect(magasin.lireEtat().autres).toEqual([
      { idEspace: E_ALPHA, entree: LECTURE, nom: "Alpha", marque: true },
    ]);

    await magasin.retirerLaMarque(E_ALPHA);
    expect(magasin.lireEtat().autres[0]?.marque).toBe(false);
    expect(await contenuDeLAppareil()).toEqual({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: LECTURE,
      [`nom:${E_ALPHA}`]: "Alpha",
    });
  });
});

describe("dernier nom connu (F-032-AC3)", () => {
  it("F-032-AC3 un nom reçu est montré dans l'onglet avant que son inscription aboutisse, pour un espace de l'appareil seulement", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const magasin = ouvrir();
    await magasin.relire();
    const vus: Record<string, string | undefined>[] = [];
    magasin.abonner(() => vus.push(noms(magasin)));

    magasin.noterLesNoms(
      new Map([
        [E_ALPHA, "Alpha"],
        [E_GAMMA, "Pas d'ici"],
      ]),
    );

    expect(vus[0]).toEqual({ [E_APPAREIL]: undefined, [E_ALPHA]: "Alpha" });
    await waitFor(async () => expect((await contenuDeLAppareil())[`nom:${E_ALPHA}`]).toBe("Alpha"));
    expect(Object.keys(await contenuDeLAppareil())).not.toContain(`nom:${E_GAMMA}`);
  });

  it("F-032-AC3 F-032-AC31 l'inscription échoue : le nom reçu reste montré dans l'onglet, sans avertissement ni erreur non interceptée", async () => {
    await poserDansLAppareil({
      "espace-local": E_APPAREIL,
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`nom:${E_ALPHA}`]: "Ancien",
    });
    const relever = ecouterLesErreursNonInterceptees();
    const magasin = ouvrir();
    await magasin.relire();
    refuserLOuvertureDe(BASE_DE_L_APPAREIL);

    magasin.noterLesNoms(new Map([[E_ALPHA, "Nouveau"]]));
    await laisserIndexedDbTravailler();
    await magasin.relire();

    expect(noms(magasin)[E_ALPHA]).toBe("Nouveau");
    vi.restoreAllMocks();
    expect((await contenuDeLAppareil())[`nom:${E_ALPHA}`]).toBe("Ancien");
    expect(relever()).toEqual([]);
  });

  it("F-032-AC3 un nom reçu avant la première lecture, dont l'inscription échoue, n'est gardé après la lecture que pour un espace de l'appareil", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const magasin = ouvrir();
    refuserLOuvertureDe(BASE_DE_L_APPAREIL);
    magasin.noterLesNoms(
      new Map([
        [E_ALPHA, "Alpha"],
        [E_GAMMA, "Pas d'ici"],
      ]),
    );
    await laisserIndexedDbTravailler();
    vi.restoreAllMocks();
    await magasin.relire();

    // Gamma arrive plus tard sur l'appareil, sans nom : le nom reçu avant la lecture est oublié.
    await poserDansLAppareil({ [`registre:${E_GAMMA}`]: ECRITURE });
    await magasin.relire();

    expect(noms(magasin)).toEqual({
      [E_APPAREIL]: undefined,
      [E_ALPHA]: "Alpha",
      [E_GAMMA]: undefined,
    });
  });
});

describe("onglets du même navigateur (F-032-AC22)", () => {
  it("F-032-AC22 un ajout, un nom inscrit et un retrait faits dans un onglet sont lus par l'autre dans les 2 secondes, sans rechargement", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const canaux = canauxRelies();
    const retirerDeLAppareil = vi.fn(async (idEspace: string) => {
      await poserDansLAppareil({
        [`registre:${idEspace}`]: undefined,
        [`nom:${idEspace}`]: undefined,
      });
      return "retire" as const;
    });
    const premier = ouvrir({ ouvrirUnCanal: canaux.ouvrirUnCanal, retirerDeLAppareil });
    const second = ouvrir({ ouvrirUnCanal: canaux.ouvrirUnCanal });
    await Promise.all([premier.relire(), second.relire()]);
    const delai = { timeout: 2000 };

    await premier.ajouter(E_ALPHA, ECRITURE, "Alpha");
    await waitFor(() => expect(noms(second)[E_ALPHA]).toBe("Alpha"), delai);

    premier.noterLesNoms(new Map([[E_ALPHA, "Alpha renommé"]]));
    await waitFor(() => expect(noms(second)[E_ALPHA]).toBe("Alpha renommé"), delai);

    expect(await premier.retirer(E_ALPHA)).toBe("retire");
    await waitFor(() => expect(second.lireEtat().autres).toEqual([]), delai);
    expect(retirerDeLAppareil).toHaveBeenCalledWith(E_ALPHA);
  });

  it("F-032-AC22 F-032-AC31 un message d'une autre forme ne fait rien ; une fois fermé, le magasin ne prévient plus, ne relit plus, et son canal est fermé", async () => {
    const canaux = canauxRelies();
    const magasin = ouvrir({ ouvrirUnCanal: canaux.ouvrirUnCanal });
    const temoin = canaux.ouvrirUnCanal(CANAL_DE_L_APPAREIL);
    const recus: unknown[] = [];
    temoin.onmessage = (evenement) => recus.push(evenement.data);
    const vus: number[] = [];
    magasin.abonner(() => vus.push(1));
    expect(canaux.ouverts()).toBe(2);

    temoin.postMessage({ sorte: "autre" });
    temoin.postMessage(null);
    await laisserIndexedDbTravailler();
    expect(vus).toEqual([]);

    magasin.prevenir();
    await laisserIndexedDbTravailler();
    expect(recus).toEqual([{ sorte: "change" }]);

    magasin.fermer();
    magasin.prevenir();
    temoin.postMessage({ sorte: "change" });
    await laisserIndexedDbTravailler();
    expect(recus).toHaveLength(1);
    expect(vus).toEqual([]);
    expect(canaux.ouverts()).toBe(1);
  });
});

describe("retrait de l'appareil (F-032-AC20)", () => {
  it("F-032-AC20 l'espace de l'appareil n'est jamais retiré par le magasin ; sans fonction de retrait, chaque demande échoue", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const retirerDeLAppareil = vi.fn(async () => "retire" as const);
    const avec = ouvrir({ retirerDeLAppareil });
    const sans = ouvrir();
    await Promise.all([avec.relire(), sans.relire()]);

    expect(await avec.retirer(E_APPAREIL)).toBe("echec");
    expect(retirerDeLAppareil).not.toHaveBeenCalled();
    expect(await sans.retirer(E_ALPHA)).toBe("echec");
  });

  it("F-032-AC20 F-032-AC31 une fonction de retrait qui rejette rend un échec, et la liste est relue", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL, [`registre:${E_ALPHA}`]: ECRITURE });
    const relever = ecouterLesErreursNonInterceptees();
    const magasin = ouvrir({
      retirerDeLAppareil: () => Promise.reject(new Error("panne")),
    });
    await magasin.relire();

    expect(await magasin.retirer(E_ALPHA)).toBe("echec");
    expect(magasin.lireEtat().autres.map(({ idEspace }) => idEspace)).toEqual([E_ALPHA]);
    expect(relever()).toEqual([]);
  });
});

describe("pannes de la base de l'appareil et du canal (F-032-AC31)", () => {
  it.each([
    ["absente", async (): Promise<void> => undefined],
    [
      "qui refuse son ouverture",
      async (): Promise<void> => refuserLOuvertureDe(BASE_DE_L_APPAREIL),
    ],
    ["sans son magasin", async (): Promise<void> => creerUneBase(BASE_DE_L_APPAREIL, ["autre"])],
  ])(
    "F-032-AC31 base de l'appareil %s : chaque opération rend son issue, aucune n'est rejetée, rien n'est levé",
    async (_cas, preparer) => {
      const relever = ecouterLesErreursNonInterceptees();
      await preparer();
      const magasin = ouvrir({ retirerDeLAppareil: async () => "echec" as const });

      expect((await magasin.relire()).lu).toBe(false);
      expect(await magasin.ajouter(E_ALPHA, ECRITURE, "Alpha")).toBe(false);
      magasin.noterLesNoms(new Map([[E_ALPHA, "Alpha"]]));
      await magasin.retirerLaMarque(E_ALPHA);
      expect(await magasin.retenir(E_ALPHA)).toBe(false);
      expect(await magasin.retenir(undefined)).toBe(false);
      expect(await magasin.retirer(E_ALPHA)).toBe("echec");
      await laisserIndexedDbTravailler();

      expect(magasin.lireEtat().lu).toBe(false);
      vi.restoreAllMocks();
      expect(relever()).toEqual([]);
    },
  );

  it("F-032-AC31 un canal qu'on ne peut ouvrir, et un canal qui lève à l'envoi et à la fermeture : le magasin fonctionne sans rien lever", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const sansCanal = ouvrir({
      ouvrirUnCanal: () => {
        throw new Error("pas de canal");
      },
    });
    const canalQuiLeve = ouvrir({
      ouvrirUnCanal: () => ({
        onmessage: null,
        postMessage: () => {
          throw new DOMException("fermé", "InvalidStateError");
        },
        close: () => {
          throw new Error("fermeture");
        },
      }),
    });

    expect(await sansCanal.ajouter(E_ALPHA, ECRITURE, "Alpha")).toBe(true);
    expect(await canalQuiLeve.ajouter(E_BETA, ECRITURE, "Beta")).toBe(true);
    expect(() => canalQuiLeve.fermer()).not.toThrow();
    expect((await sansCanal.relire()).autres.map(({ idEspace }) => idEspace)).toEqual([
      E_ALPHA,
      E_BETA,
    ]);
  });

  it("F-032-AC31 un abonné qui lève ne prive pas les suivants et ne remonte pas", async () => {
    await poserDansLAppareil({ "espace-local": E_APPAREIL });
    const signalement = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const magasin = ouvrir();
    const vus: number[] = [];
    magasin.abonner(() => {
      throw new Error("abonné fautif");
    });
    magasin.abonner(() => vus.push(1));

    await magasin.relire();

    expect(vus).toEqual([1]);
    expect(signalement).toHaveBeenCalledTimes(1);
  });
});
