import "./styles/entree.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ouvrirLeCompte } from "./compte/index.ts";
import { demarrerSessionEspace } from "./espace/session-espace.ts";
import { Application } from "./interface/Application.tsx";

const ID_RACINE = "racine";

const racine = document.getElementById(ID_RACINE);
if (racine === null) {
  throw new Error(`Élément #${ID_RACINE} absent de la page hôte.`);
}
// La session et le compte naissent hors de React : `StrictMode` ne double aucune ouverture
// (ADR-0007) ni aucune requête `moi`. Le compte ne retarde rien : la coquille s'affiche sans
// attendre sa réponse (F-010-AC1).
createRoot(racine).render(
  <StrictMode>
    <Application session={demarrerSessionEspace()} compte={ouvrirLeCompte()} />
  </StrictMode>,
);
