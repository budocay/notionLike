// Preuve lancée à la main de F-004-AC50, après `pnpm --filter @notionlike/web build` (la sortie de
// construction est ignorée par git : un test des hooks ne peut pas la lire) :
//   node apps/web/test/construction-sans-demonstration.ts
// Aucun fichier de dist/ ne porte le marqueur de la page, et aucune feuille de dist/ ne porte le
// sélecteur d'une classe propre à la démonstration, l'ensemble étant calculé depuis les sources.
// Une faute lève une erreur : le code de sortie n'est nul que si la construction est propre.
// Le relevé part sur la sortie d'erreur, seule que la règle de lint du dépôt laisse à `console`.
import { MARQUEUR_DE_DEMONSTRATION } from "../src/demonstration/marqueur.ts";
import { existe, lire, lister } from "./aides-disque.ts";
import {
  classesDeLaSeuleDemonstration,
  classesPortees,
  estDeLaDemonstration,
  FEUILLE_D_ENTREE,
  FEUILLE_DE_DEMONSTRATION,
  fichiersAnalyses,
} from "./aides-styles.ts";

const CONSTRUCTION = "dist";

function textesDe(chemins: readonly string[]): Map<string, string> {
  return new Map(chemins.map((chemin) => [chemin, lire(chemin)]));
}

function fautesDeLaConstruction(): string[] {
  const disque = ["demo.html", "index.html", ...lister("src")];
  const demonstration = lire(FEUILLE_DE_DEMONSTRATION);
  // Un fichier de la page n'est jamais compté parmi ceux de l'application, même si la feuille
  // d'entrée venait à le désigner : ses classes resteraient alors à chercher dans la construction.
  const deLApplication = fichiersAnalyses(lire(FEUILLE_D_ENTREE), disque).filter(
    (chemin) => !estDeLaDemonstration(chemin),
  );
  const classes = classesDeLaSeuleDemonstration(
    demonstration,
    textesDe(fichiersAnalyses(demonstration, disque, FEUILLE_DE_DEMONSTRATION)),
    textesDe(deLApplication),
  );
  const construits = lister(CONSTRUCTION);
  const feuilles = construits.filter((chemin) => chemin.endsWith(".css"));
  console.warn(`${classes.length} classes propres à la démonstration : ${classes.join(" ")}`);
  console.warn(
    `${construits.length} fichiers construits, dont ${feuilles.length} feuille(s) : ${feuilles.join(" ")}`,
  );
  if (feuilles.length === 0 || classes.length === 0) {
    return ["rien à comparer : aucune feuille construite, ou aucune classe calculée"];
  }
  return [
    ...construits
      .filter((chemin) => /demo|demonstration/i.test(chemin))
      .map((chemin) => `${chemin} : fichier de la page de démonstration`),
    ...construits
      .filter((chemin) => lire(chemin).includes(MARQUEUR_DE_DEMONSTRATION))
      .map((chemin) => `${chemin} : marqueur de la page de démonstration`),
    ...feuilles.flatMap((chemin) =>
      classesPortees(lire(chemin), classes).map((classe) => `${chemin} : classe « ${classe} »`),
    ),
  ];
}

if (!existe(CONSTRUCTION)) {
  throw new Error("dist/ est absent : lancer d'abord `pnpm --filter @notionlike/web build`.");
}
const fautes = fautesDeLaConstruction();
if (fautes.length > 0) {
  throw new Error(`La construction porte la page de démonstration :\n${fautes.join("\n")}`);
}
console.warn("RESULTAT: OK — la construction ne porte rien de la page de démonstration");
