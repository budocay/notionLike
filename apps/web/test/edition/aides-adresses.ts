// Table des cas de la règle des adresses (F-028-AC11), tenue en un seul endroit : la règle elle-même,
// le collage (F-028-AC13), le rendu d'un document reçu (F-028-AC15) et la commande de lien de
// l'éditeur (F-028-AC32) la rejouent. Avec elle, ce qu'un autre client écrit dans le fragment.
import * as Y from "yjs";

const ADRESSE_DE_BASE = "https://exemple.fr/";
const LONGUEUR_MAX = 2048;

/** Une adresse acceptée de cette longueur exacte. */
export function adresseDeLongueur(longueur: number): string {
  return `${ADRESSE_DE_BASE}${"a".repeat(longueur - ADRESSE_DE_BASE.length)}`;
}

/** Cas refusés : un nom lisible, la valeur soumise. */
export const ADRESSES_REFUSEES: readonly (readonly [string, unknown])[] = [
  ["javascript:alert(1)", "javascript:alert(1)"],
  ["JaVaScRiPt:alert(1)", "JaVaScRiPt:alert(1)"],
  ["javascript: précédée d'espaces", "   javascript:alert(1)"],
  ["javascript: coupée par une tabulation", "java\tscript:alert(1)"],
  ["javascript: coupée par un saut de ligne", "java\nscript:alert(1)"],
  ["javascript: précédée d'un caractère de contrôle", "\u0001javascript:alert(1)"],
  ["data:text/html,<script>", "data:text/html,<script>alert(1)</script>"],
  ["vbscript:", "vbscript:"],
  ["file:///etc/passwd", "file:///etc/passwd"],
  ["blob:", "blob:"],
  ["about:blank", "about:blank"],
  ["ftp://", "ftp://"],
  ["ftp:// avec un hôte", "ftp://exemple.fr/fichier"],
  ["tel:", "tel:"],
  ["tel: avec un numéro", "tel:+33100000000"],
  ["//exemple.fr", "//exemple.fr"],
  ["/chemin", "/chemin"],
  ["#ancre", "#ancre"],
  ["https://nom:secret@exemple.fr", "https://nom:secret@exemple.fr"],
  ["hôte maquillé par un nom d'utilisateur", "https://banque.fr@autre.example"],
  ["https://", "https://"],
  ["la chaîne vide", ""],
  ["une valeur qui n'est pas une chaîne", 42],
  ["une adresse de 2 049 caractères", adresseDeLongueur(LONGUEUR_MAX + 1)],
];

/** Cas acceptés : un nom lisible, la valeur soumise, sa forme normalisée. */
export const ADRESSES_ACCEPTEES: readonly (readonly [string, string, string])[] = [
  ["https://exemple.fr/a?b#c", "https://exemple.fr/a?b#c", "https://exemple.fr/a?b#c"],
  ["http://intranet/page", "http://intranet/page", "http://intranet/page"],
  ["mailto:prenom@exemple.fr", "mailto:prenom@exemple.fr", "mailto:prenom@exemple.fr"],
  ["schéma et hôte en capitales", "HTTPS://Exemple.FR", "https://exemple.fr/"],
  [
    "une adresse de 2 048 caractères",
    adresseDeLongueur(LONGUEUR_MAX),
    adresseDeLongueur(LONGUEUR_MAX),
  ],
];

/** Un paragraphe fait de ces morceaux de texte, chacun avec ses marques, écrit par `yjs` seul. */
export function paragrapheDeMorceaux(
  ...morceaux: readonly (readonly [string, Readonly<Record<string, unknown>>?])[]
): Y.XmlElement {
  const paragraphe = new Y.XmlElement("paragraph");
  const texte = new Y.XmlText();
  let position = 0;
  for (const [contenu, marques] of morceaux) {
    texte.insert(position, contenu, marques === undefined ? undefined : { ...marques });
    position += contenu.length;
  }
  paragraphe.insert(0, [texte]);
  return paragraphe;
}

/** Un paragraphe dont le texte porte un lien de ces attributs, écrit par `yjs` seul. */
export function paragrapheAvecLien(
  avant: string,
  lien: string,
  attributs: Readonly<Record<string, unknown>>,
): Y.XmlElement {
  return paragrapheDeMorceaux([avant], [lien, { link: attributs }]);
}

/** Les attributs de chaque étendue liée du fragment, lus par `yjs` seul. */
export function liensDuFragment(fragment: Y.XmlFragment): Record<string, unknown>[] {
  const liens: Record<string, unknown>[] = [];
  const visiter = (noeud: Y.XmlElement | Y.XmlText | Y.XmlHook): void => {
    if (noeud instanceof Y.XmlText) {
      const morceaux = noeud.toDelta() as { attributes?: { link?: Record<string, unknown> } }[];
      morceaux.forEach(({ attributes }) => {
        if (attributes?.link !== undefined) {
          liens.push(attributes.link);
        }
      });
    } else if (noeud instanceof Y.XmlElement) {
      noeud.toArray().forEach(visiter);
    }
  };
  fragment.toArray().forEach(visiter);
  return liens;
}
