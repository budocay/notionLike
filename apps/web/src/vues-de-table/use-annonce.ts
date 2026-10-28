// La zone d'annonce des vues de table (F-018, F-020-AC15) : partagée par la vue « Tableau » et la vue
// « Kanban ». Les deux vues partagent aussi, depuis la grille (F-018), `BoiteNouvelleColonne` et
// `Confirmation` (`Boites.tsx`) et `creerUneColonne` (`actions.ts`) : les modifier touche les deux.
import { useEffect, useRef, useState } from "react";

/** Délai entre le vidage de la zone d'annonce et sa réécriture, pour qu'un texte identique soit relu. */
const RELECTURE_D_ANNONCE_MS = 150;

// La zone d'annonce (`role="status"`) ne relit pas un texte inchangé : une annonce identique à la
// précédente (deux « Déjà la première ligne. » de suite) la vide, puis la réécrit un instant après.
export function useAnnonce(): readonly [string, (texte: string) => void] {
  const [annonce, setAnnonce] = useState("");
  const derniere = useRef("");
  const differee = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(differee.current), []);
  const annoncer = (texte: string): void => {
    window.clearTimeout(differee.current);
    if (texte !== derniere.current) {
      derniere.current = texte;
      setAnnonce(texte);
      return;
    }
    setAnnonce("");
    differee.current = window.setTimeout(() => setAnnonce(texte), RELECTURE_D_ANNONCE_MS);
  };
  return [annonce, annoncer];
}
