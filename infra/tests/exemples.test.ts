import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  constatsAccordDesExemples,
  constatsValeursFactices,
  lireExemple,
} from "./regles/exemples.ts";

const racine = new URL("../../", import.meta.url);
const lire = (chemin: string): string => readFileSync(new URL(chemin, racine), "utf8");
const MOT_DE_PASSE_D_EXEMPLE = "factice-a-remplacer";

describe("fichiers d'exemple", () => {
  it("F-008-AC13 infra/.env.example ne porte que le mot de passe factice, marqué comme tel", () => {
    const exemple = lireExemple(lire("infra/.env.example"));

    expect(constatsValeursFactices(exemple)).toEqual([]);
    expect(exemple.map(({ cle, valeur }) => [cle, valeur])).toEqual([
      ["POSTGRES_PASSWORD", MOT_DE_PASSE_D_EXEMPLE],
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

  it("F-008-AC13 F-009-AC23 apps/server/.env.example ne porte que des secrets factices et marqués comme tels", () => {
    const exemple = lireExemple(lire("apps/server/.env.example"));

    expect(constatsValeursFactices(exemple)).toEqual([]);
    expect(exemple.map(({ cle }) => cle)).toEqual([
      "HOTE",
      "PORT",
      "URL_BASE_DONNEES",
      "ORIGINES_AUTORISEES",
      "BETTER_AUTH_SECRET",
      "URL_PUBLIQUE",
    ]);
  });

  it("F-009-AC23 refuse un secret de session réel, ou que rien ne dit factice", () => {
    const vraiSecret = lireExemple(
      "# Secret de session.\nBETTER_AUTH_SECRET=Xo4kPq81zZXo4kPq81zZXo4kPq81zZ00\n",
    );
    const sansMarque = lireExemple(
      "# Secret factice.\n\nBETTER_AUTH_SECRET=factice-a-remplacer-par-32-caracteres\n",
    );

    expect(constatsValeursFactices(vraiSecret)).toEqual([
      "BETTER_AUTH_SECRET : la valeur n'est pas factice",
      "BETTER_AUTH_SECRET : aucun commentaire ne la dit factice",
    ]);
    expect(constatsValeursFactices(sansMarque)).toEqual([
      "BETTER_AUTH_SECRET : aucun commentaire ne la dit factice",
    ]);
  });

  it("F-008-AC13 apps/server/.env.example avec un vrai secret, ou un secret que rien ne dit factice, est vu", () => {
    const exemple = lire("apps/server/.env.example");
    const vraiSecret = exemple.replace(MOT_DE_PASSE_D_EXEMPLE, "Xo4kPq81zZ");
    const sansMarque = exemple.replace(/^# Mot de passe factice.*\n/m, "");

    expect(vraiSecret).not.toBe(exemple);
    expect(sansMarque).not.toBe(exemple);
    expect(constatsValeursFactices(lireExemple(vraiSecret))).toEqual([
      "URL_BASE_DONNEES : la valeur n'est pas factice",
    ]);
    expect(constatsValeursFactices(lireExemple(sansMarque))).toEqual([
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
