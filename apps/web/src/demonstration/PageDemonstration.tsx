// Page de démonstration (F-004-AC50) : chaque composant de présentation dans chacun de ses états,
// sur des données fictives. Outil de développement, sans texte d'explication.
import type { ReactElement, ReactNode } from "react";

import { BarreDuHaut, FilAriane, ZoneEtat } from "../interface/composants/BarreDuHaut.tsx";
import { CadreDeBarre, Sceau, TeteDeBarre } from "../interface/composants/BarreLaterale.tsx";
import { Bouton, BoutonIcone } from "../interface/composants/Bouton.tsx";
import { ChampTitre } from "../interface/composants/ChampTitre.tsx";
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
  AVERTISSEMENT_NON_ENREGISTRE,
  CHARGEMENT,
  EXPLICATION_PAGE_INTROUVABLE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  INVITATION_PREMIERE_PAGE,
  NOM_APPLICATION,
  NOM_BARRE_LATERALE,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomSousPages,
  NOUVELLE_PAGE,
  PAGE_INTROUVABLE,
  TITRE_DE_LA_PAGE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
} from "../interface/messages.ts";
import {
  ADRESSE_FICTIVE,
  ANCETRES,
  ARBORESCENCE,
  LIBELLES,
  PAGE_COURANTE,
  type PageFictive,
  TITRE_LONG,
  TOUCHES,
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
      nomEspace={LIBELLES.nomEspace}
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

function Fil({ replie }: { readonly replie: boolean }): ReactElement {
  return (
    <FilAriane
      nom={LIBELLES.filDAriane}
      ancetres={ANCETRES}
      courante={PAGE_COURANTE}
      repli={
        replie
          ? { nom: LIBELLES.pagesIntermediaires, ouvert: false, surBascule: sansEffet }
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
        { libelle: LIBELLES.renommer, touches: TOUCHES.renommer, surActivation: sansEffet },
        { libelle: LIBELLES.ajouterUneSousPage, surActivation: sansEffet },
        { libelle: LIBELLES.mettreALaCorbeille, surActivation: sansEffet },
      ]}
    />
  );
}

function SectionCoquille(): ReactElement {
  const ouverture = (
    <span className={PAGE.ouvertureEtroite}>
      <BoutonIcone nom={LIBELLES.ouvrirLaBarre} pictogramme="tiroir" lieu="barre" />
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
      <div className={PAGE.coquille}>
        <div className={PAGE.coquilleBarre}>
          <CadreDeBarre nom={NOM_BARRE_LATERALE} tete={<Tete />}>
            <Arborescence />
          </CadreDeBarre>
        </div>
        <div className={PAGE.coquilleReste}>
          <BarreDuHaut ouverture={ouverture} fil={fil} etat={<ZoneEtat echec={undefined} />} />
          <EntetePage titre={PAGE_COURANTE} />
        </div>
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
    <ChampTitre nom={TITRE_DE_LA_PAGE} erreur={LIBELLES.titreTropLong} defaultValue={TITRE_LONG} />
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
        <Specimen etiquette="Tête de barre, raccourci affiché">
          <div className={PAGE.fondBarre}>
            <CadreDeBarre
              nom={NOM_BARRE_LATERALE}
              erreur={LIBELLES.operationRefusee}
              tete={
                <TeteDeBarre
                  nomEspace={LIBELLES.nomEspace}
                  libelleNouvellePage={NOUVELLE_PAGE}
                  touches={TOUCHES.nouvellePage}
                  surNouvellePage={sansEffet}
                />
              }
            />
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
          <BarreDuHaut
            fil={<Fil replie />}
            etat={<ZoneEtat echec={LIBELLES.echecDEnregistrement} />}
          />
        </div>
      </Specimen>
    </Section>
  );
}

function SectionTiroir(): ReactElement {
  const fermeture = <BoutonIcone nom={LIBELLES.fermerLaBarre} pictogramme="fermer" lieu="barre" />;
  return (
    <Section titre="Tiroir et voile">
      <div className={PAGE.tiroir}>
        <BarreDuHaut fil={<Fil replie />} etat={<ZoneEtat echec={undefined} />} />
        <EntetePage titre={PAGE_COURANTE} />
        <div className={PAGE.voile} />
        <div className={PAGE.panneau}>
          <CadreDeBarre nom={NOM_BARRE_LATERALE} tete={<Tete fermeture={fermeture} />}>
            <Arborescence />
          </CadreDeBarre>
        </div>
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
          <div className={PAGE.ecran}>
            <Chargement texte={CHARGEMENT} />
          </div>
        </Specimen>
        <Specimen etiquette="Écran bloquant">
          <div className={PAGE.ecran}>
            <EcranBloquant
              titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
              explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
            />
          </div>
        </Specimen>
      </div>
      <div className={PAGE.grille}>
        <Specimen etiquette="Page introuvable">
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
    <Section titre="Boutons, touches et pictogrammes">
      <div className={PAGE.grille}>
        <Specimen etiquette="Boutons">
          <div className={PAGE.fondLibre}>
            <Bouton variante="principal">{NOUVELLE_PAGE}</Bouton>
            <Bouton variante="discret">{LIBELLES.renommer}</Bouton>
          </div>
        </Specimen>
        <Specimen etiquette="Bouton au focus" force="focus-visible:button">
          <div className={PAGE.fondLibre}>
            <Bouton variante="discret">{LIBELLES.renommer}</Bouton>
          </div>
        </Specimen>
        <Specimen etiquette="Touches">
          <div className={PAGE.fondLibre}>
            <Raccourci touches={TOUCHES.renommer} />
            <Raccourci touches={TOUCHES.nouvellePage} />
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
    <main className={PAGE.cadre} data-demonstration={MARQUEUR_DE_DEMONSTRATION}>
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
      <SectionBarreDuHaut />
      <SectionTiroir />
      <SectionEtats />
      <SectionCommandes />
      {echantillonsDe(jetons).map(({ titre, contenu }) => (
        <Section key={titre} titre={titre}>
          {contenu}
        </Section>
      ))}
    </main>
  );
}
