// F-032-AC23 (levée de D-009) : identifiant de l'espace de l'appareil illisible sur un appareil à
// plusieurs espaces. La réparation de F-030-AC23 n'énumère que les bases d'espace sans entrée
// lisible au registre ; elle n'efface, ne renomme ni ne fusionne aucune base. Les tests de
// F-030-AC23 et AC24 (reprise-reparation.test.ts) passent sans modification.
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirEspaceLocal, ouvrirPersistance } from "../src/persistance/index.ts";
import { ouvrirFacade } from "./aides-facade.ts";
import {
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  E_GAMMA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { attendreEtat, enregistrements, laisserIndexedDbTravailler } from "./aides-persistance.ts";
import { ecouterLesErreursNonInterceptees, identifiantInscrit } from "./aides-reprise.ts";

const baseDe = (idEspace: string): string => `notionlike:espace:${idEspace}`;

async function enregistrerUnePageDans(idEspace: string, titre: string): Promise<void> {
  const facade = ouvrirFacade(new Y.Doc());
  const persistance = ouvrirPersistance(facade.doc, { type: "espace", idEspace });
  await attendreEtat(persistance, "active");
  facade.creerPage(titre);
  await laisserIndexedDbTravailler();
  persistance.fermer();
}

/** Ouvre l'espace de l'appareil avec ce candidat ; rend ses titres et l'avertissement. */
async function ouvrirAvec(candidat: string): Promise<{ titres: string[]; averti: boolean }> {
  const facade = ouvrirFacade(new Y.Doc());
  const persistance = ouvrirEspaceLocal(facade.doc, candidat);
  await attendreEtat(persistance, "active");
  const titres = facade
    .lire()
    .racines.map((page) => page.titre)
    .sort();
  const averti = persistance.aLaisseDesBasesNonRattachees();
  persistance.fermer();
  return { titres, averti };
}

async function empreintes(...ids: string[]): Promise<number[][][]> {
  return Promise.all(ids.map((id) => enregistrements(baseDe(id))));
}

describe("réparation de l'identifiant restreinte par le registre (F-032-AC23)", () => {
  it("F-032-AC23 illisible, base de l'espace de l'appareil non inscrite et base d'un espace ajouté inscrite : la première est retenue, sans avertissement, sans rien toucher à la seconde", async () => {
    await enregistrerUnePageDans(E_APPAREIL, "Page de l'appareil");
    await enregistrerUnePageDans(E_ALPHA, "Page d'Alpha");
    await poserDansLAppareil({ "espace-local": null, [`registre:${E_ALPHA}`]: ECRITURE });
    const avant = await empreintes(E_APPAREIL, E_ALPHA);

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: ["Page de l'appareil"], averti: false });
    expect(await identifiantInscrit()).toBe(E_APPAREIL);
    expect((await empreintes(E_ALPHA))[0]).toEqual(avant[1]);
  });

  it("F-032-AC23 illisible et deux bases inscrites : le candidat est inscrit sans avertissement, les deux bases restent intactes", async () => {
    await enregistrerUnePageDans(E_ALPHA, "Page d'Alpha");
    await enregistrerUnePageDans(E_BETA, "Page de Bêta");
    await poserDansLAppareil({
      "espace-local": "illisible",
      [`registre:${E_ALPHA}`]: ECRITURE,
      [`registre:${E_BETA}`]: LECTURE,
    });
    const avant = await empreintes(E_ALPHA, E_BETA);

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: [], averti: false });
    expect(await identifiantInscrit()).toBe(E_GAMMA);
    expect(await empreintes(E_ALPHA, E_BETA)).toEqual(avant);
  });

  it("F-032-AC23 illisible, deux bases non inscrites : le candidat est inscrit avec l'avertissement de F-030-AC23", async () => {
    await enregistrerUnePageDans(E_APPAREIL, "Une");
    await enregistrerUnePageDans(E_BETA, "Autre");
    await poserDansLAppareil({ "espace-local": 7, [`registre:${E_ALPHA}`]: ECRITURE });

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: [], averti: true });
    expect(await identifiantInscrit()).toBe(E_GAMMA);
  });

  it("F-032-AC23 R3 illisible, une base non inscrite et une valeur d'une autre forme sous la clé d'un autre espace énuméré : registre illisible, candidat et avertissement", async () => {
    await enregistrerUnePageDans(E_APPAREIL, "Une");
    await enregistrerUnePageDans(E_ALPHA, "Autre");
    await poserDansLAppareil({
      "espace-local": null,
      [`registre:${E_ALPHA}`]: { rattachement: "adopte", droit: "tout" },
    });

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: [], averti: true });
    expect(await identifiantInscrit()).toBe(E_GAMMA);
  });

  it("F-032-AC23 R3 illisible et transaction de lecture du registre en échec : candidat et avertissement, sans erreur non interceptée", async () => {
    const relever = ecouterLesErreursNonInterceptees();
    await enregistrerUnePageDans(E_APPAREIL, "Une");
    await poserDansLAppareil({ "espace-local": null });
    const transiger = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      ...arguments_: Parameters<IDBDatabase["transaction"]>
    ) {
      if (this.name === "notionlike:appareil" && arguments_[1] === "readonly") {
        throw new DOMException("refus", "UnknownError");
      }
      return transiger.apply(this, arguments_);
    });

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: [], averti: true });
    vi.restoreAllMocks();
    expect(await identifiantInscrit()).toBe(E_GAMMA);
    await laisserIndexedDbTravailler();
    expect(relever()).toEqual([]);
  });

  it("F-032-AC23 un magasin recréé vide se lit comme un registre vide : ses bases relèvent du cas « non inscrites » (limite d'H7)", async () => {
    await enregistrerUnePageDans(E_ALPHA, "Seule");
    await poserDansLAppareil({ "espace-local": null });

    expect(await ouvrirAvec(E_GAMMA)).toEqual({ titres: ["Seule"], averti: false });
    expect(await identifiantInscrit()).toBe(E_ALPHA);
  });
});
