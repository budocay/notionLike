// Réévaluation des droits en cours de connexion (F-012-AC12 à AC15, AC34), contre la bibliothèque
// réelle : signal du module des adhésions, et filet de 60 secondes sur l'horloge injectée.
import { randomUUID } from "node:crypto";

import { nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  attendreQue,
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  fournisseurSynchronise,
  memesOctets,
  miseAJourTexte,
  pause,
  preparerUnEspace,
  priseDeFournisseur,
  texteDe,
  type ClientBrut,
  type EspaceDEssai,
  type MembreDEssai,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({
    reglages: { attenteDEnregistrementMs: 50, attenteMaxDEnregistrementMs: 200 },
  });
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

const page = (idEspace: string): string =>
  nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });

async function ouvrirPour(membre: MembreDEssai, ...noms: string[]): Promise<ClientBrut> {
  const client = await connecterBrut(serveur, { cookie: membre.cookie });
  for (const nom of noms) {
    await client.ouvrirEtSynchroniser(nom);
  }
  return client;
}

// Un membre de plus, dans l'espace, avec ce rôle.
async function membre(espace: EspaceDEssai, role: "editeur" | "lecteur"): Promise<MembreDEssai> {
  const compte = await serveur.inscrire(role);
  await serveur.ajouterMembre(espace.proprietaire.cookie, espace.idEspace, compte.cookie, role);
  return compte;
}

// Une mise à jour brute ne parvient ni au témoin ni au stockage.
async function constaterQueRienNePasse(
  emetteur: ClientBrut,
  temoin: ClientBrut,
  document: string,
  texte: string,
): Promise<void> {
  const stocke = await serveur.lireInstantane(document);
  const depuis = temoin.recus.length;
  emetteur.envoyer(brut.miseAJour(document, miseAJourTexte(texte, new Y.Doc())));
  emetteur.envoyer(brut.etape2(document, miseAJourTexte(texte, new Y.Doc())));
  await pause(400);
  expect(temoin.depuis(depuis, document)).toEqual([]);
  expect(texteDe(temoin.doc(document))).not.toContain(texte);
  expect(memesOctets(await serveur.lireInstantane(document), stocke)).toBe(stocke !== undefined);
}

describe("adhésion retirée, espace supprimé (F-012-AC12)", () => {
  it(
    "F-012-AC12 F-012-AC34 un membre retiré voit ses ouvertures de l'espace fermées par acces-refuse dans la seconde, la WebSocket et ses autres espaces restant en service",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const vise = await membre(espace, "editeur");
      const autreEspace = await serveur.creerEspace(vise.cookie);
      const dansA = page(espace.idEspace);
      const dansB = page(autreEspace);
      const client = await ouvrirPour(vise, dansA, dansB);
      const temoin = await ouvrirPour(espace.proprietaire, dansA);
      const depuis = client.recus.length;

      const debut = Date.now();
      await serveur.retirerMembre(espace.proprietaire.cookie, espace.idEspace, vise.idCompte);
      const fermeture = await client.attendre((lu) => lu.type === "fermeture", depuis, 1000);

      expect(Date.now() - debut).toBeLessThan(1000);
      expect(fermeture).toEqual({ nom: dansA, type: "fermeture", raison: "acces-refuse" });
      expect(client.prise.readyState).toBe(1);
      await constaterQueRienNePasse(client, temoin, dansA, "après le retrait");
      const avantB = client.recus.length;
      client.envoyer(brut.miseAJour(dansB, miseAJourTexte("ailleurs", client.doc(dansB))));
      expect(await client.attendre((lu) => lu.type === "accuse", avantB)).toMatchObject({
        nom: dansB,
        applique: true,
      });
      expect(await client.ouvrir(dansA)).toEqual({
        nom: dansA,
        type: "refusee",
        texte: "acces-refuse",
      });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC12 F-012-AC31 un espace supprimé ferme les ouvertures de tous ses membres par acces-refuse, et ses documents quittent la base",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const document = page(espace.idEspace);
      const clients = [
        await ouvrirPour(espace.proprietaire, document),
        await ouvrirPour(espace.editeur, document),
        await ouvrirPour(espace.lecteur, document),
      ];
      clients[1]?.envoyer(brut.miseAJour(document, miseAJourTexte("x", clients[1].doc(document))));
      await attendreQue(async () => (await serveur.lireInstantane(document)) !== undefined);

      await serveur.supprimerEspace(espace.proprietaire.cookie, espace.idEspace);

      for (const client of clients) {
        expect(await client.attendre((lu) => lu.type === "fermeture", 0, 1000)).toEqual({
          nom: document,
          type: "fermeture",
          raison: "acces-refuse",
        });
      }
      await pause(300);
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("changement de rôle (F-012-AC13)", () => {
  it(
    "F-012-AC13 F-012-AC34 un éditeur rétrogradé passe en lecture seule et reçoit droits-modifies ; ses mises à jour brutes ne passent ni avant ni après la réouverture",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const vise = await membre(espace, "editeur");
      const document = page(espace.idEspace);
      const client = await ouvrirPour(vise, document);
      const temoin = await ouvrirPour(espace.proprietaire, document);
      const depuis = client.recus.length;

      await serveur.changerRole(
        espace.proprietaire.cookie,
        espace.idEspace,
        vise.idCompte,
        "lecteur",
      );
      await constaterQueRienNePasse(client, temoin, document, "avant la réouverture");

      expect(await client.attendre((lu) => lu.type === "fermeture", depuis, 1000)).toEqual({
        nom: document,
        type: "fermeture",
        raison: "droits-modifies",
      });
      expect(await client.ouvrirEtSynchroniser(document)).toBe("readonly");
      await constaterQueRienNePasse(client, temoin, document, "après la réouverture");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC13 F-012-AC34 un lecteur promu reçoit droits-modifies sans reconnexion, puis, rouvert par le client officiel, écrit en écriture",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const vise = await membre(espace, "lecteur");
      const document = page(espace.idEspace);
      const temoin = await ouvrirPour(espace.proprietaire, document);
      const prise = priseDeFournisseur(serveur, vise.cookie);
      const ouvert = await fournisseurSynchronise(prise, document);
      expect(ouvert.provider.authorizedScope).toBe("readonly");

      await serveur.changerRole(
        espace.proprietaire.cookie,
        espace.idEspace,
        vise.idCompte,
        "editeur",
      );
      await attendreQue(() => ouvert.fermetures.includes("droits-modifies"), 1000);
      ouvert.provider.detach();
      ouvert.provider.attach();
      await attendreQue(() => ouvert.portees.at(-1) === "read-write" && ouvert.provider.isSynced);
      ouvert.doc.getText("contenu").insert(0, "promu");

      await attendreQue(() => texteDe(temoin.doc(document)) === "promu");
      await attendreQue(async () => {
        const stocke = await serveur.lireInstantane(document);
        if (stocke === undefined) {
          return false;
        }
        const relu = new Y.Doc();
        Y.applyUpdate(relu, stocke);
        return texteDe(relu) === "promu";
      });
      expect(ouvert.provider.authorizedScope).toBe("read-write");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC13 un changement entre éditeur et propriétaire ne ferme aucune ouverture",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const vise = await membre(espace, "editeur");
      const document = page(espace.idEspace);
      const client = await ouvrirPour(vise, document);
      const depuis = client.recus.length;

      await serveur.changerRole(
        espace.proprietaire.cookie,
        espace.idEspace,
        vise.idCompte,
        "proprietaire",
      );
      await serveur.changerRole(
        espace.proprietaire.cookie,
        espace.idEspace,
        vise.idCompte,
        "editeur",
      );
      await pause(300);

      expect(client.depuis(depuis)).toEqual([]);
      client.envoyer(brut.miseAJour(document, miseAJourTexte("toujours", client.doc(document))));
      expect(await client.attendre((lu) => lu.type === "accuse", depuis)).toMatchObject({
        applique: true,
      });
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("filet de 60 secondes (F-012-AC14, AC15)", () => {
  it(
    "F-012-AC14 une session expirée sans signal ferme sa connexion au filet suivant, par 1008 non-authentifie",
    async () => {
      const compte = await serveur.inscrire("expire");
      const client = await connecterBrut(serveur, { cookie: compte.cookie });
      await serveur.base.db.execute(
        `update "session" set "expiresAt" = now() - interval '1 minute' where "userId" = '${compte.idCompte}'`,
      );
      await pause(100);
      expect(client.prise.readyState).toBe(1);

      serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);

      expect(await client.fermeture).toEqual({ code: 1008, raison: "non-authentifie" });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC14 F-012-AC12 F-012-AC13 un retrait ou une rétrogradation écrits sans signal sont rattrapés par le filet",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const retire = await membre(espace, "editeur");
      const retrograde = await membre(espace, "editeur");
      const document = page(espace.idEspace);
      const clientRetire = await ouvrirPour(retire, document);
      const clientRetrograde = await ouvrirPour(retrograde, document);
      await serveur.base.db.execute(
        `delete from "adhesion" where "idCompte" = '${retire.idCompte}'`,
      );
      await serveur.base.db.execute(
        `update "adhesion" set "role" = 'lecteur' where "idCompte" = '${retrograde.idCompte}'`,
      );

      serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);

      expect(await clientRetire.attendre((lu) => lu.type === "fermeture")).toEqual({
        nom: document,
        type: "fermeture",
        raison: "acces-refuse",
      });
      expect(await clientRetrograde.attendre((lu) => lu.type === "fermeture")).toEqual({
        nom: document,
        type: "fermeture",
        raison: "droits-modifies",
      });
      expect(await clientRetrograde.ouvrirEtSynchroniser(document)).toBe("readonly");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC15 une réévaluation en échec ferme l'ouverture par erreur-interne, et une session illisible la connexion",
    async () => {
      const espace = await preparerUnEspace(serveur);
      const document = page(espace.idEspace);
      const client = await ouvrirPour(espace.editeur, document);

      await serveur.base.db.execute(`alter table "adhesion" rename to "adhesion_cachee"`);
      try {
        serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);
        expect(await client.attendre((lu) => lu.type === "fermeture")).toEqual({
          nom: document,
          type: "fermeture",
          raison: "erreur-interne",
        });
      } finally {
        await serveur.base.db.execute(`alter table "adhesion_cachee" rename to "adhesion"`);
      }

      await serveur.base.db.execute(`alter table "session" rename to "session_cachee"`);
      try {
        serveur.horloge.avancer(serveur.reglages.periodeDeReverificationMs);
        expect(await client.fermeture).toEqual({ code: 1008, raison: "erreur-interne" });
      } finally {
        await serveur.base.db.execute(`alter table "session_cachee" rename to "session"`);
      }
      // F-012-AC26 : chaque fermeture consigne la classe de l'erreur, jamais son message.
      const echecs = serveur
        .lignesDuJournal()
        .filter((ligne) => ligne.type === "acces-retire" && ligne.motif === "erreur-interne");
      expect(echecs.map((ligne) => ligne.code ?? "ouverture")).toEqual(["ouverture", 1008]);
      for (const ligne of echecs) {
        expect(ligne.classe).toEqual(expect.any(String));
        expect(JSON.stringify(ligne)).not.toMatch(/select|relation/i);
      }
    },
    DELAI_SYNCHRO_MS,
  );
});
