// Écran du compte : mots de passe (F-027-AC23) et échecs (F-027-AC25). Le mot de passe actuel part
// dans le corps de sa seule requête et disparaît de l'état de l'application ensuite ; un échec est
// dit en français, par la table des codes, et toute valeur du serveur est rendue comme du texte.
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMPTE,
  enveloppe,
  ID_REQUETE,
  moi200,
  moi401,
  MOT_DE_PASSE,
  pageHtml,
  ROUTES,
} from "./aides-compte.tsx";
import { corpsDe, descriptionDe, estDesactive, ouvrirA, toutLeStockage } from "./aides-espaces.tsx";
import {
  AUTRE_SESSION,
  champ,
  G,
  lignesDesSessions,
  NOUVEAU_MOT_DE_PASSE,
  requetesDuCompte,
  serveurDuCompte,
  SESSION_COURANTE,
  sessions200,
  tableauDesSessions,
} from "./aides-gestion-du-compte.tsx";

const SORTIES = ["log", "info", "warn", "error", "debug"] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

function espionnerLaConsole(): () => string {
  const espions = SORTIES.map((sortie) => vi.spyOn(console, sortie));
  return () => espions.flatMap((espion) => espion.mock.calls.flat().map(String)).join("\n");
}

function alertes(): string {
  return screen
    .queryAllByRole("alert")
    .map((alerte) => alerte.textContent)
    .join("\n");
}

function principale(): HTMLElement {
  return screen.getByRole("main");
}

/** Aucun mot de passe dans l'adresse, le titre, la console, un message ni le stockage. */
async function aucuneTrace(console: () => string, ...motsDePasse: string[]): Promise<void> {
  const stockage = await toutLeStockage();
  for (const motDePasse of motsDePasse) {
    expect(window.location.href).not.toContain(encodeURIComponent(motDePasse));
    expect(window.location.href).not.toContain(motDePasse);
    expect(document.title).not.toContain(motDePasse);
    expect(console()).not.toContain(motDePasse);
    expect(alertes()).not.toContain(motDePasse);
    expect(stockage).not.toContain(motDePasse);
  }
}

describe("mots de passe (F-027-AC23)", () => {
  it("F-027-AC23 champs déclarés pour les gestionnaires ; le mot de passe actuel part dans le corps de sa requête, puis les deux sont effacés après un succès, sans trace", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.motDePasse, () => new Response(null, { status: 204 }));
    const console = espionnerLaConsole();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const actuel = champ(/^Mot de passe actuel/);
    const nouveau = champ(/Nouveau mot de passe/);

    expect([actuel.type, actuel.autocomplete]).toEqual(["password", "current-password"]);
    expect([nouveau.type, nouveau.autocomplete]).toEqual(["password", "new-password"]);
    await utilisateur.type(actuel, MOT_DE_PASSE);
    await utilisateur.type(nouveau, NOUVEAU_MOT_DE_PASSE);
    await utilisateur.click(screen.getByRole("button", { name: "Changer le mot de passe" }));

    await waitFor(() => expect(actuel.value).toBe(""));
    expect(nouveau.value).toBe("");
    expect(corpsDe(serveur, G.motDePasse)).toEqual([
      { motDePasseActuel: MOT_DE_PASSE, nouveauMotDePasse: NOUVEAU_MOT_DE_PASSE },
    ]);
    await aucuneTrace(console, MOT_DE_PASSE, NOUVEAU_MOT_DE_PASSE);
  });

  it("F-027-AC23 F-027-AC25 mot de passe actuel refusé : « Mot de passe actuel incorrect. », l'actuel effacé, le nouveau gardé, sans trace", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.motDePasse, () => enveloppe(403, "mot-de-passe-incorrect"));
    const console = espionnerLaConsole();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");

    await utilisateur.type(champ(/^Mot de passe actuel/), MOT_DE_PASSE);
    await utilisateur.type(champ(/Nouveau mot de passe/), NOUVEAU_MOT_DE_PASSE);
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(alertes()).toContain("Mot de passe actuel incorrect."));
    expect(champ(/^Mot de passe actuel/).value).toBe("");
    expect(champ(/Nouveau mot de passe/).value).toBe(NOUVEAU_MOT_DE_PASSE);
    expect(alertes()).not.toContain("mot-de-passe-incorrect");
    expect(alertes()).not.toContain("message anglais");
    expect(principale().textContent).not.toContain("Mot de passe modifié");
    await aucuneTrace(console, MOT_DE_PASSE);
  });

  it("F-027-AC23 F-027-AC26 un nouveau mot de passe hors des bornes ou un actuel vide : aucune requête, la règle sous le champ, reliée, focus sur le premier champ fautif", async () => {
    const serveur = serveurDuCompte();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const actuel = champ(/^Mot de passe actuel/);
    const nouveau = champ(/Nouveau mot de passe/);
    const envoyer = screen.getByRole("button", { name: "Changer le mot de passe" });

    await utilisateur.type(nouveau, "onze carac.");
    await utilisateur.click(envoyer);
    expect(descriptionDe(actuel)).toBe("Le mot de passe actuel est obligatoire.");
    expect(descriptionDe(nouveau)).toBe("Le nouveau mot de passe compte au moins 12 caractères.");
    expect(nouveau.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(actuel);

    await utilisateur.type(actuel, MOT_DE_PASSE);
    await utilisateur.clear(nouveau);
    await utilisateur.click(nouveau);
    await utilisateur.paste("x".repeat(129));
    await utilisateur.click(envoyer);
    expect(descriptionDe(nouveau)).toBe("Le nouveau mot de passe compte au plus 128 caractères.");
    expect(actuel.getAttribute("aria-invalid")).toBe("false");
    expect(document.activeElement).toBe(nouveau);
    expect(requetesDuCompte(serveur).filter((route) => route !== G.sessions)).toEqual([]);
  });

  it("F-027-AC23 révocation : mot de passe actuel dans le corps de sa seule requête, effacé après l'échec, sans trace", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.revocation(), () => enveloppe(403, "mot-de-passe-incorrect"));
    const console = espionnerLaConsole();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const tableau = await tableauDesSessions();

    await utilisateur.click(within(tableau).getByRole("button", { name: /^Fermer cette session/ }));
    const boite = screen.getByRole("dialog");
    const motDePasse = within(boite).getByLabelText(/Mot de passe actuel/);
    await utilisateur.type(motDePasse, MOT_DE_PASSE);
    await utilisateur.keyboard("{Enter}");

    await waitFor(() =>
      expect(within(boite).getByRole("alert").textContent).toBe("Mot de passe actuel incorrect."),
    );
    expect((motDePasse as HTMLInputElement).value).toBe("");
    expect(corpsDe(serveur, G.revocation())).toEqual([{ motDePasseActuel: MOT_DE_PASSE }]);
    expect(lignesDesSessions(tableau)).toHaveLength(2);
    await utilisateur.click(within(boite).getByRole("button", { name: "Fermer la session" }));
    expect(
      within(boite)
        .getByLabelText(/Mot de passe actuel/)
        .getAttribute("aria-describedby"),
    ).not.toBeNull();
    expect(corpsDe(serveur, G.revocation())).toHaveLength(1);
    await aucuneTrace(console, MOT_DE_PASSE);
  });
});

describe("échecs (F-027-AC25)", () => {
  it("F-027-AC25 un 401 demande une revérification et ramène l'écran à « Connectez-vous », sans autre requête du compte", async () => {
    const serveur = serveurDuCompte();
    await ouvrirA(serveur, "#/");
    await waitFor(() => expect(serveur.routesAppelees()).toContain(ROUTES.moi));
    serveur.poser(G.sessions, () => enveloppe(401, "non-authentifie"));
    serveur.poser(ROUTES.moi, () => moi401());
    const moiAvant = serveur.routesAppelees().filter((r) => r === ROUTES.moi).length;

    window.location.hash = "#/compte";
    await act(async () => window.dispatchEvent(new HashChangeEvent("hashchange")));

    await waitFor(() =>
      expect(principale().textContent).toContain("Connectez-vous pour gérer votre compte."),
    );
    expect(serveur.routesAppelees().filter((r) => r === ROUTES.moi).length).toBeGreaterThan(
      moiAvant,
    );
    expect(principale().querySelectorAll("input")).toHaveLength(0);
  });

  it("F-027-AC25 session-courante : « Pour fermer la session de cet appareil, déconnectez-vous. », rien n'est retiré", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.revocation(), () => enveloppe(409, "session-courante"));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const tableau = await tableauDesSessions();

    await utilisateur.click(within(tableau).getByRole("button", { name: /^Fermer cette session/ }));
    await utilisateur.type(
      within(screen.getByRole("dialog")).getByLabelText(/Mot de passe/),
      MOT_DE_PASSE,
    );
    await utilisateur.keyboard("{Enter}");

    await waitFor(() =>
      expect(alertes()).toContain("Pour fermer la session de cet appareil, déconnectez-vous."),
    );
    expect(lignesDesSessions(tableau)).toHaveLength(2);
  });

  it("F-027-AC25 un 404 d'une révocation relit la liste et dit que la session était déjà fermée", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.revocation(), () => enveloppe(404, "ressource-introuvable"));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const tableau = await tableauDesSessions();
    serveur.poser(G.sessions, () => sessions200([SESSION_COURANTE]));

    await utilisateur.click(within(tableau).getByRole("button", { name: /^Fermer cette session/ }));
    await utilisateur.type(
      within(screen.getByRole("dialog")).getByLabelText(/Mot de passe/),
      MOT_DE_PASSE,
    );
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(principale().textContent).toContain("Cette session était déjà fermée.");
    await waitFor(() => expect(lignesDesSessions(screen.getByRole("table"))).toHaveLength(1));
  });

  it("F-027-AC25 un 429 : « Trop de tentatives » avec le délai de Retry-After, envois désactivés avec leur raison pendant ce délai, puis rendus", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.nom, () => enveloppe(429, "trop-de-requetes", { "Retry-After": "1" }));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();
    const enregistrer = screen.getByRole("button", { name: "Enregistrer le nom" });
    const changer = screen.getByRole("button", { name: "Changer le mot de passe" });

    await utilisateur.click(enregistrer);

    await waitFor(() =>
      expect(alertes()).toContain("Trop de tentatives. Réessayez dans 1 secondes."),
    );
    expect(estDesactive(enregistrer)).toBe(true);
    expect(estDesactive(changer)).toBe(true);
    expect(descriptionDe(changer)).toBe("Envoi suspendu après trop de tentatives.");
    await waitFor(() => expect(estDesactive(enregistrer)).toBe(false), { timeout: 3000 });
    expect(estDesactive(changer)).toBe(false);
  });

  it("F-027-AC25 un échec réseau : « Serveur injoignable », formulaire utilisable ; une réponse illisible : message générique", async () => {
    const serveur = serveurDuCompte();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();
    const enregistrer = screen.getByRole("button", { name: "Enregistrer le nom" });

    await utilisateur.click(enregistrer);
    await waitFor(() =>
      expect(alertes()).toContain(
        "Serveur injoignable. Vos pages restent disponibles sur cet appareil.",
      ),
    );
    expect(estDesactive(enregistrer)).toBe(false);

    serveur.poser(G.nom, () => pageHtml());
    await utilisateur.click(enregistrer);
    await waitFor(() => expect(alertes()).toContain("L'opération a échoué. Réessayez."));
    expect(estDesactive(enregistrer)).toBe(false);
  });

  it("F-027-AC25 une erreur interne : le message de la table et l'identifiant de requête, rendu comme du texte", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.nom, () => enveloppe(500, "erreur-interne"));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");

    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer le nom" }));

    await waitFor(() =>
      expect(alertes()).toContain("Une erreur est survenue sur le serveur. Réessayez."),
    );
    expect(alertes()).toContain(`Identifiant à communiquer au support : ${ID_REQUETE}`);
  });

  it("F-027-AC25 nom, adresse IP et navigateur portant une balise de script sont affichés comme du texte, sans rien exécuter", async () => {
    const hostile = '<script>window.__f027 = "nom"</script><img src=x onerror="window.__f027=1">';
    const navigateur = '<script>window.__f027 = "ua"</script>Mozilla/5.0';
    const serveur = serveurDuCompte([
      { ...SESSION_COURANTE, agentUtilisateur: navigateur },
      { ...AUTRE_SESSION, adresseIp: "<b>10.0.0.1</b>" },
    ]);
    serveur.poser(ROUTES.moi, () => moi200({ ...COMPTE, nom: hostile }));
    await ouvrirA(serveur, "#/compte");
    const [courante, autre] = lignesDesSessions(await tableauDesSessions());

    expect(champ(/Nom affiché/).value).toBe(hostile);
    expect(within(courante as HTMLElement).getByText(navigateur).textContent).toBe(navigateur);
    expect(within(autre as HTMLElement).getByText("<b>10.0.0.1</b>")).toBeTruthy();
    expect(principale().querySelectorAll("script, img, b")).toHaveLength(0);
    expect((window as unknown as { __f027?: unknown }).__f027).toBeUndefined();
  });
});
