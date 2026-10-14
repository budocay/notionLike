// Journal du serveur (ADR-0004) : une ligne JSON par événement. Les champs de chaque ligne sont
// une liste fermée écrite ici ; aucun objet de requête, de réponse ou d'erreur n'est journalisé.
import type { CodeErreurBase } from "@notionlike/db";
import { pino, type DestinationStream } from "pino";

const PROFONDEUR_MAX_DES_CAUSES = 5;

interface LigneDeRequete {
  readonly idRequete: string;
  readonly methode: string;
  readonly chemin: string;
  readonly statut: number;
  readonly dureeMs: number;
}

// F-009-AC19 : les événements des comptes, et rien d'autre que ces champs. F-027-AC18 : ceux de la
// gestion du compte, qui ne portent ni nom, ni courriel, ni mot de passe, ni empreinte, ni jeton.
export type TypeDEvenement =
  | "inscription"
  | "connexion"
  | "connexion-refusee"
  | "deconnexion"
  | "debit-depasse"
  | "nom-change"
  | "mot-de-passe-change"
  | "mot-de-passe-incorrect"
  | "session-revoquee"
  | "sessions-revoquees";

interface EvenementDeCompte {
  readonly type: TypeDEvenement;
  readonly idRequete: string;
  readonly adresse: string;
  readonly idCompte?: string | undefined;
  // F-027-AC18 : la session visée par une révocation, par son identifiant.
  readonly idSession?: string | undefined;
}

// F-011-AC29 : les événements des espaces. Une ligne ne porte que des identifiants : ni jeton, ni
// empreinte, ni courriel, ni nom de compte ou d'espace.
export type TypeDEvenementDEspace =
  | "espace-cree"
  | "espace-supprime"
  | "invitation-creee"
  | "invitation-revoquee"
  | "invitation-acceptee"
  | "membre-retire"
  | "role-change"
  | "action-refusee";

export interface EvenementDEspace {
  readonly type: TypeDEvenementDEspace;
  readonly idRequete: string;
  readonly idCompte: string;
  readonly idEspace: string;
  readonly idCompteVise?: string | undefined;
}

// Un échec dont l'erreur peut porter une requête SQL et ses paramètres (courriel, jeton, empreinte) :
// seuls un code fixe et le nom de la classe de l'erreur sont écrits, jamais son message.
export type CodeDEchec =
  | "authentification-en-echec"
  | "verification-de-session-en-echec"
  | "session-non-supprimee"
  | "abonne-en-echec";

export type NiveauDeBibliotheque = "debug" | "info" | "warn" | "error";

// F-012-AC26 : les événements de la synchronisation. Une ligne porte le type, le compte s'il est
// connu, l'adresse de la requête, le nom du document s'il y en a un, le motif ; pour un échec, le
// nom de la classe de l'erreur. Jamais la valeur du cookie, ni un octet d'un document ou d'une
// présence, ni le message d'une erreur (celui d'une erreur de la base porte la requête SQL).
export type TypeDEvenementDeSynchro =
  | "connexion-etablie"
  | "connexion-refusee"
  | "connexion-fermee"
  | "ouverture-refusee"
  | "acces-retire"
  | "limite-atteinte"
  | "chargement-en-echec"
  | "enregistrement-en-echec"
  | "enregistrement-abandonne"
  | "instantane-non-enregistre";

export interface EvenementDeSynchro {
  readonly type: TypeDEvenementDeSynchro;
  readonly adresse?: string | undefined;
  readonly idCompte?: string | undefined;
  readonly document?: string | undefined;
  readonly motif?: string | undefined;
  readonly code?: number | undefined;
  readonly erreur?: unknown;
}

export interface Journal {
  requete(ligne: LigneDeRequete): void;
  evenementDeCompte(evenement: EvenementDeCompte): void;
  evenementDEspace(evenement: EvenementDEspace): void;
  evenementDeSynchro(evenement: EvenementDeSynchro): void;
  echecSansDonnee(code: CodeDEchec, erreur: unknown, idRequete?: string): void;
  // Ligne du journal interne de better-auth : son niveau et les classes des erreurs jointes.
  bibliotheque(niveau: NiveauDeBibliotheque, jointes: readonly unknown[]): void;
  baseIndisponible(idRequete: string, code: CodeErreurBase): void;
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

// Le nom de la classe : un texte du code, jamais une donnée de la requête.
function classeDe(valeur: unknown): string {
  return valeur instanceof Error ? valeur.constructor.name : typeof valeur;
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
    evenementDeCompte({ type, idRequete, adresse, idCompte, idSession }) {
      lignes.info({ type, idRequete, adresse, idCompte, idSession }, "compte");
    },
    evenementDEspace({ type, idRequete, idCompte, idEspace, idCompteVise }) {
      lignes.info({ type, idRequete, idCompte, idEspace, idCompteVise }, "espace");
    },
    evenementDeSynchro({ type, adresse, idCompte, document, motif, code, erreur }) {
      const classe = erreur === undefined ? undefined : classeDe(erreur);
      lignes.info({ type, adresse, idCompte, document, motif, code, classe }, "synchro");
    },
    echecSansDonnee(code, erreur, idRequete) {
      lignes.error({ idRequete, code, classe: classeDe(erreur) }, "echec");
    },
    bibliotheque(niveau, jointes) {
      const classes = jointes.filter((jointe) => jointe instanceof Error).map(classeDe);
      lignes[niveau]({ classes }, "better-auth");
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
