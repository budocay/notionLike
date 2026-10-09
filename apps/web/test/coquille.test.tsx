import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import pageHote from "../index.html?raw";
import styles from "../src/styles.css?raw";
import {
  boutonNouvellePage,
  creerPageNommee,
  nomsDesBases,
  ouvrirCoquille,
  recevoir,
  rendreApplication,
  titresParFratrie,
} from "./aides-coquille.tsx";

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

function titresDesListes(): string[][] {
  return titresParFratrie(barreLaterale());
}

describe("coquille", () => {
  it("F-002-AC1 premier lancement : espace local créé, barre latérale sans page, invitation", async () => {
    await ouvrirCoquille();

    const barre = barreLaterale();
    expect(within(barre).getByRole("button", { name: "Nouvelle page" })).toBeDefined();
    expect(within(barre).queryAllByRole("link")).toEqual([]);
    expect(within(barre).queryAllByRole("listitem")).toEqual([]);
    expect(screen.getByRole("main").textContent).toContain("Créez-en une");
    expect(screen.queryByRole("alert")).toBeNull();
    const bases = await nomsDesBases();
    expect(bases).toHaveLength(2);
    expect(bases[0]).toBe("notionlike:appareil");
    expect(bases[1]).toMatch(/^notionlike:espace:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  });

  it("F-002-AC3 affiche un état de chargement sans action, puis l'arborescence", async () => {
    rendreApplication();

    expect(screen.getByRole("status").textContent).toBe("Chargement…");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();

    await boutonNouvellePage();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("F-002-AC5 « Nouvelle page » crée à la racine, en dernière position, une page « Sans titre »", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Première");

    await utilisateur.click(await boutonNouvellePage());
    await utilisateur.keyboard("{Escape}");

    await waitFor(() => expect(titresDesListes()).toEqual([["Première", "Sans titre"]]));
  });

  it("F-002-AC2 une seconde session rouvre le même espace : pages, titres, parents, ordre, sans la corbeille", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Projets");
    await creerPageNommee(utilisateur, "Jetée");
    await creerPageNommee(utilisateur, "Notes");
    await utilisateur.click(
      screen.getByRole("button", { name: "Ajouter une sous-page à « Projets »" }),
    );
    await utilisateur.keyboard("Feuille de route{Enter}");
    await utilisateur.click(
      screen.getByRole("button", { name: "Mettre « Jetée » à la corbeille" }),
    );
    const attendu = [["Projets", "Notes"], ["Feuille de route"]];
    await waitFor(() => expect(titresDesListes()).toEqual(attendu));
    const basesAvant = await nomsDesBases();
    cleanup();

    await ouvrirCoquille();

    await waitFor(() => expect(titresDesListes()).toEqual(attendu));
    expect(screen.queryByRole("link", { name: "Jetée" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(await nomsDesBases()).toEqual(basesAvant);
  });

  it("F-002-AC9 une mise à jour reçue met la barre latérale à jour sans rechargement", async () => {
    const { session, utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Ici");

    recevoir(session, (espace) => {
      const parent = espace.creerPage("Venue d'ailleurs");
      espace.creerPage("Sa fille", { parent });
    });

    expect(titresDesListes()).toEqual([["Ici", "Venue d'ailleurs"], ["Sa fille"]]);

    recevoir(session, (espace) => {
      const ici = espace.lire().racines[0];
      espace.renommerPage(ici?.id ?? "", "Renommée ailleurs");
    });

    expect(titresDesListes()[0]).toEqual(["Renommée ailleurs", "Venue d'ailleurs"]);
  });

  it("F-002-AC18 un titre fait de balisage s'affiche comme du texte dans la barre latérale", async () => {
    const { session } = await ouvrirCoquille();
    const titre = '<b>gras</b><script>window.piege = 1</script><img src=x onerror="piege()">';

    recevoir(session, (espace) => void espace.creerPage(titre));

    const barre = barreLaterale();
    expect(within(barre).getByRole("link").textContent).toBe(titre);
    expect(barre.querySelector("b, script, img")).toBeNull();
    expect("piege" in window).toBe(false);
    expect(within(barre).getByRole("button", { name: `Renommer « ${titre} »` }).tagName).toBe(
      "BUTTON",
    );
  });

  it("F-002-AC19 ni la page hôte ni les styles ne citent d'adresse externe", () => {
    const adresseExterne = /(https?:)?\/\/[a-z0-9]|@import|url\(/i;

    expect(pageHote).toContain('<div id="racine"></div>');
    expect(pageHote).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(pageHote.match(/(src|href)=/g)).toHaveLength(1);
    expect(pageHote).not.toMatch(adresseExterne);
    expect(styles).not.toMatch(adresseExterne);
  });

  it("F-002-AC1 l'entrée monte l'application dans l'élément « racine » de la page hôte", async () => {
    const racine = document.createElement("div");
    racine.id = "racine";
    document.body.append(racine);

    await import("../src/main.tsx");

    const bouton = await boutonNouvellePage();
    expect(racine.contains(bouton)).toBe(true);
    expect(within(racine).getByRole("main")).toBeDefined();
    racine.remove();
  });
});
