import "./styles/entree.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ouvrirLeCompte } from "./compte/index.ts";
import { lireLesPagesDeLaBase, ouvrirLeMagasinDeLAppareil } from "./espace/appareil.ts";
import { piloterLOnglet } from "./espace/espace-ouvert.ts";
import { demarrerSessionEspace } from "./espace/session-espace.ts";
import { serveurDesEspaces, sourceDuCompte } from "./interface/branchement-synchronisation.ts";
import { EspaceDeLOnglet } from "./interface/EspaceDeLOnglet.tsx";
import type { FabriqueDeSynchronisation } from "./interface/synchronisation-ouverte.ts";
import {
  demarrerSynchronisation,
  environnementDuNavigateur,
  retirerDeLAppareil,
} from "./synchronisation/index.ts";

const ID_RACINE = "racine";

const racine = document.getElementById(ID_RACINE);
if (racine === null) {
  throw new Error(`Élément #${ID_RACINE} absent de la page hôte.`);
}
// Le compte, le magasin de l'appareil et le pilote de l'onglet naissent hors de React : `StrictMode`
// ne double aucune ouverture (ADR-0007) ni aucune requête `moi`. Le compte ne retarde rien : la
// coquille s'affiche sans attendre sa réponse (F-010-AC1).
const compte = ouvrirLeCompte();
const environnement = environnementDuNavigateur();
// F-032 : ce que l'onglet sait des espaces de l'appareil, tenu à jour entre les onglets (AC22) ; le
// retrait d'un espace passe par la synchronisation, qui prévient les onglets ouverts sur lui (AC20).
const magasin = ouvrirLeMagasinDeLAppareil({
  ouvrirUnCanal: environnement.ouvrirUnCanal,
  retirerDeLAppareil: (idEspace) =>
    retirerDeLAppareil(idEspace, { environnement, lireLesPages: lireLesPagesDeLaBase }),
});
// L'entrée reste le seul module qui nomme le démarrage de la session (F-002-AC31) : elle le donne
// au pilote, qui démarre aussitôt celle de l'espace de l'appareil, puis ouvre l'espace retenu
// (F-032-AC17) et chaque espace choisi (AC10).
const pilote = piloterLOnglet({ demarrerSession: demarrerSessionEspace, magasin });
// La synchronisation naît avec l'écran de l'espace, une fois l'identifiant de l'espace connu ; elle
// ne retarde rien (F-013-AC1) et n'ouvre aucune WebSocket avant l'adoption et la connexion (AC7).
const synchronisation: FabriqueDeSynchronisation = (espace) =>
  demarrerSynchronisation({
    ...espace,
    environnement: environnementDuNavigateur(),
    compte: sourceDuCompte(compte.suivi),
    serveur: serveurDesEspaces(compte.espaces),
  });
createRoot(racine).render(
  <StrictMode>
    <EspaceDeLOnglet
      pilote={pilote}
      magasin={magasin}
      compte={compte}
      synchronisation={synchronisation}
    />
  </StrictMode>,
);
