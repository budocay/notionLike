// Couture de F-009 dans `packages/db`. Trois contrats changent : `Base["db"]` reçoit le schéma des
// comptes, `CodeErreurBase` gagne `requete-echouee`, l'entrée publique gagne `supprimerSessions`.
// Les fichiers qui en dépendent sont énumérés ici ; les consommateurs que F-009 ajoute dans
// `apps/server` le sont par `apps/server/test/coutures.test.ts` (F-009-AC23).
import { describe, expect, it } from "vitest";

import { faitEntrer, fichiersDuWorkspace } from "./fichiers-du-workspace.ts";

// Dans le paquet : la définition, la requête sur les sessions, depuis F-011 le type commun des
// requêtes des espaces (`requetes.ts`, que les trois modules d'espaces et, depuis F-027, celui de
// la gestion du compte importent), les tests qui interrogent, et ce fichier, qui porte les motifs
// cherchés.
const QUI_LIT_L_ACCES_ICI = [
  "packages/db/test/couture-comptes.test.ts",
  "packages/db/src/acces.ts",
  "packages/db/src/requetes.ts",
  "packages/db/src/sessions.ts",
  "packages/db/test/acces.test.ts",
  "packages/db/test/comptes.test.ts",
  "packages/db/test/espaces.test.ts",
  "packages/db/test/gestion-du-compte.test.ts",
  "packages/db/test/migration.test.ts",
  "packages/db/test/sessions.test.ts",
];
// Les appelants livrés par F-008 hors du paquet : ils rangent `db` dans une autre `Base` sans
// l'interroger, donc le schéma qu'il porte ne change rien pour eux.
const QUI_TRANSMET_L_ACCES = [
  "apps/server/test/arret.test.ts",
  "apps/server/test/en-tetes.test.ts",
  "apps/server/test/erreurs.test.ts",
  "apps/server/test/essai/main-fermeture-en-echec.ts",
  "apps/server/test/journal.test.ts",
  "apps/server/test/sante.test.ts",
  "apps/server/test/service.test.ts",
];
// Ils portent le code sans en dresser la liste : un code de plus ne les touche pas.
const QUI_NOMME_LE_CODE = ["apps/server/src/journal.ts", "packages/db/src/index.ts"];
// Depuis F-027, le test des requêtes de la gestion du compte supprime les sessions d'un compte sauf
// une (F-027-AC4, AC12) ; le seul appelant hors du paquet reste la fonction du serveur.
const QUI_NOMME_LA_SUPPRESSION_ICI = [
  "packages/db/src/index.ts",
  "packages/db/test/gestion-du-compte.test.ts",
  "packages/db/test/sessions.test.ts",
];

const litLAcces = (texte: string): boolean => /\.db\b|Base\["db"\]/.test(texte);
const interrogeLAcces = (texte: string): boolean => /\.db\s*\.\s*\w/.test(texte);
const dresseLaListeDesCodes = (texte: string): boolean =>
  /Record<\s*CodeErreurBase|switch\s*\(/.test(texte);

function fautesDeLAcces(chemin: string, texte: string): string[] {
  if (chemin.startsWith("packages/db/")) {
    return litLAcces(texte) && !QUI_LIT_L_ACCES_ICI.includes(chemin)
      ? [`${chemin} lit l'accès à la base sans être inscrit`]
      : [];
  }
  return QUI_TRANSMET_L_ACCES.includes(chemin) && interrogeLAcces(texte)
    ? [`${chemin} interroge l'accès qu'il ne faisait que transmettre`]
    : [];
}

function fautesDeCouture(fichiers: ReadonlyMap<string, string>): string[] {
  const fautes: string[] = [];
  const suppriment: string[] = [];
  for (const [chemin, texte] of fichiers) {
    fautes.push(...fautesDeLAcces(chemin, texte));
    if (faitEntrer(texte, "CodeErreurBase")) {
      if (!QUI_NOMME_LE_CODE.includes(chemin)) {
        fautes.push(`${chemin} nomme CodeErreurBase sans être inscrit`);
      } else if (dresseLaListeDesCodes(texte)) {
        fautes.push(`${chemin} dresse la liste des codes d'erreur de la base`);
      }
    }
    if (faitEntrer(texte, "supprimerSessions") && !QUI_NOMME_LA_SUPPRESSION_ICI.includes(chemin)) {
      suppriment.push(chemin);
    }
  }
  // F-009-AC33 : une seule fonction de suppression de session, donc un seul appelant hors du paquet.
  if (
    suppriment.length > 1 ||
    suppriment.some((chemin) => !chemin.startsWith("apps/server/src/"))
  ) {
    fautes.push(`appelants de supprimerSessions : ${suppriment.join(", ")}`);
  }
  return fautes;
}

// Les déclarations d'essai sont assemblées ici : ce fichier, lu lui aussi, n'en porte aucune.
function entrer(clause: string, source = "@notionlike/db"): string {
  return `${"import"} ${clause} from "${source}";\n`;
}

describe("couture des comptes", () => {
  const fichiers = fichiersDuWorkspace();

  it('F-009-AC23 F-009-AC33 F-027-AC20 énumère qui lit Base["db"], qui nomme CodeErreurBase et qui appelle supprimerSessions : chacun est inscrit et existe encore', () => {
    expect(fautesDeCouture(fichiers)).toEqual([]);

    const inscrits = [...QUI_LIT_L_ACCES_ICI, ...QUI_TRANSMET_L_ACCES];
    expect(inscrits.filter((chemin) => !litLAcces(fichiers.get(chemin) ?? ""))).toEqual([]);
    expect(
      QUI_NOMME_LE_CODE.filter(
        (chemin) => !faitEntrer(fichiers.get(chemin) ?? "", "CodeErreurBase"),
      ),
    ).toEqual([]);
    expect(
      QUI_NOMME_LA_SUPPRESSION_ICI.filter(
        (chemin) => !faitEntrer(fichiers.get(chemin) ?? "", "supprimerSessions"),
      ),
    ).toEqual([]);
  });

  it.each<[string, [string, string][], string]>([
    [
      "un fichier du paquet non inscrit qui lit l'accès",
      [["packages/db/src/comptes.ts", "export const lire = (base: Base) => base.db;\n"]],
      "packages/db/src/comptes.ts lit l'accès à la base sans être inscrit",
    ],
    [
      "un appelant de F-008 qui se met à interroger l'accès",
      [["apps/server/test/sante.test.ts", "await embarquee.base.db.select();\n"]],
      "apps/server/test/sante.test.ts interroge l'accès qu'il ne faisait que transmettre",
    ],
    [
      "un fichier non inscrit qui nomme le code d'erreur",
      [["apps/server/src/application.ts", entrer("type { CodeErreurBase }")]],
      "apps/server/src/application.ts nomme CodeErreurBase sans être inscrit",
    ],
    [
      "le journal qui dresse la liste des codes",
      [
        [
          "apps/server/src/journal.ts",
          `${entrer("type { CodeErreurBase }")}const NIVEAUX: Record<CodeErreurBase, string> = {};\n`,
        ],
      ],
      "apps/server/src/journal.ts dresse la liste des codes d'erreur de la base",
    ],
    [
      "deux fichiers du serveur qui suppriment des sessions",
      [
        ["apps/server/src/sessions.ts", entrer("{ supprimerSessions }")],
        ["apps/server/src/compte.ts", entrer("{ supprimerSessions }")],
      ],
      "appelants de supprimerSessions : apps/server/src/sessions.ts, apps/server/src/compte.ts",
    ],
    [
      "un test du serveur qui supprime des sessions sans passer par la fonction du serveur",
      [["apps/server/test/sessions.test.ts", entrer("{ supprimerSessions }")]],
      "appelants de supprimerSessions : apps/server/test/sessions.test.ts",
    ],
  ])("F-009-AC23 F-009-AC33 la couture refuse %s", (_cas, fautifs, faute) => {
    expect(fautesDeCouture(new Map(fautifs))).toEqual([faute]);
  });

  it("F-009-AC33 la couture accepte un seul fichier d'apps/server/src qui appelle supprimerSessions", () => {
    const seul = new Map([["apps/server/src/sessions.ts", entrer("{ supprimerSessions }")]]);

    expect(fautesDeCouture(seul)).toEqual([]);
  });
});
