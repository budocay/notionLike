// Donnée de test de F-029-AC13 : un état au format de version 1, encodé par `Y.encodeStateAsUpdate`
// avec le code livré par F-001 (commit `7e99266`), et l'arborescence que ce code en lisait. Produit
// par deux répliques (clients 11 et 22) : pages imbriquées, renommée (2), déplacées (3, puis 2 en
// tête), mise à la corbeille (4), créations simultanées à la même position (7, 8, même rang « F »),
// puis insertion entre elles (9), qui a réattribué le rang de 8. Rangs enregistrés : 1 « V »,
// 2 « F », 3 « F », 4 « V », 5 « k », 6 « V », 7 « F », 8 « R », 9 « N ». Ne pas régénérer.
import type { Arborescence, PageLue } from "../src/index.ts";

export const ETAT_V1_DE_F001 = [
  "AwH+h5ibCQAoAQRtZXRhB3ZlcnNpb24BfQEEFgAnAQVwYWdlcyQwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAw",
  "MDAwMDAwMDgBKAAWAAV0aXRyZQF3B0lkw6llIEIhABYABXBsYWNlASgAFgAJY29yYmVpbGxlAXklCwAnAQVwYWdl",
  "cyQwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEBKAALAAV0aXRyZQF3B1Byb2pldHMoAAsABXBs",
  "YWNlAXYCBnBhcmVudH4EcmFuZ3cBVigACwAJY29yYmVpbGxlAXknAQVwYWdlcyQwMDAwMDAwMC0wMDAwLTQwMDAt",
  "ODAwMC0wMDAwMDAwMDAwMDIBIQALBAV0aXRyZQEhAAsEBXBsYWNlASgACwQJY29yYmVpbGxlAXknAQVwYWdlcyQw",
  "MDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDMBKAALCAV0aXRyZQF3CEFyY2hpdmVzIQALCAVwbGFj",
  "ZQEoAAsICWNvcmJlaWxsZQF5JwEFcGFnZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA0ASgA",
  "CwwFdGl0cmUBdxBGZXVpbGxlIGRlIHJvdXRlKAALDAVwbGFjZQF2AgZwYXJlbnR3JDAwMDAwMDAwLTAwMDAtNDAw",
  "MC04MDAwLTAwMDAwMDAwMDAwMQRyYW5ndwFWIQALDAljb3JiZWlsbGUBJwEFcGFnZXMkMDAwMDAwMDAtMDAwMC00",
  "MDAwLTgwMDAtMDAwMDAwMDAwMDA1ASgACxAFdGl0cmUBdwlSw6l1bmlvbnMoAAsQBXBsYWNlAXYCBnBhcmVudHck",
  "MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAxBHJhbmd3AWsoAAsQCWNvcmJlaWxsZQF5JwEFcGFn",
  "ZXMkMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA2ASgACxQFdGl0cmUBdwxDb21wdGUgcmVuZHUo",
  "AAsUBXBsYWNlAXYCBnBhcmVudHckMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA1BHJhbmd3AVYo",
  "AAsUCWNvcmJlaWxsZQF5qAsFAXcSTm90ZXMgcGVyc29ubmVsbGVzqAsKAXYCBnBhcmVudHckMDAwMDAwMDAtMDAw",
  "MC00MDAwLTgwMDAtMDAwMDAwMDAwMDAxBHJhbmd3AUaoCw8BeCcBBXBhZ2VzJDAwMDAwMDAwLTAwMDAtNDAwMC04",
  "MDAwLTAwMDAwMDAwMDAwNwEoAAsbBXRpdHJlAXcHSWTDqWUgQSgACxsFcGxhY2UBdgIGcGFyZW50dyQwMDAwMDAw",
  "MC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDUEcmFuZ3cBRigACxsJY29yYmVpbGxlAXknAQVwYWdlcyQwMDAw",
  "MDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDkBKAALHwV0aXRyZQF3EEVudHJlIGxlcyBpZMOpZXMoAAsf",
  "BXBsYWNlAXYCBnBhcmVudHckMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA1BHJhbmd3AU4oAAsf",
  "CWNvcmJlaWxsZQF5qBYCAXYCBnBhcmVudHckMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA1BHJh",
  "bmd3AVKoCwYBdgIGcGFyZW50fgRyYW5ndwFGAhYBAgELAwUCCgEPAQ==",
].join("");

function page(numero: number, titre: string, enfants: readonly PageLue[] = []): PageLue {
  return { id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`, titre, enfants };
}

export const LECTURE_V1_DE_F001: Arborescence = {
  racines: [
    page(2, "Notes personnelles"),
    page(1, "Projets", [
      page(3, "Archives"),
      page(5, "Réunions", [
        page(7, "Idée A"),
        page(9, "Entre les idées"),
        page(8, "Idée B"),
        page(6, "Compte rendu"),
      ]),
    ]),
  ],
  corbeille: [page(4, "Feuille de route")],
};
