// Interface du module de synchronisation (F-013-AC38) : aucun type du fournisseur n'en sort.
export type {
  IssueDAdoption,
  ServeurDesEspaces,
  ReponseDuServeur,
  ErreurDuServeur,
} from "./adoption.ts";
export type { Environnement } from "./environnement.ts";
export type { Canal } from "./conduites.ts";
export type { CanalDUnMotif, MotifSynchro } from "@notionlike/contrats";
export {
  type CauseDErreur,
  type DocumentEnErreur,
  type EtatAffiche,
  ETATS_AFFICHES,
  type EtatDeSynchronisation,
  type Rattachement,
  type StatutDuCompte,
} from "./etat.ts";
export type { IssueDEffacement as IssueDeLEffacement } from "./stockage.ts";
export { versionAdmise } from "./miroir.ts";
export { idsDesPages } from "./pages-de-l-espace.ts";
export { environnementDuNavigateur } from "./reseau.ts";
export {
  demarrerSynchronisation,
  type OptionsDeSynchronisation,
  type PageAffichee,
  type SourceDuCompte,
  type Synchronisation,
} from "./synchronisation.ts";
