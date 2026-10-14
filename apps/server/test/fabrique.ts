// Fabrique d'essai du serveur (F-012-AC36, H16), publiée par `@notionlike/server/essai` pour les
// seuls tests d'`apps/server` et d'`apps/web`. Elle démarre le serveur réel : l'application de F-008
// à F-012 assemblée par la fonction du point d'entrée de production (`assembler`), sans doublure de
// la bibliothèque, du relais, de l'autorisation ni du stockage, sur une base embarquée migrée propre
// à chaque appel, à l'écoute de 127.0.0.1 sur un port éphémère. Les sessions ne sont créées que par
// les routes de F-009. Sous `NODE_ENV=production`, elle lève sans rien démarrer.
import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import { Writable } from "node:stream";

import {
  CHEMIN_SYNCHRO,
  CHEMINS_COMPTES,
  CHEMINS_ESPACES,
  schemaNomDeDocument,
  type Role,
} from "@notionlike/contrats";
import { lireDocument, type Base } from "@notionlike/db";
import { ouvrirBaseEmbarqueeMigree } from "@notionlike/db/essai";

import { assembler } from "../src/assemblage.ts";
import { lireConfiguration } from "../src/configuration.ts";
import { creerJournal } from "../src/journal.ts";
import { demarrerServeur, type Ecoute } from "../src/serveur.ts";
import {
  REGLAGES_SYNCHRO,
  type Defaillance,
  type Minuterie,
  type ReglagesSynchro,
} from "../src/synchro-reglages.ts";

const HOTE = "127.0.0.1";
const SECRET = "fabrique-d-essai-de-trente-deux-signes";
const MOT_DE_PASSE = "mot-de-passe-de-la-fabrique";
const DELAI_D_ARRET_MS = 8000;

export interface OptionsDeLaFabrique {
  // `URL_PUBLIQUE` ; à défaut, l'origine du serveur lui-même.
  readonly urlPublique?: string;
  // `ORIGINES_AUTORISEES`.
  readonly originesAutorisees?: readonly string[];
  // Des valeurs réduites des limites (F-012-AC22 à AC25) et des délais (F-012-AC14, AC18, AC21).
  readonly reglages?: Partial<ReglagesSynchro>;
  // Une défaillance provoquée du chargement ou de l'enregistrement d'un document : la fonction est
  // appelée avant chaque lecture ou écriture d'instantané et peut lever.
  readonly defaillance?: Defaillance;
}

// L'horloge injectée : le temps du système, que le test peut avancer. Un rappel programmé part à
// son échéance réelle, ou dès qu'une avance l'atteint.
export interface HorlogeDEssai extends Minuterie {
  avancer(dureeMs: number): void;
  date(): Date;
}

export interface CompteInscrit {
  readonly idCompte: string;
  // La paire `nom=valeur` du cookie de session posé par l'inscription.
  readonly cookie: string;
}

export type LigneDeJournal = Readonly<Record<string, unknown>>;

export interface ServeurDEssai {
  // L'origine HTTP du serveur, et l'adresse du point de synchronisation.
  readonly origine: string;
  readonly urlDeSynchro: string;
  // L'origine publique qu'un navigateur servi par l'application annonce.
  readonly urlPublique: string;
  readonly port: number;
  readonly horloge: HorlogeDEssai;
  readonly base: Base;
  readonly reglages: ReglagesSynchro;
  inscrire(etiquette?: string): Promise<CompteInscrit>;
  appeler(methode: string, chemin: string, appel?: AppelDEssai): Promise<Response>;
  creerEspace(cookie: string): Promise<string>;
  ajouterMembre(proprietaire: string, idEspace: string, invite: string, role: Role): Promise<void>;
  changerRole(proprietaire: string, idEspace: string, idCompte: string, role: Role): Promise<void>;
  retirerMembre(proprietaire: string, idEspace: string, idCompte: string): Promise<void>;
  supprimerEspace(proprietaire: string, idEspace: string): Promise<void>;
  lignesDuJournal(): LigneDeJournal[];
  texteDuJournal(): string;
  // L'instantané stocké du document de ce nom, ou `undefined` s'il ne l'est pas.
  lireInstantane(nom: string): Promise<Uint8Array | undefined>;
  // L'arrêt de F-012-AC31 ; la base reste ouverte pour un redémarrage.
  arreter(): Promise<void>;
  // Redémarre sur la même base et le même port.
  redemarrer(): Promise<void>;
  // Arrête et ferme la base.
  fermer(): Promise<void>;
}

export interface AppelDEssai {
  readonly cookie?: string;
  readonly corps?: unknown;
}

function creerHorloge(): HorlogeDEssai {
  let decalage = 0;
  const attentes = new Set<{ echeance: number; partir: () => void }>();
  const maintenant = (): number => Date.now() + decalage;
  return {
    maintenant,
    date: () => new Date(maintenant()),
    programmer(rappel, delaiMs) {
      const attente = {
        echeance: maintenant() + delaiMs,
        partir: () => {
          clearTimeout(minuteur);
          if (attentes.delete(attente)) {
            rappel();
          }
        },
      };
      const minuteur = setTimeout(attente.partir, delaiMs);
      minuteur.unref();
      attentes.add(attente);
      return () => {
        clearTimeout(minuteur);
        attentes.delete(attente);
      };
    },
    avancer(dureeMs) {
      decalage += dureeMs;
      for (const attente of [...attentes]) {
        if (attente.echeance <= maintenant()) {
          attente.partir();
        }
      }
    },
  };
}

// Seules des valeurs réduites sont admises : la fabrique n'élargit aucune limite.
function reglagesReduits(reduits: Partial<ReglagesSynchro> = {}): ReglagesSynchro {
  for (const [cle, valeur] of Object.entries(reduits)) {
    if (valeur > REGLAGES_SYNCHRO[cle as keyof ReglagesSynchro]) {
      throw new Error(`réglage d'essai supérieur à la valeur publiée : ${cle}`);
    }
  }
  return { ...REGLAGES_SYNCHRO, ...reduits };
}

function portLibre(): Promise<number> {
  const serveur = createServer();
  return new Promise((resolve, reject) => {
    serveur.once("error", reject);
    serveur.listen(0, HOTE, () => {
      const { port } = serveur.address() as AddressInfo;
      serveur.close(() => {
        resolve(port);
      });
    });
  });
}

let rang = 0;

export async function demarrerServeurDEssai(
  options: OptionsDeLaFabrique = {},
): Promise<ServeurDEssai> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("La fabrique d'essai ne démarre pas sous NODE_ENV=production.");
  }
  const reglages = reglagesReduits(options.reglages);
  const port = await portLibre();
  const origine = `http://${HOTE}:${String(port)}`;
  const urlPublique = options.urlPublique ?? origine;
  // Chaque inscription annonce sa propre adresse par le proxy de confiance : les plafonds
  // d'inscription de F-009 restent ceux de la production, compte par adresse.
  const configuration = lireConfiguration({
    NODE_ENV: "test",
    HOTE,
    PORT: String(port),
    URL_BASE_DONNEES: "postgres://essai:essai@127.0.0.1:5432/essai",
    BETTER_AUTH_SECRET: SECRET,
    URL_PUBLIQUE: urlPublique,
    ORIGINES_AUTORISEES: (options.originesAutorisees ?? []).join(","),
    PROXYS_DE_CONFIANCE: "1",
  });
  const { base } = await ouvrirBaseEmbarqueeMigree();
  const horloge = creerHorloge();
  const morceaux: string[] = [];
  const journal = creerJournal(
    new Writable({
      write(morceau: Buffer, _encodage, fin) {
        morceaux.push(morceau.toString("utf8"));
        fin();
      },
    }),
  );

  async function ecouter(): Promise<Ecoute> {
    const { application, synchronisation } = assembler({
      configuration,
      base,
      journal,
      essai: {
        reglages,
        minuterie: horloge,
        defaillance: options.defaillance,
        horloge: horloge.date,
      },
    });
    return demarrerServeur({
      application,
      passage: synchronisation,
      hote: HOTE,
      port,
      delaiArretMs: DELAI_D_ARRET_MS,
    });
  }

  let ecoute: Ecoute | undefined = await ecouter();

  function appeler(methode: string, chemin: string, appel: AppelDEssai = {}): Promise<Response> {
    return fetch(`${origine}${chemin}`, {
      method: methode,
      headers: {
        Origin: urlPublique,
        ...(appel.corps === undefined ? {} : { "Content-Type": "application/json" }),
        ...(appel.cookie === undefined ? {} : { Cookie: appel.cookie }),
      },
      ...(appel.corps === undefined ? {} : { body: JSON.stringify(appel.corps) }),
    });
  }

  async function exiger(reponse: Promise<Response>, statut: number): Promise<Response> {
    const lue = await reponse;
    if (lue.status !== statut) {
      throw new Error(`statut ${String(lue.status)} au lieu de ${String(statut)}`);
    }
    return lue;
  }

  async function arreter(): Promise<void> {
    const enCours = ecoute;
    ecoute = undefined;
    await enCours?.arreter();
  }

  const cheminDe = (modele: string, valeurs: Readonly<Record<string, string>>): string =>
    modele.replace(/:(\w+)/g, (_tout, nom: string) => valeurs[nom] ?? "");

  return {
    origine,
    urlDeSynchro: `ws://${HOTE}:${String(port)}${CHEMIN_SYNCHRO}`,
    urlPublique,
    port,
    horloge,
    base,
    reglages,
    async inscrire(etiquette = "membre") {
      rang += 1;
      const reponse = await fetch(`${origine}${CHEMINS_COMPTES.inscription}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: urlPublique,
          "X-Forwarded-For": `10.${String(Math.floor(rang / 65_536) % 256)}.${String(Math.floor(rang / 256) % 256)}.${String(rang % 256)}`,
        },
        body: JSON.stringify({
          name: `${etiquette} ${String(rang)}`,
          email: `${etiquette}-${String(process.pid)}-${String(rang)}-${randomUUID()}@exemple.test`,
          password: MOT_DE_PASSE,
        }),
      });
      if (reponse.status !== 200) {
        throw new Error(`inscription refusée : ${String(reponse.status)}`);
      }
      const corps = (await reponse.json()) as { user: { id: string } };
      const pose = reponse.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith("better-auth.session_token="));
      if (pose === undefined) {
        throw new Error("l'inscription n'a posé aucun cookie de session");
      }
      return { idCompte: corps.user.id, cookie: pose.split("; ")[0] ?? "" };
    },
    appeler,
    async creerEspace(cookie) {
      const idEspace = randomUUID();
      await exiger(
        appeler("POST", CHEMINS_ESPACES.espaces, { cookie, corps: { idEspace, nom: "Essai" } }),
        201,
      );
      return idEspace;
    },
    async ajouterMembre(proprietaire, idEspace, invite, role) {
      const creee = await exiger(
        appeler("POST", cheminDe(CHEMINS_ESPACES.invitations, { idEspace }), {
          cookie: proprietaire,
          corps: { role },
        }),
        201,
      );
      const { jeton } = (await creee.json()) as { jeton: string };
      await exiger(
        appeler("POST", CHEMINS_ESPACES.acceptation, { cookie: invite, corps: { jeton } }),
        200,
      );
    },
    async changerRole(proprietaire, idEspace, idCompte, role) {
      await exiger(
        appeler("PATCH", cheminDe(CHEMINS_ESPACES.membre, { idEspace, idCompte }), {
          cookie: proprietaire,
          corps: { role },
        }),
        200,
      );
    },
    async retirerMembre(proprietaire, idEspace, idCompte) {
      await exiger(
        appeler("DELETE", cheminDe(CHEMINS_ESPACES.membre, { idEspace, idCompte }), {
          cookie: proprietaire,
        }),
        204,
      );
    },
    async supprimerEspace(proprietaire, idEspace) {
      await exiger(
        appeler("DELETE", cheminDe(CHEMINS_ESPACES.espace, { idEspace }), {
          cookie: proprietaire,
        }),
        204,
      );
    },
    texteDuJournal: () => morceaux.join(""),
    lignesDuJournal: () =>
      morceaux
        .join("")
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as LigneDeJournal),
    async lireInstantane(nom) {
      return (await lireDocument(base.db, schemaNomDeDocument.parse(nom)))?.instantane;
    },
    arreter,
    async redemarrer() {
      await arreter();
      ecoute = await ecouter();
    },
    async fermer() {
      await arreter();
      await base.fermer();
    },
  };
}
