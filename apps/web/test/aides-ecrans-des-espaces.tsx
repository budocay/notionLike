// Aides des tests des écrans des espaces à plusieurs espaces (F-032, bloc 5) : un appareil qui porte
// l'espace de l'appareil `local` et deux espaces ajoutés, un serveur simulé qui liste des espaces,
// l'écran des espaces ouvert dans un onglet lancé comme l'entrée le lance.
import { screen, within } from "@testing-library/react";

import type { Role } from "../src/compte/regles-espaces.ts";
import {
  E_ALPHA,
  E_APPAREIL,
  E_BETA,
  E_GAMMA,
  ECRITURE,
  LECTURE,
  poserDansLAppareil,
} from "./aides-appareil.ts";
import { moi200, ROUTES, type ServeurSimule, serveurSimule } from "./aides-compte.tsx";
import { aller, espace, espace200, liste200, R } from "./aides-espaces.tsx";
import { poserUnEspace } from "./aides-onglet.tsx";

export const TEMOIN_DE_L_APPAREIL = "Témoin de l'appareil";

/**
 * L'appareil : l'espace de l'appareil `local`, sans nom ; Alpha adopté en écriture, « Alpha » ;
 * Bêta adopté en lecture, « Bêta », dans sa première synchronisation.
 */
export async function poserLAppareil(): Promise<void> {
  await poserUnEspace(E_APPAREIL, [TEMOIN_DE_L_APPAREIL]);
  await poserUnEspace(E_ALPHA, ["Page d'Alpha"]);
  await poserUnEspace(E_BETA, ["Page de Bêta"]);
  await poserDansLAppareil({
    "espace-local": E_APPAREIL,
    [`registre:${E_ALPHA}`]: ECRITURE,
    [`nom:${E_ALPHA}`]: "Alpha",
    [`registre:${E_BETA}`]: LECTURE,
    [`nom:${E_BETA}`]: "Bêta",
    [`premiere-synchronisation:${E_BETA}`]: true,
  });
}

export interface EspaceDuServeur {
  readonly idEspace: string;
  readonly nom: string;
  readonly role: Role;
}

export const ALPHA_SERVEUR: EspaceDuServeur = { idEspace: E_ALPHA, nom: "Alpha", role: "editeur" };
export const BETA_SERVEUR: EspaceDuServeur = { idEspace: E_BETA, nom: "Bêta", role: "lecteur" };
export const GAMMA_SERVEUR: EspaceDuServeur = {
  idEspace: E_GAMMA,
  nom: "Gamma",
  role: "lecteur",
};

/** Un serveur où le compte est connecté et membre de ces espaces, lisibles un à un. */
export function serveurDesEspacesListes(espaces: readonly EspaceDuServeur[]): ServeurSimule {
  const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
  listerAuServeur(serveur, espaces);
  return serveur;
}

/** La liste que le serveur rend désormais, et la lecture de chacun de ces espaces. */
export function listerAuServeur(serveur: ServeurSimule, espaces: readonly EspaceDuServeur[]): void {
  serveur.poser(R.espaces, () =>
    liste200(espaces.map(({ idEspace, nom, role }) => espace(role, nom, idEspace))),
  );
  for (const { idEspace, nom, role } of espaces) {
    serveur.poser(R.lire(idEspace), () => espace200(espace(role, nom, idEspace)));
  }
}

/** L'onglet prêt sur son espace ouvert, puis l'écran des espaces une fois la liste lue ou non. */
export async function ouvrirLEcranDesEspaces(page: string): Promise<void> {
  await screen.findByRole("link", { name: page });
  aller("#/espaces");
  await screen.findByRole("heading", { level: 1, name: "Espaces" });
}

export function partie(nom: string): HTMLElement {
  return screen.getByRole("region", { name: nom });
}

/** Le texte de chaque rangée d'une partie, dans l'ordre. */
export function rangeesDe(nom: string): string[] {
  return within(partie(nom))
    .queryAllByRole("listitem")
    .map((rangee) => rangee.textContent);
}

/** Le texte de la rangée de cette partie dont le titre est ce nom. */
export function rangee(nomDeLaPartie: string, nom: string): HTMLElement {
  const trouvee = within(partie(nomDeLaPartie))
    .queryAllByRole("listitem")
    .find((element) => element.firstElementChild?.textContent === nom);
  if (trouvee === undefined) {
    throw new Error(`Aucune rangée « ${nom} » sous « ${nomDeLaPartie} ».`);
  }
  return trouvee;
}

/** Les routes d'espace demandées, dans l'ordre. */
export function routesDesEspaces(serveur: ServeurSimule): string[] {
  return serveur.routesAppelees().filter((route) => route.includes("/espaces"));
}
