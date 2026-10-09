// Faux serveur PostgreSQL de test (ADR-0005) : il parle le protocole juste assez pour le
// pilote `pg`. Il accepte toute connexion sans vérifier le mot de passe et termine chaque
// requête simple sans ligne. Il ne comprend aucune requête : ce n'est pas une base.
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";

export interface FauxPostgres {
  readonly url: string;
  seTaire(): void;
  couper(): void;
  arreter(): Promise<void>;
}

const HOTE = "127.0.0.1";
const TAILLE_LONGUEUR = 4;
const TAILLE_ENTETE = 1 + TAILLE_LONGUEUR;

function trame(type: string, corps: Buffer): Buffer {
  const entete = Buffer.alloc(TAILLE_ENTETE);
  entete.write(type, 0, "latin1");
  entete.writeInt32BE(TAILLE_LONGUEUR + corps.length, 1);
  return Buffer.concat([entete, corps]);
}

const AUTHENTIFICATION_ACCEPTEE = trame("R", Buffer.alloc(TAILLE_LONGUEUR));
const PRET_POUR_UNE_REQUETE = trame("Z", Buffer.from("I", "latin1"));
const REQUETE_FINIE_SANS_LIGNE = trame("C", Buffer.from("SELECT 0\0", "latin1"));

interface Echange {
  tampon: Buffer;
  demarre: boolean;
}

// Rend le type du prochain message complet du tampon, ou `undefined` s'il en manque un morceau.
// Le premier message d'une connexion (démarrage) n'a pas d'octet de type.
function prochainMessage(echange: Echange): string | undefined {
  const debutLongueur = echange.demarre ? 1 : 0;
  if (echange.tampon.length < debutLongueur + TAILLE_LONGUEUR) {
    return undefined;
  }
  const fin = debutLongueur + echange.tampon.readInt32BE(debutLongueur);
  if (echange.tampon.length < fin) {
    return undefined;
  }
  const type = echange.demarre ? echange.tampon.toString("latin1", 0, 1) : "demarrage";
  echange.tampon = echange.tampon.subarray(fin);
  echange.demarre = true;
  return type;
}

function ecouter(serveur: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, HOTE, () => {
      resolve((serveur.address() as AddressInfo).port);
    });
  });
}

function cesserDEcouter(serveur: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    serveur.close((erreur) => {
      if (erreur) {
        reject(erreur);
      } else {
        resolve();
      }
    });
  });
}

export async function demarrerFauxPostgres(motDePasse: string): Promise<FauxPostgres> {
  const connexions = new Set<Socket>();
  let muet = false;

  function repondre(connexion: Socket, type: string): void {
    if (type === "demarrage") {
      connexion.write(Buffer.concat([AUTHENTIFICATION_ACCEPTEE, PRET_POUR_UNE_REQUETE]));
    } else if (type === "Q" && !muet) {
      connexion.write(Buffer.concat([REQUETE_FINIE_SANS_LIGNE, PRET_POUR_UNE_REQUETE]));
    } else if (type === "X") {
      connexion.end();
    }
  }

  const serveur = createServer((connexion) => {
    const echange: Echange = { tampon: Buffer.alloc(0), demarre: false };
    connexions.add(connexion);
    connexion.on("close", () => connexions.delete(connexion));
    connexion.on("error", () => connexion.destroy());
    connexion.on("data", (morceau: Buffer) => {
      echange.tampon = Buffer.concat([echange.tampon, morceau]);
      for (let type = prochainMessage(echange); type; type = prochainMessage(echange)) {
        repondre(connexion, type);
      }
    });
  });

  function couper(): void {
    for (const connexion of connexions) {
      connexion.destroy();
    }
  }

  const port = await ecouter(serveur);
  return {
    url: `postgres://essai:${motDePasse}@${HOTE}:${port}/essai`,
    seTaire: () => {
      muet = true;
    },
    couper,
    arreter: () => {
      couper();
      return cesserDEcouter(serveur);
    },
  };
}

// Un port de 127.0.0.1 sur lequel rien n'écoute : il vient d'être rendu au système.
export async function portFerme(): Promise<number> {
  const serveur = createServer();
  const port = await ecouter(serveur);
  await cesserDEcouter(serveur);
  return port;
}
