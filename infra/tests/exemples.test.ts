import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  constatsAccordDesExemples,
  constatsValeursFactices,
  lireExemple,
} from "./regles/exemples.ts";

const racine = new URL("../../", import.meta.url);
const lire = (chemin: string): string => readFileSync(new URL(chemin, racine), "utf8");

describe("fichiers d'exemple", () => {
  it("F-008-AC13 infra/.env.example ne porte que le mot de passe factice, marqué comme tel", () => {
    const exemple = lireExemple(lire("infra/.env.example"));

    expect(constatsValeursFactices(exemple)).toEqual([]);
    expect(exemple.map(({ cle, valeur }) => [cle, valeur])).toEqual([
      ["POSTGRES_PASSWORD", "factice-a-remplacer"],
    ]);
  });

  it("F-008-AC13 refuse un vrai mot de passe et une valeur factice que rien ne dit factice", () => {
    const vraiSecret = lireExemple("# Mot de passe de la base.\nPOSTGRES_PASSWORD=Xo4kPq81zZ\n");
    const sansMarque = lireExemple(
      "# Mot de passe factice.\n\nPOSTGRES_PASSWORD=factice-a-remplacer\n",
    );

    expect(constatsValeursFactices(vraiSecret)).toEqual([
      "POSTGRES_PASSWORD : la valeur n'est pas factice",
      "POSTGRES_PASSWORD : aucun commentaire ne la dit factice",
    ]);
    expect(constatsValeursFactices(sansMarque)).toEqual([
      "POSTGRES_PASSWORD : aucun commentaire ne la dit factice",
    ]);
  });

  it("F-008-AC13 refuse un secret glissé dans une URL de connexion d'exemple", () => {
    const fautif = lireExemple(
      "PORT=3000\n# URL de la base.\nURL_BASE_DONNEES=postgres://notionlike:Xo4kPq81zZ@127.0.0.1:5432/notionlike\n",
    );

    expect(constatsValeursFactices(fautif)).toEqual([
      "URL_BASE_DONNEES : la valeur n'est pas factice",
      "URL_BASE_DONNEES : aucun commentaire ne la dit factice",
    ]);
  });

  it("F-008-AC14 le mot de passe factice d'infra/.env.example est celui de l'URL d'apps/server/.env.example", () => {
    const infra = lireExemple(lire("infra/.env.example"));
    const serveur = lireExemple(lire("apps/server/.env.example"));

    expect(constatsAccordDesExemples(infra, serveur)).toEqual([]);
  });

  it("F-008-AC14 refuse deux fichiers d'exemple dont les mots de passe factices diffèrent ou manquent", () => {
    const infra = lireExemple("POSTGRES_PASSWORD=factice-a-remplacer\n");
    const url = "postgres://notionlike:factice-autre@127.0.0.1:5432/notionlike";

    expect(constatsAccordDesExemples(infra, lireExemple(`URL_BASE_DONNEES=${url}\n`))).toEqual([
      "les deux mots de passe factices diffèrent",
    ]);
    expect(constatsAccordDesExemples(infra, lireExemple("PORT=3000\n"))).toEqual([
      "apps/server/.env.example : URL_BASE_DONNEES illisible",
    ]);
    expect(constatsAccordDesExemples([], lireExemple(`URL_BASE_DONNEES=${url}\n`))).toEqual([
      "infra/.env.example : POSTGRES_PASSWORD absent",
    ]);
  });
});
