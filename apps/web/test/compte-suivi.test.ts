// État du compte (F-010-AC28) : `GET /api/v1/moi` seul juge (F-010-AC4), inconnu à toute réponse
// inexploitable (F-010-AC2), revérifié au retour de l'onglet et du réseau (F-010-AC5).
import { CHEMINS_COMPTES } from "@notionlike/contrats";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DELAI_DE_REPONSE_MS, demanderMoi } from "../src/compte/moi.ts";
import { suivreLeCompte } from "../src/compte/suivi-du-compte.ts";
import {
  COMPTE,
  enveloppe,
  jamais,
  json,
  moi200,
  moi401,
  pageHtml,
  ROUTES,
  serveurSimule,
} from "./aides-compte.tsx";

const INDISPONIBLE = { statut: "inconnu", verification: false };
const CONNECTE = { statut: "connecte", id: COMPTE.id, nom: COMPTE.nom };

function rendreVisible(etat: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => etat });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("lecture de moi", () => {
  it("F-010-AC28 un 200 conforme au schéma strict : connecté, avec l'identifiant et le nom seulement", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });

    const etat = await demanderMoi(serveur.requeter);

    expect(etat).toEqual(CONNECTE);
    expect(JSON.stringify(etat)).not.toContain(COMPTE.courriel);
    expect(serveur.requetes.map(({ adresse }) => adresse.href)).toEqual([
      `${window.location.origin}${CHEMINS_COMPTES.moi}`,
    ]);
  });

  it("F-010-AC28 un 401 portant l'enveloppe : déconnecté", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });

    expect(await demanderMoi(serveur.requeter)).toEqual({ statut: "deconnecte" });
  });

  it.each([
    ["un échec réseau", undefined],
    ["un 500 d'enveloppe", () => enveloppe(500, "erreur-interne")],
    ["un 503 d'enveloppe", () => enveloppe(503, "base-indisponible")],
    ["une page d'erreur du proxy en HTML", () => pageHtml(502)],
    ["un 200 en HTML", () => pageHtml(200)],
    ["un 200 avec un champ de plus", () => json(200, { ...COMPTE, role: "admin" })],
    ["un 200 sans nom", () => json(200, { id: COMPTE.id, courriel: COMPTE.courriel })],
    ["un 401 sans enveloppe", () => json(401, { message: "Unauthorized" })],
    ["un 401 en HTML", () => pageHtml(401)],
    ["un 403", () => enveloppe(403, "origine-refusee")],
  ])("F-010-AC2 %s : état inconnu, sans exception", async (_cas, reponse) => {
    const serveur = serveurSimule(reponse === undefined ? {} : { [ROUTES.moi]: reponse });

    expect(await demanderMoi(serveur.requeter)).toEqual(INDISPONIBLE);
  });

  it("F-010-AC2 sans réponse en 10 secondes : état inconnu", async () => {
    vi.useFakeTimers();
    const serveur = serveurSimule({ [ROUTES.moi]: jamais });
    let etat: unknown;
    void demanderMoi(serveur.requeter).then((lu) => (etat = lu));

    await vi.advanceTimersByTimeAsync(DELAI_DE_REPONSE_MS - 1);
    expect(etat).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(etat).toEqual(INDISPONIBLE);
  });
});

describe("suivi du compte", () => {
  it("F-010-AC28 l'état commence inconnu, en vérification, puis suit la réponse de moi", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    const suivi = suivreLeCompte(serveur.requeter);

    expect(suivi.lire()).toEqual({ statut: "inconnu", verification: true });
    await vi.waitFor(() => expect(suivi.lire()).toEqual(CONNECTE));
    suivi.fermer();
  });

  it("F-010-AC28 des demandes simultanées n'émettent qu'une requête et rendent toutes le même état", async () => {
    let repondre: (reponse: Response) => void = () => undefined;
    const serveur = serveurSimule({
      [ROUTES.moi]: () => new Promise<Response>((resoudre) => (repondre = resoudre)),
    });
    const suivi = suivreLeCompte(serveur.requeter);

    const demandes = [suivi.reverifier(), suivi.reverifier(), suivi.reverifier()];
    repondre(moi200());
    const etats = await Promise.all(demandes);

    expect(serveur.routesAppelees()).toEqual([ROUTES.moi]);
    expect(etats).toEqual([CONNECTE, CONNECTE, CONNECTE]);
    expect(etats[0]).toBe(etats[1]);
    suivi.fermer();
  });

  it("F-010-AC28 un abonné est prévenu du passage de connecté à déconnecté provoqué par une demande de revérification", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    const suivi = suivreLeCompte(serveur.requeter);
    await vi.waitFor(() => expect(suivi.lire().statut).toBe("connecte"));
    const vus: string[] = [];
    suivi.abonner(() => vus.push(suivi.lire().statut));

    serveur.poser(ROUTES.moi, moi401);
    expect(await suivi.reverifier()).toEqual({ statut: "deconnecte" });

    expect(vus).toEqual(["deconnecte"]);
    suivi.fermer();
  });

  it("F-010-AC5 l'onglet redevenu visible revérifie : un 401 après connecté passe à déconnecté, sans changer d'adresse", async () => {
    window.location.hash = "#/page/3f0b6a52-6f1e-4f6e-9a57-2b8f0d6e4c11";
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    const suivi = suivreLeCompte(serveur.requeter);
    await vi.waitFor(() => expect(suivi.lire().statut).toBe("connecte"));
    serveur.poser(ROUTES.moi, moi401);

    rendreVisible("hidden");
    expect(serveur.requetes).toHaveLength(1);
    rendreVisible("visible");

    await vi.waitFor(() => expect(suivi.lire()).toEqual({ statut: "deconnecte" }));
    expect(serveur.requetes).toHaveLength(2);
    expect(window.location.hash).toBe("#/page/3f0b6a52-6f1e-4f6e-9a57-2b8f0d6e4c11");
    suivi.fermer();
  });

  it("F-010-AC5 le retour du réseau revérifie l'état du compte", async () => {
    const serveur = serveurSimule();
    const suivi = suivreLeCompte(serveur.requeter);
    await vi.waitFor(() => expect(suivi.lire()).toEqual(INDISPONIBLE));
    serveur.poser(ROUTES.moi, () => moi200());

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(suivi.lire()).toEqual(CONNECTE));
    suivi.fermer();
  });

  it("F-010-AC28 fermé, le suivi n'écoute plus l'onglet et ne prévient plus personne", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    const suivi = suivreLeCompte(serveur.requeter);
    const rappel = vi.fn();
    suivi.abonner(rappel);
    await vi.waitFor(() => expect(rappel).toHaveBeenCalledTimes(1));

    suivi.fermer();
    window.dispatchEvent(new Event("online"));
    rendreVisible("visible");

    expect(serveur.requetes).toHaveLength(1);
    expect(rappel).toHaveBeenCalledTimes(1);
  });
});
