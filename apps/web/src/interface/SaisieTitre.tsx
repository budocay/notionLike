import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef, useState } from "react";

import { TITRE_DE_LA_PAGE } from "./messages.ts";

interface Proprietes {
  readonly titreInitial: string;
  /** Message du dernier refus, affiché sous le champ resté ouvert. */
  readonly erreur: string | undefined;
  /** Rend vrai si le titre est accepté : la saisie est alors close. */
  readonly surValider: (titre: string) => boolean;
  readonly surAnnuler: () => void;
}

export function SaisieTitre({
  titreInitial,
  erreur,
  surValider,
  surAnnuler,
}: Proprietes): ReactElement {
  const [texte, setTexte] = useState(titreInitial);
  const champ = useRef<HTMLInputElement>(null);
  // Une saisie close ne valide plus : la sortie du champ qui suit Entrée ou Échap est sans effet.
  const close = useRef(false);
  const idErreur = useId();

  useEffect(() => {
    close.current = false;
    champ.current?.focus();
    champ.current?.select();
  }, []);

  const valider = (): void => {
    if (!close.current) {
      close.current = surValider(texte);
    }
  };

  const surTouche = (evenement: KeyboardEvent<HTMLInputElement>): void => {
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      valider();
    } else if (evenement.key === "Escape") {
      evenement.preventDefault();
      close.current = true;
      surAnnuler();
    }
  };

  return (
    <span className="saisie-titre">
      <input
        ref={champ}
        type="text"
        aria-label={TITRE_DE_LA_PAGE}
        aria-invalid={erreur !== undefined}
        aria-describedby={erreur === undefined ? undefined : idErreur}
        value={texte}
        onChange={(evenement) => setTexte(evenement.target.value)}
        onKeyDown={surTouche}
        onBlur={valider}
      />
      {erreur !== undefined && (
        <span role="alert" id={idErreur} className="erreur">
          {erreur}
        </span>
      )}
    </span>
  );
}
