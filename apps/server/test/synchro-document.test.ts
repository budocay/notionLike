// Couture du format du document d'espace (F-012-AC29, AC38 à AC40) : le serveur relaie et stocke ce
// que l'interface publique de `@notionlike/document` écrit, sans l'interpréter, à la seule clé de
// version près. Chaque façade ouverte ici est fermée (F-002-AC30). Les deux modules hors du paquet
// du document qui nomment ses types racines y sont couverts, rang borné compris (F-029-AC16) :
// `apps/server/src/synchro-stockage.ts`, qui lit la seule clé de version, et
// `packages/contrats/src/synchro.ts`, qui publie la liste des versions admises.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import { nomDeDocument, VERSION_DU_DOCUMENT_D_ESPACE } from "@notionlike/contrats";
import { ErreurDocument } from "@notionlike/document";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  attendreQue,
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  fournisseurSynchronise,
  pause,
  preparerUnEspace,
  priseDeFournisseur,
  type ClientBrut,
  type EspaceDEssai,
} from "./aides-synchro.ts";
import { creerFacade, fermerLesFacades, ouvrirFacade } from "./aides-facade.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

const SRC = new URL("../src/", import.meta.url);

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({
    reglages: { attenteDEnregistrementMs: 50, attenteMaxDEnregistrementMs: 200 },
  });
}, DELAI_SYNCHRO_MS);
afterEach(async () => {
  fermerLesFacades();
  await fermerLesClients();
});
afterAll(async () => {
  await serveur.fermer();
});

// Un espace neuf de la fabrique, et le nom de son document d'espace.
async function nouvelEspace(): Promise<{ espace: EspaceDEssai; nom: string }> {
  const neuf = await preparerUnEspace(serveur);
  return {
    espace: neuf,
    nom: nomDeDocument({ type: "espace", idEspace: neuf.idEspace, idDocument: neuf.idEspace }),
  };
}

// L'arborescence lue par un second client dans un document ouvert par `ouvrirDocumentEspace`.
async function lirePar(cookie: string, nom: string) {
  const ouvert = await fournisseurSynchronise(priseDeFournisseur(serveur, cookie), nom);
  const facade = ouvrirFacade(ouvert.doc);
  return { ouvert, facade, arbre: facade.lire() };
}

// Une mise à jour écrite par `ecrire` sur une copie de l'état que le client tient.
function miseAJourSur(client: ClientBrut, nom: string, ecrire: (doc: Y.Doc) => void): Uint8Array {
  const copie = new Y.Doc();
  Y.applyUpdate(copie, Y.encodeStateAsUpdate(client.doc(nom)));
  const avant = Y.encodeStateVector(copie);
  ecrire(copie);
  return Y.encodeStateAsUpdate(copie, avant);
}

function entree(doc: Y.Doc, id: string, rang: string, titre = "Entrée"): void {
  const champs = new Y.Map<unknown>();
  champs.set("titre", titre);
  champs.set("place", { parent: null, rang });
  champs.set("corbeille", false);
  doc.getMap("pages").set(id, champs);
}

describe("couture du format du document d'espace (F-012-AC29)", () => {
  it("F-012-AC29 seul le module du stockage d'apps/server lit, écrit ou encode un document Yjs, et aucun n'importe @notionlike/document", () => {
    const sources = readdirSync(SRC).map((nom) => [nom, readFileSync(new URL(nom, SRC), "utf8")]);

    expect(
      sources.filter(([, texte]) => /from "yjs"/.test(texte ?? "")).map(([nom]) => nom),
    ).toEqual(["synchro-stockage.ts"]);
    expect(sources.filter(([, texte]) => (texte ?? "").includes("@notionlike/document"))).toEqual(
      [],
    );
  });

  it(
    "F-012-AC29 une arborescence écrite par l'interface publique, enregistrée puis rechargée après un redémarrage, est relue à l'identique",
    async () => {
      const { espace: neuf, nom } = await nouvelEspace();
      const original = creerFacade();
      const a = original.creerPage("A");
      const b = original.creerPage("B", { parent: a });
      const c = original.creerPage("C", { parent: a });
      original.renommerPage(b, "B renommée");
      original.deplacerPage(c, { parent: null, position: 0 });
      const jetee = original.creerPage("Jetée", { parent: b });
      original.mettreALaCorbeille(jetee);
      const ecrivain = await fournisseurSynchronise(
        priseDeFournisseur(serveur, neuf.editeur.cookie),
        nom,
        original.doc,
      );
      await attendreQue(async () => {
        const stocke = await serveur.lireInstantane(nom);
        if (stocke === undefined) {
          return false;
        }
        const relu = new Y.Doc();
        Y.applyUpdate(relu, stocke);
        return relu.getMap("pages").size === 4;
      });
      ecrivain.provider.detach();

      await serveur.redemarrer();
      const { arbre } = await lirePar(neuf.lecteur.cookie, nom);

      expect(arbre).toEqual(original.lire());
      const stocke = await serveur.lireInstantane(nom);
      const applique = new Y.Doc();
      Y.applyUpdate(applique, stocke ?? new Uint8Array([0, 0]));
      expect(ouvrirFacade(applique).lire()).toEqual(original.lire());
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("version du document d'espace (F-012-AC38, AC39)", () => {
  it.each<[string, unknown]>([
    ["2", 2],
    ["99", 99],
    ["0", 0],
    ['"1"', "1"],
    ["null", null],
    ["un objet", { version: 1 }],
  ])(
    "F-012-AC38 une version %s est refusée en entier par version-refusee, et le document reste lisible",
    async (_cas, version) => {
      const { espace: neuf, nom } = await nouvelEspace();
      const client = await connecterBrut(serveur, { cookie: neuf.editeur.cookie });
      await client.ouvrirEtSynchroniser(nom);
      const temoin = await connecterBrut(serveur, { cookie: neuf.proprietaire.cookie });
      await temoin.ouvrirEtSynchroniser(nom);
      const depuis = client.recus.length;
      const depuisTemoin = temoin.recus.length;

      client.envoyer(
        brut.miseAJour(
          nom,
          miseAJourSur(client, nom, (doc) => {
            entree(doc, randomUUID(), "V", "Avec la version");
            doc.getMap("meta").set("version", version);
          }),
        ),
      );

      expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toEqual({
        nom,
        type: "fermeture",
        raison: "version-refusee",
      });
      await pause(300);
      expect(temoin.depuis(depuisTemoin)).toEqual([]);
      expect(await serveur.lireInstantane(nom)).toBeUndefined();
      const { arbre } = await lirePar(neuf.lecteur.cookie, nom);
      expect(arbre.racines).toEqual([]);
      expect(await client.ouvrirEtSynchroniser(nom)).toBe("read-write");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC38 la version 1 sur un document sans clé est acceptée",
    async () => {
      const { nom, espace: neuf } = await nouvelEspace();
      const client = await connecterBrut(serveur, { cookie: neuf.editeur.cookie });
      await client.ouvrirEtSynchroniser(nom);
      const depuis = client.recus.length;

      client.envoyer(
        brut.miseAJour(
          nom,
          miseAJourSur(client, nom, (doc) => doc.getMap("meta").set("version", 1)),
        ),
      );

      expect(await client.attendre((lu) => lu.type === "accuse", depuis)).toMatchObject({
        applique: true,
      });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC38 une version refusée portée par l'étape 2 de la synchronisation initiale est refusée de même",
    async () => {
      const { nom, espace: neuf } = await nouvelEspace();
      const horsLigne = new Y.Doc();
      entree(horsLigne, randomUUID(), "V");
      horsLigne.getMap("meta").set("version", 99);
      const client = await connecterBrut(serveur, { cookie: neuf.editeur.cookie });

      client.envoyer(brut.ouverture(nom));
      client.envoyer(brut.etape1(nom, horsLigne));
      client.envoyer(brut.etape2(nom, Y.encodeStateAsUpdate(horsLigne)));

      expect(await client.attendre((lu) => lu.type === "fermeture")).toEqual({
        nom,
        type: "fermeture",
        raison: "version-refusee",
      });
      await pause(300);
      expect(await serveur.lireInstantane(nom)).toBeUndefined();
      expect((await lirePar(neuf.lecteur.cookie, nom)).arbre.racines).toEqual([]);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC39 un document créé par creerDocumentEspace est accepté, sa version figure dans la liste publiée, et chaque version que le paquet refuse, le serveur la refuse",
    async () => {
      const cree = creerFacade();
      cree.creerPage("Première");
      expect(VERSION_DU_DOCUMENT_D_ESPACE.admises).toContain(
        cree.doc
          .getMap(VERSION_DU_DOCUMENT_D_ESPACE.typeRacine)
          .get(VERSION_DU_DOCUMENT_D_ESPACE.cle),
      );
      const { nom, espace: neuf } = await nouvelEspace();
      await fournisseurSynchronise(priseDeFournisseur(serveur, neuf.editeur.cookie), nom, cree.doc);
      await attendreQue(async () => (await serveur.lireInstantane(nom)) !== undefined);

      const refusees: unknown[] = [];
      for (const version of [0, 1, 2, 3, 99, "1", null, -1, 1.5]) {
        const essai = new Y.Doc();
        essai.getMap("meta").set("version", version);
        const paquetRefuse = (() => {
          try {
            ouvrirFacade(essai).lire();
            return false;
          } catch (erreur) {
            return (
              erreur instanceof ErreurDocument && erreur.code === "version-non-prise-en-charge"
            );
          }
        })();
        const admise = (VERSION_DU_DOCUMENT_D_ESPACE.admises as readonly unknown[]).includes(
          version,
        );
        expect(paquetRefuse, String(version)).toBe(!admise);
        if (paquetRefuse) {
          refusees.push(version);
        }
      }

      const client = await connecterBrut(serveur, { cookie: neuf.editeur.cookie });
      await client.ouvrirEtSynchroniser(nom);
      for (const version of refusees) {
        const depuis = client.recus.length;
        client.envoyer(
          brut.miseAJour(
            nom,
            miseAJourSur(client, nom, (doc) => doc.getMap("meta").set("version", version)),
          ),
        );
        expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toMatchObject({
          raison: "version-refusee",
        });
        await client.ouvrirEtSynchroniser(nom);
      }
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("rang borné de bout en bout (F-012-AC40)", () => {
  it.each([
    ["une entrée de rang de plus de 1024 unités", [["V".repeat(1025)]]],
    [
      "deux entrées voisines de rangs de 1024 unités sans rang admis entre elles",
      [[`${"V".repeat(1023)}1`], [`${"V".repeat(1023)}2`]],
    ],
  ])(
    "F-012-AC40 %s est relayée et stockée ; un second client lit l'arborescence sans exception et y crée une page",
    async (_cas, rangs) => {
      const { nom, espace: neuf } = await nouvelEspace();
      const original = creerFacade();
      const premiere = original.creerPage("Première");
      const ecrivain = await fournisseurSynchronise(
        priseDeFournisseur(serveur, neuf.editeur.cookie),
        nom,
        original.doc,
      );
      for (const [rang] of rangs) {
        entree(ecrivain.doc, randomUUID(), rang ?? "", "Forgée");
      }
      await attendreQue(async () => {
        const stocke = await serveur.lireInstantane(nom);
        return stocke !== undefined && Buffer.from(stocke).includes("Forgée");
      });

      const { facade, ouvert } = await lirePar(neuf.lecteur.cookie, nom);
      const lecteurEditeur = await lirePar(neuf.proprietaire.cookie, nom);

      expect(ouvert.doc.getMap("pages").size).toBe(1 + rangs.length);
      const ids = facade.lire().racines.map((page) => page.id);
      expect(rangs.length === 1 ? ids : ids.slice(0, 1)).toEqual([premiere]);
      // Une seule entrée forgée : ignorée, la page va en fin ; deux voisines : entre elles (F-029-AC7).
      const creee = lecteurEditeur.facade.creerPage("Nouvelle", {
        parent: null,
        position: rangs.length,
      });
      expect(lecteurEditeur.facade.lire().racines.map((page) => page.id)[rangs.length]).toBe(creee);
    },
    DELAI_SYNCHRO_MS,
  );
});
