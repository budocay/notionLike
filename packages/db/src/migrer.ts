// Commande de migration : `node packages/db/src/migrer.ts`. Elle ne lit que `URL_BASE_DONNEES`,
// applique les migrations en attente par le pilote `pg` et finit en code 0 ou 1 (ADR-0005).
import { ouvrirPilotePg } from "./acces.ts";
import { ErreurBase } from "./erreurs.ts";
import { DOSSIER_MIGRATIONS, lancerMigration } from "./migration.ts";

function ecrire(ligne: string): void {
  process.stderr.write(`${ligne}\n`);
}

async function migrer(url: string): Promise<number> {
  const pilote = ouvrirPilotePg(url);
  try {
    return await lancerMigration(pilote, DOSSIER_MIGRATIONS, ecrire);
  } finally {
    await pilote.fermer();
  }
}

// Une `ErreurBase` porte une phrase fixe ; de toute autre erreur, rien n'est écrit que sa nature.
function codeApresEchec(erreur: unknown): number {
  ecrire(erreur instanceof ErreurBase ? erreur.message : "La commande de migration a échoué.");
  return 1;
}

const url = process.env.URL_BASE_DONNEES;
if (url === undefined || url === "") {
  ecrire("La variable URL_BASE_DONNEES est absente.");
  process.exitCode = 1;
} else {
  process.exitCode = await migrer(url).catch(codeApresEchec);
}
