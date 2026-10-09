// Entrée de la page de démonstration (F-004-AC50) : servie par le serveur de développement à
// /demo.html, hors de la construction, qui ne part que d'index.html. Ni document Yjs ni persistance.
import "./demonstration.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import jetons from "../styles/jetons.css?raw";
import { PageDemonstration } from "./PageDemonstration.tsx";

const racine = document.getElementById("racine");
if (racine !== null) {
  createRoot(racine).render(
    <StrictMode>
      <PageDemonstration jetons={jetons} />
    </StrictMode>,
  );
}
