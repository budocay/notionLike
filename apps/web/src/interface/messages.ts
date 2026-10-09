// Textes français de l'interface (spec H8). Aucun message d'erreur du code n'est affiché tel quel.
import type { CodeErreurDocument } from "@notionlike/document";

/** Limite de `@notionlike/document`, qui ne l'exporte pas : tenue par un test de couture. */
export const LONGUEUR_MAX_TITRE = 200;

export const NOM_APPLICATION = "notionLike";
export const NOM_BARRE_LATERALE = "Pages";
export const NOUVELLE_PAGE = "Nouvelle page";
const SANS_TITRE = "Sans titre";
export const CHARGEMENT = "Chargement…";
export const PAGE_INTROUVABLE = "Page introuvable";
export const TITRE_DE_LA_PAGE = "Titre de la page";

export const RENOMMER = "Renommer";
export const AJOUTER_UNE_SOUS_PAGE = "Ajouter une sous-page";
export const METTRE_A_LA_CORBEILLE = "Mettre à la corbeille";

export const NOM_DU_TIROIR = "Barre latérale";
export const OUVRIR_LA_BARRE_LATERALE = "Ouvrir la barre latérale";
export const FERMER_LA_BARRE_LATERALE = "Fermer la barre latérale";
export const NOM_FIL_D_ARIANE = "Fil d'Ariane";
export const AFFICHER_LES_PAGES_INTERMEDIAIRES = "Afficher les pages intermédiaires";
/** Seul état d'enregistrement affiché avant F-030 : l'échec (F-004-AC40). */
export const NON_ENREGISTRE = "Non enregistré sur cet appareil";

export const INVITATION_PREMIERE_PAGE =
  "Cet espace ne contient encore aucune page. Créez-en une avec « Nouvelle page », dans la barre latérale.";
export const INVITATION_CHOISIR_UNE_PAGE =
  "Aucune page n'est ouverte. Choisissez une page dans la barre latérale, ou créez-en une avec « Nouvelle page ».";
export const EXPLICATION_PAGE_INTROUVABLE =
  "Cette page n'existe pas dans cet espace, ou elle a été mise à la corbeille.";

export const AVERTISSEMENT_NON_ENREGISTRE =
  "Vos modifications ne sont pas enregistrées sur cet appareil : le stockage du navigateur est indisponible. Elles seront perdues à la fermeture ou au rechargement de l'onglet.";

export const TITRE_CONTEXTE_NON_SECURISE = "Adresse non sécurisée";
export const EXPLICATION_CONTEXTE_NON_SECURISE =
  "L'application ne peut pas démarrer à cette adresse. Elle doit être servie en https, ou à une adresse locale de la machine (localhost ou 127.0.0.1).";

export const TITRE_VERSION_NON_PRISE_EN_CHARGE = "Mise à jour nécessaire";
export const EXPLICATION_VERSION_NON_PRISE_EN_CHARGE =
  "Cet espace a été enregistré par une version plus récente de l'application. Mettez l'application à jour pour l'ouvrir ; rien n'a été modifié sur cet appareil.";

/** Ajouté à l'explication quand le document portait des modifications non enregistrées (F-030-AC10). */
export const MODIFICATIONS_NON_ENREGISTREES_PERDUES =
  "Les modifications faites depuis l'ouverture n'ont pas pu être enregistrées sur cet appareil.";

const MESSAGE_PAR_CODE: Readonly<Record<CodeErreurDocument, string>> = {
  "page-introuvable": "Cette page n'existe plus : l'action n'a pas été effectuée.",
  "page-a-la-corbeille": "Cette page a été mise à la corbeille : l'action n'a pas été effectuée.",
  "deplacement-cyclique": "Une page ne peut pas être déplacée dans l'une de ses sous-pages.",
  "titre-trop-long": `Le titre est trop long : la limite est de ${LONGUEUR_MAX_TITRE} caractères.`,
  "position-invalide": "Cet emplacement n'existe plus : l'action n'a pas été effectuée.",
  "version-non-prise-en-charge":
    "Cet espace demande une version plus récente de l'application : l'action n'a pas été effectuée.",
  "facade-fermee":
    "Cet espace a été fermé dans cet onglet : l'action n'a pas été effectuée. Rechargez la page pour le rouvrir.",
};

export function messageErreur(code: CodeErreurDocument): string {
  return MESSAGE_PAR_CODE[code];
}

// Visible : tout caractère qui n'est ni un blanc, ni un contrôle, ni un formatage, ni ignorable par défaut, ni le braille vide.
const CARACTERE_VISIBLE = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/u;

/** Titre à montrer et à nommer : le titre enregistré, ou « Sans titre » s'il n'a aucun caractère visible. */
export function titreAffiche(titre: string): string {
  return CARACTERE_VISIBLE.test(titre) ? titre : SANS_TITRE;
}

export function titreOnglet(titrePage: string | undefined): string {
  return titrePage === undefined ? NOM_APPLICATION : `${titrePage} · ${NOM_APPLICATION}`;
}

const BLANCS_DE_BORD = /^\p{White_Space}+|\p{White_Space}+$/gu;

/**
 * Titre cité dans un nom ou une description accessible : le titre affiché sans ses blancs de tête
 * et de queue, ses blancs intérieurs intacts. Seule définition : tout nom composé autour d'un titre
 * passe par elle (F-004-AC57).
 */
export function titreCite(titre: string): string {
  return titreAffiche(titre).replace(BLANCS_DE_BORD, "");
}

export function nomAjouterSousPage(titre: string): string {
  return `Ajouter une sous-page à « ${titreCite(titre)} »`;
}

/** Nom du bouton « ⋯ » d'une rangée et de son menu, dont les entrées ne portent que leur libellé. */
export function nomActionsDeLaPage(titre: string): string {
  return `Actions de la page « ${titreCite(titre)} »`;
}

/** Nom de la commande de repli : il ne dit pas l'état, que porte `aria-expanded` (F-004-AC56). */
export function nomSousPages(titre: string): string {
  return `Sous-pages de « ${titreCite(titre)} »`;
}

/** Description du lien d'une rangée de niveau 2 ou plus (F-004-AC55). */
export function descriptionDeSousPage(niveau: number, titreDeLaMere: string): string {
  return `Niveau ${niveau}, sous-page de « ${titreCite(titreDeLaMere)} »`;
}
