import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { creerPageNommee, ouvrirCoquille } from "./aides-coquille.tsx";
import {
  basesDePage,
  contenuEnregistre,
  ecrire,
  editeurAffiche,
  idEspaceLocal,
  idPageCourante,
  retenirLesBasesDePage,
  zoneDeSaisie,
  zoneDeSaisiePresente,
} from "./aides-page.tsx";

const CONTENU_RICHE =
  "<h1>Titre</h1><p>Texte</p><ul><li><p>un</p><ul><li><p>deux</p></li></ul></li></ul>" +
  "<ol><li><p>premier</p></li></ol>";
const CONTENU_RICHE_LU =
  '<heading level="1">Titre</heading><paragraph>Texte</paragraph>' +
  "<bulletlist><listitem><paragraph>un</paragraph>" +
  "<bulletlist><listitem><paragraph>deux</paragraph></listitem></bulletlist></listitem></bulletlist>" +
  '<orderedlist start="1"><listitem><paragraph>premier</paragraph></listitem></orderedlist>';

function zonePrincipale(): HTMLElement {
  return screen.getByRole("main");
}

/** Ce que l'écran rend du contenu : la balise et le texte de chaque bloc, dans l'ordre. */
function blocsAffiches(zone: HTMLElement): string[] {
  return [...zone.querySelectorAll("h1, h2, h3, p")].map(
    (bloc) => `${cheminDe(bloc, zone)}:${bloc.textContent ?? ""}`,
  );
}

function cheminDe(bloc: Element, zone: HTMLElement): string {
  const noms: string[] = [];
  for (let courant: Element | null = bloc; courant !== null && courant !== zone;) {
    noms.unshift(courant.tagName.toLowerCase());
    courant = courant.parentElement;
  }
  return noms.join(">");
}

describe("page affichée", () => {
  it("F-003-AC1 une page sélectionnée affiche sous son titre l'éditeur de cette page, enregistré dans la base de l'espace et de la page", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Carnet");

    const zone = await zoneDeSaisie();

    const principale = zonePrincipale();
    const titre = within(principale).getByRole("heading", { level: 1 });
    expect(titre.textContent).toBe("Carnet");
    expect(titre.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(principale.contains(zone)).toBe(true);
    await waitFor(async () =>
      expect(await basesDePage()).toEqual([
        `notionlike:page:${await idEspaceLocal()}:${idPageCourante()}`,
      ]),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("F-003-AC2 une page vide affiche un éditeur prêt à la saisie et un texte d'invite hors du contenu, qui disparaît à la première saisie", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Vide");
    const zone = await zoneDeSaisie();

    const invite = within(zonePrincipale()).getByText(/Écrivez ici/);
    expect(zone.contains(invite)).toBe(false);
    expect(zone.textContent).toBe("");
    expect(zone.getAttribute("contenteditable")).toBe("true");
    expect(await contenuEnregistre(await idEspaceLocal(), idPageCourante())).toBe("");

    await ecrire("Bonjour");

    expect(within(zonePrincipale()).queryByText(/Écrivez ici/)).toBeNull();
    expect(zone.textContent).toBe("Bonjour");
  });

  it("F-003-AC3 F-003-AC25 le contenu écrit par l'éditeur (quatre types de blocs, liste imbriquée) se retrouve tel quel après rechargement", async () => {
    const premiere = await ouvrirCoquille();
    await creerPageNommee(premiere.utilisateur, "Durable");
    await ecrire(CONTENU_RICHE);
    const affiche = blocsAffiches(await zoneDeSaisie());
    const idEspace = await idEspaceLocal();
    const idPage = idPageCourante();
    cleanup();

    expect(await contenuEnregistre(idEspace, idPage)).toBe(CONTENU_RICHE_LU);
    await ouvrirCoquille();

    const zone = await zoneDeSaisie();
    expect(blocsAffiches(zone)).toEqual(affiche);
    expect(affiche).toEqual([
      "h1:Titre",
      "p:Texte",
      "ul>li>p:un",
      "ul>li>ul>li>p:deux",
      "ol>li>p:premier",
    ]);
    expect(await contenuEnregistre(idEspace, idPage)).toBe(CONTENU_RICHE_LU);
  });

  it("F-003-AC4 tant que le document de page n'est pas relu : état de chargement, aucune zone de saisie ; puis l'éditeur", async () => {
    const { utilisateur } = await ouvrirCoquille();
    const retenue = retenirLesBasesDePage();
    await creerPageNommee(utilisateur, "Lente");
    await new Promise((resoudre) => setTimeout(resoudre, 30));

    expect(within(zonePrincipale()).getByRole("status").textContent).toBe("Chargement…");
    expect(zoneDeSaisiePresente()).toBeNull();
    expect(within(zonePrincipale()).getByRole("heading", { level: 1 }).textContent).toBe("Lente");

    retenue.repondre();

    await zoneDeSaisie();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("F-003-AC5 changer de page aussitôt après une modification : la nouvelle page s'affiche seule, la modification est conservée, un seul éditeur", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "Alpha");
    const idEspace = await idEspaceLocal();
    const idAlpha = idPageCourante();
    await creerPageNommee(utilisateur, "Bêta");
    const idBeta = idPageCourante();
    await utilisateur.click(screen.getByRole("link", { name: "Alpha" }));
    await waitFor(() => expect(idPageCourante()).toBe(idAlpha));
    const editeurAlpha = await editeurAffiche();

    await ecrire("contenu d'Alpha");
    await utilisateur.click(screen.getByRole("link", { name: "Bêta" }));
    await waitFor(() => expect(idPageCourante()).toBe(idBeta));

    await waitFor(async () => expect(await editeurAffiche()).not.toBe(editeurAlpha));
    expect(editeurAlpha.isDestroyed).toBe(true);
    expect(screen.getAllByRole("textbox", { name: "Contenu de la page" })).toHaveLength(1);
    expect((await zoneDeSaisie()).textContent).toBe("");
    expect(zonePrincipale().textContent).not.toContain("contenu d'Alpha");
    expect(await contenuEnregistre(idEspace, idAlpha)).toBe(
      "<paragraph>contenu d'Alpha</paragraph>",
    );

    await ecrire("contenu de Bêta");
    await utilisateur.click(screen.getByRole("link", { name: "Alpha" }));
    await waitFor(() => expect(idPageCourante()).toBe(idAlpha));

    await waitFor(async () => expect((await zoneDeSaisie()).textContent).toBe("contenu d'Alpha"));
    expect(await contenuEnregistre(idEspace, idAlpha)).toBe(
      "<paragraph>contenu d'Alpha</paragraph>",
    );
    expect(await contenuEnregistre(idEspace, idBeta)).toBe(
      "<paragraph>contenu de Bêta</paragraph>",
    );
  });

  it("F-003-AC6 mettre la page affichée à la corbeille retire l'éditeur, sans effacer ni modifier son document ni sa base", async () => {
    const { utilisateur } = await ouvrirCoquille();
    await creerPageNommee(utilisateur, "À jeter");
    const idEspace = await idEspaceLocal();
    const idPage = idPageCourante();
    await ecrire("gardé pour la restauration");
    const editeur = await editeurAffiche();

    await utilisateur.click(
      screen.getByRole("button", { name: "Mettre « À jeter » à la corbeille" }),
    );

    await waitFor(() => expect(zoneDeSaisiePresente()).toBeNull());
    expect(editeur.isDestroyed).toBe(true);
    expect(await basesDePage()).toEqual([`notionlike:page:${idEspace}:${idPage}`]);
    expect(await contenuEnregistre(idEspace, idPage)).toBe(
      "<paragraph>gardé pour la restauration</paragraph>",
    );
  });
});
