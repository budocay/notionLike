// Lecture minimale des messages du protocole de la bibliothèque, sans dépendance : le nom du document
// en tête de chaque message (pour mesurer et attribuer un envoi, F-013-AC28), et le vecteur d'état
// que le serveur annonce à l'ouverture (premier pas de l'échange de synchronisation, F-013-AC27).
// Format : entiers variables de 7 bits, chaînes et tableaux d'octets précédés de leur longueur.

const OCTET_DE_SUITE = 0x80;
const SEPT_BITS = 0x7f;
const DECALAGE = 7;
const TYPE_SYNCHRONISATION = 0;
const PREMIER_PAS = 0;

class Lecteur {
  readonly octets: Uint8Array;
  #position = 0;

  constructor(octets: Uint8Array) {
    this.octets = octets;
  }

  entier(): number {
    let valeur = 0;
    let multiplicateur = 1;
    for (;;) {
      const octet = this.octets[this.#position];
      if (octet === undefined) {
        throw new RangeError("message tronqué");
      }
      this.#position += 1;
      valeur += (octet & SEPT_BITS) * multiplicateur;
      if (octet < OCTET_DE_SUITE) {
        return valeur;
      }
      multiplicateur *= 2 ** DECALAGE;
    }
  }

  octetsPrefixes(): Uint8Array {
    const longueur = this.entier();
    const fin = this.#position + longueur;
    if (fin > this.octets.length) {
      throw new RangeError("message tronqué");
    }
    const lus = this.octets.subarray(this.#position, fin);
    this.#position = fin;
    return lus;
  }

  chaine(): string {
    return new TextDecoder().decode(this.octetsPrefixes());
  }
}

export function octetsDe(donnee: unknown): Uint8Array | undefined {
  if (donnee instanceof ArrayBuffer) {
    return new Uint8Array(donnee);
  }
  if (ArrayBuffer.isView(donnee)) {
    return new Uint8Array(donnee.buffer, donnee.byteOffset, donnee.byteLength);
  }
  return undefined;
}

/** Le nom du document en tête du message ; `undefined` pour un message sans nom lisible. */
export function nomEnTete(octets: Uint8Array): string | undefined {
  try {
    return new Lecteur(octets).chaine();
  } catch {
    return undefined;
  }
}

/** Le vecteur d'état d'un premier pas de synchronisation reçu ; `undefined` pour tout autre message. */
export function vecteurDuPremierPas(octets: Uint8Array): Uint8Array | undefined {
  try {
    const lecteur = new Lecteur(octets);
    lecteur.chaine();
    if (lecteur.entier() !== TYPE_SYNCHRONISATION || lecteur.entier() !== PREMIER_PAS) {
      return undefined;
    }
    return lecteur.octetsPrefixes();
  } catch {
    return undefined;
  }
}
