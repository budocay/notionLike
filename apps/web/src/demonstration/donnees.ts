// Données fictives de la page de démonstration : aucun document, aucune persistance. Seul ce qui
// est propre à la page est ici ; les textes de l'interface viennent de `interface/messages.ts`, les
// combinaisons de touches de `interface/raccourcis.ts`.
export const ADRESSE_FICTIVE = "#apercu";

export const TITRE_LONG =
  "Compte-rendu-de-la-réunion-de-cadrage-du-projet-Atlas-avec-les-équipes-produit-et-design".repeat(
    2,
  );

export const NOM_DE_L_ESPACE_FICTIF = "Carnets d'Inès";

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
