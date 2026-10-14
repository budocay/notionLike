// Adresse de la requête (F-009-AC15, H13) : celle de la connexion, ou celle que les proxys de
// confiance désignent dans `X-Forwarded-For`. Aucune autre valeur du client n'est retenue.
import { isIP, isIPv4, isIPv6 } from "node:net";

// Ce que l'adresse lit d'une requête : la connexion et un en-tête. Une requête d'Express le fournit,
// et la demande de passage en WebSocket aussi, par un adaptateur (F-012-AC26).
export interface RequeteLue {
  readonly socket: { readonly remoteAddress?: string | undefined };
  get(nom: string): string | undefined;
}

const PREFIXE_IPV4_EN_IPV6 = "::ffff:";
const GROUPES_IPV6 = 8;
const GROUPES_DU_RESEAU = 4;
const BASE_HEXADECIMALE = 16;

// Une connexion IPv4 reçue sur une socket IPv6 s'écrit `::ffff:a.b.c.d`.
function sansPrefixeIPv4(adresse: string): string {
  const suite = adresse.toLowerCase().startsWith(PREFIXE_IPV4_EN_IPV6)
    ? adresse.slice(PREFIXE_IPV4_EN_IPV6.length)
    : "";
  return isIPv4(suite) ? suite : adresse;
}

// La chaîne des adresses, du client annoncé à la connexion : chaque proxy de confiance y a ajouté
// celle qu'il a vue. Avec `proxys` à 0, l'adresse retenue est la dernière : celle de la connexion.
// Une entrée qui n'est pas une adresse (chaîne plus courte que prévu, valeur forgée) est ignorée.
export function adresseDe(requete: RequeteLue, proxys: number): string {
  const connexion = sansPrefixeIPv4(requete.socket.remoteAddress ?? "");
  const annoncees = (requete.get("X-Forwarded-For") ?? "").split(",").map((texte) => texte.trim());
  const chaine = [...annoncees, connexion];
  const designee = sansPrefixeIPv4(chaine[Math.max(0, chaine.length - 1 - proxys)] ?? "");
  return isIP(designee) === 0 ? connexion : designee;
}

// Clé des compteurs de débit : l'adresse IPv4 entière, ou le réseau /64 d'une adresse IPv6, dont
// un même client tient toutes les adresses.
export function reseauDe(adresse: string): string {
  if (!isIPv6(adresse)) {
    return adresse;
  }
  const [debut = "", fin] = (adresse.split("%")[0] ?? "").split("::");
  const tete = debut === "" ? [] : debut.split(":");
  const queue = fin === undefined || fin === "" ? [] : fin.split(":");
  const zeros = Array<string>(Math.max(0, GROUPES_IPV6 - tete.length - queue.length)).fill("0");
  const groupes = fin === undefined ? tete : [...tete, ...zeros, ...queue];
  return groupes
    .slice(0, GROUPES_DU_RESEAU)
    .map((groupe) => Number.parseInt(groupe, BASE_HEXADECIMALE).toString(BASE_HEXADECIMALE))
    .join(":");
}
