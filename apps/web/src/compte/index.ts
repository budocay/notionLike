// Entrée du compte pour l'interface et l'entrée de l'application : l'état du compte (F-010-AC28), les
// trois appels du client d'authentification (F-010-AC22) et le client des espaces (F-014-AC37),
// assemblés une fois au démarrage.
import { type ClientDeCompte, creerClientDeCompte } from "./client-auth.ts";
import { type ClientDesEspaces, creerClientDesEspaces } from "./client-espaces.ts";
import { requeterLeServeur } from "./reseau.ts";
import { type SuiviDuCompte, suivreLeCompte } from "./suivi-du-compte.ts";

export type { ClientDeCompte, ErreurDeCompte, ResultatDeCompte } from "./client-auth.ts";
export type {
  ClientDesEspaces,
  ErreurDEspaces,
  EspaceLu,
  InvitationCreeeLue,
  InvitationLue,
  MembreLu,
  Resultat,
} from "./client-espaces.ts";
export type { EtatDuCompte, SuiviDuCompte } from "./suivi-du-compte.ts";

export interface Compte {
  readonly suivi: SuiviDuCompte;
  readonly client: ClientDeCompte;
  readonly espaces: ClientDesEspaces;
}

export function ouvrirLeCompte(): Compte {
  return {
    suivi: suivreLeCompte(requeterLeServeur),
    client: creerClientDeCompte(),
    espaces: creerClientDesEspaces(requeterLeServeur),
  };
}
