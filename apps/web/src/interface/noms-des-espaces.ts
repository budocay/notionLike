// Dernier nom connu des espaces de l'appareil (F-032-AC3) : le client des espaces est enveloppé une
// fois, par l'entrée, avant de servir aux écrans et à l'adoption. Chaque réponse conforme de la
// liste, de la lecture, du renommage, de la déclaration et de l'acceptation passe ses couples
// (identifiant, nom) au magasin de l'appareil, qui ne retient que ceux des espaces de l'appareil.
// La liste du serveur n'est conservée nulle part (F-014-AC1) : seuls ces noms le sont.
import type { ClientDesEspaces, EspaceLu, Resultat } from "../compte/index.ts";
import type { MagasinDeLAppareil } from "../espace/appareil.ts";

type Noms = Pick<MagasinDeLAppareil, "noterLesNoms">;

/** Le client des espaces, dont les réponses conformes font noter leurs noms. */
export function avecLesNoms(client: ClientDesEspaces, magasin: Noms): ClientDesEspaces {
  const noter = <T extends EspaceLu>(resultat: Resultat<T>): Resultat<T> => {
    if (resultat.ok) {
      noterSansLever(magasin, [resultat.valeur]);
    }
    return resultat;
  };
  return {
    ...client,
    listerEspaces: async () => {
      const resultat = await client.listerEspaces();
      if (resultat.ok) {
        noterSansLever(magasin, resultat.valeur);
      }
      return resultat;
    },
    lireEspace: async (idEspace) => noter(await client.lireEspace(idEspace)),
    renommerEspace: async (idEspace, corps) => noter(await client.renommerEspace(idEspace, corps)),
    declarerEspace: async (corps) => noter(await client.declarerEspace(corps)),
    accepterInvitation: async (corps) => noter(await client.accepterInvitation(corps)),
  };
}

// Le nom reçu est rendu à l'écran quoi qu'il advienne de son inscription (F-032-AC3, AC31) : une
// exception du magasin ne remonte jamais jusqu'à l'appelant du client.
function noterSansLever(magasin: Noms, espaces: readonly EspaceLu[]): void {
  if (espaces.length === 0) {
    return;
  }
  try {
    magasin.noterLesNoms(new Map(espaces.map((espace) => [espace.idEspace, espace.nom])));
  } catch (exception) {
    console.error(SIGNALEMENT, exception);
  }
}

const SIGNALEMENT =
  "@notionlike/web : le magasin de l'appareil a levé en notant des noms d'espace.";
