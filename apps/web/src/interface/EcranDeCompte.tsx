// Écrans de compte, `#/connexion` et `#/inscription` (F-010) : un formulaire dans la zone principale,
// la barre latérale restant en place. Le mot de passe ne vit que dans l'état de ce composant : il
// disparaît quand l'écran est quitté, par un succès, un retour ou un changement d'adresse
// (F-010-AC11). Le retour se fait vers le fragment posé en mémoire par l'application, celui de la
// destination de retour ou, à défaut, de la page sélectionnée (F-010 H2, F-014-AC41).
import {
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { Compte, ErreurDeCompte } from "../compte/index.ts";
import {
  type ChampDeCompte as NomDeChamp,
  type Fautes,
  type Saisie,
  validerConnexion,
  validerInscription,
} from "../compte/validation.ts";
import { allerAuRetour } from "../navigation/fragment.ts";
import { ActionDeCompte, ChampDeCompte, FormulaireDeCompte } from "./composants/Compte.tsx";
import { fragmentDe } from "../navigation/route.ts";
import {
  CONNEXION_EN_COURS,
  DEJA_UN_COMPTE,
  ENVOI_CONNEXION,
  ENVOI_INSCRIPTION,
  ETIQUETTE_COURRIEL,
  ETIQUETTE_MOT_DE_PASSE,
  ETIQUETTE_NOM,
  IDENTIFIANT_POUR_LE_SUPPORT,
  INSCRIPTION_EN_COURS,
  MARQUE_OBLIGATOIRE,
  PAS_ENCORE_DE_COMPTE,
  RETOUR_A_L_APPLICATION,
  SE_CONNECTER,
  CREER_UN_COMPTE,
  texteDeLaFaute,
  texteDeLErreur,
  TITRE_CONNEXION,
  TITRE_INSCRIPTION,
  VOS_PAGES_RESTENT,
} from "./messages-compte.ts";

export type SorteDEcran = "connexion" | "inscription";

interface Proprietes {
  readonly sorte: SorteDEcran;
  readonly compte: Compte;
  /** Fragment de l'application à retrouver après un succès, tenu en mémoire. */
  readonly retour: string;
  /** Fragment de « Retour à l'application » : la page sélectionnée, sans la destination posée. */
  readonly application: string;
}

const TEXTES = {
  connexion: {
    titre: TITRE_CONNEXION,
    envoi: ENVOI_CONNEXION,
    enCours: CONNEXION_EN_COURS,
    question: PAS_ENCORE_DE_COMPTE,
    autre: { forme: "inscription", libelle: CREER_UN_COMPTE },
  },
  inscription: {
    titre: TITRE_INSCRIPTION,
    envoi: ENVOI_INSCRIPTION,
    enCours: INSCRIPTION_EN_COURS,
    question: DEJA_UN_COMPTE,
    autre: { forme: "connexion", libelle: SE_CONNECTER },
  },
} as const;

const SAISIE_VIDE: Saisie = { nom: "", courriel: "", motDePasse: "" };
const ORDRE_DES_CHAMPS: readonly NomDeChamp[] = ["nom", "courriel", "motDePasse"];
const MS_PAR_SECONDE = 1000;

/** Connecté, l'écran ne montre pas le formulaire : il rend la main à l'application (F-010-AC6). */
export function EcranDeCompte(props: Proprietes): ReactElement | null {
  const { compte, retour } = props;
  const etat = useSyncExternalStore(compte.suivi.abonner, compte.suivi.lire);
  const connecte = etat.statut === "connecte";
  useEffect(() => {
    if (connecte) {
      allerAuRetour(retour);
    }
  }, [connecte, retour]);
  return connecte ? null : <Formulaire {...props} />;
}

function Formulaire({ sorte, compte, retour, application }: Proprietes): ReactElement {
  const f = useFormulaire(sorte, compte, retour);
  const textes = TEXTES[sorte];
  const champ = (nom: NomDeChamp): ComponentProps<typeof ChampDeCompte> => ({
    etiquette: ETIQUETTES[nom],
    marque: MARQUE_OBLIGATOIRE,
    name: nom,
    required: true,
    value: f.saisie[nom],
    onChange: (evenement) => f.saisir(nom, evenement.target.value),
    faute: faute(nom, f.fautes),
    refChamp: f.refs[nom],
  });
  return (
    <FormulaireDeCompte
      titre={textes.titre}
      introduction={sorte === "connexion" ? VOS_PAGES_RESTENT : undefined}
      envoi={textes.envoi}
      enCours={f.enCours}
      bloque={f.bloque}
      attente={f.enCours ? textes.enCours : ""}
      alerte={f.erreur === undefined ? undefined : <MessageDEnvoi erreur={f.erreur} />}
      surEnvoi={f.soumettre}
      pied={
        <>
          <p>{textes.question}</p>
          <ActionDeCompte libelle={textes.autre.libelle} adresse={fragmentDe(textes.autre)} />
          <ActionDeCompte libelle={RETOUR_A_L_APPLICATION} adresse={application} />
        </>
      }
    >
      {sorte === "inscription" && <ChampDeCompte {...champ("nom")} autoComplete="name" />}
      <ChampDeCompte {...champ("courriel")} type="email" autoComplete="email" />
      <ChampDeCompte
        {...champ("motDePasse")}
        type="password"
        autoComplete={sorte === "connexion" ? "current-password" : "new-password"}
      />
    </FormulaireDeCompte>
  );
}

function faute(champ: NomDeChamp, fautes: Fautes): string | undefined {
  const refus = fautes[champ];
  return refus === undefined ? undefined : texteDeLaFaute(champ, refus);
}

function MessageDEnvoi({ erreur }: { readonly erreur: ErreurDeCompte }): ReactElement {
  const { texte, idRequete } = texteDeLErreur(erreur);
  return (
    <>
      <p>{texte}</p>
      {erreur.type === "compte-existant" && (
        <ActionDeCompte libelle={SE_CONNECTER} adresse={fragmentDe({ forme: "connexion" })} />
      )}
      {idRequete !== undefined && <p>{`${IDENTIFIANT_POUR_LE_SUPPORT} ${idRequete}`}</p>}
    </>
  );
}

const ETIQUETTES: Readonly<Record<NomDeChamp, string>> = {
  nom: ETIQUETTE_NOM,
  courriel: ETIQUETTE_COURRIEL,
  motDePasse: ETIQUETTE_MOT_DE_PASSE,
};

interface EtatDuFormulaire {
  readonly saisie: Saisie;
  readonly saisir: (champ: NomDeChamp, valeur: string) => void;
  readonly fautes: Fautes;
  readonly erreur: ErreurDeCompte | undefined;
  readonly enCours: boolean;
  readonly bloque: boolean;
  readonly refs: Readonly<Record<NomDeChamp, RefObject<HTMLInputElement | null>>>;
  readonly soumettre: (evenement: FormEvent) => void;
}

function useFormulaire(sorte: SorteDEcran, compte: Compte, retour: string): EtatDuFormulaire {
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [fautes, setFautes] = useState<Fautes>({});
  const [erreur, setErreur] = useState<ErreurDeCompte | undefined>(undefined);
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);
  const refs = {
    nom: useRef<HTMLInputElement>(null),
    courriel: useRef<HTMLInputElement>(null),
    motDePasse: useRef<HTMLInputElement>(null),
  };
  const bloque = useBlocage(erreur);
  usePremierChamp(sorte === "inscription" ? refs.nom : refs.courriel);
  const viderLeMotDePasse = (): void => setSaisie((avant) => ({ ...avant, motDePasse: "" }));

  const moyens: Moyens = {
    sorte,
    compte,
    retour,
    saisie,
    refs,
    verrou,
    bloque,
    setFautes,
    setErreur,
    setEnCours,
    viderLeMotDePasse,
  };
  return {
    saisie,
    saisir: (champ, valeur) => setSaisie((avant) => ({ ...avant, [champ]: valeur })),
    fautes,
    erreur,
    enCours,
    bloque,
    refs,
    soumettre: (evenement) => {
      evenement.preventDefault();
      void envoyer(moyens);
    },
  };
}

/** Ce dont un envoi a besoin : l'écran, la saisie, et de quoi dire où il en est. */
interface Moyens {
  readonly sorte: SorteDEcran;
  readonly compte: Compte;
  readonly retour: string;
  readonly saisie: Saisie;
  readonly refs: EtatDuFormulaire["refs"];
  readonly verrou: RefObject<boolean>;
  readonly bloque: boolean;
  readonly setFautes: (fautes: Fautes) => void;
  readonly setErreur: (erreur: ErreurDeCompte | undefined) => void;
  readonly setEnCours: (enCours: boolean) => void;
  readonly viderLeMotDePasse: () => void;
}

/**
 * Contrôle, puis un seul appel à la fois (F-010-AC10). Un succès est suivi de `moi`, seul juge de
 * l'état du compte (F-010-AC4), puis du retour à l'application (F-010-AC7, AC8).
 */
async function envoyer(m: Moyens): Promise<void> {
  if (m.verrou.current || m.bloque) {
    return;
  }
  const validation =
    m.sorte === "connexion" ? validerConnexion(m.saisie) : validerInscription(m.saisie);
  if (!validation.ok) {
    m.setFautes(validation.fautes);
    const premier = ORDRE_DES_CHAMPS.find((champ) => validation.fautes[champ] !== undefined);
    m.refs[premier ?? "courriel"].current?.focus();
    return;
  }
  m.setFautes({});
  m.setErreur(undefined);
  m.verrou.current = true;
  m.setEnCours(true);
  const resultat = await appelerLeServeur(m.compte, validation.corps);
  if (resultat.ok) {
    m.viderLeMotDePasse();
    await m.compte.suivi.reverifier();
    allerAuRetour(m.retour);
    return;
  }
  m.verrou.current = false;
  m.setEnCours(false);
  m.setErreur(resultat.erreur);
  if (resultat.erreur.type === "identifiants-invalides") {
    m.viderLeMotDePasse();
  }
}

/** Le corps porte un nom à l'inscription seulement : c'est lui qui désigne l'appel. */
function appelerLeServeur(
  compte: Compte,
  corps: Parameters<Compte["client"]["inscrire"]>[0] | Parameters<Compte["client"]["connecter"]>[0],
): ReturnType<Compte["client"]["connecter"]> {
  return "name" in corps ? compte.client.inscrire(corps) : compte.client.connecter(corps);
}

/** Envoi désactivé pendant le délai qu'un 429 impose (F-010-AC15). */
function useBlocage(erreur: ErreurDeCompte | undefined): boolean {
  const [bloque, setBloque] = useState(false);
  useEffect(() => {
    if (erreur?.type !== "trop-de-tentatives") {
      return undefined;
    }
    setBloque(true);
    const minuterie = setTimeout(() => setBloque(false), erreur.delaiSecondes * MS_PAR_SECONDE);
    return () => clearTimeout(minuterie);
  }, [erreur]);
  return bloque;
}

/** Focus sur le premier champ à l'ouverture de l'écran (F-010-AC23). */
function usePremierChamp(premier: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    premier.current?.focus();
  }, [premier]);
}
