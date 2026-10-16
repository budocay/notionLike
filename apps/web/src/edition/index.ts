// Interface du module d'édition (F-003-AC27) : rien de la bibliothèque d'édition n'en sort. La
// règle des adresses (F-028-AC11) en sort, fonction pure, pour être éprouvée seule.
export { adresseAcceptee, adresseDUneSaisie } from "./adresses.ts";
export { EditeurDePage, type ProprietesEditeurDePage } from "./EditeurDePage.tsx";
