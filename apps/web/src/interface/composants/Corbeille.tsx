// Composant de présentation de l'écran de la corbeille (F-007-AC2) : chaque racine avec son titre,
// un détail et ses commandes, sa descendance sous elle, à plat, retirée selon son niveau. Il ne sait
// rien du document : textes et commandes lui sont donnés, et tout titre est rendu comme du texte
// (F-007-AC22).
import type { CSSProperties, ReactElement, ReactNode, Ref } from "react";

import { CORBEILLE } from "./compte.classes.ts";

export interface LigneDeCorbeille {
  readonly cle: string;
  readonly titre: string;
  readonly detail: string;
  /** 1 pour une racine ; sa descendance compte à partir de 2. */
  readonly niveau: number;
  readonly commandes: ReactNode;
}

export interface RacineDeCorbeille extends LigneDeCorbeille {
  readonly descendance: readonly LigneDeCorbeille[];
}

interface Proprietes {
  /** Nom accessible de la liste. */
  readonly nom: string;
  /** Texte affiché à la place de la liste quand elle est vide. */
  readonly vide: string;
  readonly racines: readonly RacineDeCorbeille[];
  /** Le focus y revient quand la commande d'origine a disparu (F-007-AC17). */
  readonly refListe?: Ref<HTMLElement> | undefined;
}

function Ligne({ ligne }: { readonly ligne: LigneDeCorbeille }): ReactElement {
  return (
    <div className={CORBEILLE.ligne}>
      <span className={CORBEILLE.titre}>{ligne.titre}</span>
      <span className={CORBEILLE.detail}>{ligne.detail}</span>
      <span className={CORBEILLE.actions}>{ligne.commandes}</span>
    </div>
  );
}

export function ListeDeCorbeille(props: Proprietes): ReactElement {
  return (
    <section ref={props.refListe} tabIndex={-1} aria-label={props.nom} className={CORBEILLE.zone}>
      {props.racines.length === 0 ? (
        <p className={CORBEILLE.vide}>{props.vide}</p>
      ) : (
        <ul className={CORBEILLE.racines}>
          {props.racines.map((racine) => (
            <li key={racine.cle} className={CORBEILLE.racine}>
              <Ligne ligne={racine} />
              {racine.descendance.length > 0 && (
                <ul className={CORBEILLE.descendance}>
                  {racine.descendance.map((ligne) => (
                    <li
                      key={ligne.cle}
                      className={CORBEILLE.descendante}
                      aria-level={ligne.niveau}
                      style={{ "--niveau": ligne.niveau - 1 } as CSSProperties}
                    >
                      <Ligne ligne={ligne} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
