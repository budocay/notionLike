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
/** Zone d'état de la barre du haut pendant une coupure (F-004-AC40). */
export const NON_ENREGISTRE = "Non enregistré sur cet appareil";
/** Zone d'état, seulement une fois la preuve d'écriture faite (F-030-AC29). */
export const ENREGISTRE = "Enregistré sur cet appareil";
/** Annoncé une fois, à la reprise (F-030-AC14). */
export const ANNONCE_DE_REPRISE = "Modifications enregistrées sur cet appareil.";

export const INVITATION_PREMIERE_PAGE =
  "Cet espace ne contient encore aucune page. Créez-en une avec « Nouvelle page », dans la barre latérale.";
export const INVITATION_CHOISIR_UNE_PAGE =
  "Aucune page n'est ouverte. Choisissez une page dans la barre latérale, ou créez-en une avec « Nouvelle page ».";
export const EXPLICATION_PAGE_INTROUVABLE =
  "Cette page n'existe pas dans cet espace, ou elle a été mise à la corbeille.";

export const AVERTISSEMENT_NON_ENREGISTRE =
  "Stockage de l'appareil indisponible : vos modifications ne sont pas encore enregistrées. Nouvelle tentative automatique en cours.";
/** Ajouté tant que la base n'a jamais été relue depuis l'ouverture (F-030-AC13). */
export const AVERTISSEMENT_BASE_NON_RELUE =
  "Ce qui était déjà enregistré sur cet appareil n'a pas pu être lu ; il réapparaîtra dès que le stockage reviendra.";
export const REESSAYER_MAINTENANT = "Réessayer maintenant";
/** Après la réparation d'un identifiant d'espace illisible qui n'a pu désigner aucune base (F-030-AC23). */
export const AVERTISSEMENT_BASES_NON_RATTACHEES =
  "Des pages enregistrées auparavant sur cet appareil n'ont pas pu être rattachées à cet espace. Elles n'ont pas été effacées.";

export const TITRE_CONTEXTE_NON_SECURISE = "Adresse non sécurisée";
export const EXPLICATION_CONTEXTE_NON_SECURISE =
  "L'application ne peut pas démarrer à cette adresse. Elle doit être servie en https, ou à une adresse locale de la machine (localhost ou 127.0.0.1).";

export const TITRE_VERSION_NON_PRISE_EN_CHARGE = "Mise à jour nécessaire";
export const EXPLICATION_VERSION_NON_PRISE_EN_CHARGE =
  "Cet espace a été enregistré par une version plus récente de l'application. Mettez l'application à jour pour l'ouvrir ; rien n'a été modifié sur cet appareil.";

/** Nom accessible de la zone de saisie de l'éditeur (F-003-AC16). */
export const NOM_DE_LA_ZONE_DE_SAISIE = "Contenu de la page";
/** Invite du bloc vide, menu slash de F-005 livré (F-003-AC40). */
export const INVITE_DU_BLOC_VIDE = "Écris, ou tape / pour insérer un bloc";
export const NOM_DE_LA_BARRE_DE_BLOCS = "Type de bloc";

// Bloc code et menu slash (F-005-AC6, AC18, AC22).
export const NOM_DU_MENU_SLASH = "Commandes de bloc";
export const AUCUNE_COMMANDE = "Aucune commande";
export const SELECTEUR_DE_LANGAGE = "Langage du bloc code";
export const TEXTE_BRUT = "Texte brut";

/** Le nombre de commandes que le menu slash liste, annoncé à chaque changement du filtre. */
export function commandesListees(nombre: number): string {
  if (nombre === 0) {
    return AUCUNE_COMMANDE;
  }
  return nombre === 1 ? "1 commande" : `${nombre} commandes`;
}

/**
 * Nom de chaque langage de la liste dans le sélecteur ; sa valeur reste son identifiant. Le module
 * d'édition le lit comme un nom par langage de sa liste : un oubli ne compile pas.
 */
export const NOMS_DES_LANGAGES = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  python: "Python",
  sql: "SQL",
  typescript: "TypeScript",
  yaml: "YAML",
} as const;

/** Commandes de mise en forme de la barre de blocs et du panneau de lien (F-028-AC27). */
export const COMMANDE_GRAS = "Gras";
export const COMMANDE_ITALIQUE = "Italique";
export const COMMANDE_LIEN = "Lien";
export const NOM_DU_PANNEAU_DE_LIEN = "Lien";
export const CHAMP_ADRESSE_DU_LIEN = "Adresse du lien";
export const APPLIQUER_LE_LIEN = "Appliquer";
export const OUVRIR_LE_LIEN = "Ouvrir le lien";
export const RETIRER_LE_LIEN = "Retirer le lien";
/** Une adresse refusée par la règle des adresses (F-028-AC12, H4). */
export const ADRESSE_DU_LIEN_REFUSEE =
  "Adresse refusée : seules les adresses https, http et mailto sont acceptées. Écrivez l'adresse en entier, en commençant par https, http ou mailto.";

/** Tenu à la place de l'éditeur d'une page que cette application ne sait pas lire (F-003-AC19). */
export const PAGE_DE_VERSION_NON_PRISE_EN_CHARGE =
  "Cette page a été enregistrée par une version plus récente de l'application. Mettez l'application à jour pour l'ouvrir ; rien n'a été modifié sur cet appareil.";
export const CHARGEMENT_DE_LA_PAGE = "Chargement de la page…";

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
  "version-invalide":
    "Cette page ne peut pas passer à la version de format demandée : l'action n'a pas été effectuée.",
  "rang-indisponible":
    "Impossible de placer la page à cet endroit : l'action n'a pas été effectuée.",
  "page-hors-corbeille":
    "Cette page n'est plus dans la corbeille : l'action n'a pas été effectuée.",
  // F-017 : refus du document de table, sans écran avant F-018.
  "pas-un-document-de-table": "Ce document n'est pas une table : l'action n'a pas été effectuée.",
  "type-de-colonne-inconnu": "Ce type de colonne n'existe pas : l'action n'a pas été effectuée.",
  "nom-non-admis": "Le nom de la colonne est trop long : l'action n'a pas été effectuée.",
  "libelle-non-admis": "Le libellé du choix est trop long : l'action n'a pas été effectuée.",
  "ligne-introuvable": "Cette ligne n'existe plus : l'action n'a pas été effectuée.",
  "colonne-introuvable": "Cette colonne n'existe plus : l'action n'a pas été effectuée.",
  "colonne-sans-options":
    "Cette colonne ne propose pas de liste de choix : l'action n'a pas été effectuée.",
  "option-introuvable": "Ce choix n'existe plus dans la colonne : l'action n'a pas été effectuée.",
  "valeur-non-conforme":
    "Cette valeur ne correspond pas au type de la colonne : l'action n'a pas été effectuée.",
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

/** Vrai quand le titre n'a aucun caractère visible : « Sans titre » s'affiche alors atténué (F-003-AC39). */
export function titreEstVide(titre: string): boolean {
  return !CARACTERE_VISIBLE.test(titre);
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

/** Le titre cité entre guillemets, dans un texte de la zone de synchronisation (F-013). */
export function titreEntreGuillemets(titre: string): string {
  return `« ${titreCite(titre)} »`;
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

// Écran de la corbeille (F-007) : les noms composés autour d'un titre ; les autres textes sont dans
// messages-corbeille.ts.
export function nomRestaurer(titre: string): string {
  return `Restaurer « ${titreCite(titre)} »`;
}

export function nomSupprimer(titre: string): string {
  return `Supprimer définitivement « ${titreCite(titre)} »`;
}

export function titreDeLaConfirmation(titre: string): string {
  return `Supprimer définitivement « ${titreCite(titre)} » ?`;
}

/** Acceptation réussie d'une invitation (F-014-AC23) : le nom de l'espace est cité comme un titre. */
export function espaceRejoint(nom: string, libelleDuRole: string): string {
  return `Vous avez rejoint « ${titreCite(nom)} » en tant que ${libelleDuRole}.`;
}

// Déplacement d'une page (F-006) : commandes du menu « ⋯ », raisons d'une commande indisponible,
// annonces aux technologies d'assistance, au clavier comme pendant un geste (F-006-AC12, AC36).
export const MONTER = "Monter";
export const DESCENDRE = "Descendre";
export const METTRE_SOUS_LA_PAGE_PRECEDENTE = "Mettre sous la page précédente";
export const SORTIR_D_UN_NIVEAU = "Sortir d'un niveau";
export const DEJA_PREMIERE = "La page est déjà la première de son niveau.";
export const DEJA_DERNIERE = "La page est déjà la dernière de son niveau.";
export const AUCUNE_PAGE_PRECEDENTE = "Aucune page ne la précède à son niveau.";
export const DEJA_A_LA_RACINE = "La page est déjà à la racine.";

/** Annonce d'une page déplacée au clavier : son titre, sa nouvelle mère et sa place (F-006-AC12). */
export function pageDeplacee(
  titre: string,
  mere: string | undefined,
  rang: number,
  total: number,
): string {
  const ou = mere === undefined ? "à la racine" : `sous « ${titreCite(mere)} »`;
  return `« ${titreCite(titre)} » déplacée ${ou}, position ${rang} sur ${total}.`;
}

/**
 * Annonce d'une commande de déplacement sans destination, appelée par son raccourci : son nom, et
 * la raison quand elle est connue (F-006-AC11, AC18, AC28).
 */
export function commandeIndisponible(commande: string, raison?: string): string {
  return raison === undefined
    ? `${commande} : indisponible.`
    : `${commande} : indisponible. ${raison}`;
}

export const INSTRUCTIONS_DU_GLISSER =
  "Pour déplacer la page en la faisant glisser au clavier, appuyez sur Espace, déplacez-la avec les flèches, puis appuyez de nouveau sur Espace pour la déposer, ou sur Échap pour annuler. Le menu « Actions de la page » offre aussi Monter, Descendre, Mettre sous la page précédente et Sortir d'un niveau.";

/** Où irait la page lâchée, dit en toutes lettres : jamais par la couleur seule (F-006-AC28). */
export function lieuDuDepot(zone: "avant" | "apres" | "dans", cible: string): string {
  const cite = `« ${titreCite(cible)} »`;
  return zone === "dans" ? `dans ${cite}` : `${zone === "avant" ? "avant" : "après"} ${cite}`;
}

export function pageSaisie(titre: string): string {
  return `Page « ${titreCite(titre)} » saisie.`;
}

export function pageAuDessus(titre: string, lieu: string | undefined): string {
  return lieu === undefined
    ? `« ${titreCite(titre)} » n'est au-dessus d'aucun emplacement possible.`
    : `« ${titreCite(titre)} » irait ${lieu}.`;
}

export function pageDeposee(titre: string, lieu: string | undefined): string {
  return lieu === undefined
    ? `« ${titreCite(titre)} » relâchée sans être déplacée.`
    : `« ${titreCite(titre)} » déposée ${lieu}.`;
}

export function deplacementAbandonne(titre: string): string {
  return `Déplacement de « ${titreCite(titre)} » annulé.`;
}

// Déplacement d'un bloc (F-006-AC14, AC18) : poignée et commandes de la barre de blocs.
export const DEPLACER_LE_BLOC = "Déplacer le bloc";
export const MONTER_LE_BLOC = "Monter le bloc";
export const DESCENDRE_LE_BLOC = "Descendre le bloc";
