// Empreinte des mots de passe (F-009-AC5, AC6, H4) : Argon2id de `node:crypto`, écrit et relu au
// format PHC. `node:crypto` ne fournit ni ce codage ni la vérification : ils sont ici. Le module
// passe par l'objet `crypto` à chaque appel, pour qu'un test observe le calcul et la comparaison.
import crypto from "node:crypto";

interface Parametres {
  readonly memoireKio: number;
  readonly passes: number;
  readonly fils: number;
}

interface EmpreinteLue extends Parametres {
  readonly sel: Buffer;
  readonly cle: Buffer;
}

// Le minimum de l'OWASP pour Argon2id.
const PARAMETRES: Parametres = { memoireKio: 19_456, passes: 2, fils: 1 };
const OCTETS_DU_SEL = 16;
const OCTETS_DE_LA_CLE = 32;

// Ce qu'une empreinte stockée peut demander : jamais moins que les paramètres d'aujourd'hui, et
// jamais assez pour qu'une ligne altérée en base épuise la mémoire du serveur.
const MEMOIRE_MAX_KIO = 262_144;
const PASSES_MAX = 10;
const FILS_MAX = 4;
const OCTETS_MAX = 64;

const FORME =
  /^\$argon2id\$v=19\$m=([1-9]\d{0,6}),t=([1-9]\d?),p=([1-9])\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function enBase64(octets: Buffer): string {
  return octets.toString("base64").replace(/=+$/, "");
}

function entre(valeur: number, min: number, max: number): boolean {
  return valeur >= min && valeur <= max;
}

function calculer(motDePasse: string, sel: Buffer, taille: number, p: Parametres): Promise<Buffer> {
  const reglages = {
    message: motDePasse,
    nonce: sel,
    memory: p.memoireKio,
    passes: p.passes,
    parallelism: p.fils,
    tagLength: taille,
  };
  return new Promise((resolve, reject) => {
    crypto.argon2("argon2id", reglages, (erreur, cle) => {
      if (erreur === null) {
        resolve(cle);
      } else {
        reject(erreur);
      }
    });
  });
}

function dansLesBornes(lue: EmpreinteLue): boolean {
  return (
    entre(lue.memoireKio, PARAMETRES.memoireKio, MEMOIRE_MAX_KIO) &&
    entre(lue.passes, PARAMETRES.passes, PASSES_MAX) &&
    entre(lue.fils, PARAMETRES.fils, FILS_MAX) &&
    entre(lue.sel.length, OCTETS_DU_SEL, OCTETS_MAX) &&
    entre(lue.cle.length, OCTETS_DE_LA_CLE, OCTETS_MAX)
  );
}

// `undefined` : chaîne mal formée, autre algorithme, base64 non canonique, ou paramètres hors des
// bornes acceptées.
function lire(empreinte: string): EmpreinteLue | undefined {
  const morceaux = FORME.exec(empreinte);
  if (morceaux === null) {
    return undefined;
  }
  const [memoire, passes, fils, sel64, cle64] = morceaux.slice(1);
  const lue = {
    memoireKio: Number(memoire),
    passes: Number(passes),
    fils: Number(fils),
    sel: Buffer.from(String(sel64), "base64"),
    cle: Buffer.from(String(cle64), "base64"),
  };
  const canonique = enBase64(lue.sel) === sel64 && enBase64(lue.cle) === cle64;
  return canonique && dansLesBornes(lue) ? lue : undefined;
}

// F-009-AC5 : un sel aléatoire par mot de passe ; la chaîne porte l'algorithme, la version, les
// paramètres, le sel et la clé.
export async function empreinteDe(motDePasse: string): Promise<string> {
  const sel = crypto.randomBytes(OCTETS_DU_SEL);
  const cle = await calculer(motDePasse, sel, OCTETS_DE_LA_CLE, PARAMETRES);
  const { memoireKio, passes, fils } = PARAMETRES;
  return `$argon2id$v=19$m=${memoireKio},t=${passes},p=${fils}$${enBase64(sel)}$${enBase64(cle)}`;
}

// F-009-AC6 : la clé est recalculée avec les paramètres de la chaîne stockée, puis comparée en
// temps constant. Une chaîne que `lire` refuse ne correspond à aucun mot de passe.
export async function correspond(motDePasse: string, empreinte: string): Promise<boolean> {
  const lue = lire(empreinte);
  if (lue === undefined) {
    return false;
  }
  const cle = await calculer(motDePasse, lue.sel, lue.cle.length, lue);
  return crypto.timingSafeEqual(cle, lue.cle);
}

// F-027-AC6 : la vérification d'une action sensible calcule toujours une empreinte aux paramètres
// de F-009-AC5, même quand l'empreinte stockée manque, est mal formée ou hors des bornes : la durée
// de la réponse ne dit pas laquelle des deux causes a fait échouer la vérification.
export async function verifierLeMotDePasse(
  motDePasse: string,
  empreinte: string | undefined,
): Promise<boolean> {
  if (empreinte !== undefined && lire(empreinte) !== undefined) {
    return correspond(motDePasse, empreinte);
  }
  await calculer(motDePasse, crypto.randomBytes(OCTETS_DU_SEL), OCTETS_DE_LA_CLE, PARAMETRES);
  return false;
}
