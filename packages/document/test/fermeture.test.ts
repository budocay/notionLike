import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  type Arborescence,
  creerDocumentEspace,
  type DocumentEspace,
  ErreurDocument,
  type IdPage,
  ouvrirDocumentEspace,
} from "../src/index.ts";

// Le paquet compile sans DOM ni types Node : `console` se déclare ici comme dans la source.
declare const console: { error(...donnees: unknown[]): void };

const ID_ABSENT = "00000000-0000-4000-8000-0000000000ff";
const TITRE_TROP_LONG = "x".repeat(201);
const VERSION_NON_PRISE_EN_CHARGE = 2;
const NOMBRE_D_OUVERTURES = 50;

// Compte du départ de chaque `Y.Doc` où une façade a été ouverte, et façades à fermer en fin de test.
const comptesDeDepart = new Map<Y.Doc, number>();
const facadesSuivies: DocumentEspace[] = [];

function ecouteurs(doc: Y.Doc): number {
  return doc._observers.get("afterTransaction")?.size ?? 0;
}

function suivre(espace: DocumentEspace, depart: number): DocumentEspace {
  if (!comptesDeDepart.has(espace.doc)) {
    comptesDeDepart.set(espace.doc, depart);
  }
  facadesSuivies.push(espace);
  return espace;
}

function ouvrirSuivie(doc: Y.Doc): DocumentEspace {
  const depart = ecouteurs(doc);
  return suivre(ouvrirDocumentEspace(doc), depart);
}

function creerSuivie(): DocumentEspace {
  const depart = ecouteurs(new Y.Doc());
  return suivre(creerDocumentEspace(), depart);
}

function ecouteursAjoutes(doc: Y.Doc): number {
  return ecouteurs(doc) - (comptesDeDepart.get(doc) ?? 0);
}

// F-002-AC31 : toute façade ouverte par ce fichier est fermée, et la preuve est le compte
// d'écouteurs de chaque `Y.Doc` revenu à sa valeur de départ.
afterEach(() => {
  vi.restoreAllMocks();
  facadesSuivies.splice(0).forEach((espace) => espace.fermer());
  const ajoutes = [...comptesDeDepart.keys()].map(ecouteursAjoutes);
  comptesDeDepart.clear();
  expect(ajoutes).toEqual(ajoutes.map(() => 0));
});

function repliqueDe(espace: DocumentEspace): DocumentEspace {
  const replique = ouvrirSuivie(new Y.Doc());
  Y.applyUpdate(replique.doc, Y.encodeStateAsUpdate(espace.doc));
  return replique;
}

function recevoirDe(espace: DocumentEspace, emettrice: DocumentEspace): void {
  Y.applyUpdate(espace.doc, Y.encodeStateAsUpdate(emettrice.doc));
}

function recevoirUnePage(espace: DocumentEspace, titre: string): void {
  const emettrice = repliqueDe(espace);
  emettrice.creerPage(titre);
  recevoirDe(espace, emettrice);
}

function recevoirLaVersion(espace: DocumentEspace, version: number): void {
  const emettrice = repliqueDe(espace);
  emettrice.doc.getMap("meta").set("version", version);
  recevoirDe(espace, emettrice);
}

interface Origine {
  readonly origine: string;
  /** Change l'arborescence lue par `espace` en y ajoutant une page à la racine. */
  readonly changer: (espace: DocumentEspace, titre: string) => void;
}

const ORIGINES: Origine[] = [
  { origine: "une opération locale", changer: (espace, titre) => void espace.creerPage(titre) },
  { origine: "Y.applyUpdate", changer: recevoirUnePage },
];

function titres(lue: Arborescence): string[] {
  return lue.racines.map((page) => page.titre);
}

function codeDuRefus(operation: () => unknown): string {
  try {
    operation();
  } catch (erreur) {
    return erreur instanceof ErreurDocument ? erreur.code : `autre exception : ${String(erreur)}`;
  }
  return "aucun refus";
}

function espionnerLaConsole(): ReturnType<typeof vi.fn> {
  const espion = vi.fn();
  vi.spyOn(console, "error").mockImplementation(espion);
  return espion;
}

/** Dernier argument de chaque appel : l'exception signalée, après la phrase fixe. */
function exceptionsSignalees(espion: ReturnType<typeof vi.fn>): unknown[] {
  return espion.mock.calls.map((donnees) => donnees.at(-1));
}

function enregistrerLesMisesAJour(doc: Y.Doc): Uint8Array[] {
  const misesAJour: Uint8Array[] = [];
  doc.on("update", (miseAJour: Uint8Array) => {
    misesAJour.push(miseAJour);
  });
  return misesAJour;
}

describe("rappel d'abonné qui lève", () => {
  it.each(ORIGINES)(
    "F-002-AC29 $origine : deux rappels fautifs sur quatre, tous appelés une fois dans l'ordre, rien ne remonte, console.error reçoit chaque exception une fois",
    ({ changer }) => {
      const espace = creerSuivie();
      const console_ = espionnerLaConsole();
      const erreurDeB = new Error("b lève");
      const erreurDeD = new Error("d lève");
      const appels: string[] = [];
      espace.abonner(() => appels.push("a"));
      espace.abonner(() => {
        appels.push("b");
        throw erreurDeB;
      });
      espace.abonner(() => appels.push("c"));
      espace.abonner(() => {
        appels.push("d");
        throw erreurDeD;
      });

      expect(() => changer(espace, "page")).not.toThrow();

      expect(appels).toEqual(["a", "b", "c", "d"]);
      expect(console_).toHaveBeenCalledTimes(2);
      expect(exceptionsSignalees(console_)[0]).toBe(erreurDeB);
      expect(exceptionsSignalees(console_)[1]).toBe(erreurDeD);
      expect(titres(espace.lire())).toEqual(["page"]);
    },
  );

  it.each(ORIGINES)(
    "F-002-AC29 $origine : un seul rappel fautif, qui lève autre chose qu'une Error, est signalé une fois par la même phrase fixe à chaque changement",
    ({ changer }) => {
      const espace = creerSuivie();
      const console_ = espionnerLaConsole();
      const suivant = vi.fn();
      espace.abonner(() => {
        throw "chaîne levée";
      });
      espace.abonner(suivant);

      expect(() => changer(espace, "première")).not.toThrow();
      expect(console_).toHaveBeenCalledTimes(1);
      expect(suivant).toHaveBeenCalledTimes(1);

      expect(() => changer(espace, "seconde")).not.toThrow();
      expect(console_).toHaveBeenCalledTimes(2);
      expect(suivant).toHaveBeenCalledTimes(2);
      expect(exceptionsSignalees(console_)).toEqual(["chaîne levée", "chaîne levée"]);
      const phrases = console_.mock.calls.map((donnees) => donnees[0]);
      expect(phrases[0]).toEqual(expect.any(String));
      expect(phrases[1]).toBe(phrases[0]);
    },
  );

  it.each(ORIGINES)(
    "F-002-AC29 $origine : un rappel qui désabonne le suivant, inscrit un abonné puis lève ; ni le désabonné ni le nouvel inscrit ne sont appelés pour ce changement",
    ({ changer }) => {
      const espace = creerSuivie();
      const console_ = espionnerLaConsole();
      const erreur = new Error("le premier lève");
      const appels: string[] = [];
      let inscrit = false;
      espace.abonner(() => {
        appels.push("premier");
        desabonnerLeSuivant();
        if (!inscrit) {
          inscrit = true;
          espace.abonner(() => appels.push("inscrit pendant la diffusion"));
        }
        throw erreur;
      });
      const desabonnerLeSuivant = espace.abonner(() => appels.push("désabonné"));
      espace.abonner(() => appels.push("dernier"));

      expect(() => changer(espace, "première")).not.toThrow();
      expect(appels).toEqual(["premier", "dernier"]);
      expect(exceptionsSignalees(console_)).toEqual([erreur]);

      expect(() => changer(espace, "seconde")).not.toThrow();
      expect(appels).toEqual([
        "premier",
        "dernier",
        "premier",
        "dernier",
        "inscrit pendant la diffusion",
      ]);
      expect(exceptionsSignalees(console_)).toEqual([erreur, erreur]);
    },
  );

  it("F-002-AC29 F-002-AC31 les deux fonctions de création gardent leurs signatures de F-001 : aucun récepteur d'exception", () => {
    expect(creerDocumentEspace).toHaveLength(0);
    expect(ouvrirDocumentEspace).toHaveLength(1);
  });
});

describe("fermer la façade", () => {
  it("F-002-AC30 après fermer(), une mise à jour reçue n'appelle aucun abonné, lire() rend la même référence et l'écouteur est retiré", () => {
    const espace = creerSuivie();
    espace.creerPage("avant");
    const rappel = vi.fn();
    espace.abonner(rappel);
    const gardee = espace.lire();
    expect(ecouteursAjoutes(espace.doc)).toBe(1);

    espace.fermer();
    expect(ecouteursAjoutes(espace.doc)).toBe(0);
    recevoirUnePage(espace, "après");
    espace.doc.transact(() => espace.doc.getMap("meta").set("ailleurs", 1));

    expect(rappel).not.toHaveBeenCalled();
    expect(espace.lire()).toBe(gardee);
    expect(titres(espace.lire())).toEqual(["avant"]);
    expect(titres(ouvrirSuivie(espace.doc).lire())).toEqual(["avant", "après"]);
  });

  it("F-002-AC30 une seconde fermeture est sans effet et ne lève pas", () => {
    const espace = creerSuivie();
    const autre = ouvrirSuivie(espace.doc);
    const rappelDeLAutre = vi.fn();
    autre.abonner(rappelDeLAutre);
    espace.fermer();
    const gardee = espace.lire();

    expect(() => espace.fermer()).not.toThrow();

    expect(ecouteursAjoutes(espace.doc)).toBe(1);
    expect(espace.lire()).toBe(gardee);
    autre.creerPage("page");
    expect(rappelDeLAutre).toHaveBeenCalledTimes(1);
  });

  it("F-002-AC30 abonner après fermeture n'inscrit rien, et les fonctions de désabonnement sont sans effet", () => {
    const espace = creerSuivie();
    const temoin = ouvrirSuivie(espace.doc);
    const avant = vi.fn();
    const apres = vi.fn();
    const desabonnerAvant = espace.abonner(avant);
    espace.fermer();

    const desabonnerApres = espace.abonner(apres);
    temoin.creerPage("page");
    expect(() => desabonnerApres()).not.toThrow();
    expect(() => desabonnerAvant()).not.toThrow();
    temoin.creerPage("autre");

    expect(avant).not.toHaveBeenCalled();
    expect(apres).not.toHaveBeenCalled();
    expect(ecouteursAjoutes(espace.doc)).toBe(1);
  });

  it(`F-002-AC30 ouvrir puis fermer ${NOMBRE_D_OUVERTURES} fois une façade sur le même Y.Doc laisse le nombre d'écouteurs du départ`, () => {
    const doc = new Y.Doc();
    const etranger = vi.fn();
    doc.on("afterTransaction", etranger);
    const depart = ecouteurs(doc);
    expect(depart).toBe(1);

    for (let tour = 0; tour < NOMBRE_D_OUVERTURES; tour += 1) {
      const espace = ouvrirSuivie(doc);
      expect(ecouteurs(doc)).toBe(depart + 1);
      espace.fermer();
      expect(ecouteurs(doc)).toBe(depart);
    }

    const ouvertesEnsemble = Array.from({ length: NOMBRE_D_OUVERTURES }, () => ouvrirSuivie(doc));
    expect(ecouteurs(doc)).toBe(depart + NOMBRE_D_OUVERTURES);
    ouvertesEnsemble.forEach((espace) => espace.fermer());
    expect(ecouteurs(doc)).toBe(depart);

    doc.transact(() => doc.getMap("meta").set("ailleurs", 1));
    expect(etranger).toHaveBeenCalledTimes(1);
  });

  it("F-002-AC30 une façade créée par creerDocumentEspace se ferme comme une façade ouverte : zéro écouteur", () => {
    const espace = creerSuivie();
    expect(ecouteurs(espace.doc)).toBe(1);

    espace.fermer();

    expect(ecouteurs(espace.doc)).toBe(0);
  });
});

describe("écrire sur une façade fermée", () => {
  interface Ecriture {
    readonly ecriture: string;
    readonly ecrire: (espace: DocumentEspace, page: IdPage, jetee: IdPage) => unknown;
  }

  const ECRITURES: Ecriture[] = [
    { ecriture: "creerPage", ecrire: (espace) => espace.creerPage("x") },
    { ecriture: "renommerPage", ecrire: (espace, page) => espace.renommerPage(page, "y") },
    {
      ecriture: "deplacerPage",
      ecrire: (espace, page) => espace.deplacerPage(page, { parent: null, position: 0 }),
    },
    { ecriture: "mettreALaCorbeille", ecrire: (espace, page) => espace.mettreALaCorbeille(page) },
    {
      ecriture: "creerPage avec un titre trop long",
      ecrire: (espace) => espace.creerPage(TITRE_TROP_LONG),
    },
    {
      ecriture: "renommerPage d'une page introuvable",
      ecrire: (espace) => espace.renommerPage(ID_ABSENT, "y"),
    },
    {
      ecriture: "deplacerPage sous elle-même",
      ecrire: (espace, page) => espace.deplacerPage(page, { parent: page }),
    },
    {
      ecriture: "deplacerPage à une position invalide",
      ecrire: (espace, page) => espace.deplacerPage(page, { parent: null, position: -1 }),
    },
    {
      ecriture: "mettreALaCorbeille d'une page déjà à la corbeille",
      ecrire: (espace, _page, jetee) => espace.mettreALaCorbeille(jetee),
    },
  ];

  it.each(ECRITURES)(
    "F-002-AC30 $ecriture : refusée par facade-fermee avant tout autre refus, sans mise à jour émise ni état modifié",
    ({ ecrire }) => {
      const espace = creerSuivie();
      const jetee = espace.creerPage("jetée");
      espace.mettreALaCorbeille(jetee);
      espace.creerPage("première");
      const page = espace.creerPage("page");
      const temoin = ouvrirSuivie(espace.doc);
      const rappelDuTemoin = vi.fn();
      temoin.abonner(rappelDuTemoin);
      espace.fermer();
      const misesAJour = enregistrerLesMisesAJour(espace.doc);
      const etatAvant = Y.encodeStateAsUpdate(espace.doc);

      expect(codeDuRefus(() => ecrire(espace, page, jetee))).toBe("facade-fermee");

      expect(misesAJour).toEqual([]);
      expect(Y.encodeStateAsUpdate(espace.doc)).toEqual(etatAvant);
      expect(rappelDuTemoin).not.toHaveBeenCalled();
      expect(titres(temoin.lire())).toEqual(["première", "page"]);
    },
  );

  it("F-002-AC30 façade fermée sur un document de version non prise en charge : lire() garde le refus de version, l'écriture donne facade-fermee", () => {
    const espace = creerSuivie();
    const page = espace.creerPage("page");
    espace.doc.getMap("meta").set("version", VERSION_NON_PRISE_EN_CHARGE);
    expect(codeDuRefus(() => espace.creerPage("x"))).toBe("version-non-prise-en-charge");

    espace.fermer();

    expect(codeDuRefus(() => espace.lire())).toBe("version-non-prise-en-charge");
    expect(codeDuRefus(() => espace.creerPage("x"))).toBe("facade-fermee");
    expect(codeDuRefus(() => espace.creerPage(TITRE_TROP_LONG))).toBe("facade-fermee");
    expect(codeDuRefus(() => espace.renommerPage(page, "y"))).toBe("facade-fermee");
    expect(codeDuRefus(() => espace.deplacerPage(page, { parent: null }))).toBe("facade-fermee");
    expect(codeDuRefus(() => espace.mettreALaCorbeille(page))).toBe("facade-fermee");
  });

  it("F-002-AC30 la version change après la fermeture : lire() rend encore l'arborescence gardée, sans relire", () => {
    const espace = creerSuivie();
    espace.creerPage("page");
    const gardee = espace.lire();
    espace.fermer();

    espace.doc.getMap("meta").set("version", VERSION_NON_PRISE_EN_CHARGE);

    expect(espace.lire()).toBe(gardee);
    expect(codeDuRefus(() => espace.creerPage("x"))).toBe("facade-fermee");
    expect(codeDuRefus(() => ouvrirSuivie(espace.doc).lire())).toBe("version-non-prise-en-charge");
  });
});

describe("fermer la façade depuis un rappel d'abonné", () => {
  it.each(ORIGINES)(
    "F-002-AC30 $origine : fermer() depuis le deuxième de trois rappels, le troisième n'est pas appelé, rien ne lève, une seconde façade du même Y.Doc reste notifiée",
    ({ changer }) => {
      const espace = creerSuivie();
      const autre = ouvrirSuivie(espace.doc);
      const console_ = espionnerLaConsole();
      const appels: string[] = [];
      espace.abonner(() => appels.push("a"));
      espace.abonner(() => {
        appels.push("b ferme");
        expect(() => espace.fermer()).not.toThrow();
      });
      espace.abonner(() => appels.push("c"));
      autre.abonner(() => appels.push("autre façade"));

      expect(() => changer(espace, "page")).not.toThrow();

      expect(appels).toEqual(["a", "b ferme", "autre façade"]);
      expect(console_).not.toHaveBeenCalled();
      expect(ecouteursAjoutes(espace.doc)).toBe(1);
      const gardee = espace.lire();
      expect(titres(gardee)).toEqual(["page"]);
      expect(codeDuRefus(() => espace.creerPage("x"))).toBe("facade-fermee");

      autre.creerPage("suivante");
      expect(appels).toEqual(["a", "b ferme", "autre façade", "autre façade"]);
      expect(espace.lire()).toBe(gardee);
      expect(titres(autre.lire())).toEqual(["page", "suivante"]);
    },
  );

  it.each(ORIGINES)(
    "F-002-AC30 F-002-AC29 $origine : un rappel lève, le suivant ferme puis lève ; chaque exception est signalée une fois, le dernier rappel n'est pas appelé",
    ({ changer }) => {
      const espace = creerSuivie();
      const console_ = espionnerLaConsole();
      const erreurDeA = new Error("a lève");
      const erreurDeB = new Error("b lève après avoir fermé");
      const appels: string[] = [];
      espace.abonner(() => {
        appels.push("a");
        throw erreurDeA;
      });
      espace.abonner(() => {
        appels.push("b ferme");
        espace.fermer();
        throw erreurDeB;
      });
      espace.abonner(() => appels.push("c"));

      expect(() => changer(espace, "page")).not.toThrow();

      expect(appels).toEqual(["a", "b ferme"]);
      expect(console_).toHaveBeenCalledTimes(2);
      expect(exceptionsSignalees(console_)[0]).toBe(erreurDeA);
      expect(exceptionsSignalees(console_)[1]).toBe(erreurDeB);
      expect(ecouteursAjoutes(espace.doc)).toBe(0);
    },
  );

  it.each(ORIGINES)(
    "F-002-AC30 $origine : une façade fermée par le rappel d'une façade ouverte avant elle n'est ni relue ni notifiée pour cette transaction",
    ({ changer }) => {
      const espace = creerSuivie();
      const fermeeParLAutre = ouvrirSuivie(espace.doc);
      const console_ = espionnerLaConsole();
      const rappel = vi.fn();
      fermeeParLAutre.abonner(rappel);
      const gardee = fermeeParLAutre.lire();
      espace.abonner(() => fermeeParLAutre.fermer());

      expect(() => changer(espace, "page")).not.toThrow();

      expect(rappel).not.toHaveBeenCalled();
      expect(fermeeParLAutre.lire()).toBe(gardee);
      expect(titres(espace.lire())).toEqual(["page"]);
      expect(console_).not.toHaveBeenCalled();
      expect(ecouteursAjoutes(espace.doc)).toBe(1);
    },
  );

  it.each(ORIGINES)(
    "F-002-AC30 $origine : une façade fermée par le rappel d'une façade ouverte après elle a déjà notifié cette transaction, et plus aucune ensuite",
    ({ changer }) => {
      const fermeeParLAutre = creerSuivie();
      const espace = ouvrirSuivie(fermeeParLAutre.doc);
      const rappel = vi.fn();
      fermeeParLAutre.abonner(rappel);
      espace.abonner(() => fermeeParLAutre.fermer());

      expect(() => changer(espace, "page")).not.toThrow();
      const gardee = fermeeParLAutre.lire();
      expect(() => changer(espace, "suivante")).not.toThrow();

      expect(rappel).toHaveBeenCalledTimes(1);
      expect(titres(gardee)).toEqual(["page"]);
      expect(fermeeParLAutre.lire()).toBe(gardee);
      expect(ecouteursAjoutes(espace.doc)).toBe(1);
    },
  );

  it("F-002-AC30 une version non prise en charge reçue par Y.applyUpdate : le rappel ferme la façade, rien ne lève, lire() garde le refus de version", () => {
    const espace = creerSuivie();
    espace.creerPage("page");
    const console_ = espionnerLaConsole();
    const suivant = vi.fn();
    espace.abonner(() => {
      if (codeDuRefus(() => espace.lire()) === "version-non-prise-en-charge") {
        espace.fermer();
      }
    });
    espace.abonner(suivant);

    expect(() => recevoirLaVersion(espace, VERSION_NON_PRISE_EN_CHARGE)).not.toThrow();

    expect(suivant).not.toHaveBeenCalled();
    expect(console_).not.toHaveBeenCalled();
    expect(ecouteursAjoutes(espace.doc)).toBe(0);
    expect(codeDuRefus(() => espace.lire())).toBe("version-non-prise-en-charge");
    expect(codeDuRefus(() => espace.creerPage("x"))).toBe("facade-fermee");
  });
});
