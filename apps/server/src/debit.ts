// Compteurs de débit en mémoire du processus (F-009 H7) : une fenêtre fixe par clé, ouverte par la
// première requête comptée. Chaque application a les siens ; ils repartent de zéro au redémarrage.
interface Plafond {
  readonly fenetreS: number;
  readonly max: number;
}

interface Decision {
  readonly permise: boolean;
  // Secondes entières avant la fin de la fenêtre : de 1 à la durée de la fenêtre.
  readonly attenteS: number;
}

export type Consommer = (cle: string, plafond: Plafond) => Decision;

const MS_PAR_SECONDE = 1000;
const ENTREES_MAX = 100_000;

// L'horloge, en millisecondes, est injectable pour les tests des fenêtres (F-011 H10).
export function creerCompteurs(horloge: () => number = Date.now): Consommer {
  const fenetres = new Map<string, { fin: number; compte: number }>();

  // Borne la mémoire : au plafond, les fenêtres closes sont oubliées, puis la plus ancienne.
  function faireDeLaPlace(maintenant: number): void {
    for (const [cle, fenetre] of fenetres) {
      if (fenetre.fin <= maintenant) {
        fenetres.delete(cle);
      }
    }
    const [plusAncienne] = fenetres.keys();
    if (fenetres.size >= ENTREES_MAX && plusAncienne !== undefined) {
      fenetres.delete(plusAncienne);
    }
  }

  return (cle, plafond) => {
    const maintenant = horloge();
    if (fenetres.size >= ENTREES_MAX) {
      faireDeLaPlace(maintenant);
    }
    const ouverte = fenetres.get(cle);
    const fenetre =
      ouverte !== undefined && ouverte.fin > maintenant
        ? ouverte
        : { fin: maintenant + plafond.fenetreS * MS_PAR_SECONDE, compte: 0 };
    fenetres.set(cle, fenetre);
    fenetre.compte += 1;
    return {
      permise: fenetre.compte <= plafond.max,
      attenteS: Math.ceil((fenetre.fin - maintenant) / MS_PAR_SECONDE),
    };
  };
}
