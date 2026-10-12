// Sonde de disponibilité bornée par le code (F-008-AC3, F-008-AC17) : une course entre la
// requête et une minuterie. Aucun réglage de la base (`statement_timeout`) n'intervient.
import { ErreurBase } from "./erreurs.ts";

export const DELAI_SONDE_MS = 2000;

// À l'échéance, la requête reste en vol : elle n'est pas annulée, son issue est ignorée.
export async function sonderDansLeDelai(requete: () => PromiseLike<unknown>): Promise<void> {
  let minuterie: NodeJS.Timeout | undefined;
  const echeance = new Promise<never>((_resolve, reject) => {
    minuterie = setTimeout(() => {
      reject(new ErreurBase("sonde-hors-delai"));
    }, DELAI_SONDE_MS);
  });
  const reponse = Promise.resolve()
    .then(requete)
    .catch((cause: unknown) => {
      throw new ErreurBase("base-injoignable", { cause });
    });
  try {
    await Promise.race([reponse, echeance]);
  } finally {
    clearTimeout(minuterie);
  }
}
