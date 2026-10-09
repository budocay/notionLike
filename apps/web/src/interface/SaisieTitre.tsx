import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { ChampTitre } from "./composants/ChampTitre.tsx";
import { TITRE_DE_LA_PAGE } from "./messages.ts";

interface Proprietes {
  readonly titreInitial: string;
  /** Message du dernier refus, affiché sous le champ resté ouvert. */
  readonly erreur: string | undefined;
  /** Rend vrai si le titre est accepté : la saisie est alors close. */
  readonly surValider: (titre: string) => boolean;
  readonly surAnnuler: () => void;
}

interface Saisie {
  readonly champ: RefObject<HTMLInputElement | null>;
  readonly texte: string;
  readonly surChangement: (evenement: ChangeEvent<HTMLInputElement>) => void;
  readonly surTouche: (evenement: KeyboardEvent<HTMLInputElement>) => void;
  readonly valider: () => void;
}

function useSaisie({ titreInitial, surValider, surAnnuler }: Proprietes): Saisie {
  const [texte, setTexte] = useState(titreInitial);
  const champ = useRef<HTMLInputElement>(null);
  // Une saisie close ne valide plus : la sortie du champ qui suit Entrée ou Échap est sans effet.
  const close = useRef(false);

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
  return {
    champ,
    texte,
    surChangement: (evenement) => setTexte(evenement.target.value),
    surTouche,
    valider,
  };
}

/** Saisie du titre, à la place du titre dans la rangée, texte entier sélectionné à l'ouverture. */
export function SaisieTitre(props: Proprietes): ReactElement {
  const saisie = useSaisie(props);
  return (
    <ChampTitre
      ref={saisie.champ}
      nom={TITRE_DE_LA_PAGE}
      erreur={props.erreur}
      value={saisie.texte}
      onChange={saisie.surChangement}
      onKeyDown={saisie.surTouche}
      onBlur={saisie.valider}
    />
  );
}
