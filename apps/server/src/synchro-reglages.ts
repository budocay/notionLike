// Réglages de la synchronisation (F-012-AC22 à AC25, AC14, AC18, AC21, AC36) : les limites publiées
// par `packages/contrats` et les délais du serveur. Le point d'entrée de production les prend tels
// quels ; seule la fabrique d'essai en passe des valeurs réduites, en paramètre de l'assemblage
// (aucune variable de configuration ne les règle, H16).
import { LIMITES_SYNCHRO, type LimitesSynchro } from "@notionlike/contrats";

export interface ReglagesSynchro extends LimitesSynchro {
  // F-012-AC18 : enregistrement 2 secondes après la dernière mise à jour, 10 au plus après la
  // première non enregistrée. Ce sont aussi les défauts de la bibliothèque, écrits ici (H3).
  readonly attenteDEnregistrementMs: number;
  readonly attenteMaxDEnregistrementMs: number;
  // F-012-AC21 : un nouvel essai au plus tard 10 secondes après chaque échec.
  readonly relanceDEnregistrementMs: number;
  // F-012-AC14 : revérification de chaque connexion toutes les 60 secondes.
  readonly periodeDeReverificationMs: number;
}

export const REGLAGES_SYNCHRO: ReglagesSynchro = Object.freeze({
  ...LIMITES_SYNCHRO,
  attenteDEnregistrementMs: 2000,
  attenteMaxDEnregistrementMs: 10_000,
  relanceDEnregistrementMs: 10_000,
  periodeDeReverificationMs: 60_000,
});

// L'horloge des temporisations du serveur : la fenêtre du débit, la revérification, la relance.
// Celle de la bibliothèque (fenêtre d'enregistrement) ne s'injecte pas : elle se règle par les
// délais ci-dessus (H11).
export interface Minuterie {
  maintenant(): number;
  // Rend la fonction qui annule le rappel.
  programmer(rappel: () => void, delaiMs: number): () => void;
}

export const MINUTERIE_DU_SYSTEME: Minuterie = {
  maintenant: () => Date.now(),
  programmer: (rappel, delaiMs) => {
    const minuteur = setTimeout(rappel, delaiMs);
    return () => {
      clearTimeout(minuteur);
    };
  },
};

// Une défaillance provoquée par un test : levée avant la lecture ou l'écriture de l'instantané.
export type Operation = "chargement" | "enregistrement";
export type Defaillance = (operation: Operation, nomDuDocument: string) => void;
