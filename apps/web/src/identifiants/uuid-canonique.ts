// Seule définition de la forme d'un identifiant dans apps/web (F-002-AC27, AC28) : celle que
// produit `crypto.randomUUID`. La version de l'UUID n'est pas contrôlée (ADR-0007).
const LONGUEUR_UUID_CANONIQUE = 36;
const UUID_CANONIQUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// La longueur est comparée d'abord : une chaîne géante n'atteint jamais l'expression régulière.
export function estUuidCanonique(valeur: string): boolean {
  return valeur.length === LONGUEUR_UUID_CANONIQUE && UUID_CANONIQUE.test(valeur);
}
