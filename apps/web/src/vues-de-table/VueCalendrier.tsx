// Vue « Calendrier » (F-021) : les lignes d'une table posées sur la grille d'un mois selon une
// colonne de date, déplacées par des commandes au clavier comme au pointeur, les lignes sans date
// dans un panneau à part. Ni bibliothèque de calendrier ni de dates : l'arithmétique des jours est
// celle de `jours.ts` (F-021-AC15). Le module ne touche au document que par la façade (F-018-AC54).
import type { LigneLue } from "@notionlike/document";
import { type ReactElement, type RefObject, useEffect, useRef, useState } from "react";

import {
  CadreDuCalendrier,
  CaseDuCalendrier,
  CommandeDeCase,
  EntreeDuCalendrier,
  GrilleDuCalendrier,
  LibelleDEntree,
  SemaineDuCalendrier,
  TitreDuMois,
} from "../interface/composants/Calendrier.tsx";
import {
  Actions,
  BoiteDeDialogue,
  Bouton,
  Choix,
  Formulaire,
} from "../interface/composants/Espaces.tsx";
import {
  EcranDeTableCadre,
  ChampDeFormulaire,
  InvitationDeTable,
} from "../interface/composants/Table.tsx";
import { cleAria, TOUCHES_DE_L_ENTREE, TOUCHES_DE_LA_CASE } from "../interface/raccourcis.ts";
import { BoiteNouvelleColonne, Confirmation } from "./Boites.tsx";
import { touchesDeBoite } from "./boite.ts";
import { ChampDEdition } from "./ChampDEdition.tsx";
import { jourVise, refusDeLaDate } from "./dates-visees.ts";
import { MenuDuCalendrierOuvert } from "./MenuDuCalendrier.tsx";
import { PanneauSansDate } from "./PanneauSansDate.tsx";
import { PAS } from "./pas-du-calendrier.ts";
import { decomposer, DERNIER_JOUR, JOURS_PAR_SEMAINE, PREMIER_JOUR } from "./jours.ts";
import {
  AJOUTER_UNE_COLONNE_DATE,
  AUJOURD_HUI,
  CALENDRIER_SANS_COLONNE_DE_DATE,
  DATE_DE_LA_LIGNE,
  LIMITE_DU_CALENDRIER,
  MOIS_PRECEDENT,
  MOIS_SUIVANT,
  nomDeLaCase,
  nomDeLaGrilleDuCalendrier,
  NOMS_DES_JOURS,
  nomDesAutres,
  nomDuMenuDeLEntree,
  nomDuTitreDeLEntree,
  nomNouvelleLigne,
  numeroDeCase,
  PLACER_SELON,
  autresEntrees,
  titreDeLaBoiteDeDate,
  titreDuMois,
  VALIDER,
} from "./textes-calendrier.ts";
import {
  ANNULER,
  nomAffiche,
  SUPPRIMER_LA_LIGNE,
  TEXTE_DE_LA_SUPPRESSION_DE_LIGNE,
  titreDeLaSuppressionDeLigne,
} from "./textes.ts";
import {
  ENTREES_PAR_CASE,
  type ProprietesVueCalendrier,
  useVueCalendrier,
  type VueCalendrier as Vue,
} from "./use-vue-calendrier.ts";

/**
 * Combinaisons d'une entrée, exposées par `aria-keyshortcuts` sans entrer dans son nom ; une
 * commande indisponible (lecture seule, borne du calendrier) n'expose pas son raccourci (AC12).
 */
function raccourcisDeLEntree(vue: Vue, ligne: LigneLue): string {
  const date = vue.modele.dateVisee;
  const menu = cleAria(TOUCHES_DE_L_ENTREE.menu);
  if (vue.proprietes.lectureSeule !== undefined || date === undefined) {
    return menu;
  }
  return [
    ...PAS.filter(({ pas }) => jourVise(ligne, date, pas) !== undefined).map(({ touche }) =>
      cleAria(TOUCHES_DE_L_ENTREE[touche]),
    ),
    menu,
  ].join(" ");
}

// ── Entrées et cases ─────────────────────────────────────────────────────────────────────────────

function Entree({ vue, ligne }: { readonly vue: Vue; readonly ligne: LigneLue }) {
  const libelle = vue.modele.libelleDe(ligne);
  const champ = useRef<HTMLInputElement>(null);
  const saisie = vue.saisie?.ligne === ligne.id ? vue.saisie : undefined;
  const erreur = saisie?.erreur;
  useEffect(() => {
    // Une saisie refusée garde le champ ouvert et le focus (F-018-AC27, AC28).
    if (erreur !== undefined) {
      champ.current?.focus();
    }
  }, [erreur]);
  const { commandes } = vue;
  return (
    <EntreeDuCalendrier
      ligne={ligne.id}
      nom={libelle}
      raccourcis={raccourcisDeLEntree(vue, ligne)}
      contenu={
        saisie === undefined ? (
          <LibelleDEntree texte={libelle} />
        ) : (
          <ChampDEdition
            champ={champ}
            nom={nomDuTitreDeLEntree(libelle)}
            texte={saisie.texte}
            date={false}
            idFaute={erreur === undefined ? undefined : vue.idAlerte}
            changer={commandes.changerLaSaisie}
            valider={commandes.validerLaSaisie}
            abandonner={commandes.abandonnerLaSaisie}
            suites={{ entree: "rester", tab: "rester", tabArriere: "rester" }}
          />
        )
      }
      menu={
        saisie === undefined ? (
          <CommandeDeCase
            libelle="⋯"
            nom={nomDuMenuDeLEntree(libelle)}
            surActivation={commandes.ouvrirLeMenu}
          />
        ) : null
      }
    />
  );
}

function CaseDuMois({ vue, jour }: { readonly vue: Vue; readonly jour: string }): ReactElement {
  const entrees = vue.modele.repartition.parJour.get(jour) ?? [];
  const horsDuMois = decomposer(jour)?.mois !== vue.navigation.mois.mois;
  const toutes = vue.navigation.depliees.has(jour);
  const visibles = toutes ? entrees : entrees.slice(0, ENTREES_PAR_CASE);
  const restantes = entrees.length - visibles.length;
  return (
    <CaseDuCalendrier
      jour={jour}
      nom={nomDeLaCase(jour, entrees.length)}
      numero={numeroDeCase(jour, horsDuMois)}
      horsDuMois={horsDuMois}
      aujourdhui={jour === vue.aujourdhui}
      focalisable={jour === vue.jourFocalisable}
      raccourcis={cleAria(TOUCHES_DE_LA_CASE.menu)}
      commandeDeLigne={
        <CommandeDeCase
          libelle="+"
          nom={nomNouvelleLigne(jour)}
          raison={vue.proprietes.lectureSeule}
          surActivation={() => vue.commandes.nouvelleLigne(jour)}
        />
      }
    >
      {visibles.map((ligne) => (
        <Entree key={ligne.id} vue={vue} ligne={ligne} />
      ))}
      {restantes > 0 && (
        <CommandeDeCase
          libelle={autresEntrees(restantes)}
          nom={nomDesAutres(restantes, jour)}
          surActivation={() => vue.commandes.deplier(jour)}
        />
      )}
    </CaseDuCalendrier>
  );
}

function GrilleDuMois({ vue }: { readonly vue: Vue }): ReactElement {
  const semaines: string[][] = [];
  for (let debut = 0; debut < vue.modele.grille.length; debut += JOURS_PAR_SEMAINE) {
    semaines.push(vue.modele.grille.slice(debut, debut + JOURS_PAR_SEMAINE));
  }
  return (
    <GrilleDuCalendrier
      nom={nomDeLaGrilleDuCalendrier(vue.proprietes.titre, vue.navigation.mois)}
      jours={NOMS_DES_JOURS}
      surTouche={vue.commandes.surTouche}
    >
      {semaines.map((semaine) => (
        <SemaineDuCalendrier key={semaine[0]}>
          {semaine.map((jour) => (
            <CaseDuMois key={jour} vue={vue} jour={jour} />
          ))}
        </SemaineDuCalendrier>
      ))}
    </GrilleDuCalendrier>
  );
}

// ── Boîtes ───────────────────────────────────────────────────────────────────────────────────────

function FormulaireDeDate(props: {
  readonly vue: Vue;
  readonly ligne: LigneLue;
  readonly champ: RefObject<HTMLInputElement | null>;
  readonly fermer: () => void;
}): ReactElement {
  const { vue, ligne, champ, fermer } = props;
  const actuelle = ligne.cellules[vue.modele.dateVisee?.rang ?? -1];
  const [valeur, setValeur] = useState<{ texte: string; faute: string | undefined }>({
    texte: typeof actuelle === "string" ? actuelle : "",
    faute: undefined,
  });
  const nom = titreDeLaBoiteDeDate(vue.modele.libelleDe(ligne));
  const valider = (): void => {
    const refus = refusDeLaDate(valeur.texte, (jour) => vue.commandes.fixerLaDate(ligne, jour));
    if (refus === undefined) {
      vue.commandes.fermerLaBoite();
    } else {
      setValeur({ ...valeur, faute: refus });
    }
  };
  return (
    <Formulaire nom={nom} surEnvoi={valider}>
      <ChampDeFormulaire
        refChamp={champ}
        etiquette={DATE_DE_LA_LIGNE}
        faute={valeur.faute}
        type="date"
        min={PREMIER_JOUR}
        max={DERNIER_JOUR}
        value={valeur.texte}
        onChange={(evenement) => setValeur({ texte: evenement.target.value, faute: undefined })}
      />
      <Actions>
        <Bouton type="submit" libelle={VALIDER} />
        <Bouton libelle={ANNULER} surActivation={fermer} />
      </Actions>
    </Formulaire>
  );
}

function BoiteDeDate({ vue, id }: { readonly vue: Vue; readonly id: string }): ReactElement | null {
  const ligne = vue.proprietes.lignes.find((une) => une.id === id);
  const champ = useRef<HTMLInputElement>(null);
  if (ligne === undefined) {
    return null;
  }
  const fermer = (): void => vue.commandes.fermerLaBoite(id);
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={titreDeLaBoiteDeDate(vue.modele.libelleDe(ligne))}
      phrases={[]}
      initial={champ}
      surTouche={touchesDeBoite(fermer)}
    >
      <FormulaireDeDate vue={vue} ligne={ligne} champ={champ} fermer={fermer} />
    </BoiteDeDialogue>
  );
}

/** Où le focus va quand « Nouvelle colonne » se ferme : l'invitation (annulation), ou la grille (création). */
type RetourDuFocus = "invitation" | "grille";

function BoiteDuCalendrierOuverte({
  vue,
  retour,
}: {
  readonly vue: Vue;
  readonly retour: RefObject<RetourDuFocus | undefined>;
}): ReactElement | null {
  const { boite, commandes } = vue;
  switch (boite?.sorte) {
    case undefined:
      return null;
    case "nouvelle-colonne":
      return (
        <BoiteNouvelleColonne
          ajouter={commandes.ajouterUneColonne}
          fermer={(rendre) => {
            retour.current = rendre ? "invitation" : "grille";
            commandes.fermerLaBoite();
          }}
          typeInitial="date"
        />
      );
    case "date":
      return <BoiteDeDate vue={vue} id={boite.ligne} />;
    case "supprimer": {
      const ligne = vue.proprietes.lignes.find((une) => une.id === boite.ligne);
      if (ligne === undefined) {
        return null;
      }
      const rang = vue.proprietes.lignes.indexOf(ligne) + 1;
      return (
        <Confirmation
          titre={titreDeLaSuppressionDeLigne(rang)}
          phrases={TEXTE_DE_LA_SUPPRESSION_DE_LIGNE}
          confirmer={SUPPRIMER_LA_LIGNE}
          fermer={() => commandes.fermerLaBoite(boite.ligne)}
          surConfirmation={() => {
            commandes.fermerLaBoite();
            commandes.supprimer(ligne);
          }}
        />
      );
    }
  }
}

// ── Écran ────────────────────────────────────────────────────────────────────────────────────────

function Outils({ vue }: { readonly vue: Vue }): ReactElement {
  const { commandes } = vue;
  const dateVisee = vue.modele.dateVisee;
  return (
    <>
      {vue.proprietes.selecteur}
      {dateVisee !== undefined && (
        <>
          <Bouton
            libelle={MOIS_PRECEDENT}
            raison={vue.precedentDisponible ? undefined : LIMITE_DU_CALENDRIER}
            resterFocalisable
            surActivation={commandes.moisPrecedent}
          />
          <Bouton libelle={AUJOURD_HUI} surActivation={commandes.aujourdhui} />
          <Bouton
            libelle={MOIS_SUIVANT}
            raison={vue.suivantDisponible ? undefined : LIMITE_DU_CALENDRIER}
            resterFocalisable
            surActivation={commandes.moisSuivant}
          />
          <TitreDuMois texte={titreDuMois(vue.navigation.mois)} />
          {vue.colonnesDeDate.length >= 2 && (
            <Choix
              nom={PLACER_SELON}
              valeur={dateVisee.colonne.id}
              options={vue.colonnesDeDate.map((colonne) => ({
                valeur: colonne.id,
                libelle: nomAffiche(colonne.nom),
              }))}
              surChoix={commandes.choisirLaColonne}
            />
          )}
        </>
      )}
    </>
  );
}

// Après « Nouvelle colonne » (F-021-AC7) : annulée, le focus revient à « Ajouter une colonne Date » ;
// créée, il passe à la case focalisable de la grille, ou à l'invitation si aucune colonne de date n'est née.
function useRetourDuFocus(vue: Vue, invitation: RefObject<HTMLButtonElement | null>) {
  const retour = useRef<RetourDuFocus | undefined>(undefined);
  const { boite, suivi, jourFocalisable } = vue;
  const avecGrille = vue.modele.dateVisee !== undefined;
  useEffect(() => {
    if (boite !== undefined || retour.current === undefined) {
      return;
    }
    const vers = retour.current;
    retour.current = undefined;
    if (vers === "grille" && avecGrille) {
      suivi.suivre({ sorte: "case", jour: jourFocalisable });
    } else {
      invitation.current?.focus();
    }
  });
  return retour;
}

export function VueCalendrier(proprietes: ProprietesVueCalendrier): ReactElement {
  const vue = useVueCalendrier(proprietes);
  const invitation = useRef<HTMLButtonElement>(null);
  const retour = useRetourDuFocus(vue, invitation);
  return (
    <EcranDeTableCadre
      outils={<Outils vue={vue} />}
      annonce={vue.annonce}
      alerte={vue.alerte}
      idAlerte={vue.idAlerte}
    >
      {vue.modele.dateVisee === undefined ? (
        <InvitationDeTable texte={CALENDRIER_SANS_COLONNE_DE_DATE}>
          <Bouton
            refBouton={invitation}
            libelle={AJOUTER_UNE_COLONNE_DATE}
            raison={proprietes.lectureSeule}
            surActivation={() => vue.commandes.ouvrirUneBoite({ sorte: "nouvelle-colonne" })}
          />
        </InvitationDeTable>
      ) : (
        <CadreDuCalendrier
          refCadre={vue.cadre}
          surFocus={vue.suivi.surFocus}
          surSortie={vue.suivi.surSortie}
        >
          <GrilleDuMois vue={vue} />
          <PanneauSansDate vue={vue} />
          <MenuDuCalendrierOuvert vue={vue} />
        </CadreDuCalendrier>
      )}
      <BoiteDuCalendrierOuverte vue={vue} retour={retour} />
    </EcranDeTableCadre>
  );
}
