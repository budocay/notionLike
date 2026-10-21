// Barre de blocs flottante et invite du bloc vide (F-003-AC8, AC16, AC37, AC40 à AC43). Depuis
// F-005, le menu slash est livré : la barre ne s'affiche plus dans un bloc vide, l'invite annonce le
// menu, et un bloc vide reçoit son type par le menu (F-005 H11).
import { TABLE_DES_VERSIONS_PAGE } from "@notionlike/document";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { INVITE_DU_BLOC_VIDE } from "../../src/interface/messages.ts";
import { RACCOURCIS } from "../../src/interface/raccourcis.ts";
import { contenuLu } from "../aides-facade-page.ts";
import {
  barreDeBlocs,
  commande,
  entrerDansLEditeur,
  laisserLeMenuSuivre,
  menuSlash,
  monterLEditeur,
  type NomDeCommande,
  NOMS_DES_COMMANDES,
  NOMS_DES_COMMANDES_DE_DEPLACEMENT,
  NOMS_DES_COMMANDES_DE_MARQUE,
  placerLeCurseurApres,
  presser,
  selectionnerLeBloc,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

const CONTENU_PAR_COMMANDE: Readonly<Record<NomDeCommande, string>> = {
  Paragraphe: "<paragraph>texte</paragraph>",
  "Titre 1": '<heading level="1">texte</heading>',
  "Titre 2": '<heading level="2">texte</heading>',
  "Titre 3": '<heading level="3">texte</heading>',
  "Liste à puces": "<bulletlist><listitem><paragraph>texte</paragraph></listitem></bulletlist>",
  "Liste numérotée":
    '<orderedlist start="1"><listitem><paragraph>texte</paragraph></listitem></orderedlist>',
  "Bloc code": "<codeblock>texte</codeblock>",
};

function commandesMarquees(): string[] {
  return NOMS_DES_COMMANDES.filter((nom) => commande(nom).getAttribute("aria-pressed") === "true");
}

/** Atteint une commande au clavier seul, depuis la zone de saisie, et l'active. */
async function activerAuClavier(nom: NomDeCommande): Promise<void> {
  const utilisateur = userEvent.setup();
  presser(RACCOURCIS.barreDeBlocs.touche, { altKey: true });
  for (let pas = 0; pas < NOMS_DES_COMMANDES.indexOf(nom); pas += 1) {
    await utilisateur.keyboard("{ArrowRight}");
  }
  expect(document.activeElement).toBe(commande(nom));
  await utilisateur.keyboard("{Enter}");
}

/** Donne ce type au bloc vide du curseur par le menu slash, au clavier seul (F-005-AC12). */
async function activerParLeMenu(nom: NomDeCommande): Promise<void> {
  taper("/");
  await laisserLeMenuSuivre();
  for (let pas = 0; pas < NOMS_DES_COMMANDES.indexOf(nom); pas += 1) {
    presser("ArrowDown");
  }
  presser("Enter");
  await laisserLeMenuSuivre();
}

describe("barre de blocs flottante", () => {
  it("F-003-AC41 F-003-AC37 F-005-AC1 la barre n'est affichée que tant que l'éditeur a le focus et que la sélection n'est pas vide ; depuis le menu slash, plus dans un bloc vide ; son apparition et sa disparition n'émettent rien et laissent le focus à l'éditeur", () => {
    const { emises } = monterLEditeur();
    const sansFocus = barreDeBlocs();

    entrerDansLEditeur();
    const dansUnBlocVide = barreDeBlocs();
    const emisesParLaBarre = emises.length;
    const focusPendantLAffichage = document.activeElement;
    taper("texte");
    const emisesParLaSaisie = emises.length;
    const curseurDansUnBlocRempli = barreDeBlocs();
    selectionnerLeBloc();
    const selectionEtendue = barreDeBlocs();
    placerLeCurseurApres("texte");
    const selectionRefermee = barreDeBlocs();
    selectionnerLeBloc();
    act(() => zoneDeSaisie().blur());

    expect(sansFocus).toBeNull();
    expect(dansUnBlocVide).toBeNull();
    expect(selectionEtendue?.getAttribute("role")).toBe("toolbar");
    expect(emisesParLaBarre).toBe(0);
    expect(focusPendantLAffichage).toBe(zoneDeSaisie());
    expect(curseurDansUnBlocRempli).toBeNull();
    expect(selectionEtendue).not.toBeNull();
    expect(selectionRefermee).toBeNull();
    expect(barreDeBlocs()).toBeNull();
    expect(emises.length).toBe(emisesParLaSaisie);
  });

  it("F-003-AC41 F-003-AC16 F-028-AC27 F-006-AC18 F-005-AC21 la barre porte les sept commandes de type, Bloc code compris, puis, depuis F-028, Gras, Italique et Lien, et depuis F-006 Monter le bloc et Descendre le bloc, chacune un bouton nommé en français avec un état « activé » lisible, hors de l'ordre de tabulation", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();

    const boutons = [...(barreDeBlocs()?.querySelectorAll("button") ?? [])];

    expect(boutons.map((bouton) => bouton.getAttribute("aria-label"))).toEqual([
      ...NOMS_DES_COMMANDES,
      ...NOMS_DES_COMMANDES_DE_MARQUE,
      ...NOMS_DES_COMMANDES_DE_DEPLACEMENT,
    ]);
    expect(boutons.map((bouton) => bouton.getAttribute("aria-pressed"))).toEqual([
      "true",
      // F-005 : Bloc code.
      "false",
      // F-006 : Monter le bloc, Descendre le bloc.
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(boutons.map((bouton) => bouton.tabIndex)).toEqual(boutons.map(() => -1));
    expect(barreDeBlocs()?.getAttribute("aria-label")).toBe("Type de bloc");
  });

  it.each(NOMS_DES_COMMANDES)(
    "F-003-AC8 la commande « %s » donne son type au bloc courant en conservant son texte, et elle seule est marquée",
    (nom) => {
      const { doc } = monterLEditeur();
      entrerDansLEditeur();
      taper("texte");
      selectionnerLeBloc();

      act(() => commande(nom).click());

      expect(contenuLu(doc).toLowerCase()).toBe(CONTENU_PAR_COMMANDE[nom]);
      expect(commandesMarquees()).toEqual([nom]);
    },
  );

  it("F-003-AC8 la commande marquée suit le bloc où se trouve le curseur", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("# Titre");
    presser("Enter");
    taper("texte");
    selectionnerLeBloc();
    const dansLeParagraphe = commandesMarquees();
    placerLeCurseurApres("texte");
    presser("Enter");
    taper("- puce");
    selectionnerLeBloc();
    const dansLaListe = commandesMarquees();
    placerLeCurseurApres("Titre");
    selectionnerLeBloc();

    expect(dansLeParagraphe).toEqual(["Paragraphe"]);
    expect(dansLaListe).toEqual(["Liste à puces"]);
    expect(commandesMarquees()).toEqual(["Titre 1"]);
  });
});

describe("barre de blocs au clavier", () => {
  it("F-003-AC42 F-003-AC16 Alt+F10 mène à la première commande, les flèches parcourent les commandes, Échap rend le focus à l'éditeur, sélection conservée", async () => {
    const utilisateur = userEvent.setup();
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();
    const selectionAvant = window.getSelection()?.toString();

    const traitee = presser(RACCOURCIS.barreDeBlocs.touche, { altKey: true });
    const premiere = document.activeElement;
    await utilisateur.keyboard("{ArrowRight}");
    const suivante = document.activeElement;
    await utilisateur.keyboard("{ArrowLeft}{ArrowLeft}");
    const enBoucle = document.activeElement;
    await utilisateur.keyboard("{Escape}");

    expect(RACCOURCIS.barreDeBlocs).toEqual({ touche: "F10", modificateurs: ["Alt"] });
    expect(traitee).toBe(true);
    expect(premiere).toBe(commande("Paragraphe"));
    expect(suivante).toBe(commande("Titre 1"));
    // F-006 : la dernière commande est « Descendre le bloc ».
    expect(enBoucle).toBe(commande("Descendre le bloc"));
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(barreDeBlocs()).not.toBeNull();
    expect(window.getSelection()?.toString()).toBe(selectionAvant);
    expect(selectionAvant).toBe("texte");
  });

  it("F-003-AC42 l'activation d'une commande au clavier applique le type puis rend le focus à l'éditeur", async () => {
    const { doc } = monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();

    await activerAuClavier("Titre 2");

    expect(contenuLu(doc)).toBe('<heading level="2">texte</heading>');
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-003-AC42 quand la barre n'est pas affichée, Alt+F10 ne modifie rien, n'émet rien et laisse le focus où il est", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    const emisesAvant = emises.length;
    const avant = contenuLu(doc);

    const traitee = presser(RACCOURCIS.barreDeBlocs.touche, { altKey: true });

    expect(barreDeBlocs()).toBeNull();
    expect(traitee).toBe(false);
    expect(emises.length).toBe(emisesAvant);
    expect(contenuLu(doc)).toBe(avant);
    expect(document.activeElement).toBe(zoneDeSaisie());
  });

  it("F-003-AC42 F10 sans Alt, et Alt avec une autre touche, ne mènent pas à la barre", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("texte");
    selectionnerLeBloc();

    presser("F10");
    const apresF10Seule = document.activeElement;
    presser("F9", { altKey: true });

    expect(apresF10Seule).toBe(zoneDeSaisie());
    expect(document.activeElement).toBe(zoneDeSaisie());
    expect(barreDeBlocs()).not.toBeNull();
  });
});

// Les commandes qui donnent chaque type de bloc de la table des versions. Un type de bloc ajouté à
// la table sans commande ici fait échouer l'énumération.
const COMMANDES_PAR_TYPE_DE_BLOC: Readonly<Record<string, readonly NomDeCommande[]>> = {
  bulletList: ["Liste à puces"],
  // F-005.
  codeBlock: ["Bloc code"],
  heading: ["Titre 1", "Titre 2", "Titre 3"],
  orderedList: ["Liste numérotée"],
  paragraph: ["Paragraphe"],
};
// Nœuds de la table qui ne sont pas des blocs que l'on choisit : la racine, le texte, et l'élément
// de liste, qui n'existe que dans une liste.
const NOEUDS_SANS_COMMANDE = ["doc", "listItem", "text"];

describe("toujours un moyen de changer de type", () => {
  it("F-003-AC43 chaque type de bloc de la dernière ligne de la table des versions a ses commandes, et chaque commande de la barre donne l'un d'eux", () => {
    const noeuds = Object.keys(TABLE_DES_VERSIONS_PAGE.at(-1)?.noeuds ?? {});

    expect(noeuds.filter((noeud) => !NOEUDS_SANS_COMMANDE.includes(noeud)).sort()).toEqual(
      Object.keys(COMMANDES_PAR_TYPE_DE_BLOC).sort(),
    );
    expect(Object.values(COMMANDES_PAR_TYPE_DE_BLOC).flat().sort()).toEqual(
      [...NOMS_DES_COMMANDES].sort(),
    );
  });

  it.each(Object.values(COMMANDES_PAR_TYPE_DE_BLOC).flat())(
    "F-003-AC43 F-005-AC12 « %s » se donne au clavier seul à un bloc vide, par le menu slash, puis à un bloc rempli, par la barre, sans événement de pointeur",
    async (nom) => {
      const { doc } = monterLEditeur();
      const pointeurs: string[] = [];
      const noter = (evenement: Event): void => void pointeurs.push(evenement.type);
      const types = ["pointerdown", "mousedown", "click", "touchstart"];
      types.forEach((type) => document.addEventListener(type, noter, true));
      entrerDansLEditeur();

      await activerParLeMenu(nom);
      const depuisUnBlocVide = contenuLu(doc).toLowerCase();
      taper("texte");
      const rempli = contenuLu(doc).toLowerCase();
      // Le bloc rempli repart d'un autre type que celui visé, pour que la commande ait un effet.
      selectionnerLeBloc();
      await activerAuClavier(nom === "Paragraphe" ? "Titre 1" : "Paragraphe");
      selectionnerLeBloc();
      await activerAuClavier(nom);
      // Le clic que le navigateur déduit d'Entrée sur un bouton n'est pas un événement de pointeur.
      const pointeursReels = pointeurs.filter((type) => type !== "click");
      types.forEach((type) => document.removeEventListener(type, noter, true));

      // Le `/` saisi a inscrit le paragraphe ; la commande le retire et donne le type (F-005-AC16).
      expect(depuisUnBlocVide).toBe(CONTENU_PAR_COMMANDE[nom].replace("texte", ""));
      expect(rempli).toBe(CONTENU_PAR_COMMANDE[nom]);
      expect(contenuLu(doc).toLowerCase()).toBe(CONTENU_PAR_COMMANDE[nom]);
      expect(pointeursReels).toEqual([]);
    },
  );
});

describe("invite du bloc vide", () => {
  it("F-003-AC40 l'invite « Écris, ou tape / pour insérer un bloc » est affichée dans le bloc vide, hors du contenu lu, sans mise à jour, et disparaît au premier caractère saisi", () => {
    const { doc, emises } = monterLEditeur();
    entrerDansLEditeur();

    const invites = (): (string | null)[] =>
      [...zoneDeSaisie().querySelectorAll("[data-invite]")].map((bloc) =>
        bloc.getAttribute("data-invite"),
      );
    const dansLeDocumentVide = invites();
    const emisesParLInvite = emises.length;
    const luAvecLInvite = contenuLu(doc);
    const texteAvecLInvite = zoneDeSaisie().textContent;
    taper("a");

    expect(INVITE_DU_BLOC_VIDE).toBe("Écris, ou tape / pour insérer un bloc");
    expect(dansLeDocumentVide).toEqual([INVITE_DU_BLOC_VIDE]);
    expect(emisesParLInvite).toBe(0);
    expect(luAvecLInvite).toBe("");
    expect(texteAvecLInvite).toBe("");
    expect(invites()).toEqual([]);
    expect(contenuLu(doc)).toBe("<paragraph>a</paragraph>");
  });

  it("F-003-AC40 l'invite suit le curseur dans un paragraphe vide et n'apparaît dans aucun bloc rempli", () => {
    monterLEditeur();
    entrerDansLEditeur();
    taper("rempli");

    presser("Enter");
    const paragraphes = [...zoneDeSaisie().querySelectorAll("p")];
    const dansLeParagrapheVide = paragraphes.map((bloc) => bloc.hasAttribute("data-invite"));
    placerLeCurseurApres("rempli");

    expect(dansLeParagrapheVide).toEqual([false, true]);
    expect(zoneDeSaisie().querySelectorAll("[data-invite]")).toHaveLength(0);
  });

  it("F-003-AC40 F-005-AC12 l'invite annonce le menu slash, que F-005 livre : `/` en tête du bloc vide l'ouvre", async () => {
    monterLEditeur();
    entrerDansLEditeur();

    taper("/");
    await laisserLeMenuSuivre();

    expect(INVITE_DU_BLOC_VIDE).toContain("/");
    expect(menuSlash()).not.toBeNull();
  });
});
