// F-032 : coutures du bloc de l'onglet. La confirmation armée lue au moment d'un changement
// d'espace est celle de la demande avant de quitter (F-032-AC13, F-030-AC16, F-013-AC49) ; les
// appelants de la mémoire de l'appareil et du registre, et ceux du démarrage injecté de la session,
// sont énumérés (F-032-AC32). Une méthode privée du même nom (`#lireLeRegistre`) n'est pas un appel.
import { describe, expect, it, vi } from "vitest";

import {
  brancherLAcquittement,
  confirmationArmee,
  suivreLOnglet,
} from "../src/espace/garde-onglet.ts";
import { lireDossier } from "./aides-disque.ts";
import { tenterDeQuitter } from "./aides-reprise.ts";

type Persistance = Parameters<typeof suivreLOnglet>[0];
type Etat = ReturnType<Persistance["lireEtat"]>;

interface PersistanceSimulee extends Persistance {
  regler(nonEnregistre: boolean): void;
  fermerParUnAutre(): void;
}

function persistanceSimulee(): PersistanceSimulee {
  const abonnes = new Set<() => void>();
  let nonEnregistre = false;
  let etat: Etat = "coupee";
  const prevenir = (): void => abonnes.forEach((rappel) => rappel());
  return {
    lireEtat: () => etat,
    abonner: (rappel) => {
      abonnes.add(rappel);
      return () => void abonnes.delete(rappel);
    },
    fermer: vi.fn(),
    reessayer: vi.fn(),
    aDesModificationsNonEnregistrees: () => nonEnregistre,
    aReluLaBase: () => true,
    aLaisseDesBasesNonRattachees: () => false,
    soumettreLEtatRelu: vi.fn(),
    regler: (valeur) => {
      nonEnregistre = valeur;
      prevenir();
    },
    fermerParUnAutre: () => {
      etat = "fermee";
      prevenir();
    },
  };
}

/** La confirmation armée et la demande avant de quitter disent la même chose. */
function armee(): boolean {
  const avantDeQuitter = tenterDeQuitter().defaultPrevented;
  expect(confirmationArmee()).toBe(avantDeQuitter);
  return avantDeQuitter;
}

describe("confirmation armée au moment d'un changement d'espace (F-032-AC13)", () => {
  it("F-032-AC13 F-030-AC16 armée dès qu'une persistance suivie porte une modification non enregistrée, désarmée quand elle n'en porte plus, quand elle est fermée par un autre, ou quand sa garde cesse", () => {
    const une = persistanceSimulee();
    const autre = persistanceSimulee();
    const cesserUne = suivreLOnglet(une);
    const cesserAutre = suivreLOnglet(autre);
    expect(armee()).toBe(false);

    une.regler(true);
    expect(armee()).toBe(true);
    une.regler(false);
    expect(armee()).toBe(false);

    autre.regler(true);
    autre.fermerParUnAutre();
    expect(armee()).toBe(false);

    une.regler(true);
    cesserUne();
    expect(armee()).toBe(false);
    cesserAutre();
  });

  it("F-032-AC13 F-013-AC49 une modification non enregistrée sur l'appareil mais acquittée par le serveur n'arme pas la confirmation ; l'acquittement d'un autre document ne la désarme pas", () => {
    const doc = {};
    const autreDoc = {};
    const persistance = persistanceSimulee();
    const cesser = suivreLOnglet(persistance, doc);
    let acquittes: readonly object[] = [];
    const abonnes = new Set<() => void>();
    const debrancher = brancherLAcquittement({
      estAcquitte: (un) => acquittes.includes(un),
      abonner: (rappel) => {
        abonnes.add(rappel);
        return () => void abonnes.delete(rappel);
      },
    });

    persistance.regler(true);
    expect(armee()).toBe(true);
    acquittes = [autreDoc];
    abonnes.forEach((rappel) => rappel());
    expect(armee()).toBe(true);
    acquittes = [doc];
    abonnes.forEach((rappel) => rappel());
    expect(armee()).toBe(false);

    debrancher();
    expect(armee()).toBe(true);
    cesser();
    expect(armee()).toBe(false);
  });
});

// ── F-032-AC32 : appelants énumérés ────────────────────────────────────────────────────────────

const SOURCES = lireDossier("src");

function quiAppellent(motif: RegExp): string[] {
  return [...SOURCES]
    .filter(([, texte]) => motif.test(texte))
    .map(([chemin]) => chemin)
    .sort();
}

describe("appelants du registre et de la mémoire de l'appareil (F-032-AC32)", () => {
  it("F-032-AC32 le registre de F-013 n'est lu, inscrit et retiré que par le stockage de la synchronisation ; la mémoire de l'appareil n'est atteinte que par le magasin de l'appareil", () => {
    expect(quiAppellent(/(?<!#)\b(lireLeRegistre|inscrireAuRegistre)\(/)).toEqual([
      "src/persistance/registre.ts",
      "src/synchronisation/stockage.ts",
    ]);
    expect(quiAppellent(/(?<!#)\bretirerDuRegistre\(/)).toEqual([
      "src/persistance/registre.ts",
      "src/synchronisation/stockage.ts",
    ]);
    expect(
      quiAppellent(
        /(?<!#)\b(lireLAppareil|ajouterALAppareil|inscrireLEspaceRetenu|noterLesNoms|retirerLaMarque)\(/,
      ).filter((chemin) => !chemin.startsWith("src/persistance/")),
    ).toEqual(["src/espace/appareil.ts"]);
  });

  it("F-032-AC32 F-002-AC31 le démarrage de la session reçu par le pilote n'est appelé que par lui ; la session n'est démarrée par son nom que par l'entrée", () => {
    expect(quiAppellent(/\bdemarrerSession\(/)).toEqual(["src/espace/espace-ouvert.ts"]);
    expect(
      quiAppellent(/\bdemarrerSessionEspace\b/).filter(
        (chemin) => chemin !== "src/espace/session-espace.ts",
      ),
    ).toEqual(["src/main.tsx"]);
  });
});

describe("appelants du pilote, du magasin et du changement d'espace (F-032-AC32)", () => {
  const horsDefinition = (definition: string) => (chemin: string) => chemin !== definition;

  it("F-032-AC32 F-032-AC10 le pilote et le magasin de l'appareil ne sont créés que par l'entrée, qui seule rend l'espace de l'onglet ; seul l'espace de l'onglet donne ses espaces à l'application", () => {
    expect(
      quiAppellent(/\bpiloterLOnglet\(/).filter(horsDefinition("src/espace/espace-ouvert.ts")),
    ).toEqual(["src/main.tsx"]);
    expect(
      quiAppellent(/\bouvrirLeMagasinDeLAppareil\(/).filter(
        horsDefinition("src/espace/appareil.ts"),
      ),
    ).toEqual(["src/main.tsx"]);
    expect(quiAppellent(/<EspaceDeLOnglet\b/)).toEqual(["src/main.tsx"]);
    expect(quiAppellent(/<Application\b/)).toEqual(["src/interface/EspaceDeLOnglet.tsx"]);
    expect(quiAppellent(/\bimport\b[^;]*\bfrom "\.\/interface\/Application\.tsx"/)).toEqual([]);
  });

  it("F-032-AC32 F-032-AC12 F-032-AC13 le changement du pilote, la confirmation armée et l'attente d'acquittement ne sont appelés, hors de leur module, que par le crochet du changement d'espace", () => {
    const crochet = "src/interface/changement-d-espace.ts";
    expect(quiAppellent(/\.changer\(\s*demande\.cible|\bpilote\.changer\(/)).toEqual([crochet]);
    expect(
      quiAppellent(/\bconfirmationArmee\(/).filter(horsDefinition("src/espace/garde-onglet.ts")),
    ).toEqual([crochet]);
    expect(quiAppellent(/\.attendreLAcquittement\(/)).toEqual([crochet]);
  });
});
