// Types minimaux du module de Node que les contrôles statiques et le scénario de capture emploient : `@types/node`
// n'est pas une dépendance d'`apps/web`, et Vitest rend une chaîne vide pour toute feuille CSS
// importée, même en `?raw` (constaté le 2026-10-09) : les sources se lisent donc sur le disque.
declare module "node:fs" {
  export function readFileSync(chemin: string, encodage: "utf8"): string;
  export function readdirSync(
    chemin: string,
    options: { readonly recursive: true; readonly withFileTypes: true },
  ): { readonly name: string; readonly parentPath: string; isFile(): boolean }[];
  export function existsSync(chemin: string): boolean;
  export function statSync(chemin: string): { readonly size: number };
}

interface ImportMeta {
  readonly dirname: string;
}

declare module "node:crypto" {
  export function createHash(algorithme: "sha256"): {
    update(texte: string): { digest(encodage: "hex"): string };
  };
}
