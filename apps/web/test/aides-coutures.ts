// Texte des fichiers de code et de test du workspace, par chemin depuis la racine du dépôt. Lus
// comme des chaînes : aucun module d'un autre paquet n'est évalué (F-002-AC31, conception,
// « Règles de dépendances »). Seuls `coutures.test.ts` et `coutures-page.test.ts` s'en servent.
const ICI = "apps/web/test";

export function depuisLaRacine(dossier: string, relatif: string): string {
  const segments: string[] = [];
  for (const segment of `${dossier}/${relatif}`.split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

// `import.meta.glob` ne rend jamais le fichier qui l'appelle : c'est pourquoi il est appelé ici,
// et non dans le test, qui se lit ainsi lui-même et ajoute ce fichier à sa lecture.
export function lireLesFichiersDuWorkspace(): Map<string, string> {
  const textes = import.meta.glob<string>(
    "../../../{apps,packages}/*/{src,test,e2e}/**/*.{ts,tsx}",
    {
      query: "?raw",
      import: "default",
      eager: true,
    },
  );
  return new Map(Object.entries(textes).map(([cle, texte]) => [depuisLaRacine(ICI, cle), texte]));
}
