// Page de démonstration (F-004-AC50) : chaque composant de présentation dans chacun de ses états,
// sur des données fictives. Outil de développement, sans texte d'explication. Elle montre plusieurs
// écrans l'un sous l'autre : sa racine n'est donc pas une zone principale, chaque aperçu a la sienne.
import { type ReactElement, type ReactNode, useRef } from "react";

import { BarreDuHaut, CheminDePage, ZoneEtat } from "../interface/composants/BarreDuHaut.tsx";
import { BoutonIcone } from "../interface/composants/BoutonIcone.tsx";
import { CadreDeBarre, Sceau, TeteDeBarre } from "../interface/composants/CadreDeBarre.tsx";
import { ListeDeCorbeille } from "../interface/composants/Corbeille.tsx";
import { ChampTitre } from "../interface/composants/ChampTitre.tsx";
import {
  ActionDeCompte,
  CadreDeCompte,
  ChampDeCompte,
  FormulaireDeCompte,
} from "../interface/composants/Compte.tsx";
import { Coquille, EcranPlein, Principale } from "../interface/composants/Coquille.tsx";
import {
  Actions,
  Alerte,
  Annonce,
  BoiteDeDialogue,
  Bouton,
  Choix,
  EcranDEspaces,
  Formulaire,
  Lien,
  LienEnLecture,
  Partie,
  Tableau,
  Texte,
} from "../interface/composants/Espaces.tsx";
import {
  BarreDeBlocs,
  CorpsDePage,
  MenuDeCommandes,
  NoteDePage,
  PanneauDeLien,
  PoigneeDeBloc,
  PoigneeDuCurseur,
  ZoneDEdition,
  ZoneDeSaisie,
} from "../interface/composants/Edition.tsx";
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
  AVERTISSEMENT_BASE_NON_RELUE,
  AUCUNE_COMMANDE,
  AVERTISSEMENT_NON_ENREGISTRE,
  CHARGEMENT,
  DEPLACER_LE_BLOC,
  EXPLICATION_PAGE_INTROUVABLE,
  EXPLICATION_VERSION_NON_PRISE_EN_CHARGE,
  FERMER_LA_BARRE_LATERALE,
  INVITATION_PREMIERE_PAGE,
  INVITE_DU_BLOC_VIDE,
  messageErreur,
  METTRE_A_LA_CORBEILLE,
  MODIFICATIONS_NON_ENREGISTREES_PERDUES,
  NOM_APPLICATION,
  NOM_BARRE_LATERALE,
  NOM_DE_LA_BARRE_DE_BLOCS,
  NOM_DU_MENU_SLASH,
  NOM_DU_TIROIR,
  NOM_FIL_D_ARIANE,
  nomActionsDeLaPage,
  nomAjouterSousPage,
  nomSousPages,
  NON_ENREGISTRE,
  NOUVELLE_PAGE,
  OUVRIR_LA_BARRE_LATERALE,
  PAGE_DE_VERSION_NON_PRISE_EN_CHARGE,
  PAGE_INTROUVABLE,
  REESSAYER_MAINTENANT,
  RENOMMER,
  TITRE_DE_LA_PAGE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
} from "../interface/messages.ts";
import { afficherTouches, RACCOURCIS } from "../interface/raccourcis.ts";
import {
  ADRESSE_FICTIVE,
  ESPACES_FICTIFS,
  AFFIRMATION_FICTIVE,
  ANCETRES,
  ARBORESCENCE,
  ENTREE_DE_PIED_FICTIVE,
  COMPTE_FICTIF,
  CORBEILLE_FICTIVE,
  NOM_DE_L_ESPACE_FICTIF,
  PAGE_COURANTE,
  type PageFictive,
  TITRE_LONG,
  COMMANDES_DE_BLOC_FICTIVES,
  OPTIONS_DU_MENU_FICTIVES,
  POSITION_DU_MENU_FICTIVE,
  RANG_DU_SELECTEUR_FICTIF,
  SELECTEUR_DE_LANGAGE_FICTIF,
  PANNEAU_DE_LIEN_FICTIF,
  POSITION_DE_BARRE_FICTIVE,
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
      <Specimen etiquette="Fil d'Ariane entier, enregistrement affirmé">
        <div className={PAGE.fondZone}>
          <BarreDuHaut
            fil={<Fil replie={false} />}
            etat={<ZoneEtat echec={undefined} affirmation={AFFIRMATION_FICTIVE} />}
          />
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

// L'éditeur lui-même n'est pas rendu ici : la page n'a ni document ni bibliothèque d'édition. Ses
// composants de présentation le sont, avec l'invite que sa vue pose sur le bloc vide (F-003-AC44).
function SectionEditeur(): ReactElement {
  return (
    <Section titre="Éditeur de page">
      <Specimen etiquette="Titre, invite du bloc vide et barre de blocs dans la colonne de lecture">
        <div className={PAGE.fondZone}>
          <EntetePage titre={PAGE_COURANTE} />
          <CorpsDePage>
            <ZoneDEdition surFocus={sansEffet} surPerteDeFocus={sansEffet} surTouche={sansEffet}>
              <ZoneDeSaisie>
                <p data-invite={INVITE_DU_BLOC_VIDE} />
              </ZoneDeSaisie>
              <BarreDeBlocs
                nom={NOM_DE_LA_BARRE_DE_BLOCS}
                commandes={COMMANDES_DE_BLOC_FICTIVES.map((commande) => ({
                  ...commande,
                  surActivation: sansEffet,
                }))}
                position={POSITION_DE_BARRE_FICTIVE}
                surAbandon={sansEffet}
              />
            </ZoneDEdition>
          </CorpsDePage>
        </div>
      </Specimen>
      <SpecimenDuPanneauDeLien />
      <SpecimenDuMenuSlash />
      <SpecimenDesPoignees />
      <Specimen etiquette="Page d'une version plus récente">
        <div className={PAGE.fondZone}>
          <CorpsDePage>
            <NoteDePage texte={PAGE_DE_VERSION_NON_PRISE_EN_CHARGE} />
          </CorpsDePage>
        </div>
      </Specimen>
    </Section>
  );
}

// Marques dans le texte et panneau de lien d'un lien neutralisé (F-028-AC12, AC15, AC17).
function SpecimenDuPanneauDeLien(): ReactElement {
  return (
    <Specimen etiquette="Panneau de lien : adresse refusée, lien neutralisé">
      <div className={PAGE.fondZone}>
        <CorpsDePage>
          <ZoneDEdition surFocus={sansEffet} surPerteDeFocus={sansEffet} surTouche={sansEffet}>
            <ZoneDeSaisie>
              <p>
                Du texte <strong>en gras</strong>, <em>en italique</em> et{" "}
                <span data-lien-neutralise="">un lien neutralisé</span>.
              </p>
            </ZoneDeSaisie>
            <PanneauDeLien
              {...PANNEAU_DE_LIEN_FICTIF}
              position={POSITION_DE_BARRE_FICTIVE}
              surValidation={sansEffet}
              surRetrait={sansEffet}
              surAbandon={sansEffet}
            />
          </ZoneDEdition>
        </CorpsDePage>
      </div>
    </Specimen>
  );
}

// Bloc code, sélecteur de langage et menu slash ouvert après « /tit » (F-005-AC6, AC8, AC12). Le
// menu, posé dans la fenêtre, l'est ici dans l'aperçu, qui lui sert de repère.
function SpecimenDuMenuSlash(): ReactElement {
  return (
    <Specimen etiquette="Bloc code, sélecteur de langage et menu slash">
      <div className={PAGE.apercuDuMenu}>
        <CorpsDePage>
          <ZoneDEdition surFocus={sansEffet} surPerteDeFocus={sansEffet} surTouche={sansEffet}>
            <ZoneDeSaisie>
              <pre>
                <code>{"def bonjour():\n    return 1"}</code>
              </pre>
              <p>/tit</p>
            </ZoneDeSaisie>
            <BarreDeBlocs
              nom={NOM_DE_LA_BARRE_DE_BLOCS}
              commandes={COMMANDES_DE_BLOC_FICTIVES.map((commande) => ({
                ...commande,
                surActivation: sansEffet,
              }))}
              selecteur={SELECTEUR_DE_LANGAGE_FICTIF}
              rangDuSelecteur={RANG_DU_SELECTEUR_FICTIF}
              position={POSITION_DE_BARRE_FICTIVE}
              surAbandon={sansEffet}
            />
            <MenuDeCommandes
              id="menu-slash-fictif"
              nom={NOM_DU_MENU_SLASH}
              vide={AUCUNE_COMMANDE}
              options={OPTIONS_DU_MENU_FICTIVES}
              position={POSITION_DU_MENU_FICTIVE}
              surChoix={sansEffet}
            />
          </ZoneDEdition>
        </CorpsDePage>
      </div>
    </Specimen>
  );
}

// Poignées d'un bloc (F-006-AC14) : celle que l'éditeur place au survol, et celle du bloc du
// curseur, à gauche de la colonne.
function SpecimenDesPoignees(): ReactElement {
  return (
    <Specimen etiquette="Poignées de bloc : au survol, et au bloc du curseur">
      <div className={PAGE.fondZone}>
        <CorpsDePage>
          <ZoneDEdition surFocus={sansEffet} surPerteDeFocus={sansEffet} surTouche={sansEffet}>
            <ZoneDeSaisie>
              <p>Un bloc à déplacer.</p>
            </ZoneDeSaisie>
            <PoigneeDuCurseur nom={DEPLACER_LE_BLOC} haut={0} />
            <PoigneeDeBloc nom={DEPLACER_LE_BLOC} />
          </ZoneDEdition>
        </CorpsDePage>
      </div>
    </Specimen>
  );
}

function SectionEtats(): ReactElement {
  return (
    <Section titre="États">
      <Specimen etiquette="Avertissement de persistance">
        <div className={PAGE.fondZone}>
          <Avertissement phrases={[AVERTISSEMENT_NON_ENREGISTRE]} />
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

// Les formes que la reprise de la persistance a ajoutées aux états (F-030) : l'avertissement à deux
// phrases avec sa commande, l'écran bloquant avec sa précision.
function SectionReprise(): ReactElement {
  return (
    <Section titre="États de la reprise">
      <Specimen etiquette="Avertissement à deux phrases, avec commande">
        <div className={PAGE.fondZone}>
          <Avertissement
            phrases={[AVERTISSEMENT_NON_ENREGISTRE, AVERTISSEMENT_BASE_NON_RELUE]}
            action={{ libelle: REESSAYER_MAINTENANT, surActivation: sansEffet }}
          />
        </div>
      </Specimen>
      <Specimen etiquette="Écran bloquant avec précision">
        <div className={PAGE.fondZone}>
          <EcranPlein>
            <EcranBloquant
              titre={TITRE_VERSION_NON_PRISE_EN_CHARGE}
              explication={EXPLICATION_VERSION_NON_PRISE_EN_CHARGE}
              precision={MODIFICATIONS_NON_ENREGISTREES_PERDUES}
            />
          </EcranPlein>
        </div>
      </Specimen>
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

// La zone de compte dans ses trois états et le formulaire d'un écran de compte (F-010).
function SectionCompte(): ReactElement {
  return (
    <Section titre="Compte">
      <div className={PAGE.grille}>
        <Specimen etiquette="Zone de compte, compte inconnu">
          <CadreDeCompte nom={COMPTE_FICTIF.zone} phrases={[COMPTE_FICTIF.indisponible]}>
            <ActionDeCompte libelle={COMPTE_FICTIF.reessayer} surActivation={sansEffet} />
          </CadreDeCompte>
        </Specimen>
        <Specimen etiquette="Zone de compte, déconnecté">
          <CadreDeCompte nom={COMPTE_FICTIF.zone} phrases={[COMPTE_FICTIF.nonConnecte]}>
            <ActionDeCompte libelle={COMPTE_FICTIF.seConnecter} adresse={ADRESSE_FICTIVE} />
            <ActionDeCompte libelle={COMPTE_FICTIF.creer} adresse={ADRESSE_FICTIVE} />
          </CadreDeCompte>
        </Specimen>
        <Specimen etiquette="Zone de compte, connecté">
          <CadreDeCompte nom={COMPTE_FICTIF.zone} phrases={[COMPTE_FICTIF.connecte]}>
            <ActionDeCompte
              libelle={COMPTE_FICTIF.seDeconnecter}
              surActivation={sansEffet}
              desactivee
            />
          </CadreDeCompte>
        </Specimen>
      </div>
      <SpecimenDeFormulaire />
    </Section>
  );
}

// Écran d'un espace, son tableau de membres, une action occupée et une boîte d'alerte (F-014).
function SectionEspaces(): ReactElement {
  const F = ESPACES_FICTIFS;
  return (
    <Section titre="Espaces">
      <div className={PAGE.grille}>
        <Specimen etiquette="Écran d'un espace">
          <div className={PAGE.fondZone}>
            <EcranDEspaces titre={F.titre}>
              <Actions>
                <Lien libelle={F.lien} adresse={ADRESSE_FICTIVE} />
              </Actions>
              <Texte>{F.texte}</Texte>
              <Annonce texte={F.annonce} />
              <Alerte phrases={[F.alerte]} />
              <Partie titre={F.partie}>
                <TableauFictif />
              </Partie>
            </EcranDEspaces>
          </div>
        </Specimen>
        <Specimen etiquette="Renommage, action occupée">
          <div className={PAGE.fondZone}>
            <Formulaire nom={F.formulaire} surEnvoi={sansEffet}>
              <LienEnLecture etiquette={F.copie} valeur={F.lienFictif} />
              <Bouton libelle={F.renommer} raison={F.occupe} />
            </Formulaire>
          </div>
        </Specimen>
      </div>
      <SpecimenDeBoite />
    </Section>
  );
}

function TableauFictif(): ReactElement {
  const F = ESPACES_FICTIFS;
  return (
    <Tableau
      legende={F.partie}
      colonnes={F.colonnes}
      lignes={[
        {
          cle: F.membre,
          cellules: [
            F.membre,
            <Choix
              key="role"
              nom={F.nomDuChoix}
              valeur="lecteur"
              options={F.roles}
              surChoix={sansEffet}
            />,
            <Bouton key="retirer" libelle={F.retirer} surActivation={sansEffet} />,
          ],
        },
      ]}
    />
  );
}

function SpecimenDeBoite(): ReactElement {
  const annuler = useRef<HTMLButtonElement>(null);
  const F = ESPACES_FICTIFS;
  return (
    <Specimen etiquette="Boîte d'alerte d'un retrait">
      <div className={PAGE.apercuDuTiroir}>
        <BoiteDeDialogue
          alerte
          titre={F.boite}
          phrases={[F.avertissement]}
          initial={annuler}
          surTouche={sansEffet}
          apercu
        >
          <Actions>
            <Bouton refBouton={annuler} libelle={F.annuler} surActivation={sansEffet} />
            <Bouton libelle={F.retirer} surActivation={sansEffet} />
          </Actions>
        </BoiteDeDialogue>
      </div>
    </Specimen>
  );
}

const NIVEAU_DE_LA_FILLE = 2;

// Écran de la corbeille (F-007) : une racine avec sa descendance, une racine seule, et la liste vide.
function SectionCorbeille(): ReactElement {
  const F = CORBEILLE_FICTIVE;
  const commandes = (racine: boolean): ReactNode => (
    <>
      {racine && <Bouton libelle={F.restaurer} surActivation={sansEffet} />}
      <Bouton libelle={F.supprimer} surActivation={sansEffet} />
    </>
  );
  const ligne = (cle: string, titre: string, detail: string, niveau: number) => ({
    cle,
    titre,
    detail,
    niveau,
    commandes: commandes(niveau === 1),
  });
  return (
    <Section titre="Écran de la corbeille">
      <div className={PAGE.grille}>
        <Specimen etiquette="Racines et descendance">
          <div className={PAGE.fondZone}>
            <ListeDeCorbeille
              nom={F.nom}
              vide={F.vide}
              racines={[
                {
                  ...ligne("racine", F.racine, F.sousPages, 1),
                  descendance: [
                    ligne("fille", F.fille, F.uneSousPage, NIVEAU_DE_LA_FILLE),
                    ligne("petite-fille", F.petiteFille, F.aucune, NIVEAU_DE_LA_FILLE + 1),
                  ],
                },
                { ...ligne("seule", F.seule, F.aucune, 1), descendance: [] },
              ]}
            />
          </div>
        </Specimen>
        <Specimen etiquette="Corbeille vide">
          <div className={PAGE.fondZone}>
            <ListeDeCorbeille nom={F.nom} vide={F.vide} racines={[]} />
          </div>
        </Specimen>
      </div>
    </Section>
  );
}

function SpecimenDeFormulaire(): ReactElement {
  return (
    <Specimen etiquette="Formulaire de connexion, envoi refusé">
      <div className={PAGE.fondZone}>
        <FormulaireDeCompte
          titre={COMPTE_FICTIF.seConnecter}
          introduction={COMPTE_FICTIF.pagesRestent}
          envoi={COMPTE_FICTIF.seConnecter}
          enCours={false}
          bloque={false}
          attente=""
          alerte={COMPTE_FICTIF.refus}
          surEnvoi={(evenement) => evenement.preventDefault()}
          pied={<ActionDeCompte libelle={COMPTE_FICTIF.retour} adresse={ADRESSE_FICTIVE} />}
        >
          <ChampDeCompte
            etiquette={COMPTE_FICTIF.courriel}
            marque={COMPTE_FICTIF.obligatoire}
            faute={COMPTE_FICTIF.faute}
            type="email"
            defaultValue="alice@"
          />
          <ChampDeCompte
            etiquette={COMPTE_FICTIF.motDePasse}
            marque={COMPTE_FICTIF.obligatoire}
            faute={undefined}
            type="password"
          />
        </FormulaireDeCompte>
      </div>
    </Specimen>
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
      <SectionEditeur />
      <SectionEtats />
      <SectionReprise />
      <SectionCommandes />
      <SectionCompte />
      <SectionEspaces />
      <SectionCorbeille />
      {echantillonsDe(jetons).map(({ titre, contenu }) => (
        <Section key={titre} titre={titre}>
          {contenu}
        </Section>
      ))}
    </div>
  );
}
