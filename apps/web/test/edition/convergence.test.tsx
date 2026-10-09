import type { Editor } from "@tiptap/core";
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  ajouterParagraphe,
  contenuLu,
  creerEditeurNu,
  editeurMonte,
  monterEditeur,
  placerLeCurseurApres,
  recevoir,
  taper,
  zoneDeSaisie,
} from "./aides-edition.tsx";

interface Replique {
  readonly doc: Y.Doc;
  readonly editeur: Editor;
}

// Deux répliques d'un même document de page, chacune avec son éditeur, parties du même contenu.
function deuxRepliques(contenuDeDepart: string): [Replique, Replique] {
  const docA = new Y.Doc();
  const editeurA = creerEditeurNu(docA);
  editeurA.commands.setContent(contenuDeDepart);
  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
  return [
    { doc: docA, editeur: editeurA },
    { doc: docB, editeur: creerEditeurNu(docB) },
  ];
}

function ecrireApres(replique: Replique, repere: string, texte: string): void {
  placerLeCurseurApres(replique.editeur, repere);
  act(() => void replique.editeur.commands.insertContent(texte));
}

// Les modifications faites séparément s'échangent, puis s'appliquent dans les deux ordres à deux
// documents vierges : les quatre documents doivent lire le même contenu.
function convergerDansLesDeuxOrdres(a: Replique, b: Replique, depart: Uint8Array): string {
  const deA = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVectorFromUpdate(depart));
  const deB = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVectorFromUpdate(depart));
  act(() => {
    Y.applyUpdate(a.doc, deB);
    Y.applyUpdate(b.doc, deA);
  });
  const lus = [contenuLu(a.doc), contenuLu(b.doc)];
  for (const ordre of [
    [deA, deB],
    [deB, deA],
  ]) {
    const vierge = new Y.Doc();
    Y.applyUpdate(vierge, depart);
    ordre.forEach((miseAJour) => Y.applyUpdate(vierge, miseAJour));
    lus.push(contenuLu(vierge));
  }
  expect(new Set(lus).size).toBe(1);
  expect(a.editeur.getText()).toBe(b.editeur.getText());
  return lus[0] ?? "";
}

describe("mises à jour reçues et convergence", () => {
  it("F-003-AC14 une mise à jour appliquée au document s'affiche sans rechargement, sans perdre le texte en cours de saisie", () => {
    const { doc } = monterEditeur();
    taper("je sais");
    const editeur = editeurMonte();

    recevoir(doc, (replique) => ajouterParagraphe(replique, "venu d'ailleurs"));

    expect(editeurMonte()).toBe(editeur);
    expect([...(zoneDeSaisie()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
      "je sais",
      "venu d'ailleurs",
    ]);

    taper("is");

    expect(contenuLu(doc)).toBe(
      "<paragraph>je saisis</paragraph><paragraph>venu d'ailleurs</paragraph>",
    );
  });

  it("F-003-AC14 une mise à jour reçue dans le bloc en cours de saisie laisse le curseur à sa place", () => {
    const { doc } = monterEditeur();
    taper("milieu");

    recevoir(doc, (replique) => {
      const paragraphe = replique.getXmlFragment("contenu").get(0) as Y.XmlElement;
      (paragraphe.get(0) as Y.XmlText).insert(0, "début ");
    });
    taper(" fin");

    expect(contenuLu(doc)).toBe("<paragraph>début milieu fin</paragraph>");
  });

  it("F-003-AC15 texte inséré dans deux paragraphes différents : même contenu sur les deux répliques, dans les deux ordres", () => {
    const [a, b] = deuxRepliques("<p>premier</p><p>second</p>");
    const depart = Y.encodeStateAsUpdate(a.doc);

    ecrireApres(a, "premier", " de A");
    ecrireApres(b, "second", " de B");

    expect(convergerDansLesDeuxOrdres(a, b, depart)).toBe(
      "<paragraph>premier de A</paragraph><paragraph>second de B</paragraph>",
    );
  });

  it("F-003-AC15 texte inséré au même endroit d'un même paragraphe : même contenu, les deux textes y figurent", () => {
    const [a, b] = deuxRepliques("<p>commun</p>");
    const depart = Y.encodeStateAsUpdate(a.doc);

    ecrireApres(a, "commun", "[de A]");
    ecrireApres(b, "commun", "[de B]");

    const lu = convergerDansLesDeuxOrdres(a, b, depart);
    expect(lu).toMatch(/^<paragraph>commun(\[de A\]\[de B\]|\[de B\]\[de A\])<\/paragraph>$/);
  });

  it("F-003-AC15 bloc ajouté d'un côté pendant qu'un autre change de type de l'autre : même contenu, rien de perdu", () => {
    const [a, b] = deuxRepliques("<p>premier</p><p>second</p>");
    const depart = Y.encodeStateAsUpdate(a.doc);

    placerLeCurseurApres(a.editeur, "second");
    act(() => void a.editeur.chain().splitBlock().insertContent("ajouté par A").run());
    placerLeCurseurApres(b.editeur, "premier");
    act(() => void b.editeur.commands.setHeading({ level: 2 }));

    expect(convergerDansLesDeuxOrdres(a, b, depart)).toBe(
      '<heading level="2">premier</heading><paragraph>second</paragraph><paragraph>ajouté par A</paragraph>',
    );
  });
});
