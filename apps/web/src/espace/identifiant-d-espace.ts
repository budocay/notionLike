// Identifiant d'un espace créé sur le serveur (F-014-AC7, AC42) : tiré par `crypto.randomUUID()`,
// la source des identifiants de page (ADR-0002), et par aucun autre moyen. Hors d'un contexte
// sécurisé, la fonction manque : la création est refusée, sans générateur de secours.
export function tirerIdentifiantDEspace(): string | undefined {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    return undefined;
  }
  return crypto.randomUUID();
}
