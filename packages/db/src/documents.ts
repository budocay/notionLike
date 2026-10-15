// Instantanés des documents synchronisés (F-012-AC18 à AC21, AC24, AC28, AC31) : les seules
// requêtes du dépôt qui lisent ou écrivent la table `document`. Le serveur n'y range que ce que
// ses clients ont écrit ; ces fonctions n'interprètent pas l'instantané (F-012 H5). Aucune ne
// supprime un document : seule la suppression de son espace l'efface, par la cascade de la clé
// étrangère, dans la transaction de `supprimerEspace` (F-012-AC31). Les appelants sont énumérés
// par `test/couture-documents.test.ts`.
import { and, count, eq } from "drizzle-orm";

import { estUnUuid, sansFuite, verrouillerEspace, type Db } from "./requetes.ts";
import { document, TYPES_DE_DOCUMENT } from "./schema.ts";

export type TypeDocument = (typeof TYPES_DE_DOCUMENT)[number];

// La clé de stockage d'un document (F-012-AC8, H2). Pour le document d'un espace (`espace:<id>`),
// `idDocument` est l'identifiant de l'espace lui-même ; pour une page ou une table, celui de la
// page ou de la table. Toute autre clé ne désigne aucun document.
export interface CleDocument {
  readonly idEspace: string;
  readonly type: TypeDocument;
  readonly idDocument: string;
}

export interface DocumentLu {
  // L'état complet du document, format de mise à jour V1 de Yjs, tel qu'il a été écrit.
  readonly instantane: Uint8Array;
  // Sa taille en octets, calculée par la base.
  readonly taille: number;
  readonly enregistreLe: Date;
}

export interface EnregistrementDocument extends CleDocument {
  readonly instantane: Uint8Array;
  // Date fournie par l'appelant, dont l'horloge est injectable.
  readonly enregistreLe: Date;
  // Nombre de documents stockés qu'un espace peut compter (F-012-AC24), publié par
  // `packages/contrats`.
  readonly plafondDocumentsParEspace: number;
}

// `cree` : la ligne n'existait pas ; `remplace` : elle est réécrite. `espace-absent` : l'espace
// n'existe pas ou plus, rien n'est écrit (F-012-AC21). `quota-atteint` : l'espace compte déjà le
// plafond de documents et celui-ci n'en fait pas partie, rien n'est écrit (F-012-AC24).
// `cle-invalide` : la clé ne désigne aucun document (type hors liste, identifiant qui n'est pas un
// UUID canonique, document d'espace qui ne porte pas l'identifiant de son espace) ; aucune requête.
export type IssueEnregistrementDocument =
  | { readonly issue: "cree" }
  | { readonly issue: "remplace" }
  | { readonly issue: "espace-absent" }
  | { readonly issue: "quota-atteint" }
  | { readonly issue: "cle-invalide" };

function estUneCle(cle: CleDocument): boolean {
  return (
    (TYPES_DE_DOCUMENT as readonly string[]).includes(cle.type) &&
    estUnUuid(cle.idEspace) &&
    estUnUuid(cle.idDocument) &&
    (cle.type !== "espace" || cle.idDocument === cle.idEspace)
  );
}

const ligneDe = (cle: CleDocument) =>
  and(
    eq(document.idEspace, cle.idEspace),
    eq(document.type, cle.type),
    eq(document.idDocument, cle.idDocument),
  );

// Le dernier instantané enregistré du document, ou `undefined` s'il n'a jamais été stocké, si son
// espace a été supprimé, ou si la clé est invalide (sans requête). Une lecture n'écrit rien
// (F-012-AC9, AC35). Un échec de la base lève `ErreurBase("requete-echouee")`, sans le texte de la
// requête ni ses paramètres (F-012-AC20, AC26).
export function lireDocument(db: Db, cle: CleDocument): Promise<DocumentLu | undefined> {
  if (!estUneCle(cle)) {
    return Promise.resolve(undefined);
  }
  return sansFuite(async () => {
    const [lu] = await db
      .select({
        instantane: document.instantane,
        taille: document.taille,
        enregistreLe: document.enregistreLe,
      })
      .from(document)
      .where(ligneDe(cle));
    return lu;
  });
}

// Le nombre de documents stockés de l'espace (F-012-AC24) ; 0 pour un espace inconnu ou un
// identifiant qui n'est pas un UUID canonique (sans requête).
export function compterDocuments(db: Db, idEspace: string): Promise<number> {
  if (!estUnUuid(idEspace)) {
    return Promise.resolve(0);
  }
  return sansFuite(async () => {
    const [compte] = await db
      .select({ nombre: count() })
      .from(document)
      .where(eq(document.idEspace, idEspace));
    return compte?.nombre ?? 0;
  });
}

// Enregistre l'instantané du document en une seule transaction (F-012-AC18) : la ligne est créée
// ou remplacée en entier, instantané, taille et date ensemble. La ligne de l'espace est verrouillée
// d'abord, comme pour toute écriture d'adhésion (`verrouillerEspace`) : deux créations dans le même
// espace ne dépassent pas ensemble le plafond, et un enregistrement ne recrée jamais un espace
// supprimé entre-temps, ni un document dans cet espace (F-012-AC21). Un échec de la base lève
// `ErreurBase("requete-echouee")`, sans le texte de la requête ni l'instantané (F-012-AC26).
export function enregistrerDocument(
  db: Db,
  enregistrement: EnregistrementDocument,
): Promise<IssueEnregistrementDocument> {
  if (!estUneCle(enregistrement)) {
    return Promise.resolve({ issue: "cle-invalide" });
  }
  const { instantane, enregistreLe } = enregistrement;
  return sansFuite(() =>
    db.transaction(async (transaction): Promise<IssueEnregistrementDocument> => {
      if (!(await verrouillerEspace(transaction, enregistrement.idEspace))) {
        return { issue: "espace-absent" };
      }
      const remplaces = await transaction
        .update(document)
        .set({ instantane, enregistreLe })
        .where(ligneDe(enregistrement))
        .returning({ idDocument: document.idDocument });
      if (remplaces.length > 0) {
        return { issue: "remplace" };
      }
      const nombre = await compterDocuments(transaction, enregistrement.idEspace);
      if (nombre >= enregistrement.plafondDocumentsParEspace) {
        return { issue: "quota-atteint" };
      }
      await transaction.insert(document).values({
        idEspace: enregistrement.idEspace,
        type: enregistrement.type,
        idDocument: enregistrement.idDocument,
        instantane,
        enregistreLe,
      });
      return { issue: "cree" };
    }),
  );
}
