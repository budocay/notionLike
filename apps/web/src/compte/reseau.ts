// Seul fichier d'apps/web qui nomme `fetch` (F-010-AC21) : le bloc ESLint qui le vise retire
// `fetch` de ses globales interdites, et de nulle part ailleurs. Les chemins passés sont relatifs :
// la requête part vers l'origine qui sert l'application.
import type { Requeter } from "./moi.ts";

export const requeterLeServeur: Requeter = (entree, init) => fetch(entree, init);
