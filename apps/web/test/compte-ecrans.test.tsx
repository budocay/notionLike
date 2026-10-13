// Écrans d'inscription et de connexion (F-010) : envoi, contrôle des champs, attente, erreurs,
// retour à l'application, clavier et accessibilité.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODE_NATIF_COMPTE_EXISTANT,
  CODE_NATIF_IDENTIFIANTS_INVALIDES,
} from "../src/compte/client-auth.ts";
import { creerPageNommee } from "./aides-coquille.tsx";
import {
  COMPTE,
  compteNatif,
  enveloppe,
  etatAnnonce,
  ID_REQUETE,
  jamais,
  moi200,
  moi401,
  MOT_DE_PASSE,
  natif,
  ouvrirAvecCompte,
  pageHtml,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
  zoneDeCompte,
} from "./aides-compte.tsx";

afterEach(() => {
  vi.useRealTimers();
});

function champ(etiquette: "Nom" | "Courriel" | "Mot de passe"): HTMLInputElement {
  return screen.getByLabelText(etiquette, { exact: false }) as HTMLInputElement;
}

function bouton(nom: string): HTMLButtonElement {
  return screen.getByRole("button", { name: nom }) as HTMLButtonElement;
}

function formulaire(): HTMLElement {
  return screen.getByRole("form");
}

function lienDuFormulaire(nom: string): HTMLElement {
  return within(formulaire()).getByRole("link", { name: nom });
}

function alerteDEnvoi(): HTMLElement {
  return screen.getByRole("alert");
}

/** Ouvre l'application déconnectée, puis l'écran demandé par le lien de la zone de compte. */
async function ouvrirLEcran(
  serveur: ServeurSimule,
  lien: "Se connecter" | "Créer un compte",
): Promise<UserEvent> {
  const { utilisateur } = await ouvrirAvecCompte(serveur);
  await waitFor(() => expect(etatAnnonce()).toBe("Non connecté."));
  await utilisateur.click(within(zoneDeCompte()).getByRole("link", { name: lien }));
  await screen.findByRole("heading", { level: 1, name: lien });
  return utilisateur;
}

async function saisir(
  utilisateur: UserEvent,
  valeurs: Partial<Record<"Nom" | "Courriel" | "Mot de passe", string>>,
): Promise<void> {
  for (const [etiquette, valeur] of Object.entries(valeurs)) {
    if (valeur !== "") {
      await utilisateur.type(champ(etiquette as "Nom"), valeur);
    }
  }
}

const INSCRIPTION_VALIDE = {
  Nom: COMPTE.nom,
  Courriel: COMPTE.courriel,
  "Mot de passe": MOT_DE_PASSE,
};
const CONNEXION_VALIDE = { Courriel: COMPTE.courriel, "Mot de passe": MOT_DE_PASSE };

describe("entrées et retour", () => {
  it("F-010-AC6 déconnecté, la zone propose « Se connecter » et « Créer un compte » ; chaque écran mène à l'autre et à l'application", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
    expect(window.location.hash).toBe("#/connexion");

    await utilisateur.click(lienDuFormulaire("Créer un compte"));
    await screen.findByRole("heading", { level: 1, name: "Créer un compte" });
    expect(window.location.hash).toBe("#/inscription");
    await utilisateur.click(lienDuFormulaire("Se connecter"));
    await screen.findByRole("heading", { level: 1, name: "Se connecter" });
    await utilisateur.click(lienDuFormulaire("Retour à l'application"));

    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["#/connexion", "#/inscription"])(
    "F-010-AC6 %s ouvert alors que le compte est connecté : retour à l'application, sans formulaire",
    async (fragment) => {
      window.location.hash = fragment;
      const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
      await ouvrirAvecCompte(serveur);

      await waitFor(() => expect(window.location.hash).toBe("#/"));
      expect(screen.queryByLabelText("Courriel", { exact: false })).toBeNull();
      expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`);
    },
  );

  it("F-010-AC7 F-010-AC4 l'inscription réussie appelle l'inscription puis moi, et revient sur la page sélectionnée ; l'état connecté n'est affiché qu'au 200 de moi", async () => {
    let repondre: (reponse: Response) => void = () => undefined;
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    serveur.poser(ROUTES.inscription, () => {
      serveur.poser(ROUTES.moi, () => new Promise((resoudre) => (repondre = resoudre)));
      return compteNatif();
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await creerPageNommee(utilisateur, "Ma page");
    const pageSelectionnee = window.location.hash;
    await utilisateur.click(within(zoneDeCompte()).getByRole("link", { name: "Créer un compte" }));

    await saisir(utilisateur, INSCRIPTION_VALIDE);
    await utilisateur.click(bouton("Créer le compte"));
    await waitFor(() => expect(serveur.routesAppelees()).toHaveLength(3));
    expect(etatAnnonce()).toBe("Non connecté.");
    act(() => repondre(moi200()));

    await waitFor(() => expect(window.location.hash).toBe(pageSelectionnee));
    await waitFor(() => expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`));
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.inscription, ROUTES.moi]);
    expect(JSON.parse(serveur.requetes[1]?.corps ?? "")).toEqual({
      name: COMPTE.nom,
      email: COMPTE.courriel,
      password: MOT_DE_PASSE,
    });
  });

  it("F-010-AC8 la connexion réussie appelle la connexion puis moi, et revient sur la page sélectionnée", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    serveur.poser(ROUTES.connexion, () => {
      serveur.poser(ROUTES.moi, () => moi200());
      return compteNatif();
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await creerPageNommee(utilisateur, "Ma page");
    const pageSelectionnee = window.location.hash;
    await utilisateur.click(within(zoneDeCompte()).getByRole("link", { name: "Se connecter" }));

    await saisir(utilisateur, CONNEXION_VALIDE);
    await utilisateur.click(bouton("Se connecter"));

    await waitFor(() => expect(window.location.hash).toBe(pageSelectionnee));
    await waitFor(() => expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`));
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.connexion, ROUTES.moi]);
  });
});

describe("contrôle des champs avant envoi", () => {
  it.each([
    ["nom vide", { ...INSCRIPTION_VALIDE, Nom: "" }, "Nom", "Le nom est obligatoire"],
    ["nom fait d'espaces", { ...INSCRIPTION_VALIDE, Nom: "   " }, "Nom", "Le nom est obligatoire"],
    [
      "nom de 101 caractères",
      { ...INSCRIPTION_VALIDE, Nom: "n".repeat(101) },
      "Nom",
      "au plus 100 caractères",
    ],
    [
      "courriel invalide",
      { ...INSCRIPTION_VALIDE, Courriel: "alice@" },
      "Courriel",
      "adresse courriel valide",
    ],
    [
      "courriel de 255 caractères",
      {
        ...INSCRIPTION_VALIDE,
        Courriel: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(59)}.fr`,
      },
      "Courriel",
      "au plus 254 caractères",
    ],
    [
      "mot de passe de 11 caractères",
      { ...INSCRIPTION_VALIDE, "Mot de passe": "a".repeat(11) },
      "Mot de passe",
      "au moins 12 caractères",
    ],
    [
      "mot de passe de 129 caractères",
      { ...INSCRIPTION_VALIDE, "Mot de passe": "a".repeat(129) },
      "Mot de passe",
      "au plus 128 caractères",
    ],
  ] as const)(
    "F-010-AC9 F-010-AC24 inscription, %s : aucune requête, message relié au champ, saisie gardée, focus sur le champ fautif",
    async (_cas, valeurs, fautif, regle) => {
      const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
      const utilisateur = await ouvrirLEcran(serveur, "Créer un compte");

      await saisir(utilisateur, valeurs);
      fireEvent.submit(bouton("Créer le compte").form as HTMLFormElement);

      const fauteur = champ(fautif);
      await waitFor(() => expect(document.activeElement).toBe(fauteur));
      expect(fauteur.getAttribute("aria-invalid")).toBe("true");
      const message = document.getElementById(fauteur.getAttribute("aria-describedby") ?? "");
      expect(message?.textContent).toContain(regle);
      expect(champ("Nom").value).toBe(valeurs.Nom);
      expect(champ("Courriel").value).toBe(valeurs.Courriel);
      expect(serveur.routesAppelees()).toEqual([ROUTES.moi]);
    },
  );

  it("F-010-AC9 plusieurs champs fautifs : un message sous chacun, focus sur le premier", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    const utilisateur = await ouvrirLEcran(serveur, "Créer un compte");

    await saisir(utilisateur, { Courriel: "pas un courriel", "Mot de passe": "court" });
    await utilisateur.click(bouton("Créer le compte"));

    expect(document.activeElement).toBe(champ("Nom"));
    for (const etiquette of ["Nom", "Courriel", "Mot de passe"] as const) {
      expect(champ(etiquette).getAttribute("aria-invalid")).toBe("true");
    }
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi]);
  });

  it("F-010-AC9 le courriel perd ses blancs de bord avant l'envoi ; le mot de passe n'est jamais modifié ; un mot de passe court est envoyé à la connexion", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.connexion]: () => natif(401, CODE_NATIF_IDENTIFIANTS_INVALIDES),
    });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");

    await saisir(utilisateur, { Courriel: `  ${COMPTE.courriel} `, "Mot de passe": " court " });
    await utilisateur.click(bouton("Se connecter"));

    await waitFor(() => expect(serveur.routesAppelees()).toContain(ROUTES.connexion));
    expect(JSON.parse(serveur.requetes[1]?.corps ?? "")).toEqual({
      email: COMPTE.courriel,
      password: " court ",
    });
  });
});

describe("attente et erreurs d'envoi", () => {
  it("F-010-AC10 F-010-AC24 pendant l'envoi : bouton désactivé, attente annoncée, aucune seconde requête par clic ni par Entrée", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401, [ROUTES.connexion]: jamais });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
    await saisir(utilisateur, CONNEXION_VALIDE);

    await utilisateur.click(bouton("Se connecter"));
    await utilisateur.type(champ("Courriel"), "{Enter}");
    fireEvent.submit(bouton("Se connecter").form as HTMLFormElement);

    expect(bouton("Se connecter").disabled).toBe(true);
    expect(bouton("Se connecter").form?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Connexion en cours…").getAttribute("role")).toBe("status");
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.connexion]);
  });

  it("F-010-AC14 F-010-AC24 courriel déjà pris : message et lien vers la connexion, annoncés sans déplacer le focus", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.inscription]: () => natif(422, CODE_NATIF_COMPTE_EXISTANT),
    });
    const utilisateur = await ouvrirLEcran(serveur, "Créer un compte");
    await saisir(utilisateur, INSCRIPTION_VALIDE);

    await utilisateur.click(bouton("Créer le compte"));

    await waitFor(() =>
      expect(alerteDEnvoi().textContent).toContain("Un compte existe déjà avec ce courriel."),
    );
    expect(
      within(alerteDEnvoi()).getByRole("link", { name: "Se connecter" }).getAttribute("href"),
    ).toBe("#/connexion");
    expect(document.activeElement).toBe(bouton("Créer le compte"));
  });

  it("F-010-AC14 identifiants refusés : message qui ne dit pas lequel est faux, courriel gardé, mot de passe vidé", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.connexion]: () => natif(401, CODE_NATIF_IDENTIFIANTS_INVALIDES),
    });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
    await saisir(utilisateur, CONNEXION_VALIDE);

    await utilisateur.click(bouton("Se connecter"));

    await waitFor(() =>
      expect(alerteDEnvoi().textContent).toBe("Courriel ou mot de passe incorrect."),
    );
    expect(champ("Courriel").value).toBe(COMPTE.courriel);
    expect(champ("Mot de passe").value).toBe("");
  });

  it("F-010-AC15 un 429 : délai annoncé et envoi désactivé pendant ce délai, puis rendu", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.connexion]: () => natif(429, "TOO_MANY_REQUESTS", { "Retry-After": "1" }),
    });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
    await saisir(utilisateur, CONNEXION_VALIDE);

    await utilisateur.click(bouton("Se connecter"));

    await waitFor(() =>
      expect(alerteDEnvoi().textContent).toBe("Trop de tentatives. Réessayez dans 1 secondes."),
    );
    expect(bouton("Se connecter").disabled).toBe(true);
    fireEvent.submit(bouton("Se connecter").form as HTMLFormElement);
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.connexion]);
    await waitFor(() => expect(bouton("Se connecter").disabled).toBe(false), { timeout: 2_000 });
  });

  it.each([
    ["erreur-interne", 500, true],
    ["base-indisponible", 503, true],
    ["requete-invalide", 400, false],
  ] as const)(
    "F-010-AC16 F-010-AC18 code d'enveloppe « %s » : message de la table, identifiant de requête pour le support s'il le faut, ni code brut ni message du serveur",
    async (code, statut, avecIdentifiant) => {
      const serveur = serveurSimule({
        [ROUTES.moi]: moi401,
        [ROUTES.connexion]: () => enveloppe(statut, code),
      });
      const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
      await saisir(utilisateur, CONNEXION_VALIDE);

      await utilisateur.click(bouton("Se connecter"));

      await waitFor(() => expect(alerteDEnvoi().textContent).not.toBe(""));
      const texte = alerteDEnvoi().textContent;
      expect(texte.includes(ID_REQUETE)).toBe(avecIdentifiant);
      expect(document.body.textContent).not.toContain(code);
      expect(document.body.textContent).not.toContain("message anglais");
    },
  );

  it.each([
    ["un 200 en HTML", () => pageHtml(200), "L'opération a échoué. Réessayez."],
    [
      "un 403 sans corps",
      () => new Response(null, { status: 403 }),
      "L'opération a échoué. Réessayez.",
    ],
    [
      "un code natif inconnu",
      () => natif(400, "SOMETHING_ELSE"),
      "L'opération a échoué. Réessayez.",
    ],
    [
      "un réseau coupé",
      undefined,
      "Serveur injoignable. Vos pages restent disponibles sur cet appareil.",
    ],
  ])(
    "F-010-AC17 F-010-AC18 %s : message en français, jamais un succès, formulaire toujours utilisable",
    async (_cas, reponse, message) => {
      const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
      if (reponse !== undefined) {
        serveur.poser(ROUTES.connexion, reponse);
      }
      const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
      await saisir(utilisateur, CONNEXION_VALIDE);

      await utilisateur.click(bouton("Se connecter"));

      await waitFor(() => expect(alerteDEnvoi().textContent).toBe(message));
      expect(window.location.hash).toBe("#/connexion");
      expect(bouton("Se connecter").disabled).toBe(false);
      expect(champ("Courriel").disabled).toBe(false);
      expect(document.body.textContent).not.toContain("native message");
      expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.connexion]);
    },
  );
});

describe("mot de passe", () => {
  it("F-010-AC11 quitter l'écran efface le mot de passe ; il n'apparaît ni dans l'adresse, ni dans le titre, ni dans la console, ni dans un message", async () => {
    const consoles = (["log", "info", "warn", "error", "debug"] as const).map((methode) =>
      vi.spyOn(console, methode),
    );
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.connexion]: () => natif(500, "INTERNAL_SERVER_ERROR"),
    });
    const utilisateur = await ouvrirLEcran(serveur, "Se connecter");
    await saisir(utilisateur, CONNEXION_VALIDE);
    await utilisateur.click(bouton("Se connecter"));
    await waitFor(() => expect(alerteDEnvoi().textContent).not.toBe(""));

    expect(champ("Mot de passe").value).toBe(MOT_DE_PASSE);
    expect(`${window.location.href} ${document.title} ${alerteDEnvoi().textContent}`).not.toContain(
      MOT_DE_PASSE,
    );
    await utilisateur.click(lienDuFormulaire("Créer un compte"));
    await screen.findByRole("heading", { level: 1, name: "Créer un compte" });
    await utilisateur.click(lienDuFormulaire("Se connecter"));
    await screen.findByRole("heading", { level: 1, name: "Se connecter" });
    expect(champ("Mot de passe").value).toBe("");
    await utilisateur.click(lienDuFormulaire("Retour à l'application"));
    await waitFor(() =>
      expect(screen.queryByLabelText("Mot de passe", { exact: false })).toBeNull(),
    );

    for (const espion of consoles) {
      expect(JSON.stringify(espion.mock.calls)).not.toContain(MOT_DE_PASSE);
    }
  });

  it("F-010-AC25 F-010-AC24 champs déclarés pour les gestionnaires de mots de passe, étiquetés, obligatoires, collage permis", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    const utilisateur = await ouvrirLEcran(serveur, "Créer un compte");

    expect([champ("Nom").type, champ("Nom").autocomplete]).toEqual(["text", "name"]);
    expect([champ("Courriel").type, champ("Courriel").autocomplete]).toEqual(["email", "email"]);
    expect([champ("Mot de passe").type, champ("Mot de passe").autocomplete]).toEqual([
      "password",
      "new-password",
    ]);
    for (const etiquette of ["Nom", "Courriel", "Mot de passe"] as const) {
      expect(champ(etiquette).required).toBe(true);
      expect(champ(etiquette).labels?.[0]?.textContent).toBe(`${etiquette} (obligatoire)`);
    }
    await utilisateur.click(champ("Mot de passe"));
    await utilisateur.paste(MOT_DE_PASSE);
    expect(champ("Mot de passe").value).toBe(MOT_DE_PASSE);

    await utilisateur.click(lienDuFormulaire("Se connecter"));
    await screen.findByRole("heading", { level: 1, name: "Se connecter" });
    expect([champ("Mot de passe").type, champ("Mot de passe").autocomplete]).toEqual([
      "password",
      "current-password",
    ]);
    expect(screen.getByText("Vos pages restent sur cet appareil.")).toBeTruthy();
  });
});

describe("clavier", () => {
  it("F-010-AC23 focus sur le premier champ à l'ouverture, tabulation dans l'ordre visuel, sans piège, envoi par Entrée depuis un champ", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
    serveur.poser(ROUTES.connexion, () => {
      serveur.poser(ROUTES.moi, () => moi200());
      return compteNatif();
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await waitFor(() => expect(etatAnnonce()).toBe("Non connecté."));
    within(zoneDeCompte()).getByRole("link", { name: "Se connecter" }).focus();
    await utilisateur.keyboard("{Enter}");
    await screen.findByRole("heading", { level: 1, name: "Se connecter" });

    await waitFor(() => expect(document.activeElement).toBe(champ("Courriel")));
    const ordre = [
      champ("Mot de passe"),
      bouton("Se connecter"),
      lienDuFormulaire("Créer un compte"),
      lienDuFormulaire("Retour à l'application"),
    ];
    for (const attendu of ordre) {
      await utilisateur.tab();
      expect(document.activeElement).toBe(attendu);
    }
    await utilisateur.tab();
    expect(bouton("Se connecter").form?.contains(document.activeElement)).toBe(false);

    await utilisateur.click(champ("Courriel"));
    await utilisateur.keyboard(`${COMPTE.courriel}`);
    await utilisateur.click(champ("Mot de passe"));
    await utilisateur.keyboard(`${MOT_DE_PASSE}{Enter}`);

    await waitFor(() => expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`));
    expect(window.location.hash).toBe("#/");
  });

  it("F-010-AC23 F-010-AC12 la déconnexion se fait au clavier seul", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    serveur.poser(ROUTES.deconnexion, () => {
      serveur.poser(ROUTES.moi, moi401);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await waitFor(() => expect(etatAnnonce()).toBe(`Connecté : ${COMPTE.nom}`));

    within(zoneDeCompte()).getByRole("button", { name: "Se déconnecter" }).focus();
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(etatAnnonce()).toContain("Vous êtes déconnecté."));
  });
});
