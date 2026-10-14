// Stockage des instantanés (F-012-AC18 à AC21, AC23, AC24, AC26, AC35, ADR-0001), contre le serveur
// réel de la fabrique : fenêtre d'enregistrement réduite, défaillance provoquée, horloge injectée.
import { randomUUID } from "node:crypto";

import { nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  attendreQue,
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  fournisseurSynchronise,
  miseAJourTexte,
  nombreDeDocumentsStockes,
  pause,
  preparerUnEspace,
  priseDeFournisseur,
  texteDe,
  type ClientBrut,
  type EspaceDEssai,
} from "./aides-synchro.ts";
import { laisseDesStructuresEnAttente } from "../src/synchro-stockage.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

const TEMOIN = "TEMOIN-DU-CONTENU-7f3a";
const REQUETE = 'select "instantane" from "document" where "idEspace" = $1';

// Pannes provoquées : un nombre d'échecs à venir par opération, ou `Infinity`. L'erreur levée porte
// un texte de requête et le contenu témoin, comme une erreur brute de la base.
const pannes = { chargement: 0, enregistrement: 0 };
const essais = { enregistrement: 0 };

let serveur: ServeurDEssai;
let petit: ServeurDEssai;
let espace: EspaceDEssai;
let espacePetit: EspaceDEssai;

beforeAll(async () => {
  [serveur, petit] = await Promise.all([
    demarrerServeurDEssai({
      reglages: { attenteDEnregistrementMs: 100, attenteMaxDEnregistrementMs: 600 },
      defaillance: (operation) => {
        if (operation === "enregistrement") {
          essais.enregistrement += 1;
        }
        if (pannes[operation] > 0) {
          pannes[operation] -= 1;
          throw new Error(`${REQUETE} -- params: ${TEMOIN}`);
        }
      },
    }),
    demarrerServeurDEssai({
      reglages: {
        attenteDEnregistrementMs: 100,
        attenteMaxDEnregistrementMs: 600,
        octetsParDocument: 4000,
        documentsParEspace: 2,
      },
    }),
  ]);
  [espace, espacePetit] = await Promise.all([preparerUnEspace(serveur), preparerUnEspace(petit)]);
}, DELAI_SYNCHRO_MS);
afterEach(async () => {
  pannes.chargement = 0;
  pannes.enregistrement = 0;
  await fermerLesClients();
});
afterAll(async () => {
  await Promise.all([serveur.fermer(), petit.fermer()]);
});

const page = (idEspace = espace.idEspace): string =>
  nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });

async function texteStocke(surLe: ServeurDEssai, document: string): Promise<string | undefined> {
  const stocke = await surLe.lireInstantane(document);
  if (stocke === undefined) {
    return undefined;
  }
  const relu = new Y.Doc();
  Y.applyUpdate(relu, stocke);
  return texteDe(relu);
}

async function ligneDe(surLe: ServeurDEssai, document: string): Promise<unknown> {
  const { idEspace, idDocument } = {
    idEspace: document.split(":")[1],
    idDocument: document.split(":")[2],
  };
  const lu = (await surLe.base.db.execute(
    `select "taille", "enregistreLe" from "document" where "idEspace" = '${idEspace ?? ""}' and "idDocument" = '${idDocument ?? ""}'`,
  )) as { rows: unknown[] };
  return JSON.stringify(lu.rows);
}

async function ecrire(client: ClientBrut, document: string, texte: string): Promise<void> {
  const depuis = client.recus.length;
  client.envoyer(brut.miseAJour(document, miseAJourTexte(texte, client.doc(document))));
  await client.attendre((lu) => lu.type === "accuse", depuis);
}

async function editeurSur(document: string, surLe = serveur, membre = espace.editeur) {
  const client = await connecterBrut(surLe, { cookie: membre.cookie });
  await client.ouvrirEtSynchroniser(document);
  return client;
}

function lignes(type: string) {
  return serveur.lignesDuJournal().filter((ligne) => ligne.type === type);
}

describe("fenêtre d'enregistrement (F-012-AC18)", () => {
  it(
    "F-012-AC18 l'instantané est enregistré après la dernière mise à jour, et au plus tard après la première tant que les mises à jour continuent",
    async () => {
      const document = page();
      const client = await editeurSur(document);

      await ecrire(client, document, "a");
      await attendreQue(async () => (await texteStocke(serveur, document)) === "a", 1000);

      const debut = Date.now();
      let rang = 0;
      while ((await texteStocke(serveur, document)) === "a") {
        await ecrire(client, document, String(rang));
        rang += 1;
        await pause(50);
        expect(Date.now() - debut).toBeLessThan(serveur.reglages.attenteMaxDEnregistrementMs + 500);
      }
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC18 la fermeture de la dernière ouverture enregistre aussitôt",
    async () => {
      const lente = await demarrerServeurDEssai();
      try {
        const espaceLent = await preparerUnEspace(lente);
        const document = page(espaceLent.idEspace);
        const client = await editeurSur(document, lente, espaceLent.editeur);
        await ecrire(client, document, "fin");

        client.envoyer(brut.fermeture(document));

        await attendreQue(async () => (await texteStocke(lente, document)) === "fin", 1000);
      } finally {
        await lente.fermer();
      }
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("redémarrage et reprise (F-012-AC19)", () => {
  it(
    "F-012-AC19 après un redémarrage, le document est rechargé de son instantané, égal à l'état enregistré",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      await ecrire(client, document, "avant l'arrêt");
      const etat = Y.encodeStateAsUpdate(client.doc(document));
      await client.fermer();

      await serveur.redemarrer();
      const relecteur = await editeurSur(document, serveur, espace.lecteur);

      expect(texteDe(relecteur.doc(document))).toBe("avant l'arrêt");
      expect(Y.encodeStateAsUpdate(relecteur.doc(document))).toEqual(etat);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC19 des modifications faites hors ligne arrivent par l'échange de synchronisation, sans autre action que la connexion",
    async () => {
      const document = page();
      const hors = new Y.Doc();
      hors.getText("contenu").insert(0, "hors ligne");

      await fournisseurSynchronise(
        priseDeFournisseur(serveur, espace.editeur.cookie),
        document,
        hors,
      );

      await attendreQue(async () => (await texteStocke(serveur, document)) === "hors ligne");
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("échec du chargement (F-012-AC20)", () => {
  it(
    "F-012-AC20 un chargement en échec refuse l'ouverture par erreur-interne après authenticated, sans aucun octet entre les deux, la ligne intacte",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      await ecrire(client, document, "stocké");
      await attendreQue(async () => (await texteStocke(serveur, document)) === "stocké");
      await client.fermer();
      await pause(200);
      const avant = await ligneDe(serveur, document);

      pannes.chargement = 1;
      const autre = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await autre.ouvrir(document);
      await autre.attendre((lu) => lu.type === "refusee");
      await pause(300);

      expect(autre.depuis(0, document).map((lu) => lu.type)).toEqual(["accordee", "refusee"]);
      expect(autre.depuis(0, document)[1]).toMatchObject({ texte: "erreur-interne" });
      expect(await ligneDe(serveur, document)).toBe(avant);
      expect(lignes("chargement-en-echec").some((ligne) => ligne.document === document)).toBe(true);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC20 un instantané illisible n'est jamais servi vide ni recouvert",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      await ecrire(client, document, "sera abîmé");
      await attendreQue(async () => (await texteStocke(serveur, document)) !== undefined);
      await client.fermer();
      await pause(200);
      await serveur.base.db.execute(
        `update "document" set "instantane" = '\\x0102ff'::bytea where "idDocument" = '${document.split(":")[2] ?? ""}'`,
      );
      const avant = await ligneDe(serveur, document);

      const autre = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await autre.ouvrir(document);
      expect(await autre.attendre((lu) => lu.type === "refusee")).toMatchObject({
        texte: "erreur-interne",
      });
      await pause(300);
      expect(await ligneDe(serveur, document)).toBe(avant);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("échec de l'enregistrement (F-012-AC21)", () => {
  it(
    "F-012-AC21 F-012-AC34 deux échecs puis le stockage rétabli : la relance du projet, sur l'horloge injectée, enregistre l'état courant",
    async () => {
      const erreurs = vi.spyOn(console, "error");
      const document = page();
      const client = await editeurSur(document);
      pannes.enregistrement = 2;
      const avant = essais.enregistrement;

      await ecrire(client, document, "a");
      await attendreQue(() => essais.enregistrement === avant + 1);
      await pause(200);
      expect(essais.enregistrement).toBe(avant + 1);
      await ecrire(client, document, "b");
      await attendreQue(() => essais.enregistrement === avant + 2);
      expect(await texteStocke(serveur, document)).toBeUndefined();

      serveur.horloge.avancer(serveur.reglages.relanceDEnregistrementMs);

      await attendreQue(async () => (await texteStocke(serveur, document)) === "ba");
      expect(client.prise.readyState).toBe(1);
      expect(lignes("enregistrement-en-echec").filter((l) => l.document === document)).toHaveLength(
        2,
      );
      expect(erreurs.mock.calls.flat().join(" ")).not.toContain("storeDocumentHooks");
      erreurs.mockRestore();
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC21 un document déchargé avant qu'un essai réussisse n'est plus jamais écrit, même rouvert, et l'événement est consigné",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      pannes.enregistrement = Number.POSITIVE_INFINITY;
      await ecrire(client, document, "perdu");
      await attendreQue(() =>
        lignes("enregistrement-en-echec").some((l) => l.document === document),
      );

      client.envoyer(brut.fermeture(document));
      await attendreQue(() =>
        lignes("instantane-non-enregistre").some((ligne) => ligne.document === document),
      );
      pannes.enregistrement = 0;
      const rouvert = await editeurSur(document);
      serveur.horloge.avancer(serveur.reglages.relanceDEnregistrementMs * 3);
      await pause(500);

      expect(texteDe(rouvert.doc(document))).toBe("");
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC21 un espace supprimé pendant la relance : l'enregistrement est abandonné sans rien recréer",
    async () => {
      const autre = await preparerUnEspace(serveur);
      const document = page(autre.idEspace);
      const client = await editeurSur(document, serveur, autre.editeur);
      pannes.enregistrement = 1;
      await ecrire(client, document, "orphelin");
      await attendreQue(() =>
        lignes("enregistrement-en-echec").some((l) => l.document === document),
      );

      await serveur.supprimerEspace(autre.proprietaire.cookie, autre.idEspace);
      serveur.horloge.avancer(serveur.reglages.relanceDEnregistrementMs);
      await pause(500);

      expect(await serveur.lireInstantane(document)).toBeUndefined();
      const espaces = (await serveur.base.db.execute(
        `select 1 from "espace" where "id" = '${autre.idEspace}'`,
      )) as { rows: unknown[] };
      expect(espaces.rows).toEqual([]);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("mise à jour incomplète (F-012-AC20)", () => {
  it("F-012-AC20 trou d'horloge, origine absente et suppression d'éléments inconnus laissent des structures en attente ; une mise à jour complète non", () => {
    const serveurVide = new Y.Doc();
    const a = new Y.Doc();
    a.getText("t").insert(0, "x");
    const insertionDeA = Y.encodeStateAsUpdate(a);
    const b = new Y.Doc();
    Y.applyUpdate(b, insertionDeA);
    const avantB = Y.encodeStateVector(b);
    b.getText("t").insert(1, "y");
    const suiteDeB = Y.encodeStateAsUpdate(b, avantB);
    const avantSuppression = Y.encodeStateVector(a);
    a.getText("t").delete(0, 1);
    const suppressionSeule = Y.encodeStateAsUpdate(a, avantSuppression);
    b.getText("t").insert(0, "1");
    const apresUn = Y.encodeStateVector(b);
    b.getText("t").insert(0, "2");
    const aTrou = Y.encodeStateAsUpdate(b, apresUn);

    expect(laisseDesStructuresEnAttente(serveurVide, insertionDeA)).toBe(false);
    expect(laisseDesStructuresEnAttente(serveurVide, suiteDeB)).toBe(true);
    expect(laisseDesStructuresEnAttente(serveurVide, suppressionSeule)).toBe(true);
    const connu = new Y.Doc();
    Y.applyUpdate(connu, insertionDeA);
    Y.applyUpdate(connu, suiteDeB);
    expect(laisseDesStructuresEnAttente(connu, aTrou)).toBe(true);
    expect(laisseDesStructuresEnAttente(connu, suppressionSeule)).toBe(false);
    for (const doc of [serveurVide, a, b, connu]) {
      doc.destroy();
    }
  });

  it(
    "F-012-AC20 une mise à jour à trou d'horloge est refusée avant d'être appliquée, et le document se recharge après un redémarrage",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      await ecrire(client, document, "a");
      const temoin = await editeurSur(document, serveur, espace.proprietaire);
      const copie = new Y.Doc();
      Y.applyUpdate(copie, Y.encodeStateAsUpdate(client.doc(document)));
      copie.getText("contenu").insert(1, "b");
      const apresB = Y.encodeStateVector(copie);
      copie.getText("contenu").insert(2, "c");
      const aTrou = Y.encodeStateAsUpdate(copie, apresB);
      const depuis = client.recus.length;
      const depuisTemoin = temoin.recus.length;

      client.envoyer(brut.miseAJour(document, aTrou));

      expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toEqual({
        nom: document,
        type: "fermeture",
        raison: "erreur-interne",
      });
      await pause(serveur.reglages.attenteMaxDEnregistrementMs + 200);
      expect(temoin.depuis(depuisTemoin)).toEqual([]);
      expect(await texteStocke(serveur, document)).toBe("a");
      expect(lignes("mise-a-jour-incomplete").some((ligne) => ligne.document === document)).toBe(
        true,
      );

      await temoin.fermer();
      await client.fermer();
      await serveur.redemarrer();
      const relu = await editeurSur(document);
      expect(texteDe(relu.doc(document))).toBe("a");
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("taille et quota (F-012-AC23, AC24)", () => {
  it(
    "F-012-AC23 une mise à jour qui porterait la taille comptée au-delà du plafond est refusée par document-trop-grand, le document restant lisible",
    async () => {
      const document = page(espacePetit.idEspace);
      const client = await editeurSur(document, petit, espacePetit.editeur);
      const temoin = await editeurSur(document, petit, espacePetit.proprietaire);
      await ecrire(client, document, "x".repeat(2500));
      await attendreQue(() => texteDe(temoin.doc(document)).length === 2500);
      const depuis = client.recus.length;
      const depuisTemoin = temoin.recus.length;

      client.envoyer(
        brut.miseAJour(document, miseAJourTexte("y".repeat(2000), client.doc(document))),
      );

      expect(await client.attendre((lu) => lu.type === "fermeture", depuis)).toEqual({
        nom: document,
        type: "fermeture",
        raison: "document-trop-grand",
      });
      await pause(400);
      expect(temoin.depuis(depuisTemoin)).toEqual([]);
      expect((await texteStocke(petit, document))?.length).toBe(2500);
      const relu = await editeurSur(document, petit, espacePetit.editeur);
      expect(texteDe(relu.doc(document)).length).toBe(2500);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC24 F-012-AC35 un espace au plafond de documents refuse la mise à jour qui en créerait un de plus, sans refuser un échange sans effet",
    async () => {
      const autre = await preparerUnEspace(petit);
      for (let rang = 0; rang < 2; rang += 1) {
        const document = page(autre.idEspace);
        const client = await editeurSur(document, petit, autre.editeur);
        await ecrire(client, document, `doc ${String(rang)}`);
        await attendreQue(async () => (await texteStocke(petit, document)) !== undefined);
      }
      const nouveau = page(autre.idEspace);
      const client = await editeurSur(nouveau, petit, autre.editeur);
      client.envoyer(brut.etape2(nouveau, Y.encodeStateAsUpdate(new Y.Doc())));
      await pause(200);
      expect(client.depuis(0, nouveau).some((lu) => lu.type === "fermeture")).toBe(false);

      client.envoyer(brut.miseAJour(nouveau, miseAJourTexte("de trop", client.doc(nouveau))));

      expect(await client.attendre((lu) => lu.type === "fermeture")).toEqual({
        nom: nouveau,
        type: "fermeture",
        raison: "quota-atteint",
      });
      await pause(300);
      expect(await petit.lireInstantane(nouveau)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("un échange sans effet n'écrit rien (F-012-AC35)", () => {
  it(
    "F-012-AC35 F-012-AC34 vingt documents jamais stockés ouverts, synchronisés et refermés par un éditeur ne créent aucune ligne, même après l'arrêt",
    async () => {
      const avant = await nombreDeDocumentsStockes(serveur);
      const prise = priseDeFournisseur(serveur, espace.editeur.cookie);
      for (let rang = 0; rang < 20; rang += 1) {
        const ouvert = await fournisseurSynchronise(prise, page());
        ouvert.provider.detach();
      }
      await pause(serveur.reglages.attenteMaxDEnregistrementMs + 300);
      expect(await nombreDeDocumentsStockes(serveur)).toBe(avant);

      await serveur.redemarrer();

      expect(await nombreDeDocumentsStockes(serveur)).toBe(avant);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC35 un document stocké rouvert sans rien y écrire garde sa ligne, date comprise",
    async () => {
      const document = page();
      const client = await editeurSur(document);
      await ecrire(client, document, "stable");
      await client.fermer();
      await attendreQue(async () => (await texteStocke(serveur, document)) === "stable");
      await pause(300);
      const avant = await ligneDe(serveur, document);

      const prise = priseDeFournisseur(serveur, espace.editeur.cookie);
      const ouvert = await fournisseurSynchronise(prise, document);
      expect(texteDe(ouvert.doc)).toBe("stable");
      ouvert.provider.detach();
      await pause(serveur.reglages.attenteMaxDEnregistrementMs + 300);

      expect(await ligneDe(serveur, document)).toBe(avant);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("journal et sortie du processus (F-012-AC26)", () => {
  it(
    "F-012-AC26 après un chargement et un enregistrement défaillants, ni la sortie standard, ni la sortie d'erreur, ni le journal ne portent d'octet de l'instantané ni de texte de requête",
    async () => {
      const sorties: string[] = [];
      const ecrireStdout = vi.spyOn(process.stdout, "write").mockImplementation((morceau) => {
        sorties.push(String(morceau));
        return true;
      });
      const ecrireStderr = vi.spyOn(process.stderr, "write").mockImplementation((morceau) => {
        sorties.push(String(morceau));
        return true;
      });
      const consoles = [
        vi.spyOn(console, "error").mockImplementation((...valeurs: unknown[]) => {
          sorties.push(valeurs.map(String).join(" "));
        }),
        vi.spyOn(console, "warn").mockImplementation((...valeurs: unknown[]) => {
          sorties.push(valeurs.map(String).join(" "));
        }),
        vi.spyOn(console, "log").mockImplementation((...valeurs: unknown[]) => {
          sorties.push(valeurs.map(String).join(" "));
        }),
      ];
      try {
        const document = page();
        const client = await editeurSur(document);
        pannes.enregistrement = 1;
        await ecrire(client, document, TEMOIN);
        await attendreQue(() =>
          lignes("enregistrement-en-echec").some((l) => l.document === document),
        );
        serveur.horloge.avancer(serveur.reglages.relanceDEnregistrementMs);
        await attendreQue(async () => (await texteStocke(serveur, document)) === TEMOIN);
        await client.fermer();
        await pause(200);
        pannes.chargement = 1;
        const autre = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
        await autre.ouvrir(document);
        await autre.attendre((lu) => lu.type === "refusee");
        await pause(200);
      } finally {
        ecrireStdout.mockRestore();
        ecrireStderr.mockRestore();
        for (const espion of consoles) {
          espion.mockRestore();
        }
      }

      const tout = [...sorties, serveur.texteDuJournal()].join("\n");
      expect(tout).not.toContain(TEMOIN);
      expect(tout).not.toContain("select");
      expect(tout).not.toContain(espace.editeur.cookie.split("=")[1] ?? "");
      expect(lignes("chargement-en-echec").at(-1)).toMatchObject({ classe: "Error" });
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("ramasse-miettes du document d'espace (ADR-0001, amendement F-007)", () => {
  it(
    "F-012-AC17 le document d'espace tenu par le serveur a le ramasse-miettes : un contenu retiré quitte l'instantané stocké",
    async () => {
      const document = nomDeDocument({
        type: "espace",
        idEspace: espace.idEspace,
        idDocument: espace.idEspace,
      });
      const ouvert = await fournisseurSynchronise(
        priseDeFournisseur(serveur, espace.proprietaire.cookie),
        document,
      );
      const titre = `TITRE-SUPPRIME-${randomUUID()}`;
      const contient = async (): Promise<boolean> =>
        Buffer.from((await serveur.lireInstantane(document)) ?? new Uint8Array()).includes(titre);
      ouvert.doc.getMap("pages").set("p1", titre);
      await attendreQue(contient);

      ouvert.doc.getMap("pages").delete("p1");

      await attendreQue(async () => !(await contient()));
      expect(Buffer.from(Y.encodeStateAsUpdate(ouvert.doc)).includes(titre)).toBe(false);
    },
    DELAI_SYNCHRO_MS,
  );
});
