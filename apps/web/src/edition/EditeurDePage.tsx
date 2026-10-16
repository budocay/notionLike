import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type * as Y from "yjs";

import {
  BarreDeBlocs,
  type CommandeDeBloc,
  PanneauDeLien,
  ZoneDEdition,
  ZoneDeSaisie,
} from "../interface/composants/Edition.tsx";
import {
  ADRESSE_DU_LIEN_REFUSEE,
  APPLIQUER_LE_LIEN,
  CHAMP_ADRESSE_DU_LIEN,
  COMMANDE_GRAS,
  COMMANDE_ITALIQUE,
  COMMANDE_LIEN,
  NOM_DE_LA_BARRE_DE_BLOCS,
  NOM_DE_LA_ZONE_DE_SAISIE,
  NOM_DU_PANNEAU_DE_LIEN,
  OUVRIR_LE_LIEN,
  RETIRER_LE_LIEN,
} from "../interface/messages.ts";
import { type Barre, useBarre } from "./barre.ts";
import { basculerLeGras, basculerLItalique, type EtatDuLien } from "./commandes-de-marque.ts";
import type { ElementsInscrits, OptionsDesMarques } from "./marques.ts";
import { type EtatDuPanneau, usePanneauDeLien } from "./panneau.ts";
import { extensionsDeLEditeur } from "./schema.ts";
import { COMMANDES_DE_TYPE, donnerLeType, memeType } from "./types-de-bloc.ts";

export interface ProprietesEditeurDePage {
  /** Fragment du document de page, fourni par sa façade : seul type où l'éditeur écrit. */
  readonly contenu: Y.XmlFragment;
  /** Garde de version : son rappel détruit l'éditeur et sa liaison (F-003-AC29). */
  readonly garderVersion: (rappel: () => void) => () => void;
  /**
   * Élève la version du document, s'il le faut, avant que l'éditeur n'y inscrive ces nœuds et ces
   * marques ; faux si elle ne peut pas l'être, et rien n'est alors inscrit (F-028-AC21).
   */
  readonly preparerLaVersion: (elements: ElementsInscrits) => boolean;
  /** Vrai si la frappe est le raccourci déclaré qui mène à la barre de blocs (F-003-AC42). */
  readonly meneALaBarre: (frappe: KeyboardEvent<HTMLElement>) => boolean;
  /** Vrai si la frappe est le raccourci déclaré du lien, Mod+K (F-028-AC6, H12). */
  readonly ouvreLePanneauDeLien: (frappe: KeyboardEvent<HTMLElement>) => boolean;
  /** Vrai pour un clic qui ouvre l'adresse d'un lien : Mod enfoncé (F-028-AC10). */
  readonly ouvreLAdresse: (clic: MouseEvent) => boolean;
  /**
   * Vrai : l'espace est ouvert en lecture seule (F-013-AC25) ; ni frappe, ni collage, ni commande
   * de la barre de blocs, ni annulation.
   */
  readonly lectureSeule?: boolean | undefined;
}

export function EditeurDePage(props: ProprietesEditeurDePage): ReactElement {
  const marques = useOptionsDesMarques(props);
  const editeur = useEditeur(props.contenu, props.garderVersion, marques);
  const lectureSeule = useModifiable(editeur, props.lectureSeule === true);
  const zone = useRef<HTMLDivElement>(null);
  const refBarre = useRef<HTMLDivElement>(null);
  const barre = useBarre(editeur, { zone, barre: refBarre });
  const panneau = usePanneauDeLien(editeur);
  const surTouche = (frappe: KeyboardEvent<HTMLElement>): void => {
    if (editeur === null || lectureSeule) {
      return;
    }
    if (props.ouvreLePanneauDeLien(frappe) && editeur.view.dom.contains(frappe.target as Node)) {
      panneau.surRaccourci(frappe);
    } else if (barre.affichee && props.meneALaBarre(frappe)) {
      frappe.preventDefault();
      refBarre.current?.querySelector("button")?.focus();
    }
  };
  const visible = editeur !== null && barre.affichee && !lectureSeule;
  const lien = barre.marques?.lien;
  return (
    <ZoneDEdition
      ref={zone}
      surFocus={barre.surFocus}
      surPerteDeFocus={(evenement) =>
        [barre, panneau].forEach((un) => un.surPerteDeFocus(evenement))
      }
      surTouche={surTouche}
    >
      <ZoneDeSaisie>
        <EditorContent editor={editeur} />
      </ZoneDeSaisie>
      {visible && (
        <BarreDeBlocs
          ref={refBarre}
          nom={NOM_DE_LA_BARRE_DE_BLOCS}
          commandes={commandesDe(editeur, barre, () => panneau.ouvrir(lien?.disponible === true))}
          position={barre.placement}
          surAbandon={() => editeur.view.focus()}
        />
      )}
      {visible && panneau.ouvert && lien !== undefined && (
        <PanneauDeLien {...proprietesDuPanneau(lien, panneau, barre)} />
      )}
    </ZoneDEdition>
  );
}

/** Rend `lectureSeule`, appliquée à l'éditeur (F-013-AC25). */
function useModifiable(editeur: Editor | null, lectureSeule: boolean): boolean {
  useEffect(() => {
    if (editeur !== null && !editeur.isDestroyed) {
      editeur.setEditable(!lectureSeule);
    }
  }, [editeur, lectureSeule]);
  return lectureSeule;
}

function proprietesDuPanneau(lien: EtatDuLien, panneau: EtatDuPanneau, barre: Barre) {
  return {
    refuse: panneau.refuse,
    position: barre.placement,
    surValidation: panneau.valider,
    surRetrait: panneau.retirer,
    surAbandon: panneau.abandonner,
    nom: NOM_DU_PANNEAU_DE_LIEN,
    etiquette: CHAMP_ADRESSE_DU_LIEN,
    appliquer: APPLIQUER_LE_LIEN,
    ouvrir: OUVRIR_LE_LIEN,
    retirer: RETIRER_LE_LIEN,
    messageDeRefus: ADRESSE_DU_LIEN_REFUSEE,
    adresseEnregistree: lien.adresse,
    adresseAOuvrir: lien.ouvrable,
    retirable: lien.retirable,
  } as const;
}

// L'activation applique le type ou la marque, puis rend le focus à la zone de saisie, tout de
// suite : la commande `focus()` de la bibliothèque le rendrait à l'image suivante (F-003-AC42).
function commandesDe(editeur: Editor, barre: Barre, ouvrirLePanneau: () => void): CommandeDeBloc[] {
  const avecFocus = (action: (cible: Editor) => void) => () => {
    action(editeur);
    editeur.view.focus();
  };
  const types = COMMANDES_DE_TYPE.map(({ nom, repere, type }) => ({
    nom,
    repere,
    active: memeType(barre.courant, type),
    surActivation: avecFocus((cible) => donnerLeType(cible, type)),
  }));
  const marques = barre.marques;
  return [
    ...types,
    {
      nom: COMMANDE_GRAS,
      repere: "B",
      active: marques?.gras === true,
      surActivation: avecFocus(basculerLeGras),
    },
    {
      nom: COMMANDE_ITALIQUE,
      repere: "I",
      active: marques?.italique === true,
      surActivation: avecFocus(basculerLItalique),
    },
    {
      nom: COMMANDE_LIEN,
      repere: "↗",
      active: marques?.lien.actif === true,
      indisponible: marques?.lien.disponible !== true,
      surActivation: ouvrirLePanneau,
    },
  ];
}

function creerLEditeur(contenu: Y.XmlFragment, marques: OptionsDesMarques): Editor {
  return new Editor({
    extensions: extensionsDeLEditeur(contenu, marques),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": NOM_DE_LA_ZONE_DE_SAISIE,
      },
    },
  });
}

// L'éditeur ne se recrée pas quand ces fonctions changent : il lit toujours les dernières reçues.
function useOptionsDesMarques(props: ProprietesEditeurDePage): RefObject<OptionsDesMarques> {
  const options = useRef<OptionsDesMarques>(props);
  useEffect(() => {
    options.current = props;
  });
  return options;
}

// Pas de `useEditor` : sous `StrictMode` il laisserait vivre un instant une seconde liaison, que la
// garde ne détruirait pas et qui retirerait du document tout nœud inconnu. Ici, un éditeur par
// passage de l'effet, la garde posée avant que la liaison n'existe, et sa destruction dans le
// nettoyage (F-003-AC29, AC33).
function useEditeur(
  contenu: Y.XmlFragment,
  garderVersion: ProprietesEditeurDePage["garderVersion"],
  marques: RefObject<OptionsDesMarques>,
): Editor | null {
  const [editeur, setEditeur] = useState<Editor | null>(null);
  useEffect(() => {
    let cree: Editor | undefined = undefined;
    const detruire = (): void => {
      if (cree?.isDestroyed === false) {
        cree.destroy();
      }
      setEditeur(null);
    };
    const cesserDeGarder = garderVersion(detruire);
    cree = creerLEditeur(contenu, {
      preparerLaVersion: (elements) => marques.current.preparerLaVersion(elements),
      ouvreLAdresse: (clic) => marques.current.ouvreLAdresse(clic),
    });
    setEditeur(cree);
    return () => {
      cesserDeGarder();
      detruire();
    };
  }, [contenu, garderVersion, marques]);
  return editeur;
}
