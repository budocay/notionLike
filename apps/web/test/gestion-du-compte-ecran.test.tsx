// Écran du compte, `#/compte` (F-027-AC21, AC22, AC24, AC26) et ce qu'un changement de nom ne
// touche pas dans `apps/web` (F-027-AC3).
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { dateFrancaise } from "../src/interface/messages-espaces.ts";
import { lire } from "./aides-disque.ts";
import {
  COMPTE,
  etatAnnonce,
  moi200,
  moi401,
  MOT_DE_PASSE,
  ROUTES,
  serveurSimule,
  zoneDeCompte,
} from "./aides-compte.tsx";
import {
  aller,
  corpsDe,
  descriptionDe,
  estDesactive,
  ouvrirA,
  titrePrincipal,
  toutLeStockage,
} from "./aides-espaces.tsx";
import {
  AUTRE_SESSION,
  autres200,
  champ,
  compte200,
  G,
  lignesDesSessions,
  partie,
  requetesDuCompte,
  serveurDuCompte,
  SESSION_COURANTE,
  sessions200,
  tableauDesSessions,
  vide204,
} from "./aides-gestion-du-compte.tsx";

function principale(): HTMLElement {
  return screen.getByRole("main");
}

function annonceDeLEcran(): HTMLElement {
  const annonce = within(principale()).getAllByRole("status")[0];
  if (annonce === undefined) {
    throw new Error("annonce introuvable");
  }
  return annonce;
}

function cellules(ligne: HTMLElement): string[] {
  return within(ligne)
    .getAllByRole("cell")
    .map((cellule) => cellule.textContent);
}

describe("accès à l'écran du compte (F-027-AC21)", () => {
  it("F-027-AC21 connecté : « Mon compte » dans la zone de compte mène à #/compte, avec ses trois parties", async () => {
    const serveur = serveurDuCompte();
    const { utilisateur } = await ouvrirA(serveur, "#/");
    await waitFor(() => expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`));

    const lien = within(zoneDeCompte()).getByRole("link", { name: "Mon compte" });
    expect(lien.getAttribute("href")).toBe("#/compte");
    await utilisateur.click(lien);

    expect((await titrePrincipal()).textContent).toBe("Mon compte");
    expect(window.location.hash).toBe("#/compte");
    for (const nom of ["Nom", "Mot de passe", "Sessions"]) {
      expect(partie(nom)).toBeTruthy();
    }
    await tableauDesSessions();
  });

  it("F-027-AC21 déconnecté : ni « Mon compte » ni formulaire ; « Connectez-vous » et un lien vers la connexion, sans requête vers les routes du compte", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi401() });
    await ouvrirA(serveur, "#/compte");

    expect(within(zoneDeCompte()).queryByRole("link", { name: "Mon compte" })).toBeNull();
    expect((await titrePrincipal()).textContent).toBe("Mon compte");
    expect(principale().textContent).toContain("Connectez-vous pour gérer votre compte.");
    const lien = within(principale()).getByRole("link", { name: "Se connecter" });
    expect(lien.getAttribute("href")).toBe("#/connexion");
    expect(principale().querySelectorAll("input, form")).toHaveLength(0);
    expect(requetesDuCompte(serveur)).toEqual([]);
  });

  it("F-027-AC21 inconnu : le texte et l'action « Réessayer » de F-010-AC2, qui rejoue moi seulement", async () => {
    const serveur = serveurSimule();
    const { utilisateur } = await ouvrirA(serveur, "#/compte");

    expect(principale().textContent).toContain("Compte indisponible hors connexion");
    expect(principale().querySelectorAll("input, form")).toHaveLength(0);
    const avant = serveur.routesAppelees().filter((route) => route === ROUTES.moi).length;
    await utilisateur.click(within(principale()).getByRole("button", { name: "Réessayer" }));
    await waitFor(() =>
      expect(serveur.routesAppelees().filter((route) => route === ROUTES.moi).length).toBe(
        avant + 1,
      ),
    );
    expect(requetesDuCompte(serveur)).toEqual([]);
  });

  it("F-027-AC21 F-027-AC27 #/compte n'accepte aucun paramètre : une variante n'ouvre pas l'écran, n'est pas une page et n'appelle rien", async () => {
    const serveur = serveurDuCompte();
    await ouvrirA(serveur, "#/");
    for (const fragment of ["#/compte/", "#/compte?onglet=sessions", "#/Compte"]) {
      aller(fragment);
      await act(() => Promise.resolve());
      expect(screen.queryByRole("heading", { name: "Mon compte" }), fragment).toBeNull();
      expect(principale().textContent, fragment).not.toContain("Page introuvable");
    }
    expect(requetesDuCompte(serveur)).toEqual([]);
  });
});

describe("sessions affichées (F-027-AC22)", () => {
  it("F-027-AC22 F-027-AC26 un tableau : dates en français, adresse IP, navigateur, « Cet appareil » sans révocation ; les autres avec « Fermer cette session » nommée par sa date", async () => {
    await ouvrirA(serveurDuCompte(), "#/compte");
    const tableau = await tableauDesSessions();

    expect(
      within(tableau)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Ouverte le", "Dernière activité", "Adresse IP", "Navigateur", "Session"]);
    const [courante, autre] = lignesDesSessions(tableau);
    expect(cellules(courante as HTMLElement)).toEqual([
      dateFrancaise(SESSION_COURANTE.creeLe),
      dateFrancaise(SESSION_COURANTE.prolongeeLe),
      "203.0.113.7",
      SESSION_COURANTE.agentUtilisateur,
      "Cet appareil",
    ]);
    expect(dateFrancaise(SESSION_COURANTE.creeLe)).toMatch(/octobre 2026/);
    expect(within(courante as HTMLElement).queryAllByRole("button")).toEqual([]);
    const fermer = within(autre as HTMLElement).getByRole("button", {
      name: `Fermer cette session ouverte le ${dateFrancaise(AUTRE_SESSION.creeLe)}`,
    });
    expect(fermer.textContent).toBe("Fermer cette session");
    expect(cellules(autre as HTMLElement).slice(0, 4)).toEqual([
      dateFrancaise(AUTRE_SESSION.creeLe),
      dateFrancaise(AUTRE_SESSION.prolongeeLe),
      "198.51.100.23",
      AUTRE_SESSION.agentUtilisateur,
    ]);
  });

  it("F-027-AC22 l'écran dit ce qui est enregistré et ce que fait une fermeture ; adresse et navigateur ne partent nulle part et ne sont pas gardés", async () => {
    const serveur = serveurDuCompte();
    await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();

    const texte = partie("Sessions").textContent;
    expect(texte).toContain(
      "L'adresse IP et le navigateur de chaque session sont enregistrés par le serveur jusqu'à la fermeture ou l'expiration de la session.",
    );
    expect(texte).toContain(
      "Fermer une session coupe l'accès de cet appareil au serveur ; les pages qu'il a déjà enregistrées y restent.",
    );
    expect(serveur.requetes.every((r) => r.adresse.origin === window.location.origin)).toBe(true);
    expect(
      serveur.routesAppelees().every((route) => route === ROUTES.moi || route === G.sessions),
    ).toBe(true);
    const stockage = await toutLeStockage();
    for (const valeur of ["203.0.113.7", "198.51.100.23", "Firefox", "iPhone"]) {
      expect(stockage).not.toContain(valeur);
    }
  });

  it("F-027-AC22 une adresse ou un navigateur non enregistré est dit tel quel ; aucune autre session : « Fermer toutes les autres sessions » désactivé avec sa raison", async () => {
    const seule = { ...SESSION_COURANTE, adresseIp: null, agentUtilisateur: null };
    await ouvrirA(serveurDuCompte([seule]), "#/compte");
    const [ligne] = lignesDesSessions(await tableauDesSessions());

    expect(cellules(ligne as HTMLElement).slice(2)).toEqual([
      "Non enregistré",
      "Non enregistré",
      "Cet appareil",
    ]);
    const toutes = screen.getByRole("button", { name: "Fermer toutes les autres sessions" });
    expect(estDesactive(toutes)).toBe(true);
    expect(descriptionDe(toutes)).toBe("Aucune autre session n'est ouverte.");
  });
});

describe("succès des actions (F-027-AC24)", () => {
  it("F-027-AC24 F-027-AC26 un nom envoyé par Entrée : PATCH du seul nom, revérification de l'état du compte, zone à jour sans rechargement, « Nom modifié. »", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.nom, () => compte200("Alice M."));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const nom = champ(/Nom affiché/);
    expect(nom.value).toBe(COMPTE.nom);
    const moiAvant = serveur.routesAppelees().filter((r) => r === ROUTES.moi).length;

    serveur.poser(ROUTES.moi, () => moi200({ ...COMPTE, nom: "Alice M." }));
    await utilisateur.clear(nom);
    await utilisateur.type(nom, "Alice M.{Enter}");

    await waitFor(() => expect(etatAnnonce()).toBe("Connecté : Alice M."));
    expect(annonceDeLEcran().textContent).toBe("Nom modifié.");
    expect(corpsDe(serveur, G.nom)).toEqual([{ nom: "Alice M." }]);
    expect(serveur.routesAppelees().filter((r) => r === ROUTES.moi).length).toBe(moiAvant + 1);
    // F-016 n'est pas livrée : la phrase sur les commentaires n'est pas affichée (F-027 H5).
    expect(document.body.textContent).not.toContain("Les commentaires que vous avez déjà écrits");
  });

  it("F-027-AC24 un mot de passe changé : annonce, compte toujours connecté, liste des sessions relue", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.motDePasse, () => vide204());
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();
    const lectures = (): number => serveur.routesAppelees().filter((r) => r === G.sessions).length;
    const avant = lectures();
    serveur.poser(G.sessions, () => sessions200([SESSION_COURANTE]));

    await utilisateur.type(champ(/^Mot de passe actuel/), MOT_DE_PASSE);
    await utilisateur.type(champ(/Nouveau mot de passe/), "un nouveau mot de passe solide");
    await utilisateur.click(screen.getByRole("button", { name: "Changer le mot de passe" }));

    await waitFor(() =>
      expect(annonceDeLEcran().textContent).toBe(
        "Mot de passe modifié. Vos autres sessions ont été fermées.",
      ),
    );
    await waitFor(() => expect(lignesDesSessions(screen.getByRole("table"))).toHaveLength(1));
    expect(lectures()).toBeGreaterThan(avant);
    expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`);
  });

  it("F-027-AC24 F-027-AC26 une session fermée : mot de passe demandé dans une boîte, session retirée de la liste, annonce, focus rendu au tableau", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.revocation(), () => vide204());
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    const tableau = await tableauDesSessions();

    await utilisateur.click(within(tableau).getByRole("button", { name: /^Fermer cette session/ }));
    const boite = screen.getByRole("dialog");
    expect(within(boite).getByRole("heading").textContent).toBe(
      `Fermer la session ouverte le ${dateFrancaise(AUTRE_SESSION.creeLe)}`,
    );
    await utilisateur.type(within(boite).getByLabelText(/Mot de passe actuel/), MOT_DE_PASSE);
    await utilisateur.click(within(boite).getByRole("button", { name: "Fermer la session" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lignesDesSessions(tableau)).toHaveLength(1);
    expect(annonceDeLEcran().textContent).toBe("Session fermée.");
    expect(corpsDe(serveur, G.revocation())).toEqual([{ motDePasseActuel: MOT_DE_PASSE }]);
    await waitFor(() => expect(document.activeElement).toBe(tableau));
  });

  it("F-027-AC24 toutes les autres sessions fermées : le nombre annoncé, la liste relue", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.autres, () => autres200(1));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();
    serveur.poser(G.sessions, () => sessions200([SESSION_COURANTE]));

    await utilisateur.click(
      screen.getByRole("button", { name: "Fermer toutes les autres sessions" }),
    );
    const boite = screen.getByRole("dialog");
    await utilisateur.type(within(boite).getByLabelText(/Mot de passe actuel/), MOT_DE_PASSE);
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(annonceDeLEcran().textContent).toBe("1 session fermée."));
    await waitFor(() => expect(lignesDesSessions(screen.getByRole("table"))).toHaveLength(1));
    expect(corpsDe(serveur, G.autres)).toEqual([{ motDePasseActuel: MOT_DE_PASSE }]);
  });
});

describe("clavier et technologies d'assistance (F-027-AC26)", () => {
  it("F-027-AC26 ordre de tabulation, étiquettes reliées, attente signalée et bouton désactivé pendant la requête, une seule requête", async () => {
    const serveur = serveurDuCompte();
    let repondre: (reponse: Response) => void = () => undefined;
    serveur.poser(G.nom, () => new Promise<Response>((resoudre) => (repondre = resoudre)));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();

    const nom = champ(/Nom affiché/);
    const enregistrer = screen.getByRole("button", { name: "Enregistrer le nom" });
    nom.focus();
    await utilisateur.tab();
    expect(document.activeElement).toBe(enregistrer);
    await utilisateur.tab();
    expect(document.activeElement).toBe(champ(/^Mot de passe actuel/));
    await utilisateur.tab();
    expect(document.activeElement).toBe(champ(/Nouveau mot de passe/));
    await utilisateur.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Changer le mot de passe" }),
    );

    await utilisateur.click(enregistrer);
    await waitFor(() => expect(estDesactive(enregistrer)).toBe(true));
    expect(descriptionDe(enregistrer)).toBe("Requête en cours.");
    await utilisateur.type(nom, "{Enter}");
    expect(serveur.routesAppelees().filter((r) => r === G.nom)).toHaveLength(1);
    await act(async () => repondre(compte200(COMPTE.nom)));
    await waitFor(() => expect(estDesactive(enregistrer)).toBe(false));
  });

  it("F-027-AC26 la boîte de fermeture s'ouvre au clavier, focus sur le mot de passe, reste de la page inerte, Tab y boucle, Échap la ferme et rend le focus", async () => {
    const { utilisateur } = await ouvrirA(serveurDuCompte(), "#/compte");
    const tableau = await tableauDesSessions();
    const fermer = within(tableau).getByRole("button", { name: /^Fermer cette session/ });

    fermer.focus();
    await utilisateur.keyboard("{Enter}");
    const boite = screen.getByRole("dialog");
    const motDePasse = within(boite).getByLabelText(/Mot de passe actuel/);
    await waitFor(() => expect(document.activeElement).toBe(motDePasse));
    expect(motDePasse.getAttribute("type")).toBe("password");
    expect(motDePasse.getAttribute("autocomplete")).toBe("current-password");
    expect(fermer.closest("[inert]")).not.toBeNull();
    expect(boite.closest("[inert]")).toBeNull();

    await utilisateur.tab();
    expect(document.activeElement).toBe(
      within(boite).getByRole("button", { name: "Fermer la session" }),
    );
    await utilisateur.tab();
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    await utilisateur.tab();
    expect(document.activeElement).toBe(motDePasse);

    await utilisateur.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(fermer));
    expect(fermer.closest("[inert]")).toBeNull();
  });
});

describe("ce qu'un changement de nom ne touche pas (F-027-AC3)", () => {
  it("F-027-AC3 un changement de nom réussi n'ouvre aucune transaction Yjs dans apps/web ; une page créée ensuite en ouvre, ce qui prouve la mesure", async () => {
    const serveur = serveurDuCompte();
    serveur.poser(G.nom, () => compte200("Alice M."));
    const { utilisateur } = await ouvrirA(serveur, "#/compte");
    await tableauDesSessions();
    const emis = vi.spyOn(Y.Doc.prototype, "emit");
    const transactions = (): number =>
      emis.mock.calls.filter(([nom]) => nom === "beforeTransaction").length;

    serveur.poser(ROUTES.moi, () => moi200({ ...COMPTE, nom: "Alice M." }));
    await utilisateur.clear(champ(/Nom affiché/));
    await utilisateur.type(champ(/Nom affiché/), "Alice M.{Enter}");
    await waitFor(() => expect(etatAnnonce()).toBe("Connecté : Alice M."));
    await waitFor(() => expect(annonceDeLEcran().textContent).toBe("Nom modifié."));
    expect(transactions()).toBe(0);

    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));
    await waitFor(() => expect(transactions()).toBeGreaterThan(0));
    emis.mockRestore();
  });

  it("F-027-AC3 les modules de l'écran du compte n'importent ni le document, ni yjs, ni la session d'espace ou de page", () => {
    const fichiers = [
      "src/compte/client-gestion-du-compte.ts",
      "src/interface/EcranDuCompte.tsx",
      "src/interface/MotDePasseDuCompte.tsx",
      "src/interface/SessionsDuCompte.tsx",
      "src/interface/RevocationDeSession.tsx",
      "src/interface/outils-gestion-du-compte.ts",
      "src/interface/messages-gestion-du-compte.ts",
    ];
    const interdits =
      /from\s+["'](?:yjs|@notionlike\/document|[^"']*\/(?:espace|page|persistance|edition)\/[^"']*)["']|\boperations\b/;
    expect(fichiers.filter((chemin) => interdits.test(lire(chemin)))).toEqual([]);
    expect(interdits.test('import * as Y from "yjs";')).toBe(true);
    expect(interdits.test('import { x } from "../espace/session-espace.ts";')).toBe(true);
  });
});
