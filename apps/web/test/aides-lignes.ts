// Un document de page rempli selon chaque ligne de la table des versions, et un document de la
// version prise en charge plus un (F-028-AC20, AC23, AC24, AC28 ; F-005-AC24, AC27, AC28, AC32). Écrits par `yjs` seul, comme une
// autre application les enregistrerait ; la version passe par l'opération de `@notionlike/document`.
import { TABLE_DES_VERSIONS_PAGE, VERSION_PAGE_PRISE_EN_CHARGE } from "@notionlike/document";
import * as Y from "yjs";

import { ouvrirPersistance } from "../src/persistance/index.ts";
import { ajouter, bloc, miseAJourDUneReplique } from "./aides-facade-page.ts";
import { attendreEtat, ESPACE_A, laisserIndexedDbTravailler } from "./aides-persistance.ts";

function liste(nom: "bulletList" | "orderedList", texte: string): Y.XmlElement {
  const element = new Y.XmlElement(nom);
  const item = new Y.XmlElement("listItem");
  item.insert(0, [bloc("paragraph", texte)]);
  element.insert(0, [item]);
  return element;
}

function marque(texte: string, attributs: Record<string, unknown>): Y.XmlElement {
  const paragraphe = new Y.XmlElement("paragraph");
  const contenu = new Y.XmlText();
  contenu.insert(0, texte, attributs);
  paragraphe.insert(0, [contenu]);
  return paragraphe;
}

const TEXTES_PAR_LIGNE: Readonly<Record<number, readonly string[]>> = {
  1: [
    "titre de la ligne 1",
    "paragraphe de la ligne 1",
    "puce de la ligne 1",
    "numéro de la ligne 1",
  ],
  2: ["gras de la ligne 2", "italique de la ligne 2", "lien de la ligne 2"],
  // F-005 : un bloc code de plusieurs lignes avec langage, et un sans langage.
  3: ["def ligne_3():\n    return 3", "code brut de la ligne 3"],
};

/** Les blocs qui exercent chaque élément de la ligne ; chaque ligne reprend la précédente. */
const BLOCS_PAR_LIGNE: Readonly<Record<number, () => Y.XmlElement[]>> = {
  1: () => {
    const [titre = "", paragraphe = "", puce = "", numero = ""] = TEXTES_PAR_LIGNE[1] ?? [];
    return [
      bloc("heading", titre, { level: 2 }),
      bloc("paragraph", paragraphe),
      liste("bulletList", puce),
      liste("orderedList", numero),
    ];
  },
  2: () => {
    const [gras = "", italique = "", lien = ""] = TEXTES_PAR_LIGNE[2] ?? [];
    return [
      ...(BLOCS_PAR_LIGNE[1]?.() ?? []),
      marque(gras, { bold: {} }),
      marque(italique, { italic: {} }),
      marque(lien, { link: { href: "https://exemple.fr/" } }),
    ];
  },
  3: () => {
    const [avecLangage = "", sansLangage = ""] = TEXTES_PAR_LIGNE[3] ?? [];
    return [
      ...(BLOCS_PAR_LIGNE[2]?.() ?? []),
      bloc("codeBlock", avecLangage, { language: "python" }),
      bloc("codeBlock", sansLangage),
    ];
  },
};

/** Versions de la table que ces aides savent remplir : toutes, ou le test qui les lit échoue. */
export const VERSIONS_REMPLIES: readonly number[] = Object.keys(BLOCS_PAR_LIGNE).map(Number);
export const VERSIONS_DE_LA_TABLE: readonly number[] = TABLE_DES_VERSIONS_PAGE.map(
  (ligne) => ligne.version,
);
export const VERSION_INCONNUE = VERSION_PAGE_PRISE_EN_CHARGE + 1;

/** Les textes qu'affiche un document rempli selon cette ligne, ceux des lignes précédentes compris. */
export function textesDeLaLigne(version: number): string[] {
  return VERSIONS_REMPLIES.filter((une) => une <= version).flatMap(
    (une) => TEXTES_PAR_LIGNE[une] ?? [],
  );
}

/** Un document rempli selon cette ligne, à sa version ; la ligne 1 n'inscrit aucune version. */
export function documentDeLaLigne(version: number): Y.Doc {
  const remplir = BLOCS_PAR_LIGNE[version];
  if (remplir === undefined) {
    throw new Error(`Aucun remplissage pour la ligne ${String(version)} de la table.`);
  }
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    miseAJourDUneReplique(doc, (replique) => {
      ajouter(replique, ...remplir());
      replique.eleverVersion(version);
    }),
  );
  return doc;
}

/** Un document de la version prise en charge plus un, avec un nœud et une marque inconnus. */
export function documentDeVersionInconnue(): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    miseAJourDUneReplique(doc, (replique) => {
      ajouter(replique, bloc("blocFutur", "inconnu"), marque("souligné", { underline: {} }));
      replique.eleverVersion(VERSION_INCONNUE);
    }),
  );
  return doc;
}

/** Enregistre une copie de ce document dans la base de cette page de l'espace A. */
export async function enregistrerParLaPersistance(source: Y.Doc, idPage: string): Promise<void> {
  const ecrit = new Y.Doc();
  Y.applyUpdate(ecrit, Y.encodeStateAsUpdate(source));
  const ecriture = ouvrirPersistance(ecrit, { type: "page", idEspace: ESPACE_A, idPage });
  await attendreEtat(ecriture, "active");
  await laisserIndexedDbTravailler();
  ecriture.fermer();
  await laisserIndexedDbTravailler();
}

/** Enregistre ce document par le module de persistance, puis le relit dans un document vierge. */
export async function relireParLaPersistance(source: Y.Doc): Promise<Y.Doc> {
  const designation = { type: "page", idEspace: ESPACE_A, idPage: crypto.randomUUID() } as const;
  await enregistrerParLaPersistance(source, designation.idPage);
  const relu = new Y.Doc();
  const lecture = ouvrirPersistance(relu, designation);
  await attendreEtat(lecture, "active");
  lecture.fermer();
  await laisserIndexedDbTravailler();
  return relu;
}
