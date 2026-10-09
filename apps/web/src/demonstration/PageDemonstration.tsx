// Page de démonstration (F-004-AC50) : chaque composant de présentation dans chacun de ses états,
// sur des données fictives. Outil de développement, sans texte d'explication. Elle montre plusieurs
// écrans l'un sous l'autre : sa racine n'est donc pas une zone principale, chaque aperçu a la sienne.
import type { ReactElement, ReactNode } from "react";

import { BarreDuHaut, CheminDePage, ZoneEtat } from "../interface/composants/BarreDuHaut.tsx";
import { BoutonIcone } from "../interface/composants/BoutonIcone.tsx";
import { CadreDeBarre, Sceau, TeteDeBarre } from "../interface/composants/CadreDeBarre.tsx";
import { ChampTitre } from "../interface/composants/ChampTitre.tsx";
import { Coquille, EcranPlein, Principale } from "../interface/composants/Coquille.tsx";
import {
  Avertissement,
  Chargement,
  EcranBloquant,
  EntetePage,
} from "../interface/composants/Etats.tsx";
import { MenuActions } from "../interface/composants/MenuActions.tsx";
import { NOMS_DE_PICTOGRAMME, Pictogramme } from "../interface/composants/Pictogramme.tsx";
import { Raccourci } from "../interface/composants/Raccourci.tsx";
import { Rangee } from "../interface/composants/Rangee.tsx";
import {
  AFFICHER_LES_PAGES_INTERMEDIAIRES,
  AJOUTER_UNE_SOUS_PAGE,
  AVERTISSEMENT_NON_ENREGISTRE,
  CHARGEMENT,
  EXPLICATION_PAGE_INTROUVABLE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  FERMER_LA_BARRE_LATERALE,
  INVITATION_PREMIERE_PAGE,
  messageErreur,
  METTRE_A_LA_CORBEILLE,
  NOM_APPLICATION,
  NOM_BARRE_LATERALE,
  NOM_DU_TIROIR,
  NOM_FIL_D_ARIANE,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomSousPages,
  NON_ENREGISTRE,
  NOUVELLE_PAGE,
  OUVRIR_LA_BARRE_LATERALE,
  PAGE_INTROUVABLE,
  RENOMMER,
  TITRE_DE_LA_PAGE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
} from "../interface/messages.ts";
import { afficherTouches, RACCOURCIS } from "../interface/raccourcis.ts";
import {
  ADRESSE_FICTIVE,
  ANCETRES,
  ARBORESCENCE,
  ENTREE_DE_PIED_FICTIVE,
  NOM_DE_L_ESPACE_FICTIF,
  PAGE_COURANTE,
  type PageFictive,
  TITRE_LONG,
} from "./donnees.ts";
import { echantillonsDe } from "./Echantillons.tsx";
import { MARQUEUR_DE_DEMONSTRATION } from "./marqueur.ts";
import { PAGE } from "./page.classes.ts";

function sansEffet(): void {
  // La page ne fait rien : elle montre.
}

function Section({
  titre,
  children,
}: {
  readonly titre: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className={PAGE.section}>
      <h2 className={PAGE.sectionTitre}>{titre}</h2>
      {children}
    </section>
  );
}

interface ProprietesSpecimen {
  readonly etiquette: string;
  /** États que le scénario de capture force : « état:sélecteur », séparés par des points-virgules. */
  readonly force?: string | undefined;
  readonly children: ReactNode;
}

function Specimen({ etiquette, force, children }: ProprietesSpecimen): ReactElement {
  return (
    <div className={PAGE.specimen} data-force={force}>
      <span className={PAGE.etiquette}>{etiquette}</span>
      {children}
    </div>
  );
}

interface ProprietesRangeeFictive {
  readonly page: PageFictive;
  readonly menuOuvert?: boolean | undefined;
  readonly saisie?: ReactNode | undefined;
  readonly menu?: ReactNode | undefined;
}

function RangeeFictive({
  page: fictive,
  menuOuvert = false,
  saisie,
  menu,
}: ProprietesRangeeFictive): ReactElement {
  const repli =
    fictive.sousPages === "aucune"
      ? undefined
      : {
          nom: nomSousPages(fictive.titre),
          deplie: fictive.sousPages === "depliees",
          surBascule: sansEffet,
        };
  return (
    <Rangee
      niveau={fictive.niveau}
      titre={fictive.titre}
      adresse={ADRESSE_FICTIVE}
      courante={fictive.courante === true}
      repli={repli}
      ajout={{ nom: nomAjouterSousPage(fictive.titre), surActivation: sansEffet }}
      actions={{ nom: nomActionsDeLaPage(fictive.titre), surActivation: sansEffet }}
      menuOuvert={menuOuvert}
      saisie={saisie}
      menu={menu}
    />
  );
}

function Tete({ fermeture }: { readonly fermeture?: ReactNode }): ReactElement {
  return (
    <TeteDeBarre
      nomEspace={NOM_DE_L_ESPACE_FICTIF}
      libelleNouvellePage={NOUVELLE_PAGE}
      surNouvellePage={sansEffet}
      fermeture={fermeture}
    />
  );
}

function Arborescence(): ReactElement {
  return (
    <>
      {ARBORESCENCE.map((fictive) => (
        <RangeeFictive key={fictive.titre} page={fictive} />
      ))}
    </>
  );
}

function Barre({ fermeture }: { readonly fermeture?: ReactNode }): ReactElement {
  return (
    <CadreDeBarre nom={NOM_BARRE_LATERALE} tete={<Tete fermeture={fermeture} />}>
      <Arborescence />
    </CadreDeBarre>
  );
}

function Fil({ replie }: { readonly replie: boolean }): ReactElement {
  return (
    <CheminDePage
      nom={NOM_FIL_D_ARIANE}
      ancetres={ANCETRES}
      courante={PAGE_COURANTE}
      repli={
        replie
          ? { nom: AFFICHER_LES_PAGES_INTERMEDIAIRES, ouvert: false, surBascule: sansEffet }
          : undefined
      }
    />
  );
}

function MenuFictif({ titre }: { readonly titre: string }): ReactElement {
  return (
    <MenuActions
      nom={nomActionsDeLaPage(titre)}
      entrees={[
        {
          libelle: RENOMMER,
          touches: afficherTouches(RACCOURCIS.renommer),
          surActivation: sansEffet,
        },
        { libelle: AJOUTER_UNE_SOUS_PAGE, surActivation: sansEffet },
        { libelle: METTRE_A_LA_CORBEILLE, surActivation: sansEffet },
      ]}
    />
  );
}

function SectionCoquille(): ReactElement {
  const ouverture = (
    <span className={PAGE.ouvertureEtroite}>
      <BoutonIcone nom={OUVRIR_LA_BARRE_LATERALE} pictogramme="tiroir" lieu="barre" />
    </span>
  );
  // Sur écran étroit la place manque : le fil se montre replié, comme le fera l'application.
  const fil = (
    <>
      <span className={PAGE.filLarge}>
        <Fil replie={false} />
      </span>
      <span className={PAGE.filEtroit}>
        <Fil replie />
      </span>
    </>
  );
  return (
    <Section titre="Coquille">
      <div className={PAGE.apercu}>
        <Coquille tiroir={{ ouvert: false, nom: NOM_DU_TIROIR }} barre={<Barre />}>
          <BarreDuHaut ouverture={ouverture} fil={fil} etat={<ZoneEtat echec={undefined} />} />
          <Principale>
            <EntetePage titre={PAGE_COURANTE} />
          </Principale>
        </Coquille>
      </div>
    </Section>
  );
}

const PAGE_AU_REPOS: PageFictive = { titre: "Idées en vrac", niveau: 1, sousPages: "repliees" };
const PAGE_COURANTE_FICTIVE: PageFictive = {
  ...PAGE_AU_REPOS,
  sousPages: "depliees",
  courante: true,
};

function RangeeSeule({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className={PAGE.fondBarre}>
      <ul className={PAGE.liste}>{children}</ul>
    </div>
  );
}

function SectionRangees(): ReactElement {
  const saisie = (
    <ChampTitre nom={TITRE_DE_LA_PAGE} erreur={undefined} defaultValue={PAGE_AU_REPOS.titre} />
  );
  return (
    <Section titre="Rangée de page">
      <div className={PAGE.grille}>
        <Specimen etiquette="Au repos">
          <RangeeSeule>
            <RangeeFictive page={PAGE_AU_REPOS} />
          </RangeeSeule>
        </Specimen>
        <Specimen etiquette="Survolée" force="hover:.rangee">
          <RangeeSeule>
            <RangeeFictive page={PAGE_AU_REPOS} />
          </RangeeSeule>
        </Specimen>
        <Specimen etiquette="Au focus" force="focus-within:.rangee;focus-visible:a">
          <RangeeSeule>
            <RangeeFictive page={PAGE_AU_REPOS} />
          </RangeeSeule>
        </Specimen>
        <Specimen etiquette="Courante">
          <RangeeSeule>
            <RangeeFictive page={PAGE_COURANTE_FICTIVE} />
          </RangeeSeule>
        </Specimen>
        <Specimen etiquette="Titre long">
          <RangeeSeule>
            <RangeeFictive page={{ ...PAGE_AU_REPOS, titre: TITRE_LONG, sousPages: "aucune" }} />
          </RangeeSeule>
        </Specimen>
        <Specimen etiquette="En renommage">
          <RangeeSeule>
            <RangeeFictive page={PAGE_AU_REPOS} saisie={saisie} />
          </RangeeSeule>
        </Specimen>
      </div>
    </Section>
  );
}

function SectionMenu(): ReactElement {
  const refusee = (
    <ChampTitre
      nom={TITRE_DE_LA_PAGE}
      erreur={messageErreur("titre-trop-long")}
      defaultValue={TITRE_LONG}
    />
  );
  return (
    <Section titre="Menu et saisie refusée">
      <div className={PAGE.grille}>
        <Specimen etiquette="Menu « ⋯ » ouvert">
          <div className={PAGE.fondBarreHaut}>
            <ul className={PAGE.liste}>
              <RangeeFictive
                page={PAGE_AU_REPOS}
                menuOuvert
                menu={<MenuFictif titre={PAGE_AU_REPOS.titre} />}
              />
            </ul>
          </div>
        </Specimen>
        <Specimen etiquette="Titre refusé">
          <div className={PAGE.fondBarreHaut}>
            <ul className={PAGE.liste}>
              <RangeeFictive page={PAGE_AU_REPOS} saisie={refusee} />
            </ul>
          </div>
        </Specimen>
        <Specimen etiquette="Tête de barre, opération refusée">
          <div className={PAGE.fondBarre}>
            <CadreDeBarre
              nom={NOM_BARRE_LATERALE}
              erreur={messageErreur("page-introuvable")}
              tete={<Tete />}
            />
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

// Le pied ne porte une entrée qu'à partir de F-007 : celle-ci est une donnée fictive, sans effet,
// que rien n'active. La hauteur bornée fait défiler l'arborescence entre la tête et le pied.
function SectionBarre(): ReactElement {
  const pied = <span className={PAGE.entreeDePied}>{ENTREE_DE_PIED_FICTIVE}</span>;
  return (
    <Section titre="Tête et pied de barre latérale">
      <div className={PAGE.grille}>
        <Specimen etiquette="L'arborescence défile entre la tête et le pied">
          <div className={PAGE.apercuDeBarre}>
            <CadreDeBarre nom={NOM_BARRE_LATERALE} tete={<Tete />} pied={pied}>
              <Arborescence />
            </CadreDeBarre>
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

function SectionBarreDuHaut(): ReactElement {
  return (
    <Section titre="Barre du haut">
      <Specimen etiquette="Fil d'Ariane entier, zone d'état vide">
        <div className={PAGE.fondZone}>
          <BarreDuHaut fil={<Fil replie={false} />} etat={<ZoneEtat echec={undefined} />} />
        </div>
      </Specimen>
      <Specimen etiquette="Fil d'Ariane replié, enregistrement en échec">
        <div className={PAGE.fondZone}>
          <BarreDuHaut fil={<Fil replie />} etat={<ZoneEtat echec={NON_ENREGISTRE} />} />
        </div>
      </Specimen>
    </Section>
  );
}

function SectionTiroir(): ReactElement {
  const fermeture = (
    <BoutonIcone nom={FERMER_LA_BARRE_LATERALE} pictogramme="fermer" lieu="barre" />
  );
  return (
    <Section titre="Tiroir et voile">
      <div className={PAGE.apercuDuTiroir}>
        <Coquille
          tiroir={{ ouvert: true, nom: NOM_DU_TIROIR }}
          barre={<Barre fermeture={fermeture} />}
        >
          <BarreDuHaut fil={<Fil replie />} etat={<ZoneEtat echec={undefined} />} />
          <Principale>
            <EntetePage titre={PAGE_COURANTE} />
          </Principale>
        </Coquille>
      </div>
    </Section>
  );
}

function SectionEtats(): ReactElement {
  return (
    <Section titre="États">
      <Specimen etiquette="Avertissement de persistance">
        <div className={PAGE.fondZone}>
          <Avertissement>{AVERTISSEMENT_NON_ENREGISTRE}</Avertissement>
        </div>
      </Specimen>
      <div className={PAGE.grille}>
        <Specimen etiquette="Chargement">
          <div className={PAGE.fondZone}>
            <EcranPlein>
              <Chargement texte={CHARGEMENT} />
            </EcranPlein>
          </div>
        </Specimen>
        <Specimen etiquette="Écran bloquant">
          <div className={PAGE.fondZone}>
            <EcranPlein>
              <EcranBloquant
                titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
                explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
              />
            </EcranPlein>
          </div>
        </Specimen>
      </div>
      <div className={PAGE.grille}>
        <Specimen etiquette={PAGE_INTROUVABLE}>
          <div className={PAGE.fondZone}>
            <EntetePage titre={PAGE_INTROUVABLE} explication={EXPLICATION_PAGE_INTROUVABLE} />
          </div>
        </Specimen>
        <Specimen etiquette="Accueil, espace vide">
          <div className={PAGE.fondZone}>
            <EntetePage titre={NOM_APPLICATION} explication={INVITATION_PREMIERE_PAGE} />
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

function SectionCommandes(): ReactElement {
  return (
    <Section titre="Bouton à pictogramme, touches et pictogrammes">
      <div className={PAGE.grille}>
        <Specimen etiquette="Bouton à pictogramme au focus" force="focus-visible:button">
          <div className={PAGE.fondLibre}>
            <BoutonIcone
              nom={AFFICHER_LES_PAGES_INTERMEDIAIRES}
              pictogramme="points"
              lieu="barre"
            />
          </div>
        </Specimen>
        <Specimen etiquette="Touches">
          <div className={PAGE.fondLibre}>
            <Raccourci touches={afficherTouches(RACCOURCIS.renommer)} />
          </div>
        </Specimen>
        <Specimen etiquette="Pictogrammes">
          <div className={PAGE.fondLibre}>
            {NOMS_DE_PICTOGRAMME.map((nom) => (
              <Pictogramme key={nom} nom={nom} />
            ))}
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

export function PageDemonstration({ jetons }: { readonly jetons: string }): ReactElement {
  return (
    <div className={PAGE.cadre} data-demonstration={MARQUEUR_DE_DEMONSTRATION}>
      <header className={PAGE.entete}>
        <span className={PAGE.enseigne}>
          <Sceau />
          {NOM_APPLICATION}
        </span>
        <h1 className={PAGE.titre}>Démonstration de l'identité visuelle</h1>
      </header>
      <SectionCoquille />
      <SectionRangees />
      <SectionMenu />
      <SectionBarre />
      <SectionBarreDuHaut />
      <SectionTiroir />
      <SectionEtats />
      <SectionCommandes />
      {echantillonsDe(jetons).map(({ titre, contenu }) => (
        <Section key={titre} titre={titre}>
          {contenu}
        </Section>
      ))}
    </div>
  );
}
