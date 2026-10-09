import { isDeepStrictEqual } from "node:util";

import { isScalar, parseDocument, Scalar, visit } from "yaml";

type Dictionnaire = Record<string, unknown>;

export interface FichierCompose {
  readonly projet: string;
  readonly services: Readonly<Record<string, Dictionnaire>>;
  readonly volumes: Dictionnaire;
}

const VARIABLE_MOT_DE_PASSE = "POSTGRES_PASSWORD";
const EXIGENCES_DU_MOT_DE_PASSE = /\$\{POSTGRES_PASSWORD:\?[^}]+\}/g;
const VALEUR_DU_MOT_DE_PASSE = /^\$\{POSTGRES_PASSWORD:\?[^}]+\}$/;
const URL_DE_LA_BASE =
  /^postgres:\/\/notionlike:\$\{POSTGRES_PASSWORD:\?[^}]+\}@base:5432\/notionlike$/;
const SERVICES_QUI_JOIGNENT_LA_BASE = ["migration", "serveur"];

const IMAGE_EPINGLEE = /^[a-z0-9./-]+:(?!latest@)[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}$/;
const IMAGE_DE_LA_BASE = /^postgres:18\.6@sha256:[0-9a-f]{64}$/;
const PORT_PUBLIE_EN_LOCAL = /^127\.0\.0\.1:(?:\d+|\$\{[A-Z_]+:-\d+\}):\d+$/;
const MONTAGE_DES_DONNEES = "/var/lib/postgresql";
const ARGUMENTS_DE_LA_SONDE = ["pg_isready", "-h 127.0.0.1", "-U notionlike", "-d notionlike"];

const ORDRE_DE_DEMARRAGE = [
  { service: "migration", attend: "base", condition: "service_healthy" },
  { service: "serveur", attend: "base", condition: "service_healthy" },
  { service: "serveur", attend: "migration", condition: "service_completed_successfully" },
];
const COMMANDE_DE_MIGRATION = ["node", "packages/db/src/migrer.ts"];
const VARIABLES_DE_LA_MIGRATION = ["URL_BASE_DONNEES"];
const VARIABLES_FIXEES_AU_SERVEUR = ["HOTE", "PORT", "URL_BASE_DONNEES"];
const FICHIER_DU_SERVEUR = "../apps/server/.env";

function dictionnaire(valeur: unknown): Dictionnaire {
  const estUnObjet = typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
  return estUnObjet ? (valeur as Dictionnaire) : {};
}

function liste(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
}

function service(compose: FichierCompose, nom: string): Dictionnaire {
  return compose.services[nom] ?? {};
}

/** Charge le fichier Compose ; lève si le YAML ne se lit pas (message `${…:?…}` non quoté, par exemple). */
export function lireCompose(texte: string): FichierCompose {
  const document = parseDocument(texte);
  const [erreur] = document.errors;
  if (erreur !== undefined) throw new Error(`Fichier Compose illisible : ${erreur.message}`);
  const racine = dictionnaire(document.toJS());
  const services = Object.entries(dictionnaire(racine.services)).map(
    ([nom, contenu]) => [nom, dictionnaire(contenu)] as const,
  );
  return {
    projet: typeof racine.name === "string" ? racine.name : "",
    services: Object.fromEntries(services),
    volumes: dictionnaire(racine.volumes),
  };
}

function constatsDeLaValeur(noeud: Scalar): string[] {
  const valeur = String(noeud.value);
  if (!valeur.includes(VARIABLE_MOT_DE_PASSE)) return [];
  const constats: string[] = [];
  if (valeur.replaceAll(EXIGENCES_DU_MOT_DE_PASSE, "").includes(VARIABLE_MOT_DE_PASSE)) {
    constats.push("mot de passe lu sans la forme ${POSTGRES_PASSWORD:?message}");
  }
  if (noeud.type !== Scalar.QUOTE_DOUBLE && noeud.type !== Scalar.QUOTE_SINGLE) {
    constats.push("valeur qui porte le mot de passe non quotée en entier");
  }
  return constats;
}

/**
 * F-008-AC13 : le mot de passe de la base n'a ni valeur en dur ni valeur par défaut. Les constats ne
 * recopient jamais la valeur lue.
 */
export function constatsMotDePasse(texte: string): string[] {
  const constats: string[] = [];
  visit(parseDocument(texte), {
    Pair(_position, paire) {
      const estLaVariable = isScalar(paire.key) && paire.key.value === VARIABLE_MOT_DE_PASSE;
      const valeur = isScalar(paire.value) ? String(paire.value.value) : "";
      if (estLaVariable && !VALEUR_DU_MOT_DE_PASSE.test(valeur)) {
        constats.push("POSTGRES_PASSWORD reçoit autre chose que ${POSTGRES_PASSWORD:?message}");
      }
    },
    Scalar(position, noeud) {
      if (position !== "key") constats.push(...constatsDeLaValeur(noeud));
    },
  });
  return constats;
}

/** F-008-AC13 : l'URL de connexion ne porte le mot de passe que par la variable obligatoire. */
export function constatsUrlDeLaBase(compose: FichierCompose): string[] {
  return SERVICES_QUI_JOIGNENT_LA_BASE.filter((nom) => {
    const url = dictionnaire(service(compose, nom).environment).URL_BASE_DONNEES;
    return !URL_DE_LA_BASE.test(String(url));
  }).map((nom) => `${nom} : URL_BASE_DONNEES n'a pas la forme attendue`);
}

function constatsImageDuService(nom: string, contenu: Dictionnaire): string[] {
  if (contenu.image === undefined) {
    return "build" in contenu ? [] : [`${nom} : ni image ni construction`];
  }
  const image = String(contenu.image);
  return IMAGE_EPINGLEE.test(image)
    ? []
    : [`${nom} : image non épinglée par version et par empreinte : ${image}`];
}

/** F-008-AC20 : toute image tirée est épinglée par version et empreinte ; la base est en 18.6. */
export function constatsImages(compose: FichierCompose): string[] {
  const constats = Object.entries(compose.services).flatMap(([nom, contenu]) =>
    constatsImageDuService(nom, contenu),
  );
  if (!IMAGE_DE_LA_BASE.test(String(service(compose, "base").image))) {
    constats.push("base : image attendue postgres:18.6@sha256:<empreinte>");
  }
  return constats;
}

function constatsPortsDuService(nom: string, contenu: Dictionnaire): string[] {
  const constats = liste(contenu.ports)
    .filter((port) => typeof port !== "string" || !PORT_PUBLIE_EN_LOCAL.test(port))
    .map(
      (port) => `${nom} : port publié ailleurs que sur 127.0.0.1 en dur : ${JSON.stringify(port)}`,
    );
  if ("network_mode" in contenu) constats.push(`${nom} : network_mode contourne les ports publiés`);
  return constats;
}

/** F-008-AC20 : chaque port publié l'est sur 127.0.0.1 écrit en dur ; seul le port du poste est réglable. */
export function constatsPorts(compose: FichierCompose): string[] {
  return Object.entries(compose.services).flatMap(([nom, contenu]) =>
    constatsPortsDuService(nom, contenu),
  );
}

/** F-008-AC20 : un volume nommé, monté sur /var/lib/postgresql, sans PGDATA redéfini. */
export function constatsVolume(compose: FichierCompose): string[] {
  const base = service(compose, "base");
  const montages = liste(base.volumes);
  const [montage] = montages;
  if (montages.length !== 1 || typeof montage !== "string") {
    return ["base : un seul montage attendu, en forme courte"];
  }
  const [source = "", cible = ""] = montage.split(":");
  const constats: string[] = [];
  if (cible !== MONTAGE_DES_DONNEES) {
    constats.push(`base : données montées sur ${cible}, attendu ${MONTAGE_DES_DONNEES}`);
  }
  if (!(source in compose.volumes)) {
    constats.push(`base : « ${source} » n'est pas un volume nommé déclaré`);
  }
  if ("PGDATA" in dictionnaire(base.environment)) constats.push("base : PGDATA est redéfini");
  return constats;
}

/** F-008-AC20 : la base est sondée par pg_isready sur son adresse TCP, pas par la socket Unix. */
export function constatsSanteDeLaBase(compose: FichierCompose): string[] {
  const controle = dictionnaire(service(compose, "base").healthcheck);
  const essai = controle.test;
  const commande = typeof essai === "string" ? essai : liste(essai).join(" ");
  const constats = ARGUMENTS_DE_LA_SONDE.filter((argument) => !commande.includes(argument)).map(
    (argument) => `base : le contrôle de santé n'a pas « ${argument} »`,
  );
  if (controle.disable === true) constats.push("base : le contrôle de santé est désactivé");
  return constats;
}

/** F-008-AC19, F-008-AC21 : base saine, puis migration réussie, puis serveur. */
export function constatsOrdreDeDemarrage(compose: FichierCompose): string[] {
  return ORDRE_DE_DEMARRAGE.filter(({ service: nom, attend, condition }) => {
    const dependance = dictionnaire(dictionnaire(service(compose, nom).depends_on)[attend]);
    return dependance.condition !== condition || dependance.required === false;
  }).map(({ service: nom, attend, condition }) => `${nom} : n'attend pas ${attend} (${condition})`);
}

/** F-008-AC21 : la migration s'exécute une seule fois, dans l'image du serveur. */
export function constatsMigration(compose: FichierCompose): string[] {
  const migration = service(compose, "migration");
  const constats: string[] = [];
  if (migration.restart !== undefined && migration.restart !== "no") {
    constats.push("migration : politique de redémarrage");
  }
  if (!isDeepStrictEqual(migration.command, COMMANDE_DE_MIGRATION)) {
    constats.push("migration : commande inattendue");
  }
  const construction = migration.build;
  if (
    construction === undefined ||
    !isDeepStrictEqual(construction, service(compose, "serveur").build)
  ) {
    constats.push("migration : construction différente de celle du serveur");
  }
  const variables = Object.keys(dictionnaire(migration.environment));
  if (!isDeepStrictEqual(variables, VARIABLES_DE_LA_MIGRATION)) {
    constats.push("migration : reçoit autre chose que URL_BASE_DONNEES");
  }
  return constats;
}

function estLeFichierObligatoire(entree: unknown): boolean {
  if (typeof entree === "string") return entree === FICHIER_DU_SERVEUR;
  const { path: chemin, required: obligatoire } = dictionnaire(entree);
  return chemin === FICHIER_DU_SERVEUR && obligatoire !== false;
}

/** F-008-AC24 : le serveur reçoit apps/server/.env en entier ; Compose ne fixe que trois variables. */
export function constatsEnvironnementDuServeur(compose: FichierCompose): string[] {
  const serveur = service(compose, "serveur");
  const fichiers =
    typeof serveur.env_file === "string" ? [serveur.env_file] : liste(serveur.env_file);
  const constats: string[] = [];
  if (fichiers.length !== 1 || !estLeFichierObligatoire(fichiers[0])) {
    constats.push(
      `serveur : env_file n'est pas le seul fichier ${FICHIER_DU_SERVEUR}, obligatoire`,
    );
  }
  const variables = Object.keys(dictionnaire(serveur.environment)).sort();
  if (!isDeepStrictEqual(variables, VARIABLES_FIXEES_AU_SERVEUR)) {
    constats.push("serveur : variables recopiées une à une au lieu du fichier entier");
  }
  return constats;
}
