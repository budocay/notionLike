// Passe de fond, suppression définitive reçue, étanchéité entre espaces d'un appareil, version
// reçue sur une page non affichée (F-013-AC5, AC6, AC35, AC37, AC44, AC42), contre le serveur réel.
import { LIMITES_SYNCHRO } from "@notionlike/contrats";
import { lireVersionPage, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { inscrireAuRegistre } from "../../src/persistance/index.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import { DOCUMENTS_A_LA_FOIS } from "../../src/synchronisation/passe-de-fond.ts";
import { changerLaCleDUnePage } from "../aides-format.ts";
import { miseAJourDUneReplique } from "../aides-facade-page.ts";
import { enregistrements, nomsDesBases } from "../aides-persistance.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  ecrireDansLaBase,
  ecrireDansLaPage,
  espacePartage,
  fermerLesOnglets,
  lireDansLaBase,
  messagesDe,
  nouvelAppareil,
  type Onglet,
  ouvrirUnOnglet,
  pageDEssai,
  pause,
  preparerLAppareil,
  texteDeLaPage,
  TYPES_DE_MESSAGE,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 90_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

/** Une coupure puis le retour du réseau : la connexion suivante relance une passe entière (H6). */
async function reconnecter(onglet: Onglet): Promise<void> {
  onglet.reseau.couper();
  await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");
  onglet.reseau.retablir();
  onglet.signaler("reseau");
  await attendreLEtat(onglet, "synchronise", 20_000);
}

function contient(instantane: Uint8Array | undefined, texte: string): boolean {
  return instantane !== undefined && new TextDecoder().decode(instantane).includes(texte);
}

/** Le plus grand nombre de documents de page ouverts en même temps, d'après les messages émis. */
function ouverturesSimultanees(emis: readonly Uint8Array[], idEspace: string): number {
  const ouvertes = new Set<string>();
  let plus = 0;
  for (const { nom, type } of messagesDe(emis)) {
    if (!nom.startsWith(`page:${idEspace}:`)) {
      continue;
    }
    if (type === TYPES_DE_MESSAGE.authentification) {
      ouvertes.add(nom);
    } else if (type === TYPES_DE_MESSAGE.fermeture) {
      ouvertes.delete(nom);
    }
    plus = Math.max(plus, ouvertes.size);
  }
  return plus;
}

describe("passe de fond", () => {
  it("F-013-AC5 chaque page, affichée ou non, est échangée : à la fin de la passe, toutes sont lisibles hors ligne sur un second appareil, au plus quatre documents ouverts à la fois, sous la moitié du débit", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const premier = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    const pages = Array.from({ length: 12 }, (_, rang) =>
      premier.facade.creerPage(`P${String(rang)}`),
    );
    for (const [rang, idPage] of pages.entries()) {
      await ecrireDansLaBase(premier.appareil, idEspace, idPage, `contenu ${String(rang)}`);
    }
    await adopterEtAttendre(premier);

    const appareil = nouvelAppareil();
    await preparerLAppareil(appareil, idEspace, { rattachement: "adopte", droit: "ecriture" });
    const second = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      rejoint: true,
    });
    await attendreLEtat(second, "synchronise", 30_000);
    second.synchro.fermer();
    second.reseau.couper();

    for (const [rang, idPage] of pages.entries()) {
      expect(await lireDansLaBase(appareil, idEspace, idPage)).toContain(`contenu ${String(rang)}`);
    }
    expect(ouverturesSimultanees(premier.reseau.emis, idEspace)).toBeLessThanOrEqual(
      DOCUMENTS_A_LA_FOIS,
    );
    expect(ouverturesSimultanees(second.reseau.emis, idEspace)).toBeLessThanOrEqual(
      DOCUMENTS_A_LA_FOIS,
    );
    expect(premier.reseau.emis.length).toBeLessThanOrEqual(LIMITES_SYNCHRO.messagesParFenetre / 2);
  });

  it("F-013-AC5 une page reçue d'un autre appareil est échangée par la passe sans être affichée : sa base existe et son contenu, une fois sur le serveur, l'atteint à la passe suivante", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { chez, ailleurs, idEspace } = partage;
    const idPage = chez.facade.creerPage("Venue d'ailleurs");
    const nom = correspondance("page", idEspace, idPage).nomDeDocument;
    const base = correspondance("page", idEspace, idPage).nomDeBase;

    // La mise à jour qui ajoute la page fait ouvrir son document par la passe de l'autre appareil.
    await attendreQue(
      () =>
        messagesDe(ailleurs.reseau.emis).some(
          (message) => message.nom === nom && message.type === TYPES_DE_MESSAGE.authentification,
        ),
      20_000,
    );
    await attendreQue(async () =>
      (await ailleurs.appareil.sur(() => nomsDesBases())).includes(base),
    );
    const page = pageDEssai(idPage);
    afficher(chez, page);
    ecrireDansLaPage(page.doc, "écrite chez le propriétaire");
    await attendreLEtat(chez, "synchronise");

    await reconnecter(ailleurs);
    await attendreQue(
      async () =>
        (await lireDansLaBase(ailleurs.appareil, idEspace, idPage)).includes(
          "écrite chez le propriétaire",
        ),
      20_000,
    );
  });

  it("F-013-AC6 coupée au milieu d'une passe de 20 pages, la passe est reprise en entier à la connexion suivante et les 20 convergent", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const onglet = await ouvrirUnOnglet({ serveur, cookie: membre.cookie, idEspace });
    const pages = Array.from({ length: 20 }, (_, rang) =>
      onglet.facade.creerPage(`Q${String(rang)}`),
    );
    for (const [rang, idPage] of pages.entries()) {
      await ecrireDansLaBase(onglet.appareil, idEspace, idPage, `vingt ${String(rang)}`);
    }
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    await onglet.synchro.adopter("Vingt pages");
    await attendreQue(
      () =>
        messagesDe(onglet.reseau.emis).filter(
          ({ type, nom }) => type === TYPES_DE_MESSAGE.fermeture && nom.startsWith("page:"),
        ).length >= 3,
      20_000,
    );

    onglet.reseau.couper();
    await attendreQue(() => onglet.synchro.lireEtat().affiche !== "en-cours");
    onglet.reseau.retablir();
    onglet.signaler("reseau");
    await attendreLEtat(onglet, "synchronise", 60_000);

    for (const [rang, idPage] of pages.entries()) {
      const nom = correspondance("page", idEspace, idPage).nomDeDocument;
      await attendreQue(
        async () => contient(await serveur.lireInstantane(nom), `vingt ${String(rang)}`),
        20_000,
      );
    }
  });
});

describe("suppression définitive reçue", () => {
  it("F-013-AC37 un second appareil resté hors ligne pendant la suppression définitive n'a plus, après sa reconnexion, aucune base de la page supprimée", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { chez, ailleurs, idEspace } = partage;
    const idPage = chez.facade.creerPage("À supprimer");
    await ecrireDansLaBase(chez.appareil, idEspace, idPage, "condamnée");
    const page = pageDEssai(idPage);
    afficher(chez, page);
    ecrireDansLaPage(page.doc, "condamnée");
    await attendreLEtat(chez, "synchronise");
    afficher(chez, undefined);
    const base = correspondance("page", idEspace, idPage).nomDeBase;
    await attendreQue(
      async () => (await ailleurs.appareil.sur(() => nomsDesBases())).includes(base),
      20_000,
    );
    await attendreLEtat(ailleurs, "synchronise", 20_000);
    ailleurs.reseau.couper();
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");

    chez.facade.mettreALaCorbeille(idPage);
    chez.facade.supprimerDefinitivement(idPage);
    await attendreLEtat(chez, "synchronise");
    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");

    await attendreQue(
      async () => !(await ailleurs.appareil.sur(() => nomsDesBases())).includes(base),
      20_000,
    );
  });
});

describe("étanchéité entre les espaces d'un appareil", () => {
  it("F-013-AC44 une page de l'espace A portée par l'arborescence d'un espace B : rien de la base de A n'est envoyé sous page:B, la base de A reste octet pour octet, et les canaux des deux pages diffèrent", async () => {
    const membre = await serveur.inscrire();
    const autre = await serveur.inscrire();
    const appareil = nouvelAppareil();
    // L'espace A, local, porte une page témoin.
    const idEspaceA = crypto.randomUUID();
    const espaceA = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: idEspaceA,
      appareil,
    });
    const idPage = espaceA.facade.creerPage("Témoin de A");
    await ecrireDansLaBase(appareil, idEspaceA, idPage, "TEMOIN-DE-A");
    const baseA = correspondance("page", idEspaceA, idPage).nomDeBase;
    const avant = await appareil.sur(() => enregistrements(baseA));
    // L'espace B, dont un autre membre inscrit la page `idPage` dans l'arborescence.
    const idEspaceB = crypto.randomUUID();
    const chezAutre = await ouvrirUnOnglet({ serveur, cookie: autre.cookie, idEspace: idEspaceB });
    const forgee = chezAutre.facade.creerPage("Page de B");
    changerLaCleDUnePage(chezAutre.facade.doc, forgee, idPage);
    await adopterEtAttendre(chezAutre);
    await serveur.ajouterMembre(autre.cookie, idEspaceB, membre.cookie, "editeur");
    expect(
      await appareil.sur(() =>
        inscrireAuRegistre(idEspaceB, { rattachement: "adopte", droit: "ecriture" }),
      ),
    ).toBe(true);
    const espaceB = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: idEspaceB,
      appareil,
      autreEspace: true,
      rejoint: true,
    });
    await attendreLEtat(espaceB, "synchronise", 20_000);
    const page = pageDEssai(idPage);
    afficher(espaceB, page);
    await attendreLEtat(espaceB, "synchronise");
    await pause(500);

    const nomB = correspondance("page", idEspaceB, idPage).nomDeDocument;
    await pause(2500);
    expect(contient(await serveur.lireInstantane(nomB), "TEMOIN-DE-A")).toBe(false);
    expect(
      espaceB.reseau.emis.some((octets) =>
        new TextDecoder().decode(octets).includes("TEMOIN-DE-A"),
      ),
    ).toBe(false);
    expect(texteDeLaPage(page.doc)).not.toContain("TEMOIN-DE-A");
    expect(await appareil.sur(() => enregistrements(baseA))).toEqual(avant);
    expect(correspondance("page", idEspaceA, idPage).nomDeDocument).not.toBe(nomB);
  });
});

describe("version reçue sur une page non affichée", () => {
  it("F-013-AC35 une page d'une version non prise en charge reçue par la passe est enregistrée telle quelle dans sa base, sans être modifiée", async () => {
    const partage = await espacePartage(serveur, "editeur");
    const { chez, ailleurs, idEspace } = partage;
    const idPage = chez.facade.creerPage("Plus récente");
    const page = pageDEssai(idPage);
    afficher(chez, page);
    await attendreLEtat(chez, "synchronise");
    const plusRecente = miseAJourDUneReplique(page.doc, (replique) =>
      replique.eleverVersion(VERSION_PAGE_PRISE_EN_CHARGE + 1),
    );
    Y.applyUpdate(page.doc, plusRecente);
    ecrireDansLaPage(page.doc, "écrite en version 2");
    await attendreLEtat(chez, "synchronise");
    afficher(chez, undefined);

    await reconnecter(ailleurs);
    await attendreQue(
      async () =>
        (await lireDansLaBase(ailleurs.appareil, idEspace, idPage)).includes("écrite en version 2"),
      20_000,
    );
    const relu = new Y.Doc();
    Y.applyUpdate(
      relu,
      Y.mergeUpdates(
        (
          await ailleurs.appareil.sur(() =>
            enregistrements(correspondance("page", idEspace, idPage).nomDeBase),
          )
        ).map((octets) => new Uint8Array(octets)),
      ),
    );
    expect(lireVersionPage(relu)).toBe(VERSION_PAGE_PRISE_EN_CHARGE + 1);
  });
});
