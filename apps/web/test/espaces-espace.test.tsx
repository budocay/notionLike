// Écran d'un espace (F-014-AC9 à AC16, AC26 à AC29, AC32, AC33, AC35, AC36) : nom, rôle, membres,
// actions et confirmations.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COMPTE, enveloppe, jamais, json, type ServeurSimule } from "./aides-compte.tsx";
import {
  BOB_EDITEUR,
  corpsDe,
  descriptionDe,
  espace,
  espace200,
  estDesactive,
  ID_BOB,
  ID_ESPACE,
  liste200,
  membre,
  membres200,
  ouvrirA,
  R,
  serveurDeLEspace,
  titrePrincipal,
  valeurDe,
  vide204,
} from "./aides-espaces.tsx";

const ECRAN = `#/espaces/${ID_ESPACE}`;

async function ouvrirLEspace(serveur: ServeurSimule) {
  const ouverte = await ouvrirA(serveur, ECRAN);
  await screen.findByRole("table", { name: "Membres" });
  return ouverte;
}

function bouton(nom: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name: nom });
}

function rendreVisible(): void {
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

describe("membres", () => {
  it("F-014-AC13 F-014-AC36 un tableau à en-têtes de colonne, dans l'ordre reçu, nom, courriel quand la réponse le porte, rôle, et « (vous) » sur le compte courant", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    await ouvrirLEspace(serveur);

    const tableau = screen.getByRole("table", { name: "Membres" });
    expect(
      within(tableau)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Nom", "Courriel", "Rôle", "Actions"]);
    const lignes = within(tableau).getAllByRole("row").slice(1);
    expect(lignes[0]?.textContent).toContain(`${COMPTE.nom} (vous)`);
    expect(lignes[0]?.textContent).toContain(COMPTE.courriel);
    expect(lignes[1]?.textContent).toContain("Bob Durand");
    expect(lignes[1]?.textContent).toContain("bob@exemple.fr");
    expect(valeurDe(within(lignes[1] as HTMLElement).getByRole("combobox"))).toBe("editeur");
  });

  it("F-014-AC13 vu par un lecteur : ni courriel ni colonne d'actions, les rôles en texte", async () => {
    const serveur = serveurDeLEspace("lecteur");
    await ouvrirLEspace(serveur);

    const tableau = screen.getByRole("table", { name: "Membres" });
    expect(
      within(tableau)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Nom", "Rôle"]);
    expect(tableau.textContent).toContain("Éditeur");
    expect(tableau.textContent).not.toContain("@");
  });

  it("F-014-AC14 un autre rôle : PATCH avec ce seul rôle, le rôle renvoyé affiché et annoncé", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.role(ID_BOB), () => json(200, { ...BOB_EDITEUR, role: "lecteur" }));
    const { utilisateur } = await ouvrirLEspace(serveur);
    serveur.poser(R.membres(), () =>
      membres200([
        membre(COMPTE.id, COMPTE.nom, "proprietaire", COMPTE.courriel),
        { ...BOB_EDITEUR, role: "lecteur" },
      ]),
    );

    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: "Rôle de Bob Durand" }),
      "lecteur",
    );

    expect(await screen.findByText("Rôle de Bob Durand : Lecteur")).toBeTruthy();
    expect(corpsDe(serveur, R.role(ID_BOB))).toEqual([{ role: "lecteur" }]);
    await waitFor(() =>
      expect(valeurDe(screen.getByRole("combobox", { name: "Rôle de Bob Durand" }))).toBe(
        "lecteur",
      ),
    );
  });

  it("F-014-AC14 un 409 dernier-proprietaire : la commande revient au rôle d'avant et le message propre est affiché", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.role(COMPTE.id), () => enveloppe(409, "dernier-proprietaire"));
    const { utilisateur } = await ouvrirLEspace(serveur);

    const choix = screen.getByRole("combobox", { name: `Rôle de ${COMPTE.nom}` });
    await utilisateur.selectOptions(choix, "lecteur");

    expect(
      await screen.findByText("Un espace garde toujours au moins un propriétaire."),
    ).toBeTruthy();
    expect(valeurDe(screen.getByRole("combobox", { name: `Rôle de ${COMPTE.nom}` }))).toBe(
      "proprietaire",
    );
  });

  it("F-014-AC14 F-014-AC27 le propriétaire se passe éditeur : son rôle est relu et l'écran perd les commandes de propriétaire", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.role(COMPTE.id), () => {
      serveur.poser(R.lire(), () => espace200(espace("editeur")));
      serveur.poser(R.membres(), () =>
        membres200([
          membre(COMPTE.id, COMPTE.nom, "editeur"),
          membre(ID_BOB, "Bob Durand", "proprietaire"),
        ]),
      );
      return json(200, membre(COMPTE.id, COMPTE.nom, "editeur", COMPTE.courriel));
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: `Rôle de ${COMPTE.nom}` }),
      "editeur",
    );

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Supprimer l'espace/ })).toBeNull(),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("region", { name: "Invitations en attente" })).toBeNull();
    expect(serveur.routesAppelees().filter((route) => route === R.lire()).length).toBeGreaterThan(
      1,
    );
  });

  it("F-014-AC15 F-014-AC36 « Retirer » : une boîte d'alerte qui nomme le membre et avertit, focus sur Annuler, aucune requête avant la confirmation ; confirmé, DELETE puis retrait annoncé", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.retirer(ID_BOB), () => {
      serveur.poser(R.membres(), () =>
        membres200([membre(COMPTE.id, COMPTE.nom, "proprietaire", COMPTE.courriel)]),
      );
      return vide204();
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Retirer Bob Durand de l'espace"));
    const boite = screen.getByRole("alertdialog", { name: "Retirer Bob Durand de l'espace ?" });
    expect(boite.textContent).toContain(
      "Un retrait ne reprend pas ce qui a déjà été lu : les pages que cette personne a ouvertes restent sur ses appareils. Elle ne recevra plus rien et ne pourra plus rien envoyer.",
    );
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    expect(serveur.routesAppelees()).not.toContain(R.retirer(ID_BOB));

    await utilisateur.click(
      within(boite).getByRole("button", { name: "Retirer Bob Durand de l'espace" }),
    );

    expect(await screen.findByText("Bob Durand a été retiré de l'espace")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Membres" }).textContent).not.toContain("Bob"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // La commande d'origine a disparu : le focus revient au tableau.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("table", { name: "Membres" })),
    );
  });

  it("F-014-AC33 un nom de membre qui porte une balise de script est rendu comme du texte, dans le tableau, les noms accessibles et la confirmation", async () => {
    const nom = "<script>alert(1)</script>";
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.membres(), () =>
      membres200([
        membre(COMPTE.id, COMPTE.nom, "proprietaire", COMPTE.courriel),
        membre(ID_BOB, nom, "lecteur", "x@exemple.fr"),
      ]),
    );
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton(`Retirer ${nom} de l'espace`));
    expect(screen.getByRole("alertdialog", { name: `Retirer ${nom} de l'espace ?` })).toBeTruthy();
    expect(document.querySelectorAll("main script")).toHaveLength(0);
  });
});

describe("renommer, supprimer, quitter", () => {
  it("F-014-AC9 un nouveau nom conforme : PATCH, puis le nom renvoyé dans l'écran ; Échap garde l'ancien nom sans requête", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.renommer(), () => {
      serveur.poser(R.lire(), () => espace200(espace("proprietaire", "Atlas 2")));
      serveur.poser(R.espaces, () => liste200([espace("proprietaire", "Atlas 2")]));
      return espace200(espace("proprietaire", "Atlas 2"));
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Renommer l'espace Projet Atlas"));
    await utilisateur.keyboard("{Escape}");
    expect((await titrePrincipal()).textContent).toBe("Projet Atlas");
    expect(serveur.routesAppelees()).not.toContain(R.renommer());

    await utilisateur.click(bouton("Renommer l'espace Projet Atlas"));
    const champ = screen.getByRole("textbox", { name: /Nom de l'espace/ });
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Atlas 2{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Atlas 2"),
    );
    expect(corpsDe(serveur, R.renommer())).toEqual([{ nom: "Atlas 2" }]);
    await utilisateur.click(screen.getByRole("link", { name: "Retour aux espaces" }));
    expect(await screen.findByRole("link", { name: "Ouvrir l'espace Atlas 2" })).toBeTruthy();
  });

  it("F-014-AC10 F-014-AC36 la suppression : une alerte qui cite le nom, le nombre de membres, l'irréversible et le sort des copies ; « Supprimer définitivement » désactivé tant que le nom exact n'est pas saisi ; Échap ferme sans rien, focus rendu", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    const { utilisateur } = await ouvrirLEspace(serveur);
    const origine = bouton("Supprimer l'espace Projet Atlas");

    await utilisateur.click(origine);
    const boite = screen.getByRole("alertdialog", { name: "Supprimer l'espace Projet Atlas ?" });
    for (const phrase of [
      "2 membres",
      "irréversible",
      "toutes ses pages du serveur, pour tous ses membres",
      "Les invitations en attente cessent de fonctionner.",
      "les copies déjà présentes sur les appareils des membres y restent",
    ]) {
      expect(boite.textContent?.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(document.activeElement).toBe(within(boite).getByRole("button", { name: "Annuler" }));
    const definitif = within(boite).getByRole("button", { name: /Supprimer définitivement/ });
    expect(estDesactive(definitif)).toBe(true);
    await utilisateur.type(within(boite).getByRole("textbox"), "Projet atlas");
    expect(estDesactive(definitif)).toBe(true);

    await utilisateur.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(origine));
    expect(serveur.routesAppelees()).not.toContain(R.supprimer());
  });

  it("F-014-AC11 F-014-AC35 confirmée au clavier, la suppression part, l'espace quitte la liste, « Espace supprimé » est annoncé, sans toucher à l'appareil", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.supprimer(), () => {
      serveur.poser(R.espaces, () => liste200([]));
      return vide204();
    });
    const { utilisateur, session } = await ouvrirLEspace(serveur);
    const etatAvant = session.lireEtat();

    await utilisateur.click(bouton("Supprimer l'espace Projet Atlas"));
    await utilisateur.type(
      screen.getByRole("textbox", { name: /Saisissez le nom exact/ }),
      "Projet Atlas",
    );
    await utilisateur.tab();
    await utilisateur.tab();
    expect(document.activeElement?.textContent).toBe("Supprimer définitivement");
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
    expect(await screen.findByText("Espace supprimé")).toBeTruthy();
    expect(await screen.findByText("Vous n'êtes membre d'aucun espace du serveur.")).toBeTruthy();
    expect(serveur.routesAppelees().filter((route) => route === R.supprimer())).toHaveLength(1);
    expect(session.lireEtat()).toBe(etatAvant);
  });

  it("F-014-AC12 quitter : une alerte qui dit la perte d'accès, puis DELETE de son propre compte ; un 409 dernier-proprietaire est dit sans rien modifier", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.retirer(COMPTE.id), () => enveloppe(409, "dernier-proprietaire"));
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Quitter l'espace Projet Atlas"));
    const boite = screen.getByRole("alertdialog", { name: "Quitter l'espace Projet Atlas ?" });
    expect(boite.textContent).toContain("Vous n'y aurez plus accès");
    expect(boite.textContent).toContain("nouvelle invitation");
    await utilisateur.click(
      within(boite).getByRole("button", { name: "Quitter l'espace Projet Atlas" }),
    );

    expect(
      await screen.findByText(
        "Vous êtes le dernier propriétaire : nommez un autre propriétaire ou supprimez l'espace.",
      ),
    ).toBeTruthy();
    expect(window.location.hash).toBe(ECRAN);
    expect(serveur.routesAppelees()).toContain(R.retirer(COMPTE.id));
  });

  it("F-014-AC12 un lecteur quitte : 204, retour à la liste sans l'espace", async () => {
    const serveur = serveurDeLEspace("lecteur");
    serveur.poser(R.retirer(COMPTE.id), () => {
      serveur.poser(R.espaces, () => liste200([]));
      return vide204();
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Quitter l'espace Projet Atlas"));
    await utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Quitter l'espace Projet Atlas",
      }),
    );

    await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
    expect(await screen.findByText("Vous n'êtes membre d'aucun espace du serveur.")).toBeTruthy();
  });

  it("F-014-AC36 F-014-AC35 dans une boîte d'alerte, Tab et Maj+Tab restent dans la boîte", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    const { utilisateur } = await ouvrirLEspace(serveur);
    await utilisateur.click(bouton("Quitter l'espace Projet Atlas"));
    const boite = screen.getByRole("alertdialog");

    for (let rang = 0; rang < 4; rang += 1) {
      await utilisateur.tab();
      expect(boite.contains(document.activeElement)).toBe(true);
    }
    await utilisateur.tab({ shift: true });
    expect(boite.contains(document.activeElement)).toBe(true);
  });
});

describe("droits : la matrice décide de l'affichage, le serveur de l'action", () => {
  const COMMANDES_VISIBLES = {
    proprietaire: ["Renommer", "Quitter", "Supprimer", "Rôle", "Retirer", "Invitations"],
    editeur: ["Quitter"],
    lecteur: ["Quitter"],
  } as const;

  it.each(["proprietaire", "editeur", "lecteur"] as const)(
    "F-014-AC27 F-014-AC26 rôle %s : chaque commande est rendue ou absente comme la matrice le donne",
    async (role) => {
      const serveur = serveurDeLEspace(role);
      await ouvrirLEspace(serveur);
      const presentes = {
        Renommer: screen.queryByRole("button", { name: /^Renommer l'espace/ }) !== null,
        Quitter: screen.queryByRole("button", { name: /^Quitter l'espace/ }) !== null,
        Supprimer: screen.queryByRole("button", { name: /^Supprimer l'espace/ }) !== null,
        Rôle: screen.queryAllByRole("combobox", { name: /^Rôle de / }).length > 0,
        Retirer: screen.queryAllByRole("button", { name: /^Retirer / }).length > 0,
        Invitations: screen.queryByRole("region", { name: "Invitations en attente" }) !== null,
      };
      expect(
        Object.entries(presentes)
          .filter(([, presente]) => presente)
          .map(([nom]) => nom),
      ).toEqual(COMMANDES_VISIBLES[role]);
      expect(screen.getByText(/^Votre rôle :/).textContent).toContain(
        { proprietaire: "Propriétaire", editeur: "Éditeur", lecteur: "Lecteur" }[role],
      );
      if (role !== "proprietaire") {
        expect(serveur.routesAppelees()).not.toContain(R.invitations);
      }
    },
  );

  it("F-014-AC28 un 403 acces-refuse : le message, le rôle relu, les commandes réappliquées", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.retirer(ID_BOB), () => {
      serveur.poser(R.lire(), () => espace200(espace("lecteur")));
      serveur.poser(R.membres(), () => membres200([membre(COMPTE.id, COMPTE.nom, "lecteur")]));
      return enveloppe(403, "acces-refuse");
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Retirer Bob Durand de l'espace"));
    await utilisateur.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Retirer Bob Durand de l'espace",
      }),
    );

    expect(
      await screen.findByText("Vous n'avez plus le droit de faire cela dans cet espace."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Supprimer l'espace/ })).toBeNull(),
    );
  });

  it("F-014-AC28 un 404 ressource-introuvable : le message, la liste relue, retour à l'écran des espaces", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.renommer(), () => {
      serveur.poser(R.espaces, () => liste200([]));
      return enveloppe(404, "ressource-introuvable");
    });
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.click(bouton("Renommer l'espace Projet Atlas"));
    await utilisateur.keyboard(" bis{Enter}");

    await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
    expect(
      await screen.findByText("Cet espace n'est plus accessible avec ce compte."),
    ).toBeTruthy();
    expect(await screen.findByText("Vous n'êtes membre d'aucun espace du serveur.")).toBeTruthy();
  });

  it("F-014-AC28 l'espace introuvable à l'ouverture renvoie aussi à la liste", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.lire(), () => enveloppe(404, "ressource-introuvable"));
    await ouvrirA(serveur, ECRAN);

    await waitFor(() => expect(window.location.hash).toBe("#/espaces"));
    expect(
      await screen.findByText("Cet espace n'est plus accessible avec ce compte."),
    ).toBeTruthy();
  });

  it("F-014-AC29 pendant une requête, les actions restent visibles mais désactivées, avec leur raison, et aucune seconde requête ne part", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.role(ID_BOB), () => jamais());
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: "Rôle de Bob Durand" }),
      "lecteur",
    );

    const renommer = await waitFor(() => {
      const element = bouton("Renommer l'espace Projet Atlas");
      expect(estDesactive(element)).toBe(true);
      return element;
    });
    expect(descriptionDe(renommer)).toBe("Requête en cours.");
    const choix = screen.getByRole("combobox", { name: "Rôle de Bob Durand" });
    expect(estDesactive(choix)).toBe(true);
    expect(serveur.routesAppelees().filter((route) => route === R.role(ID_BOB))).toHaveLength(1);
  });

  it("F-014-AC31 un succès non conforme au schéma est un échec : « L'opération a échoué. Réessayez. », l'écran reste utilisable", async () => {
    const serveur = serveurDeLEspace("proprietaire");
    serveur.poser(R.role(ID_BOB), () => json(200, { ...BOB_EDITEUR, role: "chef" }));
    const { utilisateur } = await ouvrirLEspace(serveur);

    await utilisateur.selectOptions(
      screen.getByRole("combobox", { name: "Rôle de Bob Durand" }),
      "lecteur",
    );

    expect(await screen.findByText("L'opération a échoué. Réessayez.")).toBeTruthy();
    expect(estDesactive(bouton("Renommer l'espace Projet Atlas"))).toBe(false);
  });

  it("F-014-AC32 au retour de l'onglet, l'espace et ses membres sont relus", async () => {
    const serveur = serveurDeLEspace("lecteur");
    await ouvrirLEspace(serveur);
    const avant = serveur.routesAppelees().filter((route) => route === R.membres()).length;
    serveur.poser(R.membres(), () =>
      membres200([
        membre(COMPTE.id, COMPTE.nom, "lecteur"),
        membre(ID_BOB, "Bob Durand", "proprietaire"),
      ]),
    );

    rendreVisible();

    await waitFor(() =>
      expect(
        serveur.routesAppelees().filter((route) => route === R.membres()).length,
      ).toBeGreaterThan(avant),
    );
    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Membres" }).textContent).toContain("Propriétaire"),
    );
  });
});
