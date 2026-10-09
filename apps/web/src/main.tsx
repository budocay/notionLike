import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { demarrerSessionEspace } from "./espace/session-espace.ts";
import { Application } from "./interface/Application.tsx";

const ID_RACINE = "racine";

const racine = document.getElementById(ID_RACINE);
if (racine === null) {
  throw new Error(`Élément #${ID_RACINE} absent de la page hôte.`);
}
// La session naît hors de React : `StrictMode` ne double aucune ouverture (ADR-0007).
createRoot(racine).render(
  <StrictMode>
    <Application session={demarrerSessionEspace()} />
  </StrictMode>,
);
