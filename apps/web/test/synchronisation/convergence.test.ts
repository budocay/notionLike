// Local d'abord, convergence, base locale coupée, rencontre de deux versions, onglets du même
// appareil, durabilité (F-013-AC2 à AC4, AC34, AC36, AC49, AC42), contre le serveur réel.
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { ouvrirPersistance, type Persistance } from "../../src/persistance/index.ts";
import { correspondance } from "../../src/synchronisation/noms.ts";
import { ajouter, bloc, fragmentBrut, miseAJourDUneReplique } from "../aides-facade-page.ts";
import { fermerDeForce, suivreLesConnexionsTenues } from "../aides-persistance.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  compteDEssai,
  ecrireDansLaPage,
  espacePartage,
  fermerLesOnglets,
  lireDansLaBase,
  messagesDe,
  nouvelAppareil,
  type Onglet,
  ouvrirUnOnglet,
  type PageDEssai,
  pageDEssai,
  pause,
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
const persistancesDePage: Persistance[] = [];
afterEach(() => {
  fermerLesOnglets();
  persistancesDePage.splice(0).forEach((persistance) => persistance.fermer());
});

/** La page affichée avec sa base sur l'appareil, comme les pages ouvertes de l'onglet la tiennent. */
async function afficherAvecSaBase(onglet: Onglet, idPage: string): Promise<PageDEssai> {
  const page = pageDEssai(idPage);
  const persistance = onglet.appareil.sur(() =>
    ouvrirPersistance(page.doc, { type: "page", idEspace: onglet.idEspace, idPage }),
  );
  persistancesDePage.push(persistance);
  await attendreQue(() => persistance.lireEtat() !== "relecture", 12_000);
  afficher(onglet, page);
  return page;
}

function messagesDeLaPage(onglet: Onglet, idPage: string, type: number): number {
  const nom = correspondance("page", onglet.idEspace, idPage).nomDeDocument;
  return messagesDe(onglet.reseau.emis).filter(
    (message) => message.nom === nom && message.type === type,
  ).length;
}

function inserer(doc: Y.Doc, rang: number, position: number, texte: string): void {
  const paragraphe = fragmentBrut(doc).get(rang) as Y.XmlElement;
  (paragraphe.get(0) as Y.XmlText).insert(position, texte);
}

describe("local d'abord", () => {
  it("F-013-AC2 connexion coupée, chaque action et chaque frappe s'appliquent au document et à sa base sans attendre le réseau, sans erreur non interceptée", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    const idPage = onglet.facade.creerPage("Avant");
    await adopterEtAttendre(onglet);
    const page = await afficherAvecSaBase(onglet, idPage);
    await attendreLEtat(onglet, "synchronise");
    onglet.reseau.couper();
    await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");

    const creee = onglet.facade.creerPage("Créée sans réseau");
    onglet.facade.renommerPage(idPage, "Renommée sans réseau");
    onglet.facade.mettreALaCorbeille(creee);
    ecrireDansLaPage(page.doc, "frappe sans réseau");

    expect(texteDeLaPage(page.doc)).toContain("frappe sans réseau");
    expect(onglet.facade.lire().corbeille.map(({ titre }) => titre)).toEqual(["Créée sans réseau"]);
    await attendreQue(async () =>
      (await lireDansLaBase(onglet.appareil, onglet.idEspace, idPage)).includes(
        "frappe sans réseau",
      ),
    );
    expect(onglet.reseau.estCoupe()).toBe(true);
  });
});

describe("convergence sans perte", () => {
  it("F-013-AC3 deux appareils modifient hors ligne l'arborescence et la même page, l'un la quitte et se recharge hors ligne ; reconnectés dans un ordre quelconque, ils convergent dans les 5 secondes", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Commune", "Gardée"]);
    const { chez, ailleurs, idEspace } = partage;
    const [commune, gardee] = chez.facade.lire().racines.map(({ id }) => id);
    if (commune === undefined || gardee === undefined) {
      throw new Error("pages manquantes");
    }
    const pageChez = await afficherAvecSaBase(chez, commune);
    fragmentBrut(pageChez.doc).insert(0, [
      bloc("paragraph", "premier"),
      bloc("paragraph", "second"),
    ]);
    await attendreLEtat(chez, "synchronise");
    const pageAilleurs = await afficherAvecSaBase(ailleurs, commune);
    await attendreQue(() => texteDeLaPage(pageAilleurs.doc).includes("second"));
    await attendreLEtat(ailleurs, "synchronise");

    chez.reseau.couper();
    ailleurs.reseau.couper();
    await attendreQue(() => chez.synchro.lireEtat().affiche !== "synchronise");
    await attendreQue(() => ailleurs.synchro.lireEtat().affiche !== "synchronise");
    chez.facade.creerPage("Créée chez");
    chez.facade.renommerPage(gardee, "Renommée chez");
    ailleurs.facade.creerPage("Créée ailleurs");
    ailleurs.facade.mettreALaCorbeille(gardee);
    // Au même endroit d'un même bloc, puis chacun dans un bloc différent.
    inserer(pageChez.doc, 0, "premier".length, "<C>");
    inserer(pageAilleurs.doc, 0, "premier".length, "<A>");
    inserer(pageChez.doc, 0, 0, "[chez]");
    inserer(pageAilleurs.doc, 1, 0, "[ailleurs]");
    await attendreQue(async () => {
      const lu = await lireDansLaBase(chez.appareil, idEspace, commune);
      (globalThis as { dernierLu?: string }).dernierLu = `${lu} | ${texteDeLaPage(pageChez.doc)}`;
      return lu.includes("[chez]");
    }).catch((erreur: unknown) => {
      throw new Error(
        `${String(erreur)} ${(globalThis as { dernierLu?: string }).dernierLu ?? ""}`,
      );
    });
    // Chez quitte la page, puis se recharge hors ligne : tout est relu de ses bases.
    afficher(chez, undefined);
    const rechargement = await recharger(chez, partage.proprietaire.cookie);

    ailleurs.reseau.retablir();
    ailleurs.signaler("reseau");
    await attendreLEtat(ailleurs, "synchronise", 20_000);
    rechargement.reseau.retablir();
    rechargement.signaler("reseau");
    await attendreLEtat(rechargement, "synchronise", 20_000);
    const seconde = Date.now();

    const titres = (onglet: Onglet): string => JSON.stringify(onglet.facade.lire());
    await attendreQue(() => titres(rechargement) === titres(ailleurs), 5000);
    await attendreQue(async () => {
      const texteChez = await lireDansLaBase(rechargement.appareil, idEspace, commune);
      return (
        texteChez === texteDeLaPage(pageAilleurs.doc) &&
        ["[chez]", "[ailleurs]", "<C>", "<A>"].every((marque) => texteChez.includes(marque))
      );
    }, 5000);
    expect(Date.now() - seconde).toBeLessThan(5000 + 1000);
    const lu = rechargement.facade.lire();
    expect(lu.racines.map(({ titre }) => titre).sort()).toEqual([
      "Commune",
      "Créée ailleurs",
      "Créée chez",
    ]);
    expect(lu.corbeille.map(({ titre }) => titre)).toEqual(["Renommée chez"]);
  });
});

describe("base locale coupée", () => {
  it("F-013-AC4 la page se synchronise base coupée ; à la reprise, la base reçoit l'état complet, mise à jour reçue et frappe comprises, sans qu'aucun message parte vers le serveur de ce fait", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Coupée"]);
    const { chez, ailleurs, idEspace } = partage;
    const [idPage] = chez.facade.lire().racines.map(({ id }) => id);
    if (idPage === undefined) {
      throw new Error("page manquante");
    }
    const connexions = ailleurs.appareil.sur(() => suivreLesConnexionsTenues());
    const page = await afficherAvecSaBase(ailleurs, idPage);
    const persistance = persistancesDePage.at(-1);
    await attendreQue(() => persistance?.lireEtat() === "active");
    const base = connexions.find((connexion) => connexion.name.endsWith(`:${idPage}`));
    if (base === undefined || persistance === undefined) {
      throw new Error("base de page introuvable");
    }
    ailleurs.appareil.sur(() => fermerDeForce(base));
    await attendreQue(() => persistance.lireEtat() === "coupee");

    const pageChez = pageDEssai(idPage);
    afficher(chez, pageChez);
    ecrireDansLaPage(pageChez.doc, "reçue pendant la coupure");
    await attendreQue(() => texteDeLaPage(page.doc).includes("reçue pendant la coupure"));
    ecrireDansLaPage(page.doc, "saisie pendant la coupure");
    await attendreLEtat(ailleurs, "synchronise");
    const emis = ailleurs.reseau.emis.length;

    ailleurs.appareil.sur(() => persistance.reessayer());
    await attendreQue(() => persistance.lireEtat() === "active", 15_000);
    await pause(500);

    expect(ailleurs.reseau.emis.length).toBe(emis);
    const relue = await lireDansLaBase(ailleurs.appareil, idEspace, idPage);
    expect(relue).toContain("reçue pendant la coupure");
    expect(relue).toContain("saisie pendant la coupure");
  });
});

describe("rencontre de deux versions", () => {
  it("F-013-AC34 une version supérieure, un nœud et une marque inconnus reçus en une seule transaction n'atteignent jamais le document lié : aucune mise à jour émise, tout reste dans la réplique, sa base et sur le serveur, octet pour octet", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Partagée"]);
    const { chez, ailleurs, idEspace } = partage;
    const [idPage] = chez.facade.lire().racines.map(({ id }) => id);
    if (idPage === undefined) {
      throw new Error("page manquante");
    }
    const pageChez = pageDEssai(idPage);
    afficher(chez, pageChez);
    const pageAilleurs = pageDEssai(idPage);
    // La liaison simulée retire du document lié tout nœud que le schéma ne connaît pas, comme le
    // ferait celle de l'éditeur (H8) : si le contenu inconnu l'atteignait, il serait perdu.
    fragmentBrut(pageAilleurs.doc).observeDeep(() => {
      const fragment = fragmentBrut(pageAilleurs.doc);
      fragment.toArray().forEach((noeud, rang) => {
        if (noeud instanceof Y.XmlElement && noeud.nodeName === "noeudInconnu") {
          queueMicrotask(() => fragment.delete(rang, 1));
        }
      });
    });
    afficher(ailleurs, pageAilleurs);
    await attendreLEtat(ailleurs, "synchronise");
    const misesAJourAvant = messagesDeLaPage(ailleurs, idPage, TYPES_DE_MESSAGE.synchronisation);
    const nom = correspondance("page", idEspace, idPage).nomDeDocument;

    const forgee = miseAJourDUneReplique(pageChez.doc, (replique) => {
      replique.eleverVersion(2);
      const texte = new Y.XmlText();
      texte.insert(0, "texte marqué", { marqueInconnue: true });
      const marque = new Y.XmlElement("paragraph");
      marque.insert(0, [texte]);
      replique.contenu.insert(0, [bloc("noeudInconnu", "inconnu"), marque]);
    });
    Y.applyUpdate(pageChez.doc, forgee);
    await attendreQue(() => pageAilleurs.refus.length > 0);
    await attendreQue(
      async () =>
        (await serveur.lireInstantane(nom)) !== undefined &&
        contient(await serveur.lireInstantane(nom), "texte marqué"),
      15_000,
    );
    const instantane = await serveur.lireInstantane(nom);
    await pause(3000);

    expect(messagesDeLaPage(ailleurs, idPage, TYPES_DE_MESSAGE.synchronisation)).toBe(
      misesAJourAvant,
    );
    expect(texteDeLaPage(pageAilleurs.doc)).not.toContain("inconnu");
    expect(await serveur.lireInstantane(nom)).toEqual(instantane);
    const base = await lireDansLaBase(ailleurs.appareil, idEspace, idPage);
    expect(base).toContain("<noeudinconnu>");
    expect(base).toContain("texte marqué");
  });
});

describe("onglets du même appareil", () => {
  it("F-013-AC36 une modification d'un onglet atteint l'autre en moins d'une seconde, sans serveur ni réseau, espace local ; un onglet ouvert ensuite rattrape ce que sa base n'a pas encore ; rien n'est rediffusé en boucle", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const appareil = nouvelAppareil();
    const compte = compteDEssai("deconnecte");
    const premier = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      compte,
    });
    const second = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      compte: compteDEssai("deconnecte"),
    });

    const debut = Date.now();
    premier.facade.creerPage("D'un onglet à l'autre");
    await attendreQue(
      () => second.facade.lire().racines.some(({ titre }) => titre === "D'un onglet à l'autre"),
      1000,
    );
    expect(Date.now() - debut).toBeLessThan(1000);

    const idPage = premier.facade.lire().racines[0]?.id ?? "";
    const pagePremier = pageDEssai(idPage);
    afficher(premier, pagePremier);
    const pageSecond = pageDEssai(idPage);
    afficher(second, pageSecond);
    ecrireDansLaPage(pagePremier.doc, "frappe du premier onglet");
    await attendreQue(
      () => texteDeLaPage(pageSecond.doc).includes("frappe du premier onglet"),
      1000,
    );
    // Ce que l'autre onglet reçoit n'est pas défait par son annulation (F-003-AC12).
    const annulation = new Y.UndoManager(fragmentBrut(pageSecond.doc));
    ecrireDansLaPage(pageSecond.doc, "frappe du second onglet");
    annulation.undo();
    expect(texteDeLaPage(pageSecond.doc)).toContain("frappe du premier onglet");
    annulation.destroy();

    // Un troisième onglet, sans base pour cette page, la rattrape par le canal.
    const troisieme = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      compte: compteDEssai("deconnecte"),
    });
    const pageTroisieme = pageDEssai(idPage);
    afficher(troisieme, pageTroisieme);
    await attendreQue(
      () => texteDeLaPage(pageTroisieme.doc).includes("frappe du premier onglet"),
      2000,
    );
    await pause(300);
    expect(texteDeLaPage(pagePremier.doc)).toBe(texteDeLaPage(pageTroisieme.doc));
    expect([premier, second, troisieme].map(({ reseau }) => reseau.ouvertes())).toEqual([0, 0, 0]);
  });

  it("F-013-AC36 F-013-AC34 une version non prise en charge reçue d'un autre onglet n'atteint pas le document lié", async () => {
    const membre = await serveur.inscrire();
    const idEspace = crypto.randomUUID();
    const appareil = nouvelAppareil();
    const premier = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      compte: compteDEssai("deconnecte"),
    });
    const second = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace,
      appareil,
      compte: compteDEssai("deconnecte"),
    });
    const idPage = crypto.randomUUID();
    const pagePremier = pageDEssai(idPage);
    const pageSecond = pageDEssai(idPage);
    afficher(premier, pagePremier);
    afficher(second, pageSecond);

    Y.applyUpdate(
      pagePremier.doc,
      miseAJourDUneReplique(pagePremier.doc, (replique) => {
        replique.eleverVersion(2);
        ajouter(replique, bloc("noeudInconnu", "venu de l'autre onglet"));
      }),
    );
    await attendreQue(() => pageSecond.refus.length > 0, 2000);
    expect(texteDeLaPage(pageSecond.doc)).not.toContain("venu de l'autre onglet");
  });
});

describe("durabilité", () => {
  it("F-013-AC49 base coupée et connexion coupée, la frappe n'est acquittée nulle part ; la connexion rétablie, elle l'est par le serveur ; la base rétablie, elle est durable", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    const idPage = onglet.facade.creerPage("Durable");
    await adopterEtAttendre(onglet);
    const connexions = onglet.appareil.sur(() => suivreLesConnexionsTenues());
    const page = await afficherAvecSaBase(onglet, idPage);
    const persistance = persistancesDePage.at(-1);
    await attendreQue(() => persistance?.lireEtat() === "active");
    await attendreLEtat(onglet, "synchronise");
    expect(onglet.synchro.toutEstAcquitte()).toBe(true);
    const base = connexions.find((connexion) => connexion.name.endsWith(`:${idPage}`));
    if (base === undefined || persistance === undefined) {
      throw new Error("base de page introuvable");
    }
    onglet.appareil.sur(() => fermerDeForce(base));
    await attendreQue(() => persistance.lireEtat() === "coupee");
    onglet.reseau.couper();
    await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");

    ecrireDansLaPage(page.doc, "ni écrite ni acquittée");
    expect(texteDeLaPage(page.doc)).toContain("ni écrite ni acquittée");
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(true);
    expect(onglet.synchro.toutEstAcquitte()).toBe(false);
    expect(onglet.synchro.estAcquitte(page.doc)).toBe(false);

    onglet.reseau.retablir();
    onglet.signaler("reseau");
    await attendreLEtat(onglet, "synchronise", 20_000);
    expect(onglet.synchro.toutEstAcquitte()).toBe(true);
    // Document par document : la page affichée et l'espace le sont, un document étranger jamais.
    expect(onglet.synchro.estAcquitte(page.doc)).toBe(true);
    expect(onglet.synchro.estAcquitte(onglet.facade.doc)).toBe(true);
    expect(onglet.synchro.estAcquitte(new Y.Doc())).toBe(false);
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(true);

    onglet.appareil.sur(() => persistance.reessayer());
    await attendreQue(() => persistance.lireEtat() === "active", 15_000);
    expect(persistance.aDesModificationsNonEnregistrees()).toBe(false);
    expect(onglet.synchro.lireEtat().affiche).toBe("synchronise");
  });
});

function contient(instantane: Uint8Array | undefined, texte: string): boolean {
  return instantane !== undefined && new TextDecoder().decode(instantane).includes(texte);
}

/** L'onglet est fermé puis rouvert sur le même appareil, réseau coupé : tout est relu des bases. */
async function recharger(onglet: Onglet, cookie: string): Promise<Onglet> {
  onglet.synchro.fermer();
  onglet.persistance.fermer();
  const rouvert = await ouvrirUnOnglet({
    serveur,
    cookie,
    idEspace: onglet.idEspace,
    appareil: onglet.appareil,
    rejoint: true,
  });
  rouvert.reseau.couper();
  return rouvert;
}
