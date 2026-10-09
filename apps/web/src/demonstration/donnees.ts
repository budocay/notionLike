// Données fictives de la page de démonstration : aucun document, aucune persistance. Les textes
// des états viennent de l'interface ; ceux des commandes à venir sont posés ici pour l'aperçu.
export const ADRESSE_FICTIVE = "#apercu";

export const TITRE_LONG =
  "Compte-rendu-de-la-réunion-de-cadrage-du-projet-Atlas-avec-les-équipes-produit-et-design".repeat(
    2,
  );

export const LIBELLES = {
  nomEspace: "Carnets d'Inès",
  filDAriane: "Fil d'Ariane",
  pagesIntermediaires: "Afficher les pages intermédiaires",
  ouvrirLaBarre: "Ouvrir la barre latérale",
  fermerLaBarre: "Fermer la barre latérale",
  echecDEnregistrement: "Non enregistré sur cet appareil",
  renommer: "Renommer",
  ajouterUneSousPage: "Ajouter une sous-page",
  mettreALaCorbeille: "Mettre à la corbeille",
  titreTropLong: "Le titre est trop long : la limite est de 200 caractères.",
  operationRefusee: "Cette page n'existe plus : l'action n'a pas été effectuée.",
} as const;

export const TOUCHES = {
  renommer: ["F2"],
  nouvellePage: ["⌘", "N"],
} as const;

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
