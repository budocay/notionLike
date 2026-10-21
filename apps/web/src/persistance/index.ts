export { ouvrirEspaceLocal, type PersistanceEspaceLocal } from "./espace-local.ts";
export { ouvrirPersistance, type Persistance } from "./indexeddb.ts";
export { type DesignationDocument, ErreurPersistance, nomDeBase } from "./nom-de-base.ts";
export { type EtatPersistance } from "./suivi.ts";
export {
  type DesignationDeBaseDePage,
  effacerBaseDeDocument,
  effacerBaseDePage,
  type IssueDEffacement,
} from "./effacement.ts";
// F-018 : réglages de vue d'une table, sur l'appareil (ADR-0019).
export {
  cleDesReglagesDeVue,
  type DesignationDeVue,
  ecrireReglagesDeVue,
  effacerReglagesDeVue,
  lireReglagesDeVue,
  type SectionsDeVue,
} from "./reglages-de-vue.ts";
// F-013 : registre de l'appareil.
export {
  type Droit,
  type EntreeDuRegistre,
  inscrireAuRegistre,
  type LectureDuRegistre,
  lireLeRegistre,
  retirerDuRegistre,
} from "./registre.ts";
