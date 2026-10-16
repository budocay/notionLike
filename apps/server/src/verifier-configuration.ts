// Entrée de vérification de la configuration (ADR-0017, F-031 H6) :
// `node apps/server/src/verifier-configuration.ts`, lancée dans l'image par `infra/pile.sh
// demarrer` avant tout lancement, avec l'environnement exact du service `serveur`. Avec main.ts,
// c'est l'un des deux fichiers qui touchent au `process` global. Elle n'importe que
// configuration.ts : elle n'ouvre aucune connexion et n'écoute sur aucun port
// (règle `serveur-verification-de-configuration-confinee`).
//
// Acceptée : code 0, et sur la sortie standard exactement deux lignes, `URL_PUBLIQUE=…` puis
// `ORIGINES_AUTORISEES=…` (des origines, pas des secrets, F-031 H4). Refusée : code 1, le texte
// du refus sur la sortie d'erreur (F-031-AC12, AC13), rien sur la sortie standard.
import {
  ErreurConfiguration,
  lireConfiguration,
  texteDuRefusDeConfiguration,
} from "./configuration.ts";

try {
  const { urlPublique, originesAutorisees } = lireConfiguration(process.env);
  process.stdout.write(
    `URL_PUBLIQUE=${urlPublique}\nORIGINES_AUTORISEES=${originesAutorisees.join(",")}\n`,
  );
} catch (erreur) {
  if (!(erreur instanceof ErreurConfiguration)) {
    throw erreur;
  }
  process.stderr.write(texteDuRefusDeConfiguration(erreur));
  process.exitCode = 1;
}
