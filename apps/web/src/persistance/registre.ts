// Registre de l'appareil (F-013, H3) : pour chaque espace que l'appareil détient, son rattachement
// et son dernier droit connu, et rien d'autre (ni nom, ni courriel, ni identifiant de compte). Il vit
// dans la base de l'appareil, à côté de l'identifiant de l'espace local, une clé par espace ; ce que
// F-032 retient de plus vit sous d'autres clés (`cles-de-l-appareil.ts`), sans migration. L'absence
// d'entrée vaut `local` : rien n'inscrit jamais `local` (F-013-AC4).
import { estUuidCanonique } from "../identifiants/uuid-canonique.ts";
import {
  CLE_ESPACE_RETENU,
  cleDeLaMarque,
  cleDuNom,
  cleDuRegistre,
  type Droit,
  type EntreeDuRegistre,
  estUneEntree,
} from "./cles-de-l-appareil.ts";
import { CLE_ESPACE_LOCAL } from "./espace-local.ts";
import { operer } from "./transaction-de-l-appareil.ts";

export type { Droit, EntreeDuRegistre };

export type LectureDuRegistre =
  | { readonly issue: "lu"; readonly entree: EntreeDuRegistre | undefined }
  | { readonly issue: "illisible" };

const ILLISIBLE: LectureDuRegistre = { issue: "illisible" };

/** Lit l'entrée d'un espace. Jamais rejetée : tout échec, toute valeur inconnue rend `illisible`. */
export function lireLeRegistre(idEspace: string): Promise<LectureDuRegistre> {
  if (!estUuidCanonique(idEspace)) {
    return Promise.resolve(ILLISIBLE);
  }
  return operer<LectureDuRegistre>("readonly", ILLISIBLE, (magasin, conclure) => {
    const lecture = magasin.get(cleDuRegistre(idEspace));
    lecture.onsuccess = () => {
      const valeur: unknown = lecture.result;
      conclure(
        valeur === undefined
          ? { issue: "lu", entree: undefined }
          : estUneEntree(valeur)
            ? { issue: "lu", entree: valeur }
            : ILLISIBLE,
      );
    };
  });
}

/** Inscrit l'entrée d'un espace ; rend vrai si la transaction a abouti. Jamais rejetée. */
export function inscrireAuRegistre(idEspace: string, entree: EntreeDuRegistre): Promise<boolean> {
  if (!estUuidCanonique(idEspace) || !estUneEntree(entree)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.put(
      { rattachement: entree.rattachement, droit: entree.droit },
      cleDuRegistre(idEspace),
    );
    conclure(true);
  });
}

/**
 * Retire l'entrée d'un espace, et dans la même transaction son dernier nom connu, sa marque de
 * première synchronisation et l'espace retenu s'il le désigne (F-032-AC20). Avec
 * `oublierLEspaceLocal`, retire aussi l'identifiant de l'espace local s'il est celui-là, et l'espace
 * retenu : le lancement suivant est un premier lancement, sur le nouvel espace de l'appareil
 * (F-013-AC24, F-032-AC21, F-002-AC1).
 */
export function retirerDuRegistre(
  idEspace: string,
  oublierLEspaceLocal: boolean,
): Promise<boolean> {
  if (!estUuidCanonique(idEspace)) {
    return Promise.resolve(false);
  }
  return operer("readwrite", false, (magasin, conclure) => {
    magasin.delete(cleDuRegistre(idEspace));
    magasin.delete(cleDuNom(idEspace));
    magasin.delete(cleDeLaMarque(idEspace));
    const retenu = magasin.get(CLE_ESPACE_RETENU);
    retenu.onsuccess = () => {
      if (retenu.result === idEspace) {
        magasin.delete(CLE_ESPACE_RETENU);
      }
    };
    if (!oublierLEspaceLocal) {
      conclure(true);
      return;
    }
    const lecture = magasin.get(CLE_ESPACE_LOCAL);
    lecture.onsuccess = () => {
      if (lecture.result === idEspace) {
        magasin.delete(CLE_ESPACE_LOCAL);
        magasin.delete(CLE_ESPACE_RETENU);
      }
      conclure(true);
    };
  });
}
