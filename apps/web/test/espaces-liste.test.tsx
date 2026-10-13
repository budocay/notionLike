// Écran des espaces (F-014-AC1, AC2, AC7, AC8, AC33, AC42) : liste du serveur, espace de l'appareil
// à part, création d'un espace.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { enveloppe, moi401, ROUTES, serveurSimule } from "./aides-compte.tsx";
import {
  aller,
  corpsDe,
  descriptionDe,
  espace,
  espace200,
  estDesactive,
  ID_AUTRE_ESPACE,
  ID_ESPACE,
  liste200,
  ouvrirA,
  R,
  serveurDeLEspace,
  titrePrincipal,
  toutLeStockage,
  valeurDe,
} from "./aides-espaces.tsx";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function partie(nom: string): HTMLElement {
  return screen.getByRole("region", { name: nom });
}

function boutonNouvelEspace(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Nouvel espace" });
}

function idEspaceDeLaCoquille(session: { lireEtat: () => { phase: string } }): string | undefined {
  const etat = session.lireEtat();
  return "idEspace" in etat ? String(etat.idEspace) : undefined;
}

describe("liste des espaces", () => {
  it("F-014-AC1 connecté : les espaces du serveur dans l'ordre reçu, avec le libellé du rôle et un lien vers leur écran ; l'espace de l'appareil à part, courant, sans commande ; rien n'est conservé", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.espaces, () =>
      liste200([espace("lecteur", "Zèbre"), espace("proprietaire", "Atlas", ID_AUTRE_ESPACE)]),
    );
    await ouvrirA(serveur, "#/espaces");

    const tableau = await within(partie("Espaces du serveur")).findByRole("table");
    const lignes = within(tableau).getAllByRole("row").slice(1);
    expect(lignes.map((ligne) => ligne.textContent)).toEqual(["ZèbreLecteur", "AtlasPropriétaire"]);
    expect(within(tableau).getByRole("link", { name: "Ouvrir l'espace Atlas" })).toHaveProperty(
      "hash",
      `#/espaces/${ID_AUTRE_ESPACE}`,
    );
    const appareil = partie("Espace de cet appareil");
    expect(appareil.textContent).toContain("Espace courant");
    expect(appareil.textContent).toContain(
      "Les espaces du serveur ne s'ouvrent pas encore dans l'éditeur.",
    );
    expect(within(appareil).queryAllByRole("button")).toEqual([]);
    expect(within(appareil).queryAllByRole("link")).toEqual([]);
    const stockage = await toutLeStockage();
    expect(stockage).not.toContain("Zèbre");
    expect(stockage).not.toContain("Atlas");
  });

  it("F-014-AC2 déconnecté : l'espace de l'appareil seul, « Connectez-vous », création désactivée avec sa raison, aucune requête d'espace", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi401() });
    const { utilisateur } = await ouvrirA(serveur, "#/espaces");

    expect((await titrePrincipal()).textContent).toContain("Espaces");
    expect(partie("Espaces du serveur").textContent).toContain("Connectez-vous");
    expect(estDesactive(boutonNouvelEspace())).toBe(true);
    expect(descriptionDe(boutonNouvelEspace())).toBe(
      "Connectez-vous pour voir les espaces du serveur.",
    );
    expect(serveur.routesAppelees().filter((route) => route.includes("espaces"))).toEqual([]);
    // La coquille reste utilisable : une page se crée comme avant.
    await utilisateur.click(screen.getByRole("button", { name: "Nouvelle page" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/page\//));
  });

  it("F-014-AC2 compte inconnu : « Demande une connexion au serveur », création désactivée, aucun écran bloquant", async () => {
    const serveur = serveurSimule();
    await ouvrirA(serveur, "#/espaces");

    await waitFor(() =>
      expect(partie("Espaces du serveur").textContent).toContain(
        "Demande une connexion au serveur.",
      ),
    );
    expect(estDesactive(boutonNouvelEspace())).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(estDesactive(screen.getByRole("button", { name: "Nouvelle page" }))).toBe(false);
  });

  it("F-014-AC2 F-014-AC30 F-014-AC31 la lecture échoue : la raison, le message de la table et l'identifiant pour le support, puis Réessayer", async () => {
    const serveur = serveurDeLEspace("lecteur");
    serveur.poser(R.espaces, () => enveloppe(500, "erreur-interne"));
    const { utilisateur } = await ouvrirA(serveur, "#/espaces");

    const alerte = await within(partie("Espaces du serveur")).findByRole("alert");
    expect(alerte.textContent).toContain("Une erreur est survenue sur le serveur. Réessayez.");
    expect(alerte.textContent).toContain("Identifiant à communiquer au support : req-7c2e91");
    expect(alerte.textContent).toContain("Demande une connexion au serveur.");
    expect(alerte.textContent).not.toContain("erreur-interne");
    expect(alerte.textContent).not.toContain("message anglais");
    expect(estDesactive(boutonNouvelEspace())).toBe(true);

    serveur.poser(R.espaces, () => liste200([espace("lecteur")]));
    await utilisateur.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("link", { name: "Ouvrir l'espace Projet Atlas" })).toBeTruthy();
    expect(estDesactive(boutonNouvelEspace())).toBe(false);
  });

  it("F-014-AC31 serveur injoignable : le message dit que les pages restent sur l'appareil", async () => {
    const serveur = serveurDeLEspace("lecteur");
    serveur.retirer(R.espaces);
    await ouvrirA(serveur, "#/espaces");

    expect((await screen.findByText(/Serveur injoignable/)).textContent).toContain(
      "Serveur injoignable. Vos pages restent disponibles sur cet appareil.",
    );
  });

  it("F-014-AC33 un nom d'espace qui porte une balise de script s'affiche comme du texte, y compris dans les noms accessibles", async () => {
    const nom = "<script>alert(1)</script><img src=x onerror=alert(2)>";
    const serveur = serveurDeLEspace("lecteur");
    serveur.poser(R.espaces, () => liste200([espace("lecteur", nom)]));
    await ouvrirA(serveur, "#/espaces");

    const lien = await screen.findByRole("link", { name: `Ouvrir l'espace ${nom}` });
    expect(lien.textContent).toBe(nom);
    expect(document.querySelectorAll("main script, main img")).toHaveLength(0);
  });
});

describe("création d'un espace", () => {
  it("F-014-AC7 F-014-AC34 F-014-AC3 F-014-AC5 un nom conforme : POST avec un UUID v4 canonique et ce nom, rien d'autre ; l'écran de l'espace s'ouvre, l'espace courant de la coquille ne change pas, rien n'est écrit sur l'appareil", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    let tire = "";
    serveur.poser(R.creer, () => {
      const corps = corpsDe(serveur, R.creer).at(-1) as { idEspace: string; nom: string };
      tire = corps.idEspace;
      serveur.poser(R.lire(tire), () => espace200(espace("proprietaire", corps.nom, tire)));
      return espace200(espace("proprietaire", corps.nom, tire), 201);
    });
    const { utilisateur, session } = await ouvrirA(serveur, "#/espaces");
    const avant = idEspaceDeLaCoquille(session);
    const stockageAvant = await toutLeStockage();

    await utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
    await utilisateur.keyboard("Équipe Nord{Enter}");

    await waitFor(() => expect(window.location.hash).toBe(`#/espaces/${tire}`));
    const corps = corpsDe(serveur, R.creer);
    expect(corps).toHaveLength(1);
    expect(corps[0]).toEqual({ idEspace: tire, nom: "Équipe Nord" });
    expect(tire).toMatch(UUID_V4);
    expect((await titrePrincipal()).textContent).toContain("Équipe Nord");
    expect(idEspaceDeLaCoquille(session)).toBe(avant);
    expect(await toutLeStockage()).toBe(stockageAvant);
    // F-014-AC34 : l'identifiant de l'espace de l'appareil n'est envoyé dans aucune requête.
    for (const requete of serveur.requetes) {
      expect(`${requete.adresse.href} ${requete.corps ?? ""}`).not.toContain(String(avant));
    }
  });

  it.each([
    ["vide", ""],
    ["fait de blancs", "   "],
    ["de 101 caractères", "x".repeat(101)],
  ])(
    "F-014-AC8 un nom %s : aucune requête, la règle sous le champ, relié au champ ; le nom est conservé",
    async (_cas, nom) => {
      const serveur = serveurDeLEspace("proprietaire");
      const { utilisateur } = await ouvrirA(serveur, "#/espaces");
      await utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
      const champ = screen.getByRole("textbox", { name: /Nom de l'espace/ });
      if (nom !== "") {
        await utilisateur.type(champ, nom);
      }
      await utilisateur.click(screen.getByRole("button", { name: "Créer l'espace" }));

      expect(champ.getAttribute("aria-invalid")).toBe("true");
      expect(descriptionDe(champ)).toBe(
        "Le nom de l'espace est obligatoire, ne peut pas être fait que d'espaces et compte au plus 100 caractères.",
      );
      expect(valeurDe(champ)).toBe(nom);
      expect(serveur.routesAppelees()).not.toContain(R.creer);
    },
  );

  it.each([
    ["quota-atteint", "Vous possédez déjà le nombre maximal d'espaces (20)."],
    ["identifiant-indisponible", "L'opération a échoué. Réessayez."],
  ] as const)(
    "F-014-AC8 F-014-AC30 un 409 %s : son texte, aucun nouvel essai, le nom conservé, rien sur l'appareil",
    async (code, texte) => {
      const serveur = serveurDeLEspace("proprietaire");
      serveur.poser(R.creer, () => enveloppe(409, code));
      const { utilisateur } = await ouvrirA(serveur, "#/espaces");
      const stockageAvant = await toutLeStockage();
      await utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
      await utilisateur.keyboard("Atlas{Enter}");

      expect(await screen.findByText(texte)).toBeTruthy();
      expect(valeurDe(screen.getByRole("textbox", { name: /Nom de l'espace/ }))).toBe("Atlas");
      expect(serveur.routesAppelees().filter((route) => route === R.creer)).toHaveLength(1);
      expect(window.location.hash).toBe("#/espaces");
      expect(await toutLeStockage()).toBe(stockageAvant);
    },
  );

  it("F-014-AC42 sans crypto.randomUUID : aucune requête, le message du contexte sécurisé, le nom conservé, aucune erreur non interceptée", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    const { utilisateur } = await ouvrirA(serveur, "#/espaces");
    await utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
    await utilisateur.type(screen.getByRole("textbox", { name: /Nom de l'espace/ }), "Atlas");
    const aleatoire = vi.spyOn(Math, "random");
    const { randomUUID: _retire, ...sansUuid } = Object.getOwnPropertyDescriptors(
      Object.getPrototypeOf(crypto) as object,
    );
    void _retire;
    vi.stubGlobal("crypto", Object.create(Object.prototype, sansUuid) as Crypto);

    await utilisateur.click(screen.getByRole("button", { name: "Créer l'espace" }));

    expect(
      await screen.findByText(
        "La création d'un espace demande que l'application soit servie en https ou à une adresse locale de la machine (localhost, 127.0.0.1).",
      ),
    ).toBeTruthy();
    expect(valeurDe(screen.getByRole("textbox", { name: /Nom de l'espace/ }))).toBe("Atlas");
    expect(serveur.routesAppelees()).not.toContain(R.creer);
    expect(aleatoire).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("F-014-AC35 F-014-AC9 Échap ferme le formulaire sans requête et rend le focus à « Nouvel espace »", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    const { utilisateur } = await ouvrirA(serveur, "#/espaces");
    await utilisateur.click(await screen.findByRole("button", { name: "Nouvel espace" }));
    await utilisateur.keyboard("Atlas{Escape}");

    await waitFor(() => expect(document.activeElement).toBe(boutonNouvelEspace()));
    expect(serveur.routesAppelees()).not.toContain(R.creer);
  });
});

describe("sélecteur d'espace", () => {
  it("F-014-AC1 F-014-AC35 la barre latérale mène à l'écran des espaces, au clavier", async () => {
    const serveur = serveurDeLEspace("lecteur");
    const { utilisateur } = await ouvrirA(serveur, "#/");
    const lien = screen.getByRole("link", { name: "Espaces" });
    lien.focus();
    await utilisateur.keyboard("{Enter}");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));

    await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
    expect((await titrePrincipal()).textContent).toContain("Espaces");
    aller(`#/espaces/${ID_ESPACE}`);
    expect((await titrePrincipal()).textContent).toContain("Projet Atlas");
  });
});
