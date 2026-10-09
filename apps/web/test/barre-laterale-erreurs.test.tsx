import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  activerActionDeRangee,
  atteindreActionDeRangee,
  commandesDuMenu,
  creerPageNommee,
  docDe,
  etatEncode,
  miseAJourDUneAutreReplique,
  ouvrirCoquille,
} from "./aides-coquille.tsx";

const CHAMP_TITRE = { name: "Titre de la page" };
const CODES = /page-introuvable|page-a-la-corbeille|titre-trop-long|ErreurDocument|[0-9a-f]{8}-/;

describe("barre latérale : refus", () => {
  it("F-002-AC14 un titre de 201 caractères est refusé : message qui cite la limite, texte conservé, titre inchangé", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Titre court");
    const avant = etatEncode(session);
    const tropLong = "x".repeat(201);
    await activerActionDeRangee(utilisateur, "renommer", "Titre court");
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);

    fireEvent.change(champ, { target: { value: tropLong } });
    await utilisateur.keyboard("{Enter}");

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("200");
    expect(alerte.textContent).not.toMatch(CODES);
    expect(screen.getByRole<HTMLInputElement>("textbox", CHAMP_TITRE).value).toBe(tropLong);
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(champ.getAttribute("aria-describedby") ?? "")).toBe(alerte);
    expect(etatEncode(session)).toEqual(avant);
    expect(await commandesDuMenu("Titre court")).toContain("Mettre à la corbeille");

    fireEvent.change(champ, { target: { value: "y".repeat(200) } });
    await utilisateur.keyboard("{Enter}");

    expect(await screen.findByRole("link", { name: "y".repeat(200) })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
  });

  it("F-002-AC14 un titre trop long validé par la sortie du champ est refusé de la même façon", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Titre court");
    const avant = etatEncode(session);
    await activerActionDeRangee(utilisateur, "renommer", "Titre court");
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);

    fireEvent.change(champ, { target: { value: "x".repeat(201) } });
    await utilisateur.tab();

    expect((await screen.findByRole("alert")).textContent).toContain("200");
    expect(screen.getByRole<HTMLInputElement>("textbox", CHAMP_TITRE).value).toBe("x".repeat(201));
    expect(etatEncode(session)).toEqual(avant);
  });

  it("F-002-AC15 page mise à la corbeille par une mise à jour reçue pendant la saisie : message français, arbre conforme, barre utilisable", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Convoitée");
    await creerPageNommee(utilisateur, "Voisine");
    await activerActionDeRangee(utilisateur, "renommer", "Convoitée");
    const champ = await screen.findByRole<HTMLInputElement>("textbox", CHAMP_TITRE);
    fireEvent.change(champ, { target: { value: "Trop tard" } });
    const miseAJour = miseAJourDUneAutreReplique(session, (espace) => {
      espace.mettreALaCorbeille(espace.lire().racines[0]?.id ?? "");
    });

    // La mise à jour arrive entre le dernier rendu et la validation : le champ est encore là.
    act(() => {
      Y.applyUpdate(docDe(session), miseAJour);
      fireEvent.keyDown(champ, { key: "Enter" });
    });

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("corbeille");
    expect(alerte.textContent).not.toMatch(CODES);
    expect(screen.queryByRole("textbox", { name: "Titre de la page" })).toBeNull();
    expect(screen.getAllByRole("link").map((lien) => lien.textContent)).toEqual(["Voisine"]);

    await creerPageNommee(utilisateur, "Encore utilisable");

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getAllByRole("link").map((lien) => lien.textContent)).toEqual([
      "Voisine",
      "Encore utilisable",
    ]);
  });

  it("F-002-AC15 mise à la corbeille refusée parce que la page a disparu entre-temps : message, arbre conforme", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Déjà partie");
    const corbeille = await atteindreActionDeRangee("mettre-a-la-corbeille", "Déjà partie");
    const miseAJour = miseAJourDUneAutreReplique(session, (espace) => {
      espace.mettreALaCorbeille(espace.lire().racines[0]?.id ?? "");
    });

    act(() => {
      Y.applyUpdate(docDe(session), miseAJour);
      fireEvent.click(corbeille);
    });

    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent).toContain("corbeille");
    expect(alerte.textContent).not.toMatch(CODES);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByRole("button", { name: "Nouvelle page" })).toBeDefined();
  });
});
