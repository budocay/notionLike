// Graphe des modules d'`apps/web`, calculé par dependency-cruiser appelé comme une bibliothèque :
// la seule aide qui dit ce qu'un module atteint par ses imports, statiques ou dynamiques. Aucun
// analyseur d'imports n'est écrit dans les tests de F-004.
import { cruise } from "dependency-cruiser";

interface Module {
  readonly source: string;
  readonly dependencies: readonly { readonly resolved: string }[];
}

/** Dépendances directes de chaque module, par chemin depuis `apps/web`. */
export type Aretes = ReadonlyMap<string, readonly string[]>;

/** Graphe de `src/` et de `test/` : les dépendances directes de chaque module. */
export async function graphe(): Promise<Aretes> {
  const racine = import.meta.dirname.replace(/[\\/]test$/, "");
  const resultat = await cruise(["src", "test"], {
    baseDir: racine,
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    outputType: "json",
  });
  const sortie: unknown =
    typeof resultat.output === "string" ? JSON.parse(resultat.output) : resultat.output;
  const { modules } = sortie as { readonly modules: readonly Module[] };
  return new Map(
    modules.map(({ source, dependencies }) => [source, dependencies.map((un) => un.resolved)]),
  );
}

/** Modules atteints depuis un module, de proche en proche, lui compris. */
export function atteintsDepuis(aretes: Aretes, depart: string): Set<string> {
  const atteints = new Set([depart]);
  for (const module of atteints) {
    (aretes.get(module) ?? []).forEach((suivant) => atteints.add(suivant));
  }
  return atteints;
}
