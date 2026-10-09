import type { IdPage, PageLue } from "@notionlike/document";
import { type CSSProperties, type ReactElement, type RefObject, useEffect, useRef } from "react";

import { fragmentDe } from "../navigation/route.ts";
import {
  nomAjouterSousPage,
  nomDeplier,
  nomMettreALaCorbeille,
  nomRenommer,
  nomReplier,
  TEXTE_CORBEILLE,
  TEXTE_RENOMMER,
  TEXTE_SOUS_PAGE,
  titreAffiche,
} from "./messages.ts";
import { SaisieTitre } from "./SaisieTitre.tsx";

/** État d'écran de la barre latérale : il vit dans `Application`, hors du document d'espace. */
export interface EcranBarre {
  readonly idPageCourante: IdPage | undefined;
  readonly repliees: ReadonlySet<IdPage>;
  readonly saisie: { readonly idPage: IdPage; readonly erreur: string | undefined } | undefined;
}

export interface ActionsBarre {
  readonly creerPage: (parent: IdPage | null) => void;
  readonly ouvrirSaisie: (id: IdPage) => void;
  readonly validerTitre: (id: IdPage, titre: string) => boolean;
  readonly annulerSaisie: () => void;
  readonly mettreALaCorbeille: (page: PageLue) => void;
  readonly basculerRepli: (id: IdPage) => void;
}

interface Proprietes {
  readonly page: PageLue;
  /** Profondeur de la page dans l'arbre, 1 à la racine. */
  readonly niveau: number;
  readonly ecran: EcranBarre;
  readonly actions: ActionsBarre;
}

// Une rangée ne rend pas ses sous-pages : la liste est plate, la hiérarchie est portée par
// `aria-level` et par le retrait. Un rendu imbriqué fait déborder la pile du navigateur dès
// 1 000 niveaux (mesuré dans Chromium), et une arborescence reçue n'a pas de profondeur bornée.
export function RangeePage({ page, niveau, ecran, actions }: Proprietes): ReactElement {
  const titre = titreAffiche(page.titre);
  const aDesSousPages = page.enfants.length > 0;
  const repliee = ecran.repliees.has(page.id);
  const enSaisie = ecran.saisie?.idPage === page.id;
  const lien = useLienRefocalise(enSaisie);

  return (
    <li aria-level={niveau} style={{ "--niveau": niveau } as CSSProperties}>
      <div className="rangee">
        {aDesSousPages ? (
          <button
            type="button"
            className="repli"
            aria-expanded={!repliee}
            aria-label={repliee ? nomDeplier(titre) : nomReplier(titre)}
            onClick={() => actions.basculerRepli(page.id)}
          >
            <span aria-hidden="true">{repliee ? "▸" : "▾"}</span>
          </button>
        ) : (
          <span className="repli" aria-hidden="true" />
        )}
        {enSaisie ? (
          <SaisieTitre
            titreInitial={page.titre}
            erreur={ecran.saisie?.erreur}
            surValider={(saisi) => actions.validerTitre(page.id, saisi)}
            surAnnuler={actions.annulerSaisie}
          />
        ) : (
          <a
            ref={lien}
            className="lien-page"
            href={fragmentDe({ forme: "page", idPage: page.id })}
            aria-current={ecran.idPageCourante === page.id ? "page" : undefined}
          >
            {titre}
          </a>
        )}
        <span className="actions">
          <button
            type="button"
            aria-label={nomRenommer(titre)}
            onClick={() => actions.ouvrirSaisie(page.id)}
          >
            {TEXTE_RENOMMER}
          </button>
          <button
            type="button"
            aria-label={nomAjouterSousPage(titre)}
            onClick={() => actions.creerPage(page.id)}
          >
            {TEXTE_SOUS_PAGE}
          </button>
          <button
            type="button"
            aria-label={nomMettreALaCorbeille(titre)}
            onClick={() => actions.mettreALaCorbeille(page)}
          >
            {TEXTE_CORBEILLE}
          </button>
        </span>
      </div>
    </li>
  );
}

// Quand la saisie se ferme au clavier, le champ disparaît avec le focus : il revient au lien de la
// page. Une sortie du champ a déjà porté le focus ailleurs : il n'est pas repris.
function useLienRefocalise(enSaisie: boolean): RefObject<HTMLAnchorElement | null> {
  const lien = useRef<HTMLAnchorElement>(null);
  const etaitEnSaisie = useRef(enSaisie);
  useEffect(() => {
    const focusPerdu = document.activeElement === null || document.activeElement === document.body;
    if (etaitEnSaisie.current && !enSaisie && focusPerdu) {
      lien.current?.focus();
    }
    etaitEnSaisie.current = enSaisie;
  }, [enSaisie]);
  return lien;
}
