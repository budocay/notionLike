// Les piles et les cartes de la vue kanban (F-020-AC1, AC2, AC8, AC12) : une pile est un groupe
// nommé par son libellé et son nombre de cartes, une carte est une ligne affichée. Les libellés sont
// rendus comme du texte (AC22). Le geste et le repère de dépôt viennent du module de glisser-déposer.
import { PileGlissable, PilesGlissables, useElementGlissable } from "../../glisser/index.ts";
import { Bouton } from "../../interface/composants/Espaces.tsx";
import { CarteDeKanban, PileDeKanban } from "../../interface/composants/Kanban.tsx";
import { cleAria, TOUCHES_DE_LA_CARTE } from "../../interface/raccourcis.ts";
import { ChampDEdition } from "../ChampDEdition.tsx";
import { idDeCarte, idDePile } from "./identifiants.ts";
import { arretNouvelleCarte, arretPlusDeCartes } from "./navigation.ts";
import type { Carte, Pile } from "./piles.ts";
import {
  AFFICHER_PLUS,
  afficherPlusDans,
  libelleDePile,
  nomDeLaPile,
  nomDesActions,
  nomDuChampDeTitre,
  NOUVELLE_CARTE,
  nouvelleCarteDans,
  PAS_DE_LIGNES,
  titreDeCarte,
} from "./textes.ts";
import type { VueKanban } from "./use-vue-kanban.ts";

const RACCOURCIS_DE_LA_CARTE = [
  TOUCHES_DE_LA_CARTE.pilePrecedente,
  TOUCHES_DE_LA_CARTE.pileSuivante,
  TOUCHES_DE_LA_CARTE.monter,
  TOUCHES_DE_LA_CARTE.descendre,
]
  .map((combinaison) => cleAria(combinaison))
  .join(" ");

function SaisieDuTitre({ vue, carte }: { readonly vue: VueKanban; readonly carte: Carte }) {
  const { titre } = vue;
  const saisie = titre.saisie;
  return (
    <ChampDEdition
      champ={titre.champ}
      nom={nomDuChampDeTitre(carte.titre)}
      texte={saisie?.texte ?? ""}
      date={false}
      idFaute={saisie?.erreur === undefined ? undefined : vue.idAlerte}
      changer={titre.changer}
      valider={(suite) => titre.valider(suite === "sortie")}
      abandonner={titre.abandonner}
      suites={{ entree: "rester", tab: "rester", tabArriere: "rester" }}
    />
  );
}

function UneCarte(props: {
  readonly vue: VueKanban;
  readonly carte: Carte;
  readonly rang: number;
  readonly total: number;
}) {
  const { vue, carte } = props;
  const glisser = useElementGlissable(idDeCarte(carte.id));
  const menuOuvert =
    vue.menu.ouvert?.cible.sorte === "ligne" && vue.menu.ouvert.cible.ligne === carte.id;
  return (
    <CarteDeKanban
      identifiant={carte.id}
      titre={titreDeCarte(carte.titre)}
      vide={carte.titre.trim() === ""}
      rang={props.rang}
      total={props.total}
      courante={vue.focus.courante === carte.id}
      raccourcis={RACCOURCIS_DE_LA_CARTE}
      glisser={glisser}
      refCarte={vue.focus.refDe(carte.id)}
      surFocus={() => vue.focus.surFocus(carte.id)}
      saisie={
        vue.titre.saisie?.carte === carte.id ? <SaisieDuTitre vue={vue} carte={carte} /> : undefined
      }
      nomDesActions={nomDesActions(carte.titre)}
      menuOuvert={menuOuvert}
      surActions={(evenement) => {
        const element = evenement.currentTarget.closest<HTMLElement>("[data-carte]");
        if (element !== null) {
          vue.menu.ouvrir({ sorte: "ligne", ligne: carte.id }, element, vue.cadre.current);
        }
      }}
    />
  );
}

// « Nouvelle carte » et « Afficher 100 cartes de plus » sont des arrêts du plateau : hors de l'ordre de
// tabulation, atteints par les flèches (AC15). Seul l'arrêt courant est dans cet ordre.
function PiedDePile({ vue, pile }: { readonly vue: VueKanban; readonly pile: Pile }) {
  const libelle = pile.option === null ? null : pile.libelle;
  const masquees = pile.cartes.length > vue.limites.limiteDe(pile);
  const arret = (identifiant: string) => ({
    arret: identifiant,
    refBouton: vue.focus.refDe(identifiant),
    tabIndex: vue.focus.courante === identifiant ? 0 : -1,
    surFocus: () => vue.focus.surFocus(identifiant),
  });
  return (
    <>
      <Bouton
        {...arret(arretNouvelleCarte(pile))}
        nom={nouvelleCarteDans(libelle)}
        libelle={NOUVELLE_CARTE}
        raison={vue.proprietes.lectureSeule}
        surActivation={() => vue.actions.creer(pile)}
      />
      {masquees && (
        <Bouton
          {...arret(arretPlusDeCartes(pile))}
          libelle={AFFICHER_PLUS}
          nom={afficherPlusDans(libelle)}
          surActivation={() => vue.actions.afficherPlus(pile)}
        />
      )}
    </>
  );
}

function UnePile({ vue, pile }: { readonly vue: VueKanban; readonly pile: Pile }) {
  const visibles = pile.cartes.slice(0, vue.limites.limiteDe(pile));
  const libelle = pile.option === null ? null : pile.libelle;
  return (
    <PileGlissable
      id={idDePile(pile.option)}
      identifiants={visibles.map(({ id }) => idDeCarte(id))}
      desactivee={vue.desactivee}
    >
      {(zone) => (
        <PileDeKanban
          nom={nomDeLaPile(libelle, pile.cartes.length)}
          libelle={libelleDePile(libelle)}
          nombre={pile.cartes.length}
          vide={PAS_DE_LIGNES}
          refZone={zone.ref}
          survolee={zone.survolee}
          pied={<PiedDePile vue={vue} pile={pile} />}
        >
          {visibles.map((carte, rang) => (
            <UneCarte
              key={carte.id}
              vue={vue}
              carte={carte}
              rang={rang + 1}
              total={pile.cartes.length}
            />
          ))}
        </PileDeKanban>
      )}
    </PileGlissable>
  );
}

export function PilesDuKanban({ vue }: { readonly vue: VueKanban }) {
  return (
    <PilesGlissables
      identifiants={vue.identifiants}
      desactivee={vue.desactivee}
      surLacher={vue.actions.deposer}
      annonces={vue.annonces}
      repereParPile={vue.proprietes.triActif}
    >
      {vue.piles.map((pile) => (
        <UnePile key={idDePile(pile.option)} vue={vue} pile={pile} />
      ))}
    </PilesGlissables>
  );
}
