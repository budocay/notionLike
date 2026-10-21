// Données fictives de la page de démonstration : aucun document, aucune persistance. Seul ce qui
// est propre à la page est ici ; les textes de l'interface viennent de `interface/messages.ts`, les
// combinaisons de touches de `interface/raccourcis.ts`.
import {
  ADRESSE_DU_LIEN_REFUSEE,
  APPLIQUER_LE_LIEN,
  CHAMP_ADRESSE_DU_LIEN,
  COMMANDE_GRAS,
  COMMANDE_ITALIQUE,
  COMMANDE_LIEN,
  NOM_DU_PANNEAU_DE_LIEN,
  NOMS_DES_LANGAGES,
  OUVRIR_LE_LIEN,
  RETIRER_LE_LIEN,
  SELECTEUR_DE_LANGAGE,
  TEXTE_BRUT,
} from "../interface/messages.ts";

export const ADRESSE_FICTIVE = "#apercu";

export const TITRE_LONG =
  "Compte-rendu-de-la-réunion-de-cadrage-du-projet-Atlas-avec-les-équipes-produit-et-design".repeat(
    2,
  );

export const NOM_DE_L_ESPACE_FICTIF = "Carnets d'Inès";
/** Textes de la zone et du formulaire de compte, tels que l'application les affiche (F-010). */
export const COMPTE_FICTIF = {
  zone: "Compte",
  indisponible: "Compte indisponible hors connexion",
  nonConnecte: "Non connecté.",
  connecte: "Connecté : Inès Laurent",
  reessayer: "Réessayer",
  seConnecter: "Se connecter",
  creer: "Créer un compte",
  seDeconnecter: "Se déconnecter",
  pagesRestent: "Vos pages restent sur cet appareil.",
  courriel: "Courriel",
  motDePasse: "Mot de passe",
  obligatoire: "(obligatoire)",
  faute: "Saisissez une adresse courriel valide, de la forme nom@exemple.fr.",
  refus: "Courriel ou mot de passe incorrect.",
  retour: "Retour à l'application",
} as const;

// Écrans des espaces (F-014) : un espace, ses membres, une invitation, une confirmation.
export const ESPACES_FICTIFS = {
  titre: "Atelier Nord",
  partie: "Membres",
  texte: "Votre rôle : Propriétaire",
  annonce: "Rôle de Inès Laurent : Lecteur",
  alerte: "Un espace garde toujours au moins un propriétaire.",
  colonnes: ["Nom", "Rôle", "Actions"],
  membre: "Inès Laurent",
  role: "Lecteur",
  roles: [
    { valeur: "proprietaire", libelle: "Propriétaire" },
    { valeur: "editeur", libelle: "Éditeur" },
    { valeur: "lecteur", libelle: "Lecteur" },
  ],
  nomDuChoix: "Rôle de Inès Laurent",
  retirer: "Retirer",
  renommer: "Renommer l'atelier",
  occupe: "Requête en cours.",
  formulaire: "Renommer l'espace",
  lien: "Retour aux espaces",
  boite: "Retirer Inès Laurent de l'espace ?",
  avertissement: "Les pages que cette personne a ouvertes restent sur ses appareils.",
  annuler: "Annuler",
  copie: "Copiez le lien à la main",
  lienFictif: "exemple.invalid/#/invitation/jeton-fictif",
} as const;

// Écran de la corbeille (F-007) : une racine et sa descendance, une racine seule.
export const CORBEILLE_FICTIVE = {
  nom: "Corbeille",
  vide: "La corbeille est vide",
  racine: "Notes de réunion",
  sousPages: "2 sous-pages",
  fille: "Mardi",
  petiteFille: "Points ouverts",
  aucune: "Aucune sous-page",
  seule: "Brouillon d'annonce",
  restaurer: "Restaurer",
  supprimer: "Supprimer définitivement",
  uneSousPage: "1 sous-page",
} as const;

// Écran de table (F-018) : une table sans colonne, sa marque dans une rangée et dans la corbeille.
export const TABLE_FICTIVE = {
  titre: "Suivi des achats",
  marque: "Table",
  invitation: "Cette table n'a encore aucune colonne. Ajoutez-en une pour commencer à la remplir.",
  ajouter: "Ajouter une colonne",
  nouvelleTable: "Nouvelle table",
  grille: "Lignes de la table Suivi des achats",
  actions: "Actions des lignes",
  colonnes: ["Article", "Prix", "Reçu"],
  lignes: [
    ["Papier", "12,5"],
    ["Encre, cartouche noire de grande capacité pour l'imprimante du bureau", "39"],
  ],
  vues: [
    { id: "tableau", libelle: "Tableau" },
    { id: "kanban", libelle: "Kanban" },
  ],
  nomDesVues: "Vue de la table",
  largeur: "Largeur de la colonne Article",
  champ: "Article, ligne 1",
  choix: [
    { cle: "aucune", libelle: "Aucune", courant: false },
    { cle: "attente", libelle: "En attente", courant: true },
    { cle: "recu", libelle: "Reçu", courant: false },
  ],
  nomDuChoix: "Choix pour la colonne État",
  options: "Options de la colonne État",
  aucuneOption: "Cette colonne n'a encore aucune option.",
  nouvelleOption: "Nouvelle option",
  faute: "Le libellé d'une option compte au plus 100 caractères.",
} as const;

// La zone d'état affirmée se montre sur un texte fictif : le texte de l'application n'a qu'un
// lecteur, l'écran d'enregistrement, qui ne le donne qu'après la preuve d'écriture (F-030-AC29).
export const AFFIRMATION_FICTIVE = "Enregistré, texte d'exemple";

export interface PageFictive {
  readonly titre: string;
  readonly niveau: number;
  readonly sousPages: "aucune" | "depliees" | "repliees";
  readonly courante?: boolean;
}

export const ARBORESCENCE: readonly PageFictive[] = [
  { titre: "Carnet de bord", niveau: 1, sousPages: "depliees" },
  { titre: "Semaine du 5 octobre", niveau: 2, sousPages: "depliees", courante: true },
  { titre: "Point d'équipe du lundi", niveau: 3, sousPages: "aucune" },
  { titre: "Idées en vrac", niveau: 2, sousPages: "aucune" },
  { titre: "Projet Atlas", niveau: 1, sousPages: "repliees" },
  { titre: TITRE_LONG, niveau: 1, sousPages: "aucune" },
  { titre: "Lectures", niveau: 1, sousPages: "depliees" },
  { titre: "L'Usage du monde", niveau: 2, sousPages: "aucune" },
  { titre: "Recettes de saison", niveau: 1, sousPages: "aucune" },
];

export const ANCETRES = [
  { titre: "Carnet de bord", adresse: ADRESSE_FICTIVE },
  { titre: "Semaine du 5 octobre", adresse: `${ADRESSE_FICTIVE}-semaine` },
  { titre: "Point d'équipe du lundi", adresse: `${ADRESSE_FICTIVE}-point` },
] as const;

export const PAGE_COURANTE = "Décisions à prendre avant jeudi";

/** Entrée du pied de la barre latérale : fictive, F-007 y posera la sienne (F-004-AC30). */
export const ENTREE_DE_PIED_FICTIVE = "Corbeille";

/** Commandes de la barre de blocs, telles que l'éditeur les donne ; « Titre 1 » est le type courant. */
export const COMMANDES_DE_BLOC_FICTIVES = [
  { nom: "Paragraphe", repere: "¶", active: false },
  { nom: "Titre 1", repere: "T1", active: true },
  { nom: "Titre 2", repere: "T2", active: false },
  { nom: "Titre 3", repere: "T3", active: false },
  { nom: "Liste à puces", repere: "•", active: false },
  { nom: "Liste numérotée", repere: "1.", active: false },
  { nom: "Bloc code", repere: "</>", active: false },
  { nom: COMMANDE_GRAS, repere: "B", active: true },
  { nom: COMMANDE_ITALIQUE, repere: "I", active: false },
  { nom: COMMANDE_LIEN, repere: "↗", active: false, indisponible: true },
] as const;

/** Le sélecteur de langage d'un bloc code en Python (F-005-AC6). */
export const SELECTEUR_DE_LANGAGE_FICTIF = {
  nom: SELECTEUR_DE_LANGAGE,
  valeur: "python",
  options: [
    { valeur: "", nom: TEXTE_BRUT },
    ...Object.entries(NOMS_DES_LANGAGES).map(([valeur, nom]) => ({ valeur, nom })),
  ],
  surChoix: () => undefined,
} as const;

/** Le menu slash après « /tit » : les trois titres, le deuxième actif (F-005-AC14, AC15). */
export const OPTIONS_DU_MENU_FICTIVES = ["Titre 1", "Titre 2", "Titre 3"].map((nom, rang) => ({
  id: `menu-slash-fictif-${rang}`,
  nom,
  active: nom === "Titre 2",
}));

/** Le sélecteur suit les commandes de type de bloc, avant celles de mise en forme. */
export const RANG_DU_SELECTEUR_FICTIF = COMMANDES_DE_BLOC_FICTIVES.findIndex(
  (commande) => commande.nom === COMMANDE_GRAS,
);

export const POSITION_DU_MENU_FICTIVE = { gauche: 24, haut: 120 } as const;

/** Le panneau de lien d'un lien neutralisé, après une adresse refusée (F-028-AC12, AC17). */
export const PANNEAU_DE_LIEN_FICTIF = {
  nom: NOM_DU_PANNEAU_DE_LIEN,
  etiquette: CHAMP_ADRESSE_DU_LIEN,
  appliquer: APPLIQUER_LE_LIEN,
  ouvrir: OUVRIR_LE_LIEN,
  retirer: RETIRER_LE_LIEN,
  messageDeRefus: ADRESSE_DU_LIEN_REFUSEE,
  adresseEnregistree: "javascript:alert(1)",
  adresseAOuvrir: undefined,
  retirable: true,
  refuse: true,
} as const;

/** La barre de blocs est posée sous le bloc vide de l'aperçu, sans le recouvrir. */
export const POSITION_DE_BARRE_FICTIVE = { gauche: 0, haut: 44 } as const;
