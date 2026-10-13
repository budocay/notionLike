// Pages ouvertes par l'onglet : changement de page (F-003-AC5), mise à la corbeille (F-003-AC6),
// identifiants refusés (F-003-AC36), une façade au plus (F-003-AC33).
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type * as Y from "yjs";

import { creerPagesOuvertes } from "../src/page/pages-ouvertes.ts";
import type { SessionPage } from "../src/page/session-page.ts";
import { ouvrirCoquille } from "./aides-coquille.tsx";
import { bloc, contenuLu, fragmentBrut, observateursDuDocument } from "./aides-facade-page.ts";
import { FORMES_REFUSEES, UUID_AVEC_LETTRES } from "./aides-identifiants.ts";
import { contenuEnregistre, creerUnePage, ouvrirUnePage, selectionner } from "./aides-page.tsx";
import {
  enregistrements,
  ESPACE_A,
  laisserIndexedDbTravailler,
  nomsDesBases,
  suivreLesConnexionsTenues,
} from "./aides-persistance.ts";
import { ecouterLesErreursNonInterceptees } from "./aides-reprise.ts";
import {
  attendrePhase,
  nomDeLaBaseDePage,
  PAGE_A,
  PAGE_B,
  rendreLaSession,
} from "./aides-session-page.tsx";
import {
  attendreLaZoneDeSaisie,
  chercherLaZoneDeSaisie,
  entrerDansLEditeur,
  taper,
} from "./edition/aides-edition.tsx";

const BASE_DE_PAGE = /^notionlike:page:/;

/** Le document que la session prête lie à l'éditeur. */
function documentDe(session: SessionPage): Y.Doc {
  const etat = session.lireEtat();
  if (etat.phase !== "pret" || etat.contenu.doc === null) {
    throw new Error("La session de page n'est pas prête.");
  }
  return etat.contenu.doc;
}

function operationsDe(coquille: Awaited<ReturnType<typeof ouvrirCoquille>>) {
  const etat = coquille.session.lireEtat();
  if (etat.phase !== "pret") {
    throw new Error("L'espace n'est pas ouvert.");
  }
  return etat.operations;
}

describe("changement de page", () => {
  it("F-003-AC5 une page modifiée puis quittée aussitôt garde sa modification, relue dans un document vierge, et la page suivante n'affiche jamais le contenu de la précédente", async () => {
    const premiere = await ouvrirUnePage("Première");
    const seconde = await creerUnePage(premiere, "Seconde");
    await selectionner(premiere, "Première");
    await attendreLaZoneDeSaisie();
    entrerDansLEditeur();
    taper("écrit dans la première");

    await selectionner(premiere, "Seconde");
    const affichesSousLaSeconde: (string | null | undefined)[] = [
      chercherLaZoneDeSaisie()?.textContent,
    ];
    const editeur = await attendreLaZoneDeSaisie();
    affichesSousLaSeconde.push(editeur.textContent);
    await act(() => laisserIndexedDbTravailler());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Seconde");
    expect(affichesSousLaSeconde.filter((texte) => texte?.includes("première"))).toEqual([]);
    expect(editeur.textContent).toBe("");
    expect(await contenuEnregistre(premiere.idEspace, premiere.idPage)).toBe(
      "<paragraph>écrit dans la première</paragraph>",
    );
    expect(await contenuEnregistre(seconde.idEspace, seconde.idPage)).toBe("");
  });

  it("F-003-AC5 F-003-AC33 au plus un document de page est ouvert par onglet : ouvrir une page ferme la persistance et la façade de la précédente, et la fermeture ne laisse rien", async () => {
    const connexions = suivreLesConnexionsTenues();
    const pages = creerPagesOuvertes();
    const basesTenues = (): string[] =>
      connexions.map((connexion) => connexion.name).filter((nom) => BASE_DE_PAGE.test(nom));

    const premiere = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(premiere, "pret");
    const docDeLaPremiere = documentDe(premiere);
    const pendantLaPremiere = basesTenues();
    const seconde = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_B });
    await attendrePhase(seconde, "pret");
    await laisserIndexedDbTravailler();
    const pendantLaSeconde = basesTenues();
    const observateursDeLaSeconde = observateursDuDocument(documentDe(seconde));
    const docDeLaSeconde = documentDe(seconde);
    pages.fermer();
    await laisserIndexedDbTravailler();

    expect(pendantLaPremiere).toEqual([nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_A })]);
    expect(pendantLaSeconde).toEqual([nomDeLaBaseDePage({ idEspace: ESPACE_A, idPage: PAGE_B })]);
    expect(docDeLaPremiere.isDestroyed).toBe(true);
    expect(observateursDuDocument(docDeLaPremiere)).toBe(0);
    expect(observateursDeLaSeconde).toBeGreaterThan(0);
    expect(observateursDuDocument(docDeLaSeconde)).toBe(0);
    expect(basesTenues()).toEqual([]);
  });

  it("F-003-AC33 monter puis démonter la page plusieurs fois, comme le mode strict, ne laisse ouverte qu'une façade, puis aucune", async () => {
    const pages = creerPagesOuvertes();
    const docs: Y.Doc[] = [];
    for (let passage = 0; passage < 3; passage += 1) {
      const session = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
      await attendrePhase(session, "pret");
      docs.push(documentDe(session));
      session.fermer();
      session.fermer();
    }
    await laisserIndexedDbTravailler();

    expect(docs.map((doc) => observateursDuDocument(doc))).toEqual([0, 0, 0]);
    expect(docs.map((doc) => doc.isDestroyed)).toEqual([true, true, true]);
    pages.fermer();
  });
});

describe("page mise à la corbeille", () => {
  it("F-003-AC6 la page affichée mise à la corbeille perd son éditeur, sa persistance est fermée, et ni son document ni sa base ne sont effacés ou modifiés", async () => {
    const connexions = suivreLesConnexionsTenues();
    const page = await ouvrirUnePage("À jeter");
    entrerDansLEditeur();
    taper("contenu à garder");
    await act(() => laisserIndexedDbTravailler());
    const base = nomDeLaBaseDePage(page);
    const avant = await enregistrements(base);

    act(() => operationsDe(page).mettreALaCorbeille(page.idPage));
    await act(() => laisserIndexedDbTravailler());

    expect(chercherLaZoneDeSaisie()).toBeNull();
    expect(connexions.map((connexion) => connexion.name).filter((nom) => nom === base)).toEqual([]);
    expect(await nomsDesBases()).toContain(base);
    expect(await enregistrements(base)).toEqual(avant);
    expect(avant.length).toBeGreaterThan(0);
    expect(await contenuEnregistre(page.idEspace, page.idPage)).toBe(
      "<paragraph>contenu à garder</paragraph>",
    );
  });
});

describe("identifiants d'un document de page", () => {
  const AVEC_DEUX_POINTS = FORMES_REFUSEES.find(([cas]) => cas === "qui contient « : »")?.[1] ?? "";
  const EN_MAJUSCULES = UUID_AVEC_LETTRES.toUpperCase();

  it.each([
    ["un identifiant de page qui contient « : »", { idEspace: ESPACE_A, idPage: AVEC_DEUX_POINTS }],
    ["un identifiant de page en majuscules", { idEspace: ESPACE_A, idPage: EN_MAJUSCULES }],
    ["un identifiant d'espace en majuscules", { idEspace: EN_MAJUSCULES, idPage: PAGE_A }],
    ["un identifiant d'espace qui contient « : »", { idEspace: AVEC_DEUX_POINTS, idPage: PAGE_A }],
  ])(
    "F-003-AC36 sous %s : « Page introuvable », ni base, ni façade, ni éditeur, l'identifiant écrit nulle part, la barre latérale utilisable, aucune erreur non interceptée",
    async (_cas, designation) => {
      const relever = ecouterLesErreursNonInterceptees();
      const coquille = await ouvrirCoquille();
      const pages = creerPagesOuvertes();

      const session = pages.ouvrir(designation);
      rendreLaSession(session, PAGE_A);
      await act(() => laisserIndexedDbTravailler());

      const refuse = designation.idPage === PAGE_A ? designation.idEspace : designation.idPage;
      expect(refuse).toMatch(/:|[A-F]/);
      expect(session.lireEtat().phase).toBe("introuvable");
      const titres = screen.getAllByRole("heading", { level: 1 }).map((titre) => titre.textContent);
      expect(titres).toContain("Page introuvable");
      expect(chercherLaZoneDeSaisie()).toBeNull();
      expect((await nomsDesBases()).filter((nom) => BASE_DE_PAGE.test(nom))).toEqual([]);
      expect(document.body.textContent).not.toContain(refuse);
      expect(document.body.innerHTML).not.toContain(refuse);
      await creerUnePage(coquille, "Encore utilisable");
      expect(screen.getByRole("link", { name: "Encore utilisable" })).toBeDefined();
      pages.fermer();
      expect(relever()).toEqual([]);
    },
  );

  it("F-003-AC36 F-003-AC1 deux identifiants canoniques ouvrent la base de la page, que le module de persistance nomme seul", async () => {
    const pages = creerPagesOuvertes();

    const session = pages.ouvrir({ idEspace: ESPACE_A, idPage: PAGE_A });
    await attendrePhase(session, "pret");
    const doc = documentDe(session);
    fragmentBrut(doc).insert(0, [bloc("paragraph", "x")]);
    await laisserIndexedDbTravailler();

    expect((await nomsDesBases()).filter((nom) => BASE_DE_PAGE.test(nom))).toEqual([
      `notionlike:page:${ESPACE_A}:${PAGE_A}`,
    ]);
    expect(contenuLu(doc)).toBe("<paragraph>x</paragraph>");
    pages.fermer();
  });

  it("F-003-AC1 l'application ouvre la page sous l'espace que l'appareil a retenu et sous l'identifiant de la page sélectionnée", async () => {
    const page = await ouvrirUnePage("Carnet");

    expect((await nomsDesBases()).filter((nom) => BASE_DE_PAGE.test(nom))).toEqual([
      nomDeLaBaseDePage(page),
    ]);
    expect(await nomsDesBases()).toContain(`notionlike:espace:${page.idEspace}`);
  });
});
