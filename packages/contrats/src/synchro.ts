// Contrat de la synchronisation des documents (F-012-AC27, AC39, H2, H8). Le serveur et ses clients
// n'échangent sur le point de synchronisation que le protocole de la bibliothèque ; ce fichier publie
// ce qui l'entoure : le chemin, le nom des documents, les limites, les motifs et le canal par lequel
// un client reçoit chacun. Aucune dépendance vers Yjs ni vers Hocuspocus (F-008-AC23).
//
// Une ouverture n'est acquise qu'à la réception de l'état du document (premier message de
// synchronisation du serveur), jamais à celle du message `authenticated` de la bibliothèque : le
// serveur charge le document après avoir accepté l'ouverture, et un chargement en échec envoie
// encore un refus d'ouverture `erreur-interne` après `authenticated` (F-012-AC20).
import { z } from "zod";

export const CHEMIN_SYNCHRO = "/api/v1/synchro";

// ADR-0001 : les trois types de documents, liste fermée (même liste que la table `document`).
export const TYPES_DE_DOCUMENT = ["espace", "page", "table"] as const;

export type TypeDeDocument = (typeof TYPES_DE_DOCUMENT)[number];

// Le document d'un espace a pour identifiant celui de l'espace lui-même.
export interface DocumentNomme {
  readonly type: TypeDeDocument;
  readonly idEspace: string;
  readonly idDocument: string;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FORME_DU_NOM = new RegExp(`^(?:espace:(${UUID})|(page|table):(${UUID}):(${UUID}))$`);
const SEPARATEUR = ":";

// `table:` suivi de deux UUID canoniques séparés par `:` : le nom le plus long.
export const LONGUEUR_MAX_DU_NOM_DE_DOCUMENT = 79;

function analyser(nom: string): DocumentNomme {
  const [type = "", idEspace = "", idDocument = idEspace] = nom.split(SEPARATEUR);
  return { type: type as TypeDeDocument, idEspace, idDocument };
}

// H2 : `espace:<idEspace>`, `page:<idEspace>:<idPage>`, `table:<idEspace>:<idTable>`, identifiants
// en UUID canonique minuscule. Le schéma analyse la chaîne ; `nomDeDocument` la produit.
export const schemaNomDeDocument = z
  .string()
  .max(LONGUEUR_MAX_DU_NOM_DE_DOCUMENT)
  .regex(FORME_DU_NOM)
  .transform(analyser);

export function nomDeDocument({ type, idEspace, idDocument }: DocumentNomme): string {
  return type === "espace"
    ? [type, idEspace].join(SEPARATEUR)
    : [type, idEspace, idDocument].join(SEPARATEUR);
}

// H7 : garde-fous contre l'abus, tenus par le code du serveur (F-012-AC22 à AC25).
export const LIMITES_SYNCHRO = {
  // 5 Mio : au-delà, la connexion est fermée par le code 1009 (F-012-AC22).
  octetsParMessage: 5_242_880,
  // 20 Mio de taille comptée par document (F-012-AC23).
  octetsParDocument: 20_971_520,
  connexionsParCompte: 20,
  connexionsParServeur: 500,
  documentsParConnexion: 100,
  documentsParEspace: 5000,
  // 600 messages en 10 secondes par connexion, tous types et documents confondus (F-012-AC25).
  messagesParFenetre: 600,
  fenetreDesMessagesMs: 10_000,
  // 16 Kio par message de présence.
  octetsParMessageDePresence: 16_384,
} as const;

export type LimitesSynchro = { readonly [Cle in keyof typeof LIMITES_SYNCHRO]: number };

// F-012-AC27, AC38 : liste fermée des motifs, dans la convention des codes de F-008 H3.
export const MOTIFS_SYNCHRO = [
  "non-authentifie",
  "origine-refusee",
  "acces-refuse",
  "droits-modifies",
  "nom-de-document-invalide",
  "document-trop-grand",
  "quota-atteint",
  "trop-de-requetes",
  "message-trop-grand",
  "erreur-interne",
  "version-refusee",
] as const;

export type MotifSynchro = (typeof MOTIFS_SYNCHRO)[number];

// H8. `refus-de-connexion` : statut HTTP écrit sur la demande de passage en WebSocket, qu'un
// navigateur ne voit pas (pour lui, une connexion qui n'aboutit pas, sans motif) ; seul un client
// hors navigateur le lit, et le motif n'existe que dans le journal du serveur.
// `refus-d-ouverture` : raison du message d'authentification refusée de la bibliothèque.
// `fermeture-d-ouverture` : raison du message de fermeture de la bibliothèque (son code n'est pas
// transmis). `fermeture-de-connexion` : code et raison de la fermeture de la WebSocket ; seule la
// raison fait contrat. `fermeture-sans-raison` : code seul, raison vide (`message-trop-grand`).
export type CanalDUnMotif =
  | { readonly canal: "refus-de-connexion"; readonly statut: number }
  | { readonly canal: "refus-d-ouverture" }
  | { readonly canal: "fermeture-d-ouverture" }
  | { readonly canal: "fermeture-de-connexion"; readonly code: number }
  | { readonly canal: "fermeture-sans-raison"; readonly code: number };

const POLITIQUE = 1008;
const REFUS = { canal: "refus-d-ouverture" } as const;
const FERMETURE = { canal: "fermeture-d-ouverture" } as const;

export const CANAUX_DES_MOTIFS: Readonly<Record<MotifSynchro, readonly CanalDUnMotif[]>> = {
  "non-authentifie": [
    { canal: "refus-de-connexion", statut: 401 },
    { canal: "fermeture-de-connexion", code: POLITIQUE },
  ],
  "origine-refusee": [{ canal: "refus-de-connexion", statut: 403 }],
  "acces-refuse": [REFUS, FERMETURE],
  "droits-modifies": [FERMETURE],
  "nom-de-document-invalide": [REFUS],
  "document-trop-grand": [FERMETURE],
  // 429 : plafond de connexions du compte ; 503 : plafond du serveur ; refus d'ouverture : 100
  // documents ouverts par la connexion ; fermeture d'ouverture : 5 000 documents dans l'espace.
  "quota-atteint": [
    { canal: "refus-de-connexion", statut: 429 },
    { canal: "refus-de-connexion", statut: 503 },
    REFUS,
    FERMETURE,
  ],
  "trop-de-requetes": [{ canal: "fermeture-de-connexion", code: POLITIQUE }],
  "message-trop-grand": [{ canal: "fermeture-sans-raison", code: 1009 }],
  "erreur-interne": [
    { canal: "refus-de-connexion", statut: 500 },
    REFUS,
    FERMETURE,
    { canal: "fermeture-de-connexion", code: POLITIQUE },
  ],
  "version-refusee": [FERMETURE],
};

// À l'arrêt du serveur, chaque WebSocket est fermée par ce code, sans motif (F-012-AC31).
export const CODE_DE_FERMETURE_A_L_ARRET = 1001;

// F-012-AC38, AC39, F-018-AC57, AC58 : le serveur ne laisse écrire dans un document d'espace qu'une
// version de cette liste, jamais inférieure à celle du document (ADR-0002, amendement F-018). La
// version lue est le plus grand de la clé `version` du type racine `meta` et des entrées du type
// racine `versions` (un tableau d'entiers auquel on ne fait qu'ajouter) ; 1 en leur absence.
export const VERSION_DU_DOCUMENT_D_ESPACE = {
  typeRacine: "meta",
  cle: "version",
  typeRacineDesVersions: "versions",
  admises: [1, 2],
} as const;
