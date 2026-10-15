// Relais de messages de la synchronisation (F-012-AC10, AC11, AC24, AC25, AC37, H10, H17) : chaque
// message d'une WebSocket passe ici avant la bibliothèque, qui n'applique elle-même ni débit, ni
// plafond de présence, ni compte d'ouvertures. Le relais ne lit d'un message entrant que son adresse
// (le nom du document, suivi au besoin du suffixe de session du client) et son type ; d'un message
// sortant de la bibliothèque, il lit en plus l'issue d'une authentification, pour suivre les
// ouvertures de la connexion telles que la bibliothèque les tient.
import "./stockage-local-neutre.ts";

import { MessageType } from "@hocuspocus/server";
import { LONGUEUR_MAX_DU_NOM_DE_DOCUMENT } from "@notionlike/contrats";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type { WebSocket } from "ws";

import type { ReglagesSynchro } from "./synchro-reglages.ts";

// Issue d'une authentification dans un message sortant (`AuthMessageType` de la bibliothèque).
const ISSUES_D_AUTHENTIFICATION = { refusee: 1, accordee: 2 } as const;

// Une ouverture demandée attend sa décision (et, accordée, le chargement du document) ; ouverte, elle
// a reçu l'accord de la bibliothèque. Sans entrée, la connexion ne tient aucune ouverture de ce nom.
export type EtatDOuverture = "attente" | "ouverte";

export interface Connexion {
  readonly idCompte: string;
  readonly idSession: string;
  readonly adresse: string;
  // Les en-têtes de la lecture de session, pour la revérification (F-012-AC14).
  readonly enTetes: Headers;
  readonly prise: WebSocket;
  // Par adresse de message.
  readonly ouvertures: Map<string, EtatDOuverture>;
  // Ouvertures accordées par la décision, dont l'accord n'est pas encore parti (F-012-AC24).
  accordeesEnVol: number;
  fenetre: { debut: number; nombre: number };
  fermee: boolean;
}

// Borne de l'adresse d'un message, en octets : un nom conforme (79 caractères ASCII), le NUL, puis
// un suffixe de session de 64 octets au plus (le client officiel en écrit une dizaine). Un message
// dont l'adresse la dépasse n'est jamais remis à la bibliothèque : ni elle, ni le suivi des
// ouvertures n'en gardent rien. Une demande d'ouverture reçoit le refus `nom-de-document-invalide`
// (F-012-AC7) écrit par le relais ; tout autre message est écarté.
const SUFFIXE_DE_SESSION_MAX = 64;
export const LONGUEUR_MAX_DE_L_ADRESSE =
  LONGUEUR_MAX_DU_NOM_DE_DOCUMENT + 1 + SUFFIXE_DE_SESSION_MAX;

interface EnTete {
  readonly adresse: string;
  readonly type: number;
  readonly decodeur: decoding.Decoder;
}

function enTeteDe(donnees: Uint8Array): EnTete | undefined {
  try {
    const decodeur = decoding.createDecoder(donnees);
    const adresse = decoding.readVarString(decodeur);
    return { adresse, type: decoding.readVarUint(decodeur), decodeur };
  } catch {
    return undefined;
  }
}

// Le nom que la bibliothèque remet à ses crochets : la partie qui précède le premier NUL.
export function nomDeLAdresse(adresse: string): string {
  const fin = adresse.indexOf("\0");
  return fin === -1 ? adresse : adresse.slice(0, fin);
}

export function ouvertesDe(connexion: Connexion): number {
  let nombre = 0;
  for (const etat of connexion.ouvertures.values()) {
    if (etat === "ouverte") {
      nombre += 1;
    }
  }
  return nombre;
}

// F-012-AC25 : fenêtre fixe, ouverte par le premier message compté.
function dansLeDebit(connexion: Connexion, maintenant: number, reglages: ReglagesSynchro): boolean {
  if (maintenant - connexion.fenetre.debut >= reglages.fenetreDesMessagesMs) {
    connexion.fenetre = { debut: maintenant, nombre: 0 };
  }
  connexion.fenetre.nombre += 1;
  return connexion.fenetre.nombre <= reglages.messagesParFenetre;
}

// Un message remis à la bibliothèque, ou écarté. Une demande d'ouverture est remise si la connexion
// ne tient pas déjà ce nom. Tout autre message n'est remis que pour un nom ouvert ou dont l'ouverture
// attend sa décision (F-012-AC11) : un message de fermeture pour un nom sans ouverture serait gardé
// par la bibliothèque et appliqué à la prochaine ouverture de ce nom (F-012-AC37, H17 d). Les types
// sans état, de diffusion interne ou inconnus ne sont jamais remis (F-012-AC10).
function aRemettre(
  connexion: Connexion,
  entete: EnTete,
  taille: number,
  reglages: ReglagesSynchro,
) {
  const etat = connexion.ouvertures.get(entete.adresse);
  switch (entete.type) {
    case MessageType.Auth:
      if (etat !== undefined) {
        return false;
      }
      connexion.ouvertures.set(entete.adresse, "attente");
      return true;
    case MessageType.Awareness:
      return etat !== undefined && taille <= reglages.octetsParMessageDePresence;
    case MessageType.Sync:
    case MessageType.SyncReply:
    case MessageType.QueryAwareness:
    case MessageType.CLOSE:
      return etat !== undefined;
    default:
      return false;
  }
}

export interface Relais {
  // Un message reçu de la WebSocket ; `remettre` le transmet à la bibliothèque.
  recevoir(donnees: Uint8Array, remettre: (donnees: Uint8Array) => void): void;
  // Un message que la bibliothèque envoie au client.
  observerLEnvoi(donnees: Uint8Array): void;
}

export interface DependancesDuRelais {
  readonly reglages: ReglagesSynchro;
  maintenant(): number;
  // Le débit est dépassé : la connexion est fermée.
  depasser(): void;
  // Une demande d'ouverture d'adresse trop longue : le refus est écrit au client.
  refuserLAdresse(refus: Uint8Array, adresse: string): void;
}

// Le refus d'ouverture de la bibliothèque (`PermissionDenied`), adressé comme la demande.
function refusDAdresse(adresse: string): Uint8Array {
  const encodeur = encoding.createEncoder();
  encoding.writeVarString(encodeur, adresse);
  encoding.writeVarUint(encodeur, MessageType.Auth);
  encoding.writeVarUint(encodeur, ISSUES_D_AUTHENTIFICATION.refusee);
  encoding.writeVarString(encodeur, "nom-de-document-invalide");
  return encoding.toUint8Array(encodeur);
}

export function creerRelais(connexion: Connexion, dependances: DependancesDuRelais): Relais {
  const { reglages } = dependances;
  return {
    recevoir(donnees, remettre) {
      if (connexion.fermee) {
        return;
      }
      if (!dansLeDebit(connexion, dependances.maintenant(), reglages)) {
        dependances.depasser();
        return;
      }
      const entete = enTeteDe(donnees);
      if (entete === undefined) {
        return;
      }
      if (Buffer.byteLength(entete.adresse, "utf8") > LONGUEUR_MAX_DE_L_ADRESSE) {
        if (entete.type === MessageType.Auth) {
          dependances.refuserLAdresse(refusDAdresse(entete.adresse), entete.adresse);
        }
        return;
      }
      if (aRemettre(connexion, entete, donnees.byteLength, reglages)) {
        remettre(donnees);
      }
    },
    observerLEnvoi(donnees) {
      const entete = enTeteDe(donnees);
      if (entete === undefined) {
        return;
      }
      if (entete.type === MessageType.CLOSE) {
        connexion.ouvertures.delete(entete.adresse);
        return;
      }
      if (entete.type !== MessageType.Auth) {
        return;
      }
      const issue = decoding.readVarUint(entete.decodeur);
      if (issue === ISSUES_D_AUTHENTIFICATION.accordee) {
        connexion.ouvertures.set(entete.adresse, "ouverte");
        connexion.accordeesEnVol = Math.max(0, connexion.accordeesEnVol - 1);
      } else if (issue === ISSUES_D_AUTHENTIFICATION.refusee) {
        connexion.ouvertures.delete(entete.adresse);
      }
    },
  };
}
