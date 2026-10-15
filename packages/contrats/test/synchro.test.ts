import { describe, expect, it } from "vitest";

import {
  CANAUX_DES_MOTIFS,
  CHEMIN_SYNCHRO,
  LIMITES_SYNCHRO,
  LONGUEUR_MAX_DU_NOM_DE_DOCUMENT,
  MOTIFS_SYNCHRO,
  nomDeDocument,
  schemaNomDeDocument,
  TYPES_DE_DOCUMENT,
  VERSION_DU_DOCUMENT_D_ESPACE,
  type DocumentNomme,
} from "../src/index.ts";

const E = "0b3f9f1e-6c1a-4f43-9a52-7d1c2b8e4a10";
const P = "9a52b8e4-7d1c-4f43-8c1a-0b3f9f1e2b8e";

describe("nom de document (F-012-AC27, H2)", () => {
  it.each<DocumentNomme>([
    { type: "espace", idEspace: E, idDocument: E },
    { type: "page", idEspace: E, idDocument: P },
    { type: "table", idEspace: E, idDocument: P },
  ])("F-012-AC27 l'aller-retour rend les mêmes champs pour un document $type", (document) => {
    const nom = nomDeDocument(document);

    expect(schemaNomDeDocument.parse(nom)).toEqual(document);
  });

  it("F-012-AC27 les trois formes du nom sont celles de H2", () => {
    expect(nomDeDocument({ type: "espace", idEspace: E, idDocument: E })).toBe(`espace:${E}`);
    expect(nomDeDocument({ type: "page", idEspace: E, idDocument: P })).toBe(`page:${E}:${P}`);
    expect(nomDeDocument({ type: "table", idEspace: E, idDocument: P }).length).toBe(
      LONGUEUR_MAX_DU_NOM_DE_DOCUMENT,
    );
  });

  it.each([
    ["type inconnu", `bloc:${E}:${P}`],
    ["identifiant en majuscules", `page:${E.toUpperCase()}:${P}`],
    ["identifiant qui n'est pas un UUID", `page:${E}:pas-un-uuid`],
    ["segment manquant", `page:${E}`],
    ["segment en trop pour un espace", `espace:${E}:${P}`],
    ["segment en trop pour une page", `page:${E}:${P}:${P}`],
    ["nom vide", ""],
    ["nom trop long", `page:${E}:${P}${"0".repeat(100)}`],
    ["suffixe de session", `page:${E}:${P}\0session`],
  ])("F-012-AC7 un nom non conforme est refusé : %s", (_cas, nom) => {
    expect(schemaNomDeDocument.safeParse(nom).success).toBe(false);
  });
});

describe("liste fermée et limites (F-012-AC27)", () => {
  it("F-012-AC27 le chemin et les trois types sont publiés", () => {
    expect(CHEMIN_SYNCHRO).toBe("/api/v1/synchro");
    expect(TYPES_DE_DOCUMENT).toEqual(["espace", "page", "table"]);
  });

  it("F-012-AC27 F-012-AC22 F-012-AC23 F-012-AC24 F-012-AC25 les limites de H7 sont publiées", () => {
    expect(LIMITES_SYNCHRO).toEqual({
      octetsParMessage: 5 * 1024 * 1024,
      octetsParDocument: 20 * 1024 * 1024,
      connexionsParCompte: 20,
      connexionsParServeur: 500,
      documentsParConnexion: 100,
      documentsParEspace: 5000,
      messagesParFenetre: 600,
      fenetreDesMessagesMs: 10_000,
      octetsParMessageDePresence: 16 * 1024,
    });
  });

  it("F-012-AC27 F-012-AC38 chaque motif de la liste fermée a au moins un canal, et seulement ceux-là", () => {
    expect(MOTIFS_SYNCHRO).toHaveLength(11);
    expect(Object.keys(CANAUX_DES_MOTIFS).sort()).toEqual([...MOTIFS_SYNCHRO].sort());
    for (const motif of MOTIFS_SYNCHRO) {
      expect(CANAUX_DES_MOTIFS[motif].length).toBeGreaterThan(0);
    }
  });

  it("F-012-AC27 un refus de connexion ne promet au client qu'un statut HTTP, et message-trop-grand que le code 1009", () => {
    expect(CANAUX_DES_MOTIFS["origine-refusee"]).toEqual([
      { canal: "refus-de-connexion", statut: 403 },
    ]);
    expect(CANAUX_DES_MOTIFS["message-trop-grand"]).toEqual([
      { canal: "fermeture-sans-raison", code: 1009 },
    ]);
  });

  it("F-012-AC39 le type racine, la clé et les versions admises d'un document d'espace sont publiés", () => {
    expect(VERSION_DU_DOCUMENT_D_ESPACE).toEqual({
      typeRacine: "meta",
      cle: "version",
      admises: [1],
    });
  });
});
