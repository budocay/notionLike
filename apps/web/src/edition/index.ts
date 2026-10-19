// Interface du module d'édition (F-003-AC27) : rien de la bibliothèque d'édition n'en sort. La
// règle des adresses (F-028-AC11) en sort, fonction pure, pour être éprouvée seule ; de même la
// liste des commandes de bloc et son filtre, données et fonction pures (F-005-AC14, AC21).
export { adresseAcceptee, adresseDUneSaisie } from "./adresses.ts";
export { EditeurDePage, type ProprietesEditeurDePage } from "./EditeurDePage.tsx";
export { commandesFiltrees } from "./filtre-des-commandes.ts";
export { LISTE_DES_COMMANDES } from "./types-de-bloc.ts";
