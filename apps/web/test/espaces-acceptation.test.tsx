// Acceptation d'une invitation (F-014-AC21 à AC25) et destination de retour après un écran de compte
// (F-014-AC41), avec la couture des formes d'adresse (F-014-AC38).
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { fragmentDe, lireEcranDEspaces, lireRoute } from "../src/navigation/route.ts";
import {
  compteNatif,
  COMPTE,
  enveloppe,
  moi200,
  moi401,
  MOT_DE_PASSE,
  rendreAvecCompte,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
} from "./aides-compte.tsx";
import { boutonNouvellePage } from "./aides-coquille.tsx";
import { lire, lister } from "./aides-disque.ts";
import {
  corpsDe,
  espace,
  espace200,
  estDesactive,
  ID_ESPACE,
  JETON_INVITATION,
  R,
  titrePrincipal,
  toutLeStockage,
} from "./aides-espaces.tsx";

const LIEN = `#/invitation/${JETON_INVITATION}`;

/** Serveur où le compte se connecte : `moi` répond 401 jusqu'à la connexion ou l'inscription. */
function serveurDeLInvite(connecte: boolean): ServeurSimule {
  let session = connecte;
  const serveur = serveurSimule({
    [ROUTES.moi]: () => (session ? moi200() : moi401()),
    [R.accepter]: () => espace200(espace("lecteur")),
  });
  const ouvrir = () => {
    session = true;
    return compteNatif();
  };
  serveur.poser(ROUTES.connexion, ouvrir);
  serveur.poser(ROUTES.inscription, ouvrir);
  return serveur;
}

/** Ouvre l'onglet à cette adresse, comme un lien suivi : aucun `hashchange` avant le rendu. */
async function ouvrirLOngletA(serveur: ServeurSimule, adresse: string) {
  window.history.replaceState(null, "", adresse);
  const ouverte = rendreAvecCompte(serveur);
  await boutonNouvellePage();
  return ouverte;
}

function bouton(nom: string): HTMLButtonElement | null {
  return screen.queryByRole("button", { name: nom });
}

async function seConnecterDepuisLEcran(utilisateur: UserEvent): Promise<void> {
  await utilisateur.type(await screen.findByLabelText(/^Courriel/), COMPTE.courriel);
  await utilisateur.type(screen.getByLabelText(/^Mot de passe/), MOT_DE_PASSE);
  await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));
}

describe("ouverture d'un lien d'invitation", () => {
  it.each([
    ["avec", false],
    ["sans", true],
  ])(
    "F-014-AC21 %s hashchange émis par le remplacement : même écran, même jeton en mémoire, aucune requête du seul fait de l'ouverture, le jeton retiré de l'adresse sans entrée d'historique",
    async (_cas, bloquer) => {
      const bloqueur = (evenement: Event): void => evenement.stopImmediatePropagation();
      if (bloquer) {
        window.addEventListener("hashchange", bloqueur, { capture: true });
      }
      const longueur = window.history.length;
      const serveur = serveurDeLInvite(true);
      const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

      expect((await titrePrincipal()).textContent).toBe("Invitation");
      await screen.findByRole("button", { name: "Rejoindre l'espace" });
      expect(window.location.hash).toBe("#/invitation");
      expect(window.history.length).toBe(longueur);
      expect(serveur.routesAppelees().filter((route) => route !== ROUTES.moi)).toEqual([]);

      await utilisateur.click(screen.getByRole("button", { name: "Rejoindre l'espace" }));
      await screen.findByText(/Vous avez rejoint/);
      expect(corpsDe(serveur, R.accepter)).toEqual([{ jeton: JETON_INVITATION }]);
      window.removeEventListener("hashchange", bloqueur, { capture: true });
    },
  );

  it.each([
    ["de 42 caractères", JETON_INVITATION.slice(1)],
    ["de 44 caractères", `${JETON_INVITATION}A`],
    ["de 43 caractères avec +", `${JETON_INVITATION.slice(1)}+`],
    ["de 43 caractères avec /", `${JETON_INVITATION.slice(1)}/`],
    ["de 43 caractères avec =", `${JETON_INVITATION.slice(1)}=`],
    ["de 43 caractères avec %2D", `${JETON_INVITATION.slice(3)}%2D`],
    ["vide (#/invitation/)", ""],
  ])(
    "F-014-AC21 F-014-AC24 une chaîne %s est refusée sur l'appareil : retirée de l'adresse, message d'invitation invalide, aucune requête, ni à l'ouverture ni ensuite",
    async (_cas, chaine) => {
      const serveur = serveurDeLInvite(true);
      const { utilisateur } = await ouvrirLOngletA(serveur, `#/invitation/${chaine}`);

      expect(
        await screen.findByText(
          "Ce lien d'invitation n'est pas valide, a déjà servi ou a expiré. Demandez-en un nouveau au propriétaire de l'espace.",
        ),
      ).toBeTruthy();
      await waitFor(() => expect(window.location.hash).toBe("#/invitation"));
      expect(bouton("Rejoindre l'espace")).toBeNull();
      await utilisateur.click(screen.getByRole("link", { name: "Espaces" }));
      expect(serveur.routesAppelees().filter((route) => route === R.accepter)).toEqual([]);
      expect(serveur.requetes.every(({ adresse }) => !adresse.href.includes("invitation"))).toBe(
        true,
      );
    },
  );

  it("F-014-AC21 F-014-AC25 #/invitation sans jeton en mémoire (rechargement, adresse saisie) : rouvrir le lien reçu, sans requête", async () => {
    const serveur = serveurDeLInvite(true);
    await ouvrirLOngletA(serveur, "#/invitation");

    expect(await screen.findByText(/Rouvrez le lien d'invitation que vous avez reçu/)).toBeTruthy();
    expect(serveur.routesAppelees().filter((route) => route !== ROUTES.moi)).toEqual([]);
  });
});

describe("écran d'invitation", () => {
  it("F-014-AC22 connecté : la phrase qui nomme le compte, « Rejoindre l'espace » et « Ignorer » ; Ignorer efface le jeton et revient à l'application sans requête", async () => {
    const serveur = serveurDeLInvite(true);
    const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

    expect(
      await screen.findByText(
        `Vous avez reçu une invitation à rejoindre un espace. En l'acceptant, vous devenez membre de cet espace avec le compte ${COMPTE.nom} ; son nom et votre rôle vous seront indiqués après l'acceptation. Vous pourrez le quitter à tout moment.`,
      ),
    ).toBeTruthy();
    await utilisateur.click(screen.getByRole("button", { name: "Ignorer" }));

    await waitFor(() => expect(window.location.hash).toBe("#/"));
    act(() => {
      window.location.hash = "#/invitation";
    });
    expect(await screen.findByText(/Rouvrez le lien/)).toBeTruthy();
    expect(serveur.routesAppelees().filter((route) => route !== ROUTES.moi)).toEqual([]);
  });

  it("F-014-AC22 compte inconnu : l'acceptation demande une connexion au serveur, « Réessayer » revérifie le compte", async () => {
    const serveur = serveurSimule();
    const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

    expect(
      await screen.findByText(/L'acceptation d'une invitation demande une connexion au serveur/),
    ).toBeTruthy();
    serveur.poser(ROUTES.moi, () => moi200());
    await utilisateur.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Réessayer" }),
    );

    expect(await screen.findByRole("button", { name: "Rejoindre l'espace" })).toBeTruthy();
  });

  it("F-014-AC23 F-014-AC3 accepter : le corps ne porte que le jeton ; le nom et le rôle sont dits, « Voir cet espace » mène à son écran ; la coquille et l'appareil ne changent pas", async () => {
    const serveur = serveurDeLInvite(true);
    const { utilisateur, session } = await ouvrirLOngletA(serveur, LIEN);
    const etat = session.lireEtat();
    const stockage = await toutLeStockage();
    serveur.poser(R.lire(), () => espace200(espace("lecteur")));

    await utilisateur.click(await screen.findByRole("button", { name: "Rejoindre l'espace" }));

    expect(
      await screen.findByText("Vous avez rejoint « Projet Atlas » en tant que Lecteur."),
    ).toBeTruthy();
    expect(serveur.requetes.find(({ route }) => route === R.accepter)?.corps).toBe(
      JSON.stringify({ jeton: JETON_INVITATION }),
    );
    expect(bouton("Rejoindre l'espace")).toBeNull();
    await utilisateur.click(screen.getByRole("link", { name: "Voir cet espace" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/espaces/${ID_ESPACE}`));
    expect(session.lireEtat()).toBe(etat);
    expect(await toutLeStockage()).toBe(stockage);
  });

  it.each([
    [
      "404 invitation-invalide",
      () => enveloppe(404, "invitation-invalide"),
      "Ce lien d'invitation n'est pas valide, a déjà servi ou a expiré. Demandez-en un nouveau au propriétaire de l'espace.",
      false,
    ],
    [
      "409 deja-membre",
      () => enveloppe(409, "deja-membre"),
      "Vous êtes déjà membre de cet espace.",
      false,
    ],
    [
      "409 quota-atteint",
      () => enveloppe(409, "quota-atteint"),
      "Cet espace a atteint son nombre maximal de membres.",
      true,
    ],
  ])(
    "F-014-AC24 F-014-AC30 un %s : son texte ; le jeton est effacé, ou gardé pour un nouvel essai",
    async (_cas, reponse, texte, garde) => {
      const serveur = serveurDeLInvite(true);
      serveur.poser(R.accepter, reponse);
      const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

      await utilisateur.click(await screen.findByRole("button", { name: "Rejoindre l'espace" }));

      expect(await screen.findByText(texte)).toBeTruthy();
      expect(bouton("Rejoindre l'espace") !== null).toBe(garde);
      if (garde) {
        await utilisateur.click(screen.getByRole("button", { name: "Rejoindre l'espace" }));
        await waitFor(() =>
          expect(corpsDe(serveur, R.accepter)).toEqual([
            { jeton: JETON_INVITATION },
            { jeton: JETON_INVITATION },
          ]),
        );
      } else if (texte.startsWith("Vous êtes déjà")) {
        expect(screen.getByRole("link", { name: "Voir les espaces" })).toBeTruthy();
      }
    },
  );

  it("F-014-AC24 un 429 : le délai de Retry-After, l'envoi désactivé pendant ce délai", async () => {
    const serveur = serveurDeLInvite(true);
    serveur.poser(R.accepter, () => enveloppe(429, "trop-de-requetes", { "Retry-After": "1" }));
    const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

    await utilisateur.click(await screen.findByRole("button", { name: "Rejoindre l'espace" }));

    expect(await screen.findByText("Trop de tentatives. Réessayez dans 1 secondes.")).toBeTruthy();
    expect(estDesactive(screen.getByRole("button", { name: "Rejoindre l'espace" }))).toBe(true);
    await waitFor(
      () =>
        expect(estDesactive(screen.getByRole("button", { name: "Rejoindre l'espace" }))).toBe(
          false,
        ),
      { timeout: 2000 },
    );
  });

  it("F-014-AC24 un 401 : l'état du compte est revérifié, et l'écran propose la connexion", async () => {
    const serveur = serveurDeLInvite(true);
    serveur.poser(R.accepter, () => {
      serveur.poser(ROUTES.moi, () => moi401());
      return enveloppe(401, "non-authentifie");
    });
    const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);

    await utilisateur.click(await screen.findByRole("button", { name: "Rejoindre l'espace" }));

    expect(await screen.findByRole("button", { name: "Se connecter" })).toBeTruthy();
    expect(screen.getByText(/il faut un compte/)).toBeTruthy();
  });

  it("F-014-AC43 le code courriel-non-verifie n'existe pas encore : aucune branche de l'écran ne le nomme (F-026 livrera son test)", () => {
    expect(lire("src/interface/EcranDInvitation.tsx")).not.toContain("courriel-non-verifie");
  });
});

describe("détour par un écran de compte", () => {
  it.each([
    ["la connexion", "Se connecter"],
    ["l'inscription", "Créer un compte"],
  ])(
    "F-014-AC22 F-014-AC41 F-014-AC25 déconnecté : %s depuis l'écran d'invitation ramène à l'écran d'invitation, le jeton gardé en mémoire et envoyé dans le seul corps de l'acceptation",
    async (_cas, commande) => {
      const consoles = (["log", "info", "warn", "error", "debug"] as const).map((niveau) =>
        vi.spyOn(console, niveau),
      );
      const longueur = window.history.length;
      const serveur = serveurDeLInvite(false);
      const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);
      expect(await screen.findByText(/il faut un compte/)).toBeTruthy();

      await utilisateur.click(screen.getByRole("button", { name: commande }));
      await waitFor(() => expect(window.location.hash).not.toBe("#/invitation"));
      if (commande === "Créer un compte") {
        await utilisateur.type(await screen.findByLabelText(/^Nom/), COMPTE.nom);
        await utilisateur.type(screen.getByLabelText(/^Courriel/), COMPTE.courriel);
        await utilisateur.type(screen.getByLabelText(/^Mot de passe/), MOT_DE_PASSE);
        await utilisateur.click(screen.getByRole("button", { name: "Créer le compte" }));
      } else {
        await seConnecterDepuisLEcran(utilisateur);
      }

      await waitFor(() => expect(window.location.hash).toBe("#/invitation"));
      await utilisateur.click(await screen.findByRole("button", { name: "Rejoindre l'espace" }));
      expect(await screen.findByText(/Vous avez rejoint/)).toBeTruthy();

      // Le jeton n'est que dans le corps de l'acceptation, une fois.
      const porteurs = serveur.requetes.filter(({ adresse, corps }) =>
        `${adresse.href} ${corps ?? ""}`.includes(JETON_INVITATION),
      );
      expect(porteurs.map(({ route }) => route)).toEqual([R.accepter]);
      expect(window.location.href).not.toContain(JETON_INVITATION);
      expect(window.history.length - longueur).toBeLessThanOrEqual(3);
      expect(document.title).not.toContain(JETON_INVITATION);
      expect(await toutLeStockage()).not.toContain(JETON_INVITATION);
      for (const espion of consoles) {
        expect(JSON.stringify(espion.mock.calls)).not.toContain(JETON_INVITATION);
      }
    },
  );

  it("F-014-AC41 un détour abandonné puis repris depuis la zone de compte revient à la page sélectionnée", async () => {
    const serveur = serveurDeLInvite(false);
    const { utilisateur } = await ouvrirLOngletA(serveur, LIEN);
    await utilisateur.click(await screen.findByRole("button", { name: "Se connecter" }));
    await utilisateur.click(await screen.findByRole("link", { name: "Retour à l'application" }));
    await waitFor(() => expect(window.location.hash).toBe("#/"));

    act(() => {
      window.location.hash = "#/connexion";
    });
    await seConnecterDepuisLEcran(utilisateur);

    await waitFor(() => expect(serveur.routesAppelees()).toContain(ROUTES.connexion));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
  });

  it.each([
    "#/connexion?retour=https://exemple.invalid",
    "#/connexion/https://exemple.invalid",
    "#/inscription?next=%2F%2Fexemple.invalid",
    "#/connexion?retour=javascript:alert(1)",
    "?retour=//exemple.invalid#/connexion",
  ])(
    "F-014-AC41 F-014-AC38 adresse forgée %s : la connexion menée à son terme revient à la page sélectionnée, sur la même origine et le même chemin, sans script ni requête ailleurs",
    async (adresse) => {
      const alerte = vi.fn();
      vi.stubGlobal("alert", alerte);
      const serveur = serveurDeLInvite(false);
      const { origin, pathname } = window.location;
      const { utilisateur } = await ouvrirLOngletA(serveur, adresse);

      if (window.location.hash !== "#/connexion") {
        await utilisateur.click(await screen.findByRole("link", { name: "Se connecter" }));
      }
      await seConnecterDepuisLEcran(utilisateur);

      await waitFor(() => expect(window.location.hash).toBe("#/"));
      expect(window.location.origin).toBe(origin);
      expect(window.location.pathname).toBe(pathname);
      expect(serveur.requetes.every((requete) => requete.adresse.origin === origin)).toBe(true);
      expect(alerte).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    },
  );
});

describe("couture des formes d'adresse et du retour (F-014-AC38)", () => {
  it("F-014-AC38 les formes reconnues : celles de F-002 et F-010 inchangées, celles des espaces jamais prises pour une page", () => {
    const page = "0b9c6c8e-7d1a-4c55-9b0e-2f4b8a6d1e01";
    expect(lireRoute(`#/page/${page}`)).toEqual({ forme: "page", idPage: page });
    expect(lireRoute("#/page/x")).toEqual({ forme: "page-introuvable" });
    expect(lireRoute("#/connexion")).toEqual({ forme: "connexion" });
    expect(lireRoute("#/inscription")).toEqual({ forme: "inscription" });
    for (const fragment of [
      "#/connexion?retour=x",
      "#/inscription/x",
      "#/espaces",
      `#/espaces/${ID_ESPACE}`,
      "#/invitation",
      LIEN,
    ]) {
      expect(lireRoute(fragment), fragment).toEqual({ forme: "accueil" });
    }
    expect(lireEcranDEspaces("#/espaces")).toEqual({ ecran: "espaces" });
    expect(lireEcranDEspaces(`#/espaces/${ID_ESPACE}`)).toEqual({
      ecran: "espace",
      idEspace: ID_ESPACE,
    });
    expect(lireEcranDEspaces("#/invitation")).toEqual({ ecran: "invitation" });
    expect(lireEcranDEspaces(LIEN)).toEqual({ ecran: "lien-d-invitation", brut: JETON_INVITATION });
    for (const fragment of ["", "#/", `#/page/${page}`, "#/connexion", "#/inscription"]) {
      expect(lireEcranDEspaces(fragment), fragment).toBeUndefined();
    }
    expect(fragmentDe({ forme: "accueil" })).toBe("#/");
  });

  it("F-014-AC38 F-014-AC41 les appelants du retour sont énumérés : l'écran de compte (F-010-AC6, AC7, AC8) et « Ignorer » ; aucun ne lit l'adresse, un stockage ni une réponse pour choisir où revenir", () => {
    const sources = new Map(
      lister("src")
        .filter((chemin) => /\.tsx?$/.test(chemin))
        .map((chemin) => [chemin, lire(chemin)]),
    );
    const appels = [...sources].flatMap(([chemin, texte]) =>
      [...texte.matchAll(/\ballerAuRetour\(([^)]*)\)/g)].map(
        ([, argument]) => `${chemin} : ${argument}`,
      ),
    );
    expect(appels.sort()).toEqual([
      "src/interface/EcranDInvitation.tsx : navigation.application",
      "src/interface/EcranDeCompte.tsx : m.retour",
      "src/interface/EcranDeCompte.tsx : retour",
      "src/navigation/fragment.ts : fragment: string",
    ]);
    const navigation = sources.get("src/interface/navigation-espaces.ts") ?? "";
    expect(navigation).not.toMatch(/referrer|window\.name|postMessage|localStorage|sessionStorage/);
    expect(lire("src/navigation/route.ts")).toMatch(
      /DESTINATIONS = \["page-selectionnee", "invitation"\]/,
    );
  });

  it("F-014-AC38 F-002-AC12 le sélecteur d'espace s'ajoute à la barre ; la coquille et les pages restent", async () => {
    const serveur = serveurDeLInvite(true);
    const { utilisateur } = await ouvrirLOngletA(serveur, "#/");
    await utilisateur.click(await boutonNouvellePage());
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/page\//));
    expect(screen.getByRole("link", { name: "Espaces" }).getAttribute("href")).toBe("#/espaces");
    expect(Object.keys(window.localStorage)).toEqual([]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
  });
});
