// La page affichée de la synchronisation, jouée seule (F-028-AC28) : un document lié vierge reçoit
// par son miroir ce qu'un autre onglet envoie sur le canal. Ici, parce que seuls les tests du module
// de synchronisation en importent les fichiers internes (F-013-AC38).
import { expect } from "vitest";
import * as Y from "yjs";

import type { CanalEntreOnglets } from "../../src/synchronisation/environnement.ts";
import { PageSynchronisee } from "../../src/synchronisation/page-affichee.ts";
import { fragmentBrut } from "../aides-facade-page.ts";
import { ESPACE_A } from "../aides-persistance.ts";

interface PageDEssai {
  readonly page: PageSynchronisee;
  readonly lie: Y.Doc;
  readonly canal: CanalEntreOnglets;
  readonly refus: number[];
}

function pageSynchroniseeDEssai(): PageDEssai {
  const lie = new Y.Doc();
  const canal: CanalEntreOnglets = {
    postMessage: () => undefined,
    close: () => undefined,
    onmessage: null,
  };
  const refus: number[] = [];
  const horloge = { maintenant: () => Date.now(), programmer: () => () => undefined };
  const page = PageSynchronisee.creer({
    page: { idPage: crypto.randomUUID(), doc: lie, refuserLaVersion: () => void refus.push(1) },
    idEspace: ESPACE_A,
    environnement: {
      WebSocket,
      adresse: "ws://localhost/synchro",
      horloge,
      alea: () => 0,
      ecouter: () => () => undefined,
      ouvrirUnCanal: () => canal,
    },
    contexte: {
      prise: () => undefined,
      horloge,
      alea: () => 0,
      verifierLEspace: () => Promise.resolve("membre"),
      surAcquise: () => undefined,
      surChangement: () => undefined,
      blocage: () => undefined,
      noterLeBlocage: () => undefined,
    },
  });
  if (page === undefined) {
    throw new Error("La page synchronisée d'essai n'a pas été créée.");
  }
  return { page, lie, canal, refus };
}

/**
 * Ce document arrive d'un autre onglet sur la page affichée : « refuse » si la page refuse sa
 * version sans que rien n'atteigne le document lié, « lu » s'il y est recopié à l'identique.
 */
export function recevoirSurLaPageAffichee(doc: Y.Doc): "lu" | "refuse" {
  const { page, lie, canal, refus } = pageSynchroniseeDEssai();
  try {
    const maj = Y.encodeStateAsUpdate(doc);
    canal.onmessage?.(new MessageEvent("message", { data: { sorte: "maj", maj } }));
    if (refus.length > 0) {
      expect(fragmentBrut(lie).length).toBe(0);
      return "refuse";
    }
    expect(fragmentBrut(lie).toString()).toBe(fragmentBrut(doc).toString());
    return "lu";
  } finally {
    page.fermer();
  }
}
