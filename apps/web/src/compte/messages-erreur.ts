// Table de messages des codes de l'enveloppe d'erreur (F-010-AC16, H6, H12) : un message français
// par code de la liste fermée que publie `packages/contrats`. Une feature qui ajoute un code y
// ajoute sa ligne, et ne touche à rien d'autre ; quand la feature qui publie un code en fixe le
// texte, il est repris ici à la lettre (F-011-AC34 pour les sept derniers).
import type { CodeErreur } from "@notionlike/contrats";

export const MESSAGES_DES_CODES: Readonly<Record<CodeErreur, string>> = {
  "requete-invalide": "Le serveur n'a pas compris la demande. Réessayez.",
  "ressource-introuvable": "L'élément demandé est introuvable sur le serveur.",
  "corps-trop-grand": "Les données envoyées sont trop volumineuses.",
  "base-indisponible":
    "Le serveur est momentanément indisponible. Réessayez dans quelques instants.",
  "erreur-interne": "Une erreur est survenue sur le serveur. Réessayez.",
  "non-authentifie": "Vous n'êtes pas connecté, ou votre session a expiré.",
  "trop-de-requetes": "Trop de tentatives. Réessayez dans quelques instants.",
  "acces-refuse": "Vous n'avez pas le droit de faire cela dans cet espace.",
  "origine-refusee":
    "Cette requête a été refusée par le serveur. Rechargez l'application et réessayez.",
  "identifiant-indisponible": "Cet identifiant est déjà utilisé sur le serveur.",
  "dernier-proprietaire": "Un espace garde toujours au moins un propriétaire.",
  "deja-membre": "Vous êtes déjà membre de cet espace.",
  "invitation-invalide": "Ce lien d'invitation n'est pas valide, a déjà servi ou a expiré.",
  "quota-atteint": "Une limite est atteinte : l'opération n'a pas été faite.",
  // F-027-AC25, à la lettre.
  "mot-de-passe-incorrect": "Mot de passe actuel incorrect.",
  "session-courante": "Pour fermer la session de cet appareil, déconnectez-vous.",
};

export function messageDuCode(code: CodeErreur): string {
  return MESSAGES_DES_CODES[code];
}
