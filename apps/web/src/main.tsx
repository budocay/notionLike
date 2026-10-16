import "./styles/entree.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ouvrirLeCompte } from "./compte/index.ts";
import { demarrerSessionEspace } from "./espace/session-espace.ts";
import { Application } from "./interface/Application.tsx";
import { serveurDesEspaces, sourceDuCompte } from "./interface/branchement-synchronisation.ts";
import type { FabriqueDeSynchronisation } from "./interface/synchronisation-ouverte.ts";
import { demarrerSynchronisation, environnementDuNavigateur } from "./synchronisation/index.ts";

const ID_RACINE = "racine";

const racine = document.getElementById(ID_RACINE);
if (racine === null) {
  throw new Error(`Élément #${ID_RACINE} absent de la page hôte.`);
}
// La session et le compte naissent hors de React : `StrictMode` ne double aucune ouverture
// (ADR-0007) ni aucune requête `moi`. Le compte ne retarde rien : la coquille s'affiche sans
// attendre sa réponse (F-010-AC1).
const compte = ouvrirLeCompte();
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
    <Application
      session={demarrerSessionEspace()}
      compte={compte}
      synchronisation={synchronisation}
    />
  </StrictMode>,
);
