// Invitations côté propriétaire (F-014-AC16 à AC20) : liste, création, copie du lien, révocation, et
// le jeton qui ne survit pas à la boîte qui le montre.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { enveloppe, type ServeurSimule } from "./aides-compte.tsx";
import {
  corpsDe,
  ID_ESPACE,
  INVITATION,
  invitationCreee201,
  invitations200,
  JETON_INVITATION,
  ouvrirA,
  R,
  serveurDeLEspace,
  toutLeStockage,
  valeurDe,
  vide204,
} from "./aides-espaces.tsx";

const LIEN = `${window.location.origin}/#/invitation/${JETON_INVITATION}`;

function enFrancais(instant: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(instant),
  );
}

async function ouvrirLesInvitations(serveur: ServeurSimule) {
  const ouverte = await ouvrirA(serveur, `#/espaces/${ID_ESPACE}`);
  const partie = await screen.findByRole("region", { name: "Invitations en attente" });
  return { ...ouverte, partie };
}

async function creerUnLien(utilisateur: UserEvent, role: string): Promise<HTMLElement> {
  await utilisateur.selectOptions(
    screen.getByRole("combobox", { name: "Rôle donné par le lien" }),
    role,
  );
  await utilisateur.click(
    screen.getByRole("button", { name: "Créer un lien d'invitation pour l'espace Projet Atlas" }),
  );
  return screen.findByRole("dialog", { name: "Lien d'invitation" });
}

/** Presse-papiers du navigateur simulé ; `undefined` le retire, comme hors d'un contexte sécurisé. */
function poserLePressePapiers(valeur: unknown): void {
  Object.defineProperty(navigator, "clipboard", { value: valeur, configurable: true });
}

describe("invitations en attente", () => {
  it("F-014-AC16 F-014-AC36 un tableau des invitations : rôle, création et expiration en français, sans lien ni jeton, et la phrase qui le dit", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    const { partie } = await ouvrirLesInvitations(serveur);

    const tableau = await within(partie).findByRole("table", { name: "Invitations en attente" });
    expect(
      within(tableau)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Rôle", "Créée le", "Expire le", "Actions"]);
    const ligne = within(tableau).getAllByRole("row")[1] as HTMLElement;
    expect(ligne.textContent).toContain("Lecteur");
    expect(ligne.textContent).toContain(enFrancais(INVITATION.creeLe));
    expect(ligne.textContent).toContain(enFrancais(INVITATION.expireLe));
    expect(partie.textContent).toContain(
      "Le lien d'une invitation n'est affiché qu'à sa création.",
    );
    expect(within(partie).queryAllByRole("link")).toEqual([]);
  });

  it("F-014-AC17 F-014-AC36 « Éditeur » ou « Lecteur » seulement ; POST avec ce seul rôle ; la boîte montre le lien, l'expiration, la copie, l'avertissement et « Ce lien ne sera plus affiché. »", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.inviter, () => invitationCreee201("editeur"));
    const { utilisateur } = await ouvrirLesInvitations(serveur);

    const options = within(screen.getByRole("combobox", { name: "Rôle donné par le lien" }))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Éditeur", "Lecteur"]);
    const boite = await creerUnLien(utilisateur, "editeur");

    expect(corpsDe(serveur, R.inviter)).toEqual([{ role: "editeur" }]);
    expect(boite.textContent).toContain(LIEN);
    expect(boite.textContent).toContain(`Expire le ${enFrancais("2026-10-20T08:00:00.000Z")}.`);
    expect(boite.textContent).toContain(
      "Quiconque obtient ce lien entre dans l'espace en tant que Éditeur, jusqu'à son expiration ou sa révocation. Transmettez-le par un canal sûr.",
    );
    expect(boite.textContent).toContain("Ce lien ne sera plus affiché.");
    expect(document.activeElement).toBe(
      within(boite).getByRole("button", { name: "Copier le lien" }),
    );
  });

  it("F-014-AC17 un 409 quota-atteint : le texte propre, avec le nombre lu dans les contrats", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.inviter, () => enveloppe(409, "quota-atteint"));
    const { utilisateur } = await ouvrirLesInvitations(serveur);

    await utilisateur.click(
      screen.getByRole("button", { name: "Créer un lien d'invitation pour l'espace Projet Atlas" }),
    );

    expect(
      await screen.findByText(
        "Cet espace a déjà le nombre maximal d'invitations en attente (20) : révoquez-en une.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("F-014-AC18 presse-papiers disponible : le lien y est placé et « Lien copié » est annoncé", async () => {
    const ecrire = vi.fn(() => Promise.resolve());
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.inviter, () => invitationCreee201());
    const { utilisateur } = await ouvrirLesInvitations(serveur);
    poserLePressePapiers({ writeText: ecrire });
    const boite = await creerUnLien(utilisateur, "lecteur");

    await utilisateur.click(within(boite).getByRole("button", { name: "Copier le lien" }));

    expect(ecrire).toHaveBeenCalledWith(LIEN);
    expect(await within(boite).findByText("Lien copié")).toBeTruthy();
    poserLePressePapiers(undefined);
  });

  it.each([
    ["navigator.clipboard absent", undefined],
    [
      "writeText qui rejette",
      { writeText: () => Promise.reject(new DOMException("refus", "NotAllowedError")) },
    ],
  ])(
    "F-014-AC18 %s : le lien dans un champ en lecture seule, sélectionné, avec « Copiez le lien à la main », sans erreur non interceptée",
    async (_cas, pressePapiers) => {
      const serveur = serveurDeLEspace("proprietaire");
      serveur.poser(R.inviter, () => invitationCreee201());
      const { utilisateur } = await ouvrirLesInvitations(serveur);
      // Après l'installation de user-event, qui pose son propre presse-papiers.
      poserLePressePapiers(pressePapiers);
      const boite = await creerUnLien(utilisateur, "lecteur");

      await utilisateur.click(within(boite).getByRole("button", { name: "Copier le lien" }));

      const champ = await within(boite).findByRole("textbox", { name: "Copiez le lien à la main" });
      expect(valeurDe(champ)).toBe(LIEN);
      expect((champ as HTMLInputElement).readOnly).toBe(true);
      expect(document.activeElement).toBe(champ);
      const champDeTexte = champ as HTMLInputElement;
      expect([champDeTexte.selectionStart, champDeTexte.selectionEnd]).toEqual([0, LIEN.length]);
      poserLePressePapiers(undefined);
    },
  );

  it("F-014-AC19 F-014-AC35 fermée (Échap), la boîte efface le jeton : ni adresse, ni titre, ni console, ni stockage, ni autre requête ne le portent", async () => {
    const consoles = (["log", "info", "warn", "error", "debug"] as const).map((niveau) =>
      vi.spyOn(console, niveau),
    );
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.inviter, () => invitationCreee201());
    const { utilisateur } = await ouvrirLesInvitations(serveur);
    const origine = screen.getByRole("button", {
      name: "Créer un lien d'invitation pour l'espace Projet Atlas",
    });
    await creerUnLien(utilisateur, "lecteur");

    await utilisateur.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(origine));
    expect(document.body.textContent).not.toContain(JETON_INVITATION);
    expect(window.location.href).not.toContain(JETON_INVITATION);
    expect(document.title).not.toContain(JETON_INVITATION);
    expect(await toutLeStockage()).not.toContain(JETON_INVITATION);
    for (const espion of consoles) {
      expect(JSON.stringify(espion.mock.calls)).not.toContain(JETON_INVITATION);
    }
    for (const requete of serveur.requetes) {
      expect(`${requete.adresse.href} ${requete.corps ?? ""}`).not.toContain(JETON_INVITATION);
    }
  });

  it("F-014-AC20 « Révoquer » : DELETE, l'invitation quitte la liste, et l'annonce dit que le lien ne fonctionne plus", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.revoquer, () => {
      serveur.poser(R.invitations, () => invitations200([]));
      return vide204();
    });
    const { utilisateur } = await ouvrirLesInvitations(serveur);

    await utilisateur.click(
      await screen.findByRole("button", {
        name: `Révoquer l'invitation Lecteur créée le ${enFrancais(INVITATION.creeLe)}`,
      }),
    );

    expect(
      await screen.findByText("Invitation révoquée : son lien ne fonctionne plus"),
    ).toBeTruthy();
    expect(await screen.findByText("Aucune invitation en attente.")).toBeTruthy();
    expect(serveur.routesAppelees().filter((route) => route === R.revoquer)).toHaveLength(1);
  });

  it("F-014-AC20 un 404 : la liste est relue et l'écran dit que l'invitation n'était plus en attente", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.revoquer, () => {
      serveur.poser(R.invitations, () => invitations200([]));
      return enveloppe(404, "ressource-introuvable");
    });
    const { utilisateur } = await ouvrirLesInvitations(serveur);
    const lectures = serveur.routesAppelees().filter((route) => route === R.invitations).length;

    await utilisateur.click(await screen.findByRole("button", { name: /^Révoquer l'invitation/ }));

    expect(await screen.findByText("Cette invitation n'était plus en attente.")).toBeTruthy();
    expect(await screen.findByText("Aucune invitation en attente.")).toBeTruthy();
    expect(
      serveur.routesAppelees().filter((route) => route === R.invitations).length,
    ).toBeGreaterThan(lectures);
    expect(window.location.hash).toBe(`#/espaces/${ID_ESPACE}`);
  });
});
