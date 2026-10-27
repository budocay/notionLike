// Zone d'annonce polie des vues d'une table (F-018, F-021) : partagée par la vue Tableau et la vue
// Calendrier.
import { useEffect, useRef, useState } from "react";

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
