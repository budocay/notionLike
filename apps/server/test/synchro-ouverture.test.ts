// Ouverture d'un document et lecture seule (F-012-AC5 à AC11, AC16, AC17), contre le serveur réel
// de la fabrique, avec le client du protocole écrit pour les tests et le client officiel.
import { randomUUID } from "node:crypto";

import { nomDeDocument, type TypeDeDocument } from "@notionlike/contrats";
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
  nombreDeDocumentsStockes,
  pause,
  preparerUnEspace,
  priseDeFournisseur,
  texteDe,
  type EspaceDEssai,
} from "./aides-synchro.ts";
import { demarrerServeurDEssai, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;
let espace: EspaceDEssai;
// Chaque chargement d'instantané passe par la défaillance provoquée, qui ne lève pas ici.
const chargements: string[] = [];

beforeAll(async () => {
  serveur = await demarrerServeurDEssai({
    reglages: { attenteDEnregistrementMs: 50, attenteMaxDEnregistrementMs: 200 },
    defaillance: (operation, nom) => {
      if (operation === "chargement") {
        chargements.push(nom);
      }
    },
  });
  espace = await preparerUnEspace(serveur);
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

function nom(type: TypeDeDocument, idEspace = espace.idEspace, id = randomUUID()): string {
  return nomDeDocument({ type, idEspace, idDocument: type === "espace" ? idEspace : id });
}

// Un document de page écrit par l'éditeur et stocké.
async function pageStockee(texte: string, idEspace = espace.idEspace): Promise<string> {
  const document = nom("page", idEspace);
  const editeur = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
  await editeur.ouvrirEtSynchroniser(document);
  editeur.envoyer(brut.miseAJour(document, miseAJourTexte(texte, editeur.doc(document))));
  await attendreQue(async () => (await serveur.lireInstantane(document)) !== undefined);
  return document;
}

describe("décision d'ouverture (F-012-AC5)", () => {
  it(
    "F-012-AC5 propriétaire et éditeur ouvrent en écriture, lecteur en lecture seule, portée annoncée à l'authentification",
    async () => {
      const document = nom("espace");
      const portees: string[] = [];
      for (const membre of [espace.proprietaire, espace.editeur, espace.lecteur]) {
        const client = await connecterBrut(serveur, { cookie: membre.cookie });
        portees.push(await client.ouvrirEtSynchroniser(document));
      }

      expect(portees).toEqual(["read-write", "read-write", "readonly"]);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC5 le client officiel lit la portée accordée",
    async () => {
      const prise = priseDeFournisseur(serveur, espace.lecteur.cookie);

      const ouvert = await fournisseurSynchronise(prise, nom("page"));

      expect(ouvert.provider.authorizedScope).toBe("readonly");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC5 la réouverture d'un document sur la même connexion est décidée à nouveau",
    async () => {
      const membre = await serveur.inscrire("reouverture");
      await serveur.ajouterMembre(
        espace.proprietaire.cookie,
        espace.idEspace,
        membre.cookie,
        "editeur",
      );
      const document = nom("page");
      const client = await connecterBrut(serveur, { cookie: membre.cookie });
      expect(await client.ouvrirEtSynchroniser(document)).toBe("read-write");
      client.envoyer(brut.fermeture(document));
      await client.attendre((lu) => lu.nom === document && lu.type === "fermeture");

      await serveur.retirerMembre(espace.proprietaire.cookie, espace.idEspace, membre.idCompte);
      const refus = await client.ouvrir(document);

      expect(refus).toEqual({ nom: document, type: "refusee", texte: "acces-refuse" });
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("aucune fuite d'existence (F-012-AC6)", () => {
  it(
    "F-012-AC6 non-membre, espace inexistant, espace supprimé : le même refus acces-refuse, sans octet ni ligne",
    async () => {
      const proprietaire = await serveur.inscrire("supprime");
      const supprime = await serveur.creerEspace(proprietaire.cookie);
      await serveur.supprimerEspace(proprietaire.cookie, supprime);
      const avant = await nombreDeDocumentsStockes(serveur);
      const vise = await pageStockee("secret");
      const client = await connecterBrut(serveur, { cookie: espace.nonMembre.cookie });
      const intrus = await connecterBrut(serveur, { cookie: proprietaire.cookie });

      const refus = [
        await client.ouvrir(vise),
        await client.ouvrir(nom("espace", randomUUID())),
        await intrus.ouvrir(nom("page", supprime)),
      ];
      await pause(200);

      expect(refus.map(({ nom: _nom, ...reste }) => reste)).toEqual([
        { type: "refusee", texte: "acces-refuse" },
        { type: "refusee", texte: "acces-refuse" },
        { type: "refusee", texte: "acces-refuse" },
      ]);
      for (const lu of [...client.recus, ...intrus.recus]) {
        expect(lu.type).toBe("refusee");
      }
      expect(await nombreDeDocumentsStockes(serveur)).toBe(avant + 1);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("nom de document (F-012-AC7)", () => {
  it.each([
    ["type inconnu", () => `bloc:${espace.idEspace}:${randomUUID()}`],
    ["identifiant en majuscules", () => `page:${espace.idEspace.toUpperCase()}:${randomUUID()}`],
    ["segment en trop", () => `espace:${espace.idEspace}:${randomUUID()}`],
    ["segment manquant", () => `page:${espace.idEspace}`],
    ["nom trop long", () => `page:${espace.idEspace}:${"a".repeat(200)}`],
    ["nom invalide avant le NUL", () => `bloc\0${nom("page")}`],
  ])(
    "F-012-AC7 un nom non conforme est refusé par nom-de-document-invalide : %s",
    async (_cas, fabriquer) => {
      const client = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      const document = fabriquer();

      const refus = await client.ouvrir(document);

      expect(refus).toEqual({ nom: document, type: "refusee", texte: "nom-de-document-invalide" });
      expect(chargements).not.toContain(document);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC7 le nom contrôlé est celui qui précède le premier NUL, sans interroger la base pour un nom invalide",
    async () => {
      const client = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      const valide = nom("page");
      expect((await client.ouvrir(`${valide}\0session-du-client`)).type).toBe("accordee");

      await serveur.base.db.execute(`alter table "adhesion" rename to "adhesion_cachee"`);
      try {
        expect((await client.ouvrir(`bloc:${espace.idEspace}`)).type).toBe("refusee");
        expect(
          serveur
            .lignesDuJournal()
            .filter((ligne) => ligne.document === `bloc:${espace.idEspace}`)
            .map((ligne) => ligne.motif),
        ).toEqual(["nom-de-document-invalide"]);
      } finally {
        await serveur.base.db.execute(`alter table "adhesion_cachee" rename to "adhesion"`);
      }
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("rattachement à l'espace (F-012-AC8)", () => {
  it.each<TypeDeDocument>(["page", "table"])(
    "F-012-AC8 %s : le même identifiant dans un autre espace est un document propre à chaque espace",
    async (type) => {
      const autreProprietaire = await serveur.inscrire("autre");
      const autreEspace = await serveur.creerEspace(autreProprietaire.cookie);
      const id = randomUUID();
      const dansB = nom(type, autreEspace, id);
      const ecrivain = await connecterBrut(serveur, { cookie: autreProprietaire.cookie });
      await ecrivain.ouvrirEtSynchroniser(dansB);
      ecrivain.envoyer(brut.miseAJour(dansB, miseAJourTexte("de B", ecrivain.doc(dansB))));
      await attendreQue(async () => (await serveur.lireInstantane(dansB)) !== undefined);

      const lecteur = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      const dansA = nom(type, espace.idEspace, id);
      await lecteur.ouvrirEtSynchroniser(dansA);

      expect(texteDe(lecteur.doc(dansA))).toBe("");
      expect(Y.encodeStateVector(lecteur.doc(dansA))).toEqual(new Uint8Array([0]));
      expect((await lecteur.ouvrir(dansB)).type).toBe("refusee");
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("lecteur et document jamais stocké (F-012-AC9)", () => {
  it(
    "F-012-AC9 un lecteur ouvre un document jamais stocké : vide, en lecture seule, sans ligne créée",
    async () => {
      const avant = await nombreDeDocumentsStockes(serveur);
      const client = await connecterBrut(serveur, { cookie: espace.lecteur.cookie });
      const document = nom("page");

      expect(await client.ouvrirEtSynchroniser(document)).toBe("readonly");
      client.envoyer(brut.fermeture(document));
      await pause(300);

      expect(texteDe(client.doc(document))).toBe("");
      expect(await nombreDeDocumentsStockes(serveur)).toBe(avant);
      expect(await serveur.lireInstantane(document)).toBeUndefined();
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("lecture seule imposée par le serveur (F-012-AC10)", () => {
  it(
    "F-012-AC10 F-012-AC34 une mise à jour et une étape 2 brutes d'un lecteur ne sont ni appliquées, ni stockées, ni relayées, et reçoivent l'accusé négatif",
    async () => {
      const document = await pageStockee("original");
      const stocke = await serveur.lireInstantane(document);
      const temoin = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await temoin.ouvrirEtSynchroniser(document);
      const lecteur = await connecterBrut(serveur, { cookie: espace.lecteur.cookie });
      expect(await lecteur.ouvrirEtSynchroniser(document)).toBe("readonly");
      const depuisTemoin = temoin.recus.length;
      const depuis = lecteur.recus.length;

      lecteur.envoyer(brut.miseAJour(document, miseAJourTexte("forgé ", new Y.Doc())));
      lecteur.envoyer(brut.etape2(document, miseAJourTexte("forgé aussi ", new Y.Doc())));
      await lecteur.attendre((lu) => lu.type === "accuse", depuis);
      await pause(400);

      expect(lecteur.depuis(depuis, document).filter((lu) => lu.type === "accuse")).toEqual([
        { nom: document, type: "accuse", applique: false },
        { nom: document, type: "accuse", applique: false },
      ]);
      expect(temoin.depuis(depuisTemoin, document)).toEqual([]);
      expect(texteDe(temoin.doc(document))).toBe("original");
      expect(memesOctets(await serveur.lireInstantane(document), stocke)).toBe(true);
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC10 une étape 2 d'un lecteur qui n'apporte rien reçoit l'accusé positif",
    async () => {
      const document = await pageStockee("connu");
      const lecteur = await connecterBrut(serveur, { cookie: espace.lecteur.cookie });
      await lecteur.ouvrirEtSynchroniser(document);
      const depuis = lecteur.recus.length;

      lecteur.envoyer(brut.etape2(document, Y.encodeStateAsUpdate(lecteur.doc(document))));

      expect(await lecteur.attendre((lu) => lu.type === "accuse", depuis)).toEqual({
        nom: document,
        type: "accuse",
        applique: true,
      });
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC10 F-012-AC25 la présence d'un lecteur est relayée ; un message sans état ou de diffusion interne ne relaie rien",
    async () => {
      const document = nom("page");
      const temoin = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await temoin.ouvrirEtSynchroniser(document);
      const lecteur = await connecterBrut(serveur, { cookie: espace.lecteur.cookie });
      await lecteur.ouvrirEtSynchroniser(document);
      const depuis = temoin.recus.length;

      lecteur.envoyer(brut.sansEtat(document, "bonjour"));
      lecteur.envoyer(brut.diffusionInterne(document, "à tous"));
      await pause(200);
      expect(temoin.depuis(depuis, document)).toEqual([]);

      const { Awareness, encodeAwarenessUpdate } = await import("y-protocols/awareness");
      const presence = new Awareness(new Y.Doc());
      presence.setLocalState({ curseur: 3 });
      lecteur.envoyer(
        brut.presence(document, encodeAwarenessUpdate(presence, [presence.clientID])),
      );

      const recue = await temoin.attendre((lu) => lu.type === "presence", depuis);
      expect(recue.nom).toBe(document);
      expect(lecteur.prise.readyState).toBe(1);
      presence.destroy();
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("document non ouvert (F-012-AC11)", () => {
  it(
    "F-012-AC11 une mise à jour ou une présence pour un document non ouvert, ou dont l'ouverture est refusée, est ignorée sans charger le document",
    async () => {
      const document = await pageStockee("intact");
      const stocke = await serveur.lireInstantane(document);
      const jamaisOuvert = nom("page");
      const temoin = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await temoin.ouvrirEtSynchroniser(document);
      const depuis = temoin.recus.length;
      const intrus = await connecterBrut(serveur, { cookie: espace.nonMembre.cookie });
      const membre = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      expect((await intrus.ouvrir(document)).type).toBe("refusee");

      intrus.envoyer(brut.miseAJour(document, miseAJourTexte("intrus", new Y.Doc())));
      intrus.envoyer(brut.presence(document, new Uint8Array([0])));
      membre.envoyer(brut.miseAJour(document, miseAJourTexte("sans ouverture", new Y.Doc())));
      membre.envoyer(brut.miseAJour(jamaisOuvert, miseAJourTexte("rien", new Y.Doc())));
      await pause(400);

      expect(temoin.depuis(depuis)).toEqual([]);
      expect(memesOctets(await serveur.lireInstantane(document), stocke)).toBe(true);
      expect(chargements).not.toContain(jamaisOuvert);
      expect(intrus.prise.readyState).toBe(1);
    },
    DELAI_SYNCHRO_MS,
  );
});

describe("relais et accusé (F-012-AC16, AC17)", () => {
  it(
    "F-012-AC16 F-012-AC34 une mise à jour d'une ouverture en écriture est appliquée, relayée, stockée et accusée",
    async () => {
      const document = nom("page");
      const autre = await connecterBrut(serveur, { cookie: espace.proprietaire.cookie });
      await autre.ouvrirEtSynchroniser(document);
      const editeur = await connecterBrut(serveur, { cookie: espace.editeur.cookie });
      await editeur.ouvrirEtSynchroniser(document);
      const depuis = editeur.recus.length;

      editeur.envoyer(brut.miseAJour(document, miseAJourTexte("bonjour", editeur.doc(document))));

      expect(await editeur.attendre((lu) => lu.type === "accuse", depuis)).toEqual({
        nom: document,
        type: "accuse",
        applique: true,
      });
      await attendreQue(() => texteDe(autre.doc(document)) === "bonjour");
      await attendreQue(async () => (await serveur.lireInstantane(document)) !== undefined);
      const relu = new Y.Doc();
      Y.applyUpdate(relu, (await serveur.lireInstantane(document)) ?? new Uint8Array());
      expect(texteDe(relu)).toBe("bonjour");
    },
    DELAI_SYNCHRO_MS,
  );

  it(
    "F-012-AC17 un document jamais stocké est servi vide, et l'instantané ne porte que les identifiants de client de ses auteurs",
    async () => {
      const document = nom("page");
      const prises = [espace.proprietaire, espace.editeur].map((membre) =>
        priseDeFournisseur(serveur, membre.cookie),
      );
      const auteurs = [];
      for (const prise of prises) {
        const ouvert = await fournisseurSynchronise(prise, document);
        expect(ouvert.doc.getText("contenu").toString()).toBe("");
        auteurs.push(ouvert);
      }
      auteurs[0]?.doc.getText("contenu").insert(0, "un ");
      auteurs[1]?.doc.getText("contenu").insert(0, "deux ");
      auteurs[0]?.doc.getMap("autre").set("cle", 1);

      await attendreQue(async () => {
        const stocke = await serveur.lireInstantane(document);
        if (stocke === undefined) {
          return false;
        }
        const relu = new Y.Doc();
        Y.applyUpdate(relu, stocke);
        return relu.getText("contenu").length === 8 && relu.getMap("autre").has("cle");
      });
      const relu = new Y.Doc();
      Y.applyUpdate(relu, (await serveur.lireInstantane(document)) ?? new Uint8Array());

      expect([...Y.decodeStateVector(Y.encodeStateVector(relu)).keys()].sort()).toEqual(
        auteurs.map((auteur) => auteur.doc.clientID).sort(),
      );
    },
    DELAI_SYNCHRO_MS,
  );
});
