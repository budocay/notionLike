// Branchement du module de synchronisation sur le compte (F-013) : l'état du compte vient du seul
// module de F-010 (F-010-AC28), et les deux appels aux routes des espaces passent par le client de
// F-014-AC37. La synchronisation ne connaît d'eux que ces formes.
import type { ClientDesEspaces, ErreurDEspaces, SuiviDuCompte } from "../compte/index.ts";
import type {
  ErreurDuServeur,
  ServeurDesEspaces,
  SourceDuCompte,
  StatutDuCompte,
} from "../synchronisation/index.ts";

function erreurDuServeur(erreur: ErreurDEspaces): ErreurDuServeur {
  switch (erreur.type) {
    case "enveloppe":
      return { type: "enveloppe", code: erreur.code };
    case "trop-de-requetes":
      return { type: "trop-de-requetes" };
    case "hors-ligne":
      return { type: "hors-ligne" };
    case "generique":
      return { type: "generique" };
  }
}

export function serveurDesEspaces(client: ClientDesEspaces): ServeurDesEspaces {
  return {
    declarer: async (idEspace, nom) => {
      const resultat = await client.declarerEspace({ idEspace, nom });
      return resultat.ok
        ? {
            ok: true,
            valeur: {
              nom: resultat.valeur.nom,
              role: resultat.valeur.role,
              rejouee: resultat.valeur.rejouee,
            },
          }
        : { ok: false, erreur: erreurDuServeur(resultat.erreur) };
    },
    lire: async (idEspace) => {
      const resultat = await client.lireEspace(idEspace);
      return resultat.ok
        ? { ok: true, valeur: { nom: resultat.valeur.nom, role: resultat.valeur.role } }
        : { ok: false, erreur: erreurDuServeur(resultat.erreur) };
    },
  };
}

export function sourceDuCompte(suivi: SuiviDuCompte): SourceDuCompte {
  const statut = (): StatutDuCompte => suivi.lire().statut;
  return {
    lire: statut,
    abonner: (rappel) => suivi.abonner(rappel),
    reverifier: async () => (await suivi.reverifier()).statut,
  };
}
