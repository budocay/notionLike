// Levée de D-006 côté application : garde des abonnés de la session (F-002-AC29) et fermeture de
// la session, de sa façade et de sa persistance (F-002-AC30), par `demarrerSession` et par
// `<Application>`.
import { ErreurDocument } from "@notionlike/document";
import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, type Mock, vi } from "vitest";
import * as Y from "yjs";

import type { SessionEspace } from "../src/espace/session-espace.ts";
import {
  boutonNouvellePage,
  creerPageNommee,
  docDe,
  miseAJourDUneAutreReplique,
  ouvrirCoquille,
  recevoir,
  rendreApplication,
  rendreSession,
  versionInconnueVenueDAilleurs,
} from "./aides-coquille.tsx";
import { demarrerSession, ecouteurs } from "./aides-facade.ts";
import { ecrireLaVersion, VERSION_PRISE_EN_CHARGE } from "./aides-format.ts";
import {
  enregistrements,
  fermerDeForce,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";

const PREFIXE_BASE_ESPACE = "notionlike:espace:";
const CODES = /facade-fermee|version-non-prise-en-charge|ErreurDocument|[0-9a-f]{8}-/;

function espionnerLaConsole(): Mock<(...donnees: unknown[]) => void> {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

function exceptionsSignalees(consoleErreur: Mock<(...donnees: unknown[]) => void>): unknown[] {
  return consoleErreur.mock.calls.map((appel) => {
    expect(appel).toHaveLength(2);
    expect(appel[0]).toMatch(/abonné de la session/);
    return appel[1];
  });
}

async function attendreLaPhase(session: SessionEspace, phase: string): Promise<void> {
  await waitFor(() => expect(session.lireEtat().phase).toBe(phase));
}

async function sessionPrete(): Promise<SessionEspace> {
  const session = demarrerSession();
  await attendreLaPhase(session, "pret");
  return session;
}

async function baseDeLEspace(): Promise<string> {
  const base = (await nomsDesBases()).find((nom) => nom.startsWith(PREFIXE_BASE_ESPACE));
  if (base === undefined) {
    throw new Error("Aucune base d'espace sur l'appareil simulé.");
  }
  return base;
}

describe("session d'espace : un abonné qui lève", () => {
  it("F-002-AC29 changement du document : l'exception d'un abonné est signalée une fois par console.error, le suivant est prévenu, l'application reste utilisable", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const consoleErreur = espionnerLaConsole();
    const exception = new Error("abonné fautif");
    const suivant = vi.fn();
    session.abonner(() => {
      throw exception;
    });
    session.abonner(suivant);

    expect(() =>
      recevoir(session, (espace) => void espace.creerPage("Reçue pendant la faute")),
    ).not.toThrow();

    expect(exceptionsSignalees(consoleErreur)).toEqual([exception]);
    expect(suivant).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Reçue pendant la faute" })).toBeDefined();

    await creerPageNommee(utilisateur, "Créée ensuite");

    expect(screen.getAllByRole("link").map((lien) => lien.textContent)).toEqual([
      "Reçue pendant la faute",
      "Créée ensuite",
    ]);
    expect(exceptionsSignalees(consoleErreur).every((signalee) => signalee === exception)).toBe(
      true,
    );
    expect(suivant.mock.calls.length).toBe(consoleErreur.mock.calls.length);
  });

  it.each([
    [
      "une mise à jour reçue par Y.applyUpdate",
      (session: SessionEspace): void => {
        const miseAJour = miseAJourDUneAutreReplique(session, (espace) => {
          espace.creerPage("Venue d'ailleurs");
        });
        Y.applyUpdate(docDe(session), miseAJour);
      },
    ],
    [
      "une opération locale",
      (session: SessionEspace): void => {
        const etat = session.lireEtat();
        if (etat.phase !== "pret") {
          throw new Error("La session n'est pas prête.");
        }
        etat.operations.creerPage("Créée ici");
      },
    ],
  ])(
    "F-002-AC29 plusieurs abonnés fautifs dans une même diffusion, pour %s : chacun signalé une fois, dans l'ordre des rappels, les autres prévenus dans l'ordre d'inscription, rien ne remonte",
    async (_origine, changer) => {
      const session = await sessionPrete();
      const consoleErreur = espionnerLaConsole();
      const appels: string[] = [];
      const premiere = new Error("premier abonné fautif");
      const seconde = new Error("second abonné fautif");
      session.abonner(() => void appels.push("un"));
      session.abonner(() => {
        appels.push("deux");
        throw premiere;
      });
      session.abonner(() => void appels.push("trois"));
      session.abonner(() => {
        appels.push("quatre");
        throw seconde;
      });
      session.abonner(() => void appels.push("cinq"));

      expect(() => changer(session)).not.toThrow();

      expect(appels).toEqual(["un", "deux", "trois", "quatre", "cinq"]);
      expect(exceptionsSignalees(consoleErreur)).toEqual([premiere, seconde]);
      const etat = session.lireEtat();
      expect(etat.phase === "pret" && etat.arborescence.racines).toHaveLength(1);
    },
  );

  it("F-002-AC29 règles de diffusion sous garde : un abonné désabonné pendant la diffusion n'est pas appelé, un abonné inscrit pendant la diffusion ne l'est qu'au changement suivant", async () => {
    const session = await sessionPrete();
    const consoleErreur = espionnerLaConsole();
    const exception = new Error("lève après avoir désabonné et inscrit");
    const desabonne = vi.fn();
    const inscritPendant = vi.fn();
    let desabonnerLeSuivant = (): void => undefined;
    let dejaInscrit = false;
    session.abonner(() => {
      desabonnerLeSuivant();
      if (!dejaInscrit) {
        dejaInscrit = true;
        session.abonner(inscritPendant);
      }
      throw exception;
    });
    desabonnerLeSuivant = session.abonner(desabonne);

    recevoir(session, (espace) => void espace.creerPage("Premier changement"));

    expect(desabonne).not.toHaveBeenCalled();
    expect(inscritPendant).not.toHaveBeenCalled();
    expect(exceptionsSignalees(consoleErreur)).toEqual([exception]);

    recevoir(session, (espace) => void espace.creerPage("Second changement"));

    expect(desabonne).not.toHaveBeenCalled();
    expect(inscritPendant).toHaveBeenCalledTimes(1);
    expect(exceptionsSignalees(consoleErreur)).toEqual([exception, exception]);
  });

  it("F-002-AC29 changement de la persistance, fin de la relecture : l'exception d'un abonné inscrit pendant le chargement est signalée une fois, le suivant lit la phase prête, l'application est utilisable", async () => {
    const consoleErreur = espionnerLaConsole();
    const { session, utilisateur } = rendreApplication();
    const exception = new Error("abonné fautif pendant le chargement");
    const phasesLues: string[] = [];
    expect(session.lireEtat().phase).toBe("chargement");
    session.abonner(() => {
      throw exception;
    });
    session.abonner(() => void phasesLues.push(session.lireEtat().phase));

    await boutonNouvellePage();

    expect(phasesLues).toEqual(["pret"]);
    expect(exceptionsSignalees(consoleErreur)).toEqual([exception]);
    expect(screen.queryByRole("alert")).toBeNull();
    await creerPageNommee(utilisateur, "Après la relecture");
    expect(screen.getByRole("link", { name: "Après la relecture" })).toBeDefined();
  });

  it("F-002-AC29 changement de la persistance, connexion fermée après le chargement : même signalement, le suivant lit une session non enregistrée, l'avertissement est affiché et l'application reste utilisable", async () => {
    const connexions = suivreLesConnexionsTenues();
    const { session, utilisateur } = await ouvrirCoquille();
    const consoleErreur = espionnerLaConsole();
    const exception = new Error("abonné fautif à la coupure");
    const enregistreLu: (boolean | undefined)[] = [];
    session.abonner(() => {
      throw exception;
    });
    session.abonner(() => {
      const etat = session.lireEtat();
      enregistreLu.push(etat.phase === "pret" ? etat.enregistre : undefined);
    });
    const connexionDeLEspace = connexions.at(-1);
    if (connexionDeLEspace === undefined) {
      throw new Error("Aucune connexion ouverte par la session.");
    }

    expect(() => act(() => fermerDeForce(connexionDeLEspace))).not.toThrow();

    expect((await screen.findByRole("alert")).textContent).toContain("enregistrées");
    expect(enregistreLu).toEqual([false]);
    expect(exceptionsSignalees(consoleErreur)).toEqual([exception]);
    await creerPageNommee(utilisateur, "En mémoire seulement");
    expect(screen.getByRole("link", { name: "En mémoire seulement" })).toBeDefined();
  });
});

describe("session d'espace : fermeture", () => {
  it("F-002-AC30 cinq montages et démontages sous StrictMode n'ouvrent qu'une façade ; fermer() rend au Y.Doc son compte d'écouteurs de départ, une seconde fermeture est sans effet, plus aucun abonné n'est prévenu", async () => {
    const depart = ecouteurs(new Y.Doc());
    const session = demarrerSession();
    const doc = docDe(session);
    const abonne = vi.fn();
    session.abonner(abonne);

    for (let montage = 1; montage <= 5; montage += 1) {
      const rendu = rendreSession(session);
      await boutonNouvellePage();
      expect(ecouteurs(doc), `montage ${montage}`).toBe(depart + 1);
      rendu.unmount();
      expect(ecouteurs(doc), `démontage ${montage}`).toBe(depart + 1);
    }
    const etatAvant = session.lireEtat();
    const appelsAvant = abonne.mock.calls.length;
    const miseAJour = miseAJourDUneAutreReplique(session, (espace) => {
      espace.creerPage("Reçue après la fermeture");
    });

    session.fermer();

    expect(ecouteurs(doc)).toBe(depart);
    expect(() => session.fermer()).not.toThrow();
    expect(ecouteurs(doc)).toBe(depart);

    Y.applyUpdate(doc, miseAJour);

    expect(abonne.mock.calls.length).toBe(appelsAvant);
    expect(session.lireEtat()).toBe(etatAvant);
    expect(ecouteurs(doc)).toBe(depart);
  });

  it("F-002-AC30 fermer() ferme aussi la persistance : ce que le document reçoit ensuite n'atteint plus IndexedDB", async () => {
    const session = await sessionPrete();
    const base = await baseDeLEspace();
    const miseAJour = miseAJourDUneAutreReplique(session, (espace) => {
      espace.creerPage("Jamais enregistrée");
    });
    await laisserIndexedDbTravailler();
    const avant = await enregistrements(base);

    session.fermer();
    Y.applyUpdate(docDe(session), miseAJour);
    await laisserIndexedDbTravailler();

    expect(await enregistrements(base)).toEqual(avant);
  });

  it("F-002-AC30 F-002-AC15 une action faite sur une session fermée est refusée par « facade-fermee » : message français sans code, document inchangé", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    const etat = session.lireEtat();
    act(() => session.fermer());
    const avant = [...Y.encodeStateAsUpdate(docDe(session))];

    await utilisateur.click(await boutonNouvellePage());

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toMatch(/fermé/);
    expect(alerte.textContent).not.toMatch(CODES);
    expect([...Y.encodeStateAsUpdate(docDe(session))]).toEqual(avant);
    let refus: unknown;
    try {
      if (etat.phase === "pret") {
        etat.operations.creerPage("Refusée");
      }
    } catch (erreur) {
      refus = erreur;
    }
    expect(refus).toBeInstanceOf(ErreurDocument);
    expect((refus as ErreurDocument).code).toBe("facade-fermee");
  });

  it("F-002-AC30 F-002-AC17 version non prise en charge reçue par Y.applyUpdate, application affichée : la session ferme sa façade depuis le rappel en cours de diffusion, rien ne lève, zéro écouteur, écran bloquant", async () => {
    const depart = ecouteurs(new Y.Doc());
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Avant la mise à jour");
    const consoleErreur = espionnerLaConsole();
    const doc = docDe(session);
    const phasesLues: string[] = [];
    session.abonner(() => void phasesLues.push(session.lireEtat().phase));
    const miseAJour = versionInconnueVenueDAilleurs(session);
    expect(ecouteurs(doc)).toBe(depart + 1);

    expect(() => act(() => Y.applyUpdate(doc, miseAJour))).not.toThrow();

    expect(ecouteurs(doc)).toBe(depart);
    expect(phasesLues).toEqual(["version-non-prise-en-charge"]);
    expect(screen.getByRole("alert").textContent).toContain("à jour");
    expect(screen.queryByRole("button", { name: "Nouvelle page" })).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(consoleErreur).not.toHaveBeenCalled();

    // La phase est définitive : une transaction suivante ne rouvre rien et ne prévient personne.
    act(() => ecrireLaVersion(doc, VERSION_PRISE_EN_CHARGE));
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(phasesLues).toHaveLength(1);
    expect(ecouteurs(doc)).toBe(depart);
    expect(() => session.fermer()).not.toThrow();
  });

  it("F-002-AC30 version non prise en charge reçue pendant qu'un abonné lève : la façade est fermée quand même, l'exception est signalée une fois", async () => {
    const session = await sessionPrete();
    const consoleErreur = espionnerLaConsole();
    const exception = new Error("abonné fautif à l'entrée dans la version non prise en charge");
    const suivant = vi.fn();
    session.abonner(() => {
      throw exception;
    });
    session.abonner(suivant);

    expect(() =>
      Y.applyUpdate(docDe(session), versionInconnueVenueDAilleurs(session)),
    ).not.toThrow();

    expect(ecouteurs(docDe(session))).toBe(0);
    expect(session.lireEtat().phase).toBe("version-non-prise-en-charge");
    expect(suivant).toHaveBeenCalledTimes(1);
    expect(exceptionsSignalees(consoleErreur)).toEqual([exception]);
  });

  it("F-002-AC30 session fermée pendant le chargement : la fin de la relecture n'ouvre aucune façade et ne prévient personne", async () => {
    const session = demarrerSession();
    const abonne = vi.fn();
    session.abonner(abonne);
    expect(session.lireEtat().phase).toBe("chargement");

    session.fermer();
    await laisserIndexedDbTravailler();

    expect(ecouteurs(docDe(session))).toBe(0);
    expect(session.lireEtat().phase).toBe("chargement");
    expect(abonne).not.toHaveBeenCalled();
  });

  it("F-002-AC30 F-002-AC26 hors contexte sécurisé, la session n'a rien ouvert : fermer() est sans effet", async () => {
    vi.stubGlobal("crypto", {});
    const session = demarrerSession();

    expect(() => session.fermer()).not.toThrow();
    expect(() => session.fermer()).not.toThrow();

    expect(session.lireEtat().phase).toBe("contexte-non-securise");
    expect(session.doc).toBeUndefined();
    expect(await nomsDesBases()).toEqual([]);
  });
});
