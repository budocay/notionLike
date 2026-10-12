import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { type Dictionnaire, dictionnaire, type FichierCompose, liste } from "./compose.ts";

// Rétention des données de la pile de travail (F-008-AC20, infra/RETOUR-ARRIERE.md) : aucune
// commande versée sous infra/ ne supprime un volume, et le fichier Compose ne pose ni tmpfs ni
// montage non nommé sur les données de PostgreSQL.

const CIBLE_DES_DONNEES = "/var/lib/postgresql";
const BARRIERE_DE_BLOC = /^(?:```|~~~)/;
const SEPARATEURS_DE_COMMANDES = /&&|\|\||[;|&]/;
const OPTION_DES_VOLUMES = /^(?:-[A-Za-z]*v[A-Za-z]*|--volumes(?:=.*)?)$/;
const SOUS_COMMANDES_QUI_ARRETENT = ["down", "prune"];
const SOUS_COMMANDES_DU_VOLUME = ["rm", "remove", "prune"];
const SOURCE_DU_POSTE = /^[./~]/;
const PILOTE_EN_MEMOIRE = "tmpfs";

/**
 * Fichiers d'infra/ que la règle ne lit pas : `fumee.sh` supprime volontairement le volume de sa pile
 * jetable (projet `notionlike-fumee`, constats 9 et 11) ; `tests/` porte les cas fautifs en données
 * et ne lance jamais Docker ; `.env` tient les secrets du poste et n'est pas versé.
 */
function estExclu(chemin: string): boolean {
  const nom = chemin.split("/").at(-1);
  return chemin === "fumee.sh" || chemin.startsWith("tests/") || nom === ".env";
}

/** Chemins relatifs, triés, des fichiers d'un dossier que la règle de rétention lit. */
export function fichiersSurveilles(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true, encoding: "utf8" })
    .map((chemin) => chemin.split("\\").join("/"))
    .filter((chemin) => !estExclu(chemin) && statSync(join(dossier, chemin)).isFile())
    .sort();
}

interface Ligne {
  readonly numero: number;
  readonly texte: string;
}

// Dans un fichier Markdown, seules les lignes des blocs de code sont des commandes à recopier : la
// prose peut nommer une commande pour l'interdire.
function lignesDesBlocsDeCode(lignes: readonly Ligne[]): Ligne[] {
  let dansUnBloc = false;
  return lignes.filter(({ texte }) => {
    if (BARRIERE_DE_BLOC.test(texte)) {
      dansUnBloc = !dansUnBloc;
      return false;
    }
    return dansUnBloc;
  });
}

// Une commande coupée par « \ » en fin de ligne est relue en entier, au numéro de sa première ligne.
function commandesEntieres(lignes: readonly Ligne[]): Ligne[] {
  const commandes: Ligne[] = [];
  let enCours: Ligne | undefined;
  for (const { numero, texte } of lignes) {
    const ligne =
      enCours === undefined
        ? { numero, texte }
        : { ...enCours, texte: `${enCours.texte} ${texte}` };
    enCours = texte.endsWith("\\") ? { ...ligne, texte: ligne.texte.slice(0, -1) } : undefined;
    if (enCours === undefined) commandes.push(ligne);
  }
  return enCours === undefined ? commandes : [...commandes, enCours];
}

function lignesDeCommande(chemin: string, texte: string): Ligne[] {
  const lignes = texte
    .split("\n")
    .map((ligne, rang) => ({ numero: rang + 1, texte: ligne.trim() }));
  const candidates = chemin.endsWith(".md") ? lignesDesBlocsDeCode(lignes) : lignes;
  return commandesEntieres(
    candidates.filter(({ texte: ligne }) => ligne !== "" && !ligne.startsWith("#")),
  );
}

function suit(mots: readonly string[], sousCommande: string, test: (mot: string) => boolean) {
  const rang = mots.indexOf(sousCommande);
  return rang !== -1 && mots.slice(rang + 1).some(test);
}

function motifDeSuppression(segment: string): string | undefined {
  const mots = segment.replaceAll(/["']/g, "").split(/\s+/);
  const arret = SOUS_COMMANDES_QUI_ARRETENT.find((sousCommande) =>
    suit(mots, sousCommande, (mot) => OPTION_DES_VOLUMES.test(mot)),
  );
  if (arret !== undefined) return `${arret} supprime les volumes (-v, --volumes)`;
  const rang = mots.indexOf("volume");
  const action = rang === -1 ? undefined : mots[rang + 1];
  return action !== undefined && SOUS_COMMANDES_DU_VOLUME.includes(action)
    ? `volume ${action} supprime un volume`
    : undefined;
}

/**
 * F-008-AC20 : aucune commande du fichier ne supprime un volume (`down -v`, `down --volumes`,
 * `docker volume rm|remove|prune`, `prune --volumes`). Les commentaires et, en Markdown, la prose
 * hors des blocs de code ne sont pas lus. Les constats donnent le fichier et la ligne, jamais son
 * contenu.
 */
export function constatsSuppressionDuVolume(chemin: string, texte: string): string[] {
  return lignesDeCommande(chemin, texte).flatMap(({ numero, texte: commande }) =>
    commande
      .split(SEPARATEURS_DE_COMMANDES)
      .flatMap((segment) => motifDeSuppression(segment) ?? [])
      .map((motif) => `${chemin}:${numero} : ${motif}`),
  );
}

interface Montage {
  readonly type: string;
  readonly source: string;
  readonly cible: string;
}

// Forme courte « [source:]cible[:mode] » ou forme longue { type, source, target }.
function lireMontage(entree: unknown): Montage {
  if (typeof entree !== "string") {
    const { type = "volume", source = "", target = "" } = dictionnaire(entree);
    return { type: String(type), source: String(source), cible: String(target) };
  }
  const parties = entree.split(":");
  const [source = "", cible = ""] = parties.length === 1 ? ["", entree] : parties;
  return { type: SOURCE_DU_POSTE.test(source) ? "bind" : "volume", source, cible };
}

function estSurLesDonnees(cible: string): boolean {
  const chemin = cible.replace(/\/+$/, "");
  return chemin === CIBLE_DES_DONNEES || chemin.startsWith(`${CIBLE_DES_DONNEES}/`);
}

function constatsDuMontage(nom: string, montage: Montage, volumes: Dictionnaire): string[] {
  const { type, source, cible } = montage;
  if (type !== "volume") return [`${nom} : montage ${type} sur ${cible}, pas un volume nommé`];
  if (!(source in volumes)) return [`${nom} : montage non nommé sur ${cible}`];
  const pilote = dictionnaire(dictionnaire(volumes[source]).driver_opts);
  return pilote.type === PILOTE_EN_MEMOIRE
    ? [`volume ${source} : pilote en ${PILOTE_EN_MEMOIRE}, monté par ${nom} sur ${cible}`]
    : [];
}

function constatsDuService(nom: string, contenu: Dictionnaire, volumes: Dictionnaire): string[] {
  const tmpfs = typeof contenu.tmpfs === "string" ? [contenu.tmpfs] : liste(contenu.tmpfs);
  const enMemoire = tmpfs
    .map((entree) => String(entree).split(":")[0] ?? "")
    .filter(estSurLesDonnees)
    .map((cible) => `${nom} : tmpfs sur ${cible}`);
  const montages = liste(contenu.volumes)
    .map(lireMontage)
    .filter(({ cible }) => estSurLesDonnees(cible))
    .flatMap((montage) => constatsDuMontage(nom, montage, volumes));
  return [...enMemoire, ...montages];
}

/**
 * F-008-AC20 : dans tout le fichier Compose, ce qui se monte sur /var/lib/postgresql (ou dessous) est
 * un volume nommé déclaré, sur disque : ni tmpfs, ni volume anonyme, ni dossier du poste, ni volume
 * nommé au pilote tmpfs. Sans quoi les données disparaissent avec le conteneur.
 */
export function constatsMontageDesDonnees(compose: FichierCompose): string[] {
  return Object.entries(compose.services).flatMap(([nom, contenu]) =>
    constatsDuService(nom, contenu, compose.volumes),
  );
}
