import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { type DocumentPage, lireVersionPage, VERSION_PAGE_PRISE_EN_CHARGE } from "../src/index.ts";
import {
  codeDuRefusDe,
  misesAJourDe,
  nombreDeParametresDeLOuverture,
  observateursAjoutes,
  observateursDe,
  ouvrirPageSuivie,
  recevoirLaVersion,
} from "./aides-page.ts";

// Le paquet compile sans DOM ni types Node : `console` se déclare ici comme dans la source.
declare const console: { error(...donnees: unknown[]): void };

const VERSION_INCONNUE = VERSION_PAGE_PRISE_EN_CHARGE + 1;
const NOMBRE_D_OUVERTURES = 50;

type Origine = (page: DocumentPage, version: number) => void;

// Les deux origines d'une version non prise en charge : l'opération locale, une mise à jour reçue.
const ORIGINES: readonly [string, Origine][] = [
  ["l'opération d'élévation", (page, version) => page.eleverVersion(version)],
  ["Y.applyUpdate", (page, version) => recevoirLaVersion(page.doc, version)],
];

function espionnerLaConsole(): ReturnType<typeof vi.fn> {
  const espion = vi.fn();
  vi.spyOn(console, "error").mockImplementation(espion);
  return espion;
}

describe("garde de version d'une façade de page", () => {
  it.each(ORIGINES)(
    "F-003-AC29 le rappel de garde est appelé quand %s rend le document non pris en charge, et pas pour une version prise en charge",
    (_origine, provoquer) => {
      const page = ouvrirPageSuivie(new Y.Doc());
      const garde = vi.fn();
      page.garderVersion(garde);

      provoquer(page, VERSION_PAGE_PRISE_EN_CHARGE);
      const appelsPourUneVersionAdmise = garde.mock.calls.length;
      provoquer(page, VERSION_INCONNUE);

      expect(appelsPourUneVersionAdmise).toBe(0);
      expect(garde).toHaveBeenCalledTimes(1);
      expect(page.lireVersion()).toBe(VERSION_INCONNUE);
    },
  );

  it("F-003-AC29 la garde passe au rang d'un observateur simple : avant tout observateur profond du fragment, que la version soit écrite avant ou après le contenu dans la transaction", () => {
    for (const versionDAbord of [true, false]) {
      const doc = new Y.Doc();
      const page = ouvrirPageSuivie(doc);
      const ordre: string[] = [];
      const profond = (): void => void ordre.push("observateur profond du contenu");
      page.contenu.observeDeep(profond);
      page.garderVersion(() => ordre.push("garde"));
      const emettrice = new Y.Doc();
      const distante = ouvrirPageSuivie(emettrice);
      emettrice.transact(() => {
        if (versionDAbord) {
          distante.eleverVersion(VERSION_INCONNUE);
        }
        distante.contenu.insert(0, [new Y.XmlElement("blocFutur")]);
        if (!versionDAbord) {
          distante.eleverVersion(VERSION_INCONNUE);
        }
      });

      Y.applyUpdate(doc, Y.encodeStateAsUpdate(emettrice));
      page.contenu.unobserveDeep(profond);

      expect(ordre, `version d'abord : ${String(versionDAbord)}`).toEqual([
        "garde",
        "observateur profond du contenu",
      ]);
    }
  });

  it("F-003-AC29 une modification du contenu seul n'appelle pas la garde", () => {
    const page = ouvrirPageSuivie(new Y.Doc());
    const garde = vi.fn();
    page.garderVersion(garde);

    page.contenu.insert(0, [new Y.XmlElement("paragraph")]);

    expect(garde).not.toHaveBeenCalled();
    expect(page.contenu.length).toBe(1);
  });
});

describe("fermeture d'une façade de page", () => {
  it("F-003-AC33 fermer() retire l'observateur du type de version : le compte du Y.Doc revient à son départ, et ouvrir puis fermer cinquante fois le laisse inchangé", () => {
    const doc = new Y.Doc();
    const depart = observateursDe(doc);

    const page = ouvrirPageSuivie(doc);
    page.garderVersion(() => undefined);
    const pendant = observateursDe(doc);
    page.fermer();
    const apres = observateursDe(doc);
    for (let numero = 0; numero < NOMBRE_D_OUVERTURES; numero += 1) {
      ouvrirPageSuivie(doc).fermer();
    }

    expect(pendant).toBe(depart + 1);
    expect(apres).toBe(depart);
    expect(observateursDe(doc)).toBe(depart);
    expect(observateursAjoutes(doc)).toBe(0);
  });

  it("F-003-AC33 après fermer(), une version reçue n'appelle aucun rappel de garde et ne provoque aucune relecture : la lecture rend la dernière version lue avant la fermeture", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    const garde = vi.fn();
    page.garderVersion(garde);

    page.fermer();
    recevoirLaVersion(doc, VERSION_INCONNUE);

    expect(garde).not.toHaveBeenCalled();
    expect(page.lireVersion()).toBe(VERSION_PAGE_PRISE_EN_CHARGE);
    expect(lireVersionPage(doc)).toBe(VERSION_INCONNUE);
  });

  it("F-003-AC33 l'abonnement de garde n'inscrit plus rien sur une façade fermée", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    page.fermer();
    const depart = observateursDe(doc);
    const garde = vi.fn();

    const desabonner = page.garderVersion(garde);
    recevoirLaVersion(doc, VERSION_INCONNUE);
    desabonner();

    expect(observateursDe(doc)).toBe(depart);
    expect(garde).not.toHaveBeenCalled();
  });

  it("F-003-AC33 une seconde fermeture est sans effet, et la fermeture ne détruit ni ne modifie le Y.Doc ni le fragment du contenu", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    page.contenu.insert(0, [new Y.XmlElement("paragraph")]);
    const emises = misesAJourDe(doc);
    const avant = [...Y.encodeStateAsUpdate(doc)];
    const signalements = espionnerLaConsole();

    page.fermer();
    const apresLaPremiere = observateursDe(doc);
    page.fermer();

    expect(observateursDe(doc)).toBe(apresLaPremiere);
    expect(signalements).not.toHaveBeenCalled();
    expect(emises).toEqual([]);
    expect([...Y.encodeStateAsUpdate(doc)]).toEqual(avant);
    expect(doc.isDestroyed).toBe(false);
    expect(page.contenu.length).toBe(1);
  });

  it.each(ORIGINES)(
    "F-003-AC33 fermer() appelée depuis un rappel de garde, la version venant de %s : les rappels restants ne sont pas appelés, les observateurs sont retirés, rien n'est levé",
    (_origine, provoquer) => {
      const doc = new Y.Doc();
      const depart = observateursDe(doc);
      const page = ouvrirPageSuivie(doc);
      const suivant = vi.fn();
      const signalements = espionnerLaConsole();
      let fermetures = 0;
      page.garderVersion(() => {
        page.fermer();
        fermetures += 1;
      });
      page.garderVersion(suivant);

      expect(() => provoquer(page, VERSION_INCONNUE)).not.toThrow();

      expect(fermetures).toBe(1);
      expect(suivant).not.toHaveBeenCalled();
      expect(signalements).not.toHaveBeenCalled();
      expect(observateursDe(doc)).toBe(depart);
    },
  );

  it("F-003-AC33 sur une façade fermée, l'élévation est refusée par facade-fermee avant tout autre refus, sans modifier le Y.Doc", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);
    page.fermer();
    const emises = misesAJourDe(doc);
    const avant = [...Y.encodeStateAsUpdate(doc)];

    expect(codeDuRefusDe(() => page.eleverVersion(VERSION_INCONNUE))).toBe("facade-fermee");
    expect(codeDuRefusDe(() => page.eleverVersion(0))).toBe("facade-fermee");

    expect(emises).toEqual([]);
    expect([...Y.encodeStateAsUpdate(doc)]).toEqual(avant);
    expect(lireVersionPage(doc)).toBe(VERSION_PAGE_PRISE_EN_CHARGE);
  });

  it("F-003-AC33 fermer une façade laisse ouverte une autre façade du même Y.Doc", () => {
    const doc = new Y.Doc();
    const premiere = ouvrirPageSuivie(doc);
    const seconde = ouvrirPageSuivie(doc);
    const garde = vi.fn();
    seconde.garderVersion(garde);

    premiere.fermer();
    seconde.eleverVersion(VERSION_INCONNUE);

    expect(garde).toHaveBeenCalledTimes(1);
    expect(observateursAjoutes(doc)).toBe(1);
  });
});

describe("rappel de garde qui lève", () => {
  it.each(ORIGINES)(
    "F-003-AC34 la version venant de %s : les rappels suivants sont appelés dans l'ordre d'inscription, rien ne remonte, et chaque exception va une fois à console.error, dans l'ordre",
    (_origine, provoquer) => {
      const page = ouvrirPageSuivie(new Y.Doc());
      const signalements = espionnerLaConsole();
      const appels: string[] = [];
      const premiereFaute = new Error("premier rappel fautif");
      const secondeFaute = new Error("troisième rappel fautif");
      page.garderVersion(() => {
        appels.push("premier");
        throw premiereFaute;
      });
      page.garderVersion(() => void appels.push("deuxième"));
      page.garderVersion(() => {
        appels.push("troisième");
        throw secondeFaute;
      });

      expect(() => provoquer(page, VERSION_INCONNUE)).not.toThrow();

      expect(appels).toEqual(["premier", "deuxième", "troisième"]);
      expect(signalements).toHaveBeenCalledTimes(2);
      expect(signalements.mock.calls.map((appel) => appel.at(-1))).toEqual([
        premiereFaute,
        secondeFaute,
      ]);
      expect(page.lireVersion()).toBe(VERSION_INCONNUE);
    },
  );

  it("F-003-AC34 un rappel désabonné pendant la diffusion n'est pas appelé, et un rappel inscrit pendant la diffusion ne l'est qu'au changement suivant", () => {
    const page = ouvrirPageSuivie(new Y.Doc());
    const desabonne = vi.fn();
    const inscritPendant = vi.fn();
    let desabonner: () => void = () => undefined;
    page.garderVersion(() => {
      desabonner();
      if (inscritPendant.mock.calls.length === 0) {
        page.garderVersion(inscritPendant);
      }
    });
    desabonner = page.garderVersion(desabonne);

    page.eleverVersion(VERSION_INCONNUE);
    const appelsAuPremierChangement = inscritPendant.mock.calls.length;
    page.eleverVersion(VERSION_INCONNUE + 1);

    expect(desabonne).not.toHaveBeenCalled();
    expect(appelsAuPremierChangement).toBe(0);
    expect(inscritPendant).toHaveBeenCalledTimes(1);
  });

  it("F-003-AC34 la fonction d'ouverture ne reçoit que le Y.Doc : ni récepteur d'exception, ni option", () => {
    expect(nombreDeParametresDeLOuverture()).toBe(1);
  });
});

describe("ouvertures des aides du paquet", () => {
  it("F-003-AC35 recevoirLaVersion ferme la façade de son émettrice avant le retour : chaque type observé pendant l'appel n'a plus aucun observateur, et le document qui reçoit n'en gagne aucun", () => {
    const espion = vi.spyOn(Y.AbstractType.prototype, "observe");
    const doc = new Y.Doc();
    const depart = observateursDe(doc);
    try {
      recevoirLaVersion(doc, VERSION_PAGE_PRISE_EN_CHARGE);
      const types = [...new Set(espion.mock.contexts as Y.AbstractType<unknown>[])];

      expect(types).toHaveLength(1);
      expect(types.map((type) => type._eH.l.length + type._dEH.l.length)).toEqual([0]);
      expect(observateursDe(doc)).toBe(depart);
    } finally {
      espion.mockRestore();
    }
  });

  it("F-003-AC35 ouvrirPageSuivie ajoute un observateur au document, que la fermeture de la façade retire", () => {
    const doc = new Y.Doc();
    const page = ouvrirPageSuivie(doc);

    expect(observateursAjoutes(doc)).toBe(1);
    page.fermer();
    expect(observateursAjoutes(doc)).toBe(0);
  });
});
