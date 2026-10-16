import { Editor } from "@tiptap/core";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { EditorContent } from "@tiptap/react";
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type * as Y from "yjs";

import {
  BarreDeBlocs,
  type CommandeDeBloc,
  PanneauDeLien,
  PoigneeDeBloc,
  PoigneeDuCurseur,
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
  commandeIndisponible,
  DEPLACER_LE_BLOC,
  DESCENDRE_LE_BLOC,
  MONTER_LE_BLOC,
  NOM_DE_LA_BARRE_DE_BLOCS,
  NOM_DE_LA_ZONE_DE_SAISIE,
  NOM_DU_PANNEAU_DE_LIEN,
  OUVRIR_LE_LIEN,
  RETIRER_LE_LIEN,
} from "../interface/messages.ts";
import { type Barre, useBarre } from "./barre.ts";
import { basculerLeGras, basculerLItalique, type EtatDuLien } from "./commandes-de-marque.ts";
import {
  deplacerLeBlocCourant,
  destinationDuBlocCourant,
  type SensDuDeplacement,
} from "./deplacement-de-bloc.ts";
import type { OptionsDuDepot } from "./depot.ts";
import type { ElementsInscrits, OptionsDesMarques } from "./marques.ts";
import { type EtatDuPanneau, usePanneauDeLien } from "./panneau.ts";
import {
  type PoigneeAuCurseur,
  selectionnerLeBlocDuCurseur,
  usePoigneeAuCurseur,
} from "./poignee.ts";
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
   * Le sens du déplacement d'un bloc que la frappe désigne, Alt+Maj+Flèche haut ou bas ;
   * `undefined` pour toute autre frappe (F-006-AC18).
   */
  readonly deplacementDuBloc: (
    frappe: globalThis.KeyboardEvent,
  ) => "monter" | "descendre" | undefined;
  /** Les raccourcis de déplacement d'un bloc, pour `aria-keyshortcuts` de sa poignée. */
  readonly raccourcisDuBloc?: string | undefined;
  /**
   * Faux : aucune poignée de bloc n'est rendue (écran étroit, où le geste à la souris n'est pas
   * offert) ; le bloc se déplace par la barre de blocs et le clavier. Vrai par défaut.
   */
  readonly poignees?: boolean | undefined;
  /**
   * Vrai : l'espace est ouvert en lecture seule (F-013-AC25) ; ni frappe, ni collage, ni commande
   * de la barre de blocs, ni annulation.
   */
  readonly lectureSeule?: boolean | undefined;
}

export function EditeurDePage(props: ProprietesEditeurDePage): ReactElement {
  const { geste, annonce, liens } = useLiensDuDepot();
  const editeur = useEditeur(props, liens);
  const lectureSeule = useModifiable(editeur, props.lectureSeule === true);
  const [zone, refBarre] = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const barre = useBarre(editeur, { zone, barre: refBarre });
  const panneau = usePanneauDeLien(editeur);
  const poignees = avecPoignees(props, lectureSeule);
  const poignee = usePoigneeAuCurseur(editeur, zone, barre.focusDedans && poignees, geste);
  const surTouche = (frappe: KeyboardEvent<HTMLElement>): void => {
    if (editeur !== null && !lectureSeule) {
      surToucheDeLaZone(frappe, { editeur, props, barre, panneau, refBarre });
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
      annonce={regionDEtat(barre, annonce)}
    >
      <ZoneDeSaisie>
        <EditorContent editor={editeur} />
      </ZoneDeSaisie>
      <Poignees
        editeur={poignees ? editeur : null}
        poignee={poignee}
        raccourcis={props.raccourcisDuBloc}
        refBarre={refBarre}
      />
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

interface ZoneTenue {
  readonly editeur: Editor;
  readonly props: ProprietesEditeurDePage;
  readonly barre: Barre;
  readonly panneau: EtatDuPanneau;
  readonly refBarre: RefObject<HTMLDivElement | null>;
}

function surToucheDeLaZone(frappe: KeyboardEvent<HTMLElement>, zone: ZoneTenue): void {
  const { editeur, props, barre, panneau, refBarre } = zone;
  if (props.ouvreLePanneauDeLien(frappe) && editeur.view.dom.contains(frappe.target as Node)) {
    panneau.surRaccourci(frappe);
  } else if (barre.affichee && props.meneALaBarre(frappe)) {
    frappe.preventDefault();
    refBarre.current?.querySelector("button")?.focus();
  }
}

/**
 * La poignée du curseur activée (F-006-AC14, AC28) : une fois le bloc sélectionné et la barre de
 * blocs rendue, le focus va à « Monter le bloc », d'où les flèches mènent à « Descendre le bloc ».
 */
function useVersLesCommandesDeDeplacement(refBarre: RefObject<HTMLDivElement | null>): () => void {
  const demande = useRef(false);
  useEffect(() => {
    const barre = refBarre.current;
    if (demande.current && barre !== null) {
      demande.current = false;
      barre.querySelector<HTMLElement>(`[aria-label="${MONTER_LE_BLOC}"]`)?.focus();
    }
  });
  return () => {
    demande.current = true;
  };
}

/** Texte de la région d'état de l'éditeur, qui n'existe que le focus dedans (`useLiensDuDepot`). */
function regionDEtat(barre: Barre, annonce: string): string | undefined {
  return barre.focusDedans ? annonce : undefined;
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

/**
 * Ni en lecture seule, ni sur écran étroit (F-006, hors périmètre) ; sans poignées, le bloc du
 * curseur n'est pas mesuré à chaque transaction.
 */
function avecPoignees(props: ProprietesEditeurDePage, lectureSeule: boolean): boolean {
  return !lectureSeule && props.poignees !== false;
}

/**
 * La poignée que l'éditeur place au survol d'un bloc, et celle du bloc du curseur quand le pointeur
 * n'en montre aucune (F-006-AC14). Ni l'une ni l'autre n'écrit dans le document à l'affichage.
 */
function Poignees(props: {
  /** Absent, ou en lecture seule : aucune poignée. */
  readonly editeur: Editor | null;
  readonly poignee: PoigneeAuCurseur;
  readonly raccourcis: string | undefined;
  /** La barre de blocs, où le focus va après la sélection du bloc par la poignée du curseur. */
  readonly refBarre: RefObject<HTMLDivElement | null>;
}): ReactElement | null {
  const { editeur, poignee, raccourcis, refBarre } = props;
  const versLesCommandes = useVersLesCommandesDeDeplacement(refBarre);
  if (editeur === null) {
    return null;
  }
  return (
    <>
      <DragHandle
        editor={editeur}
        onElementDragStart={poignee.surDebutDuGeste}
        onElementDragEnd={poignee.surFinDuGeste}
        onNodeChange={({ node }) => poignee.surSurvol(node !== null)}
      >
        <PoigneeDeBloc nom={DEPLACER_LE_BLOC} raccourcis={raccourcis} />
      </DragHandle>
      {poignee.haut !== undefined && (
        <PoigneeDuCurseur
          nom={DEPLACER_LE_BLOC}
          raccourcis={raccourcis}
          haut={poignee.haut}
          surActivation={() => {
            if (selectionnerLeBlocDuCurseur(editeur)) {
              versLesCommandes();
            }
          }}
        />
      )}
    </>
  );
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
    ...commandesDeDeplacement(editeur, avecFocus),
  ];
}

// « Monter le bloc » et « Descendre le bloc » (F-006-AC18) : indisponibles sur le premier, le
// dernier, ou une sélection sur plusieurs blocs ; le curseur reste dans son bloc.
function commandesDeDeplacement(
  editeur: Editor,
  avecFocus: (action: (cible: Editor) => void) => () => void,
): CommandeDeBloc[] {
  const commande = (nom: string, repere: string, sens: SensDuDeplacement): CommandeDeBloc => ({
    nom,
    repere,
    active: false,
    indisponible: destinationDuBlocCourant(editeur.state, sens) === undefined,
    surActivation: avecFocus((cible) => void deplacerLeBlocCourant(cible, sens)),
  });
  return [commande(MONTER_LE_BLOC, "↑", "monter"), commande(DESCENDRE_LE_BLOC, "↓", "descendre")];
}

function creerLEditeur(
  contenu: Y.XmlFragment,
  marques: OptionsDesMarques,
  depot: OptionsDuDepot,
): Editor {
  return new Editor({
    extensions: extensionsDeLEditeur(contenu, marques, depot),
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
function useOptionsRecues(props: ProprietesEditeurDePage): RefObject<ProprietesEditeurDePage> {
  const options = useRef<ProprietesEditeurDePage>(props);
  useEffect(() => {
    options.current = props;
  });
  return options;
}

/** Ce que le gestionnaire de dépôt lit et dit hors de l'éditeur : le geste en cours, l'annonce. */
interface LiensDuDepot {
  readonly geste: RefObject<boolean>;
  /** Stable d'un rendu à l'autre (une fonction d'état), sans quoi l'éditeur serait recréé. */
  readonly annoncer: (texte: string) => void;
}

/**
 * Le drapeau du geste de la poignée, et le texte de la région d'état que le dépôt remplit
 * (F-006-AC18). La région n'existe que tant que le focus est dans la zone d'édition, où naît
 * tout raccourci : présente avant l'annonce, elle est lue ; absente ailleurs, elle ne double pas
 * celle de l'état de chargement.
 */
function useLiensDuDepot(): {
  readonly geste: RefObject<boolean>;
  readonly annonce: string;
  readonly liens: LiensDuDepot;
} {
  const geste = useRef(false);
  const [annonce, annoncer] = useState("");
  const liens = useMemo(() => ({ geste, annoncer }), []);
  return { geste, annonce, liens };
}

// Pas de `useEditor` : sous `StrictMode` il laisserait vivre un instant une seconde liaison, que la
// garde ne détruirait pas et qui retirerait du document tout nœud inconnu. Ici, un éditeur par
// passage de l'effet, la garde posée avant que la liaison n'existe, et sa destruction dans le
// nettoyage (F-003-AC29, AC33).
function useEditeur(
  props: ProprietesEditeurDePage,
  { geste, annoncer }: LiensDuDepot,
): Editor | null {
  const { contenu, garderVersion } = props;
  const options = useOptionsRecues(props);
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
    cree = creerLEditeur(
      contenu,
      {
        preparerLaVersion: (elements) => options.current.preparerLaVersion(elements),
        ouvreLAdresse: (clic) => options.current.ouvreLAdresse(clic),
      },
      {
        deplacementDuBloc: (frappe) => options.current.deplacementDuBloc(frappe),
        gesteDeLaPoignee: () => geste.current,
        surIndisponible: (sens) =>
          annoncer(commandeIndisponible(sens === "monter" ? MONTER_LE_BLOC : DESCENDRE_LE_BLOC)),
      },
    );
    setEditeur(cree);
    return () => {
      cesserDeGarder();
      detruire();
    };
  }, [contenu, garderVersion, options, geste, annoncer]);
  return editeur;
}
