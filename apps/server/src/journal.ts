// Journal du serveur (ADR-0004) : une ligne JSON par événement. Les champs de chaque ligne sont
// une liste fermée écrite ici ; aucun objet de requête, de réponse ou d'erreur n'est journalisé.
import { pino, type DestinationStream } from "pino";

const PROFONDEUR_MAX_DES_CAUSES = 5;

interface LigneDeRequete {
  readonly idRequete: string;
  readonly methode: string;
  readonly chemin: string;
  readonly statut: number;
  readonly dureeMs: number;
}

export interface Journal {
  requete(ligne: LigneDeRequete): void;
  baseIndisponible(idRequete: string, code: string): void;
  erreurInterne(idRequete: string, erreur: unknown): void;
  ecoute(hote: string, port: number): void;
  arret(hote: string, port: number): void;
}

interface ElementDErreur {
  readonly type: string;
  readonly message: string;
  readonly pile: string;
}

// Seuls le nom, le message et la pile d'une erreur sont écrits : ses autres propriétés peuvent
// porter une requête, ses paramètres ou un client de base avec son mot de passe.
function decrire(valeur: unknown): ElementDErreur {
  return valeur instanceof Error
    ? { type: valeur.name, message: valeur.message, pile: valeur.stack ?? "" }
    : { type: typeof valeur, message: "valeur levée qui n'est pas une erreur", pile: "" };
}

function chaineDesCauses(erreur: unknown): ElementDErreur[] {
  const elements: ElementDErreur[] = [];
  let courante = erreur;
  while (courante !== undefined && elements.length < PROFONDEUR_MAX_DES_CAUSES) {
    elements.push(decrire(courante));
    courante = courante instanceof Error ? courante.cause : undefined;
  }
  return elements;
}

export function creerJournal(sortie: DestinationStream): Journal {
  const lignes = pino(
    {
      level: "info",
      base: null,
      messageKey: "message",
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (niveau) => ({ niveau }) },
    },
    sortie,
  );
  return {
    requete({ idRequete, methode, chemin, statut, dureeMs }) {
      lignes.info({ idRequete, methode, chemin, statut, dureeMs }, "requete");
    },
    baseIndisponible(idRequete, code) {
      lignes.warn({ idRequete, code }, "base-indisponible");
    },
    erreurInterne(idRequete, erreur) {
      lignes.error({ idRequete, erreur: chaineDesCauses(erreur) }, "erreur-interne");
    },
    ecoute(hote, port) {
      lignes.info({ hote, port }, "ecoute");
    },
    arret(hote, port) {
      lignes.info({ hote, port }, "arret");
    },
  };
}
