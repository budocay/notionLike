// Couture de F-034 (AC11, AC9) : la façade de table change deux contrats publics, `lire()` (dans une
// transaction englobante elle rend une relecture fraîche s'il n'y a aucun abonné) et `fermer()` (il
// relit une dernière fois avant de se fermer). Les appelants de `lire()`, `abonner()` et `fermer()`
// de la façade, dans `apps/web/src` et `apps/server/src`, sont énumérés en liste fermée : un nouvel
// appelant fait échouer ce test, jusqu'à ce qu'on établisse qu'il n'appelle pas la façade dans un
// `doc.transact` ou qu'il en tolère l'état en cours. Les fichiers sont lus comme du texte.
import { describe, expect, it } from "vitest";

import { lireLesFichiersDuWorkspace } from "./aides-coutures.ts";

const SESSION = "apps/web/src/table/session-table.ts";
const ECRAN = "apps/web/src/vues-de-table/EcranDeTable.tsx";

const fichiers = lireLesFichiersDuWorkspace();

// Une référence à `lire`, `abonner` ou `fermer` d'un objet nommé comme la façade : `facade`, `table`
// (la propriété de l'écran) ou le champ privé `#ouverte` de la session. Appel ou simple référence.
const APPEL = /(?<!\w)(?:facade|table|#ouverte)\??\.(?:lire|abonner|fermer)\b/;

function appelants(): string[] {
  const trouves: string[] = [];
  for (const [chemin, texte] of fichiers) {
    if (!/^apps\/(?:web|server)\/src\//.test(chemin)) {
      continue;
    }
    // Seuls les fichiers qui nomment la façade de table : celles de l'espace et des pages sont autres.
    if (!/\b(?:DocumentTable|ouvrirDocumentTable)\b/.test(texte)) {
      continue;
    }
    for (const ligne of texte.split("\n")) {
      if (APPEL.test(ligne)) {
        trouves.push(`${chemin} | ${ligne.trim()}`);
      }
    }
  }
  return trouves.sort();
}

// Pour chaque appelant : pourquoi il n'est pas dans un `doc.transact`, ou ce qu'il tolère.
const APPELANTS_ADMIS: Readonly<Record<string, string>> = {
  [`${SESSION} | facade.lire();`]:
    "refusDeLaFacade : appelée à l'ouverture (rappel de la persistance) et depuis #surLaTable, un " +
    "abonné appelé à la fin d'une transaction (afterTransaction, où _transaction est nul) ; avec un " +
    "abonné inscrit, lire() ne relit jamais en cours de transaction (comportement d'avant F-034).",
  [`${SESSION} | facade.abonner(this.#surLaTable);`]:
    "abonnement à l'ouverture, depuis un rappel de la persistance ; l'abonner dans une transaction " +
    "est de toute façon sûr (notification à la fin de la transaction, test de F-034-AC11).",
  [`${SESSION} | facade.fermer();`]:
    "deux appels : refusDeLaTable (façade d'un document témoin, depuis un rappel de la persistance, " +
    "le temps d'une lecture) et #surLaTable (depuis un abonné, à la fin d'une transaction, où " +
    "_transaction est nul : fermer() relit alors hors transaction).",
  [`${SESSION} | this.#ouverte?.fermer();`]:
    "fermeture de session (démontage, changement d'espace) et refus à l'ouverture, depuis des " +
    "rappels de la persistance ou des effets React, jamais dans une transaction.",
  [`${ECRAN} | return table.lire();`]:
    "lectureDe : getSnapshot de useSyncExternalStore, appelé au rendu ou dans le rappel de " +
    "l'abonnement ; l'écran est abonné, donc lire() ne relit pas en cours de transaction.",
  [`${ECRAN} | const lue = useSyncExternalStore(table.abonner, () => lectureDe(table));`]:
    "abonnement par React au montage, hors transaction.",
};

describe("F-034-AC11 couture : appelants de lire(), abonner() et fermer() de la façade de table", () => {
  it("les appelants sont la liste fermée ci-dessus, ni plus ni moins", () => {
    const attendus = Object.keys(APPELANTS_ADMIS).sort();
    const trouves = appelants();
    // Les doublons de la même ligne dans un même fichier comptent une fois : la clé est la ligne.
    expect([...new Set(trouves)]).toEqual(attendus);
  });

  it("aucun appelant n'ouvre lui-même une transaction du document", () => {
    for (const chemin of [SESSION, ECRAN]) {
      expect(fichiers.get(chemin)).not.toMatch(/\.transact\(/);
    }
  });

  it("apps/web/src et apps/server/src n'ouvrent aucune transaction Yjs : la façade n'y est jamais appelée dans un doc.transact", () => {
    for (const [chemin, texte] of fichiers) {
      if (/^apps\/(?:web|server)\/src\//.test(chemin)) {
        expect(texte, chemin).not.toMatch(/\bdoc\.transact\(|\.transact\(\s*\(/);
      }
    }
  });

  it("apps/server/src n'appelle pas la façade de table", () => {
    for (const [chemin, texte] of fichiers) {
      if (chemin.startsWith("apps/server/src/")) {
        expect(texte, chemin).not.toMatch(/ouvrirDocumentTable|creerDocumentTable/);
      }
    }
  });
});
