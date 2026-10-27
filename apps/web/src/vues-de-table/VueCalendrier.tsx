// Vue « Calendrier » (F-021) : les lignes d'une table posées sur la grille d'un mois selon une
// colonne de date, déplacées par des commandes au clavier comme au pointeur, les lignes sans date
// dans un panneau à part. Ni bibliothèque de calendrier ni de dates : l'arithmétique des jours est
// celle de `jours.ts` (F-021-AC15). Le module ne touche au document que par la façade (F-018-AC54).
import type { LigneLue } from "@notionlike/document";
import { type ReactElement, useEffect, useRef, useState } from "react";

import {
  CadreDuCalendrier,
  CaseDuCalendrier,
  CommandeDeCase,
  EntreeDuCalendrier,
  GrilleDuCalendrier,
  LibelleDEntree,
  LignesDuPanneau,
  LigneDuPanneau,
  NoteDuPanneau,
  PanneauDeCalendrier,
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
import { MenuActions, type EntreeDeMenu } from "../interface/composants/MenuActions.tsx";
import {
  EcranDeTableCadre,
  ChampDeFormulaire,
  InvitationDeTable,
  SurfaceFlottante,
} from "../interface/composants/Table.tsx";
import { afficherTouches, cleAria, TOUCHES_DE_L_ENTREE } from "../interface/raccourcis.ts";
import { BoiteNouvelleColonne, Confirmation } from "./Boites.tsx";
import { touchesDeBoite } from "./boite.ts";
import { ChampDEdition } from "./ChampDEdition.tsx";
import { jourVise, type PasDeJours } from "./commandes-calendrier.ts";
import { decomposer } from "./jours.ts";
import {
  AFFICHER_PLUS_DE_LIGNES,
  AJOUTER_UNE_COLONNE_DATE,
  AUJOURD_HUI,
  CALENDRIER_SANS_COLONNE_DE_DATE,
  CHANGER_LA_DATE,
  commandeSurLEntree,
  DATE_DE_LA_LIGNE,
  DEFINIR_LA_DATE,
  HORS_DES_BORNES,
  JOUR_PRECEDENT,
  JOUR_SUIVANT,
  LIMITE_DU_CALENDRIER,
  MODIFIER_LE_TITRE,
  MOIS_PRECEDENT,
  MOIS_SUIVANT,
  nomDeLaCase,
  nomDeLaGrilleDuCalendrier,
  NOMS_DES_JOURS,
  nomDesAutres,
  nomDuMenuDeLaCase,
  nomDuMenuDeLEntree,
  nomDuTitreDeLEntree,
  nomNouvelleLigne,
  NOUVELLE_LIGNE_DU_JOUR,
  numeroDeCase,
  PANNEAU_VIDE,
  PAS_DE_COLONNE_DE_TITRE,
  PLACER_SELON,
  autresEntrees,
  RETIRER_LA_DATE,
  SEMAINE_PRECEDENTE,
  SEMAINE_SUIVANTE,
  SUPPRIMER_L_ENTREE,
  titreDeLaBoiteDeDate,
  titreDuMois,
  titreDuPanneau,
  VALIDER,
} from "./textes-calendrier.ts";
import {
  ANNULER,
  DATE_INVALIDE,
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

const JOURS_PAR_SEMAINE = 7;
const DATE_MIN = "0001-01-01";
const DATE_MAX = "9999-12-31";

const PAS: readonly {
  readonly pas: PasDeJours;
  readonly libelle: string;
  readonly touche: keyof typeof TOUCHES_DE_L_ENTREE;
}[] = [
  { pas: -1, libelle: JOUR_PRECEDENT, touche: "jourPrecedent" },
  { pas: 1, libelle: JOUR_SUIVANT, touche: "jourSuivant" },
  { pas: -7, libelle: SEMAINE_PRECEDENTE, touche: "semainePrecedente" },
  { pas: 7, libelle: SEMAINE_SUIVANTE, touche: "semaineSuivante" },
];

/**
 * Combinaisons d'une entrée, exposées par `aria-keyshortcuts` sans entrer dans son nom ; une
 * commande indisponible (lecture seule, borne du calendrier) n'expose pas son raccourci (AC12).
 */
function raccourcisDeLEntree(vue: Vue, ligne: LigneLue): string {
  const date = vue.modele.dateVisee;
  if (vue.proprietes.lectureSeule !== undefined || date === undefined) {
    return "";
  }
  return PAS.filter(({ pas }) => jourVise(ligne, date, pas) !== undefined)
    .map(({ touche }) => cleAria(TOUCHES_DE_L_ENTREE[touche]))
    .join(" ");
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
      raccourcis={raccourcisDeLEntree(vue, ligne) || undefined}
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
      refGrille={null}
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

// ── Menu d'une case ou d'une entrée ──────────────────────────────────────────────────────────────

function deplacementsDeLEntree(vue: Vue, ligne: LigneLue): EntreeDeMenu[] {
  const { commandes, menu } = vue;
  const date = vue.modele.dateVisee;
  const libelle = vue.modele.libelleDe(ligne);
  return PAS.map(({ pas, libelle: commande, touche }) => {
    const horsDesBornes = date === undefined || jourVise(ligne, date, pas) === undefined;
    const raison = vue.proprietes.lectureSeule ?? (horsDesBornes ? HORS_DES_BORNES : undefined);
    return {
      libelle: commande,
      nom: commandeSurLEntree(commande, libelle),
      touches: afficherTouches(TOUCHES_DE_L_ENTREE[touche]),
      raccourci: raison === undefined ? cleAria(TOUCHES_DE_L_ENTREE[touche]) : undefined,
      raison,
      surActivation: () => {
        menu.fermer();
        commandes.deplacer(ligne, pas);
      },
    };
  });
}

function entreesDuMenuDeLEntree(vue: Vue, id: string): EntreeDeMenu[] {
  const ligne = vue.proprietes.lignes.find((une) => une.id === id);
  if (ligne === undefined || vue.modele.dateVisee === undefined) {
    return [];
  }
  const { commandes, menu } = vue;
  const lectureSeule = vue.proprietes.lectureSeule;
  const libelle = vue.modele.libelleDe(ligne);
  const agir = (effet: () => void) => () => {
    menu.fermer();
    effet();
  };
  return [
    {
      libelle: MODIFIER_LE_TITRE,
      nom: commandeSurLEntree(MODIFIER_LE_TITRE, libelle),
      touches: afficherTouches(TOUCHES_DE_L_ENTREE.modifierLeTitre),
      raison: lectureSeule ?? (vue.modele.rangDuTitre >= 0 ? undefined : PAS_DE_COLONNE_DE_TITRE),
      surActivation: agir(() => commandes.ouvrirLaSaisie(ligne)),
    },
    ...deplacementsDeLEntree(vue, ligne),
    {
      libelle: CHANGER_LA_DATE,
      nom: commandeSurLEntree(CHANGER_LA_DATE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.ouvrirUneBoite({ sorte: "date", ligne: id })),
    },
    {
      libelle: RETIRER_LA_DATE,
      nom: commandeSurLEntree(RETIRER_LA_DATE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.retirerLaDate(ligne)),
    },
    {
      libelle: SUPPRIMER_L_ENTREE,
      nom: commandeSurLEntree(SUPPRIMER_L_ENTREE, libelle),
      raison: lectureSeule,
      surActivation: agir(() => commandes.ouvrirUneBoite({ sorte: "supprimer", ligne: id })),
    },
  ];
}

function entreesDuMenuDeLaCase(vue: Vue, jour: string): EntreeDeMenu[] {
  const { commandes, menu } = vue;
  const total = vue.modele.repartition.parJour.get(jour)?.length ?? 0;
  const restantes = vue.navigation.depliees.has(jour) ? 0 : total - ENTREES_PAR_CASE;
  return [
    {
      libelle: NOUVELLE_LIGNE_DU_JOUR,
      nom: nomNouvelleLigne(jour),
      raison: vue.proprietes.lectureSeule,
      surActivation: () => {
        menu.fermer();
        commandes.nouvelleLigne(jour);
      },
    },
    ...(restantes > 0
      ? [
          {
            libelle: autresEntrees(restantes),
            nom: nomDesAutres(restantes, jour),
            surActivation: () => {
              menu.fermer();
              commandes.deplier(jour);
              vue.suivi.suivre({ sorte: "case", jour });
            },
          },
        ]
      : []),
  ];
}

function MenuOuvert({ vue }: { readonly vue: Vue }): ReactElement | null {
  const ouvert = vue.menu.ouvert;
  if (ouvert === undefined) {
    return null;
  }
  const { cible, ancre } = ouvert;
  const ligne =
    cible.sorte === "entree"
      ? vue.proprietes.lignes.find((une) => une.id === cible.ligne)
      : undefined;
  if (cible.sorte === "entree" && ligne === undefined) {
    return null;
  }
  const nom =
    ligne === undefined
      ? nomDuMenuDeLaCase(cible.jour)
      : nomDuMenuDeLEntree(vue.modele.libelleDe(ligne));
  const entrees =
    cible.sorte === "entree"
      ? entreesDuMenuDeLEntree(vue, cible.ligne)
      : entreesDuMenuDeLaCase(vue, cible.jour);
  return (
    <SurfaceFlottante x={ancre.x} y={ancre.y} largeur={ancre.largeur} hauteur={ancre.hauteur}>
      <MenuActions ref={vue.menu.surface} nom={nom} entrees={entrees} />
    </SurfaceFlottante>
  );
}

// ── Panneau « Sans date » ────────────────────────────────────────────────────────────────────────

function PanneauSansDate({ vue }: { readonly vue: Vue }): ReactElement {
  const { sansDate } = vue.modele.repartition;
  const visibles = sansDate.slice(0, vue.navigation.limiteDuPanneau);
  const raison = vue.proprietes.lectureSeule;
  const { commandes } = vue;
  return (
    <PanneauDeCalendrier titre={titreDuPanneau(sansDate.length)}>
      {sansDate.length === 0 ? (
        <NoteDuPanneau texte={PANNEAU_VIDE} />
      ) : (
        <LignesDuPanneau>
          {visibles.map((ligne) => {
            const libelle = vue.modele.libelleDe(ligne);
            return (
              <LigneDuPanneau key={ligne.id} ligne={ligne.id} nom={libelle} libelle={libelle}>
                <Bouton
                  libelle={DEFINIR_LA_DATE}
                  nom={commandeSurLEntree(DEFINIR_LA_DATE, libelle)}
                  raison={raison}
                  surActivation={() => commandes.ouvrirUneBoite({ sorte: "date", ligne: ligne.id })}
                />
                <Bouton
                  libelle={RETIRER_LA_DATE}
                  nom={commandeSurLEntree(RETIRER_LA_DATE, libelle)}
                  raison={raison}
                  surActivation={() => commandes.retirerLaDate(ligne)}
                />
              </LigneDuPanneau>
            );
          })}
        </LignesDuPanneau>
      )}
      {sansDate.length > visibles.length && (
        <Bouton libelle={AFFICHER_PLUS_DE_LIGNES} surActivation={commandes.plusDeLignes} />
      )}
    </PanneauDeCalendrier>
  );
}

// ── Boîtes ───────────────────────────────────────────────────────────────────────────────────────

function BoiteDeDate({ vue, id }: { readonly vue: Vue; readonly id: string }): ReactElement | null {
  const ligne = vue.proprietes.lignes.find((une) => une.id === id);
  const rang = vue.modele.dateVisee?.rang ?? -1;
  const actuelle = ligne?.cellules[rang];
  const [valeur, setValeur] = useState<{ texte: string; faute: string | undefined }>({
    texte: typeof actuelle === "string" ? actuelle : "",
    faute: undefined,
  });
  const champ = useRef<HTMLInputElement>(null);
  if (ligne === undefined) {
    return null;
  }
  const libelle = vue.modele.libelleDe(ligne);
  const fermer = (): void => vue.commandes.fermerLaBoite(id);
  const valider = (): void => {
    const refus =
      valeur.texte === "" ? DATE_INVALIDE : vue.commandes.fixerLaDate(ligne, valeur.texte);
    if (refus === undefined) {
      vue.commandes.fermerLaBoite();
    } else {
      setValeur({ ...valeur, faute: refus });
    }
  };
  return (
    <BoiteDeDialogue
      alerte={false}
      titre={titreDeLaBoiteDeDate(libelle)}
      phrases={[]}
      initial={champ}
      surTouche={touchesDeBoite(fermer)}
    >
      <Formulaire nom={titreDeLaBoiteDeDate(libelle)} surEnvoi={valider}>
        <ChampDeFormulaire
          refChamp={champ}
          etiquette={DATE_DE_LA_LIGNE}
          faute={valeur.faute}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={valeur.texte}
          onChange={(evenement) => setValeur({ texte: evenement.target.value, faute: undefined })}
        />
        <Actions>
          <Bouton type="submit" libelle={VALIDER} />
          <Bouton libelle={ANNULER} surActivation={fermer} />
        </Actions>
      </Formulaire>
    </BoiteDeDialogue>
  );
}

function BoiteOuverte({ vue }: { readonly vue: Vue }): ReactElement | null {
  const { boite, commandes } = vue;
  switch (boite?.sorte) {
    case undefined:
      return null;
    case "nouvelle-colonne":
      return (
        <BoiteNouvelleColonne
          vue={{ moyens: vue.moyens, fermerBoite: () => commandes.fermerLaBoite() }}
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
            surActivation={commandes.moisPrecedent}
          />
          <Bouton libelle={AUJOURD_HUI} surActivation={commandes.aujourdhui} />
          <Bouton
            libelle={MOIS_SUIVANT}
            raison={vue.suivantDisponible ? undefined : LIMITE_DU_CALENDRIER}
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

export function VueCalendrier(proprietes: ProprietesVueCalendrier): ReactElement {
  const vue = useVueCalendrier(proprietes);
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
          <MenuOuvert vue={vue} />
        </CadreDuCalendrier>
      )}
      <BoiteOuverte vue={vue} />
    </EcranDeTableCadre>
  );
}
