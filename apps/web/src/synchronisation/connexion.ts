// La connexion de l'onglet (F-013-AC17, H15) : une seule à la fois, et une WebSocket du fournisseur
// neuve à chaque tentative. Le fournisseur ne se reconnecte jamais de lui-même : chaque tentative
// est demandée par le module, qui règle lui-même ses délais (F-013-AC20). Chaque message sortant est
// mesuré avant l'envoi : un message plus grand que la limite publiée n'est pas émis (F-013-AC28), et
// les messages émis sont comptés pour tenir la passe de fond sous le débit publié (F-013-AC5).
import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";

import type { ConstructeurDeWebSocket, Environnement } from "./environnement.ts";
import { nomEnTete, octetsDe } from "./protocole.ts";

/** Une tentative qui n'a pas abouti dans ce délai est abandonnée, et comptée comme un échec. */
export const ECHEANCE_D_UNE_TENTATIVE_MS = 10_000;

export type EtatDeConnexion = "absente" | "tentative" | "etablie";

/** `echec` : la tentative n'a pas abouti ; `perdue` : la connexion établie s'est fermée. */
export type Fermeture =
  | { readonly sorte: "echec" }
  | { readonly sorte: "perdue"; readonly code: number; readonly raison: string };

export interface OptionsDeConnexion {
  readonly environnement: Pick<Environnement, "WebSocket" | "adresse" | "horloge">;
  readonly limiteDeMessage: number;
  readonly fenetreDesMessagesMs: number;
  readonly surEtablie: (prise: HocuspocusProviderWebsocket) => void;
  /** Appelé une fois par tentative qui s'arrête, sauf après `fermer()`. */
  readonly surFermee: (fermeture: Fermeture) => void;
  /** Un message du document de ce nom n'a pas été émis : il dépassait la limite publiée. */
  readonly surMessageTropGrand: (nomDuDocument: string | undefined) => void;
}

export interface Connexion {
  etat(): EtatDeConnexion;
  /** La WebSocket du fournisseur de la tentative en cours ; `undefined` sans tentative. */
  prise(): HocuspocusProviderWebsocket | undefined;
  /** Lance une tentative, sauf si une tentative court ou si la connexion est établie. */
  tenter(): void;
  /** Ferme la connexion ou abandonne la tentative, sans prévenir `surFermee`. */
  fermer(): void;
  /**
   * Ferme la connexion établie comme une perte (F-013-AC33), ou abandonne la tentative comme un
   * échec : `surFermee` est prévenu.
   */
  couper(): void;
  /** Nombre de messages émis dans la fenêtre glissante du débit publié. */
  messagesRecents(): number;
}

export function creerConnexion(options: OptionsDeConnexion): Connexion {
  return new ConnexionDeLOnglet(options);
}

class ConnexionDeLOnglet implements Connexion {
  readonly #options: OptionsDeConnexion;
  readonly #emissions: number[] = [];
  #courante: Tentative | undefined;

  constructor(options: OptionsDeConnexion) {
    this.#options = options;
  }

  readonly etat = (): EtatDeConnexion => this.#courante?.etat ?? "absente";

  readonly prise = (): HocuspocusProviderWebsocket | undefined => this.#courante?.prise;

  readonly tenter = (): void => {
    if (this.#courante !== undefined) {
      return;
    }
    this.#courante = this.#lancer();
  };

  readonly fermer = (): void => {
    const courante = this.#courante;
    this.#courante = undefined;
    courante?.arreter();
  };

  readonly couper = (): void => {
    const courante = this.#courante;
    if (courante === undefined) {
      return;
    }
    this.#courante = undefined;
    const etablie = courante.etat === "etablie";
    courante.arreter();
    this.#options.surFermee(
      etablie ? { sorte: "perdue", code: 0, raison: "" } : { sorte: "echec" },
    );
  };

  readonly messagesRecents = (): number => {
    const debut =
      this.#options.environnement.horloge.maintenant() - this.#options.fenetreDesMessagesMs;
    while (this.#emissions.length > 0 && (this.#emissions[0] ?? 0) <= debut) {
      this.#emissions.shift();
    }
    return this.#emissions.length;
  };

  #lancer(): Tentative {
    const { environnement } = this.#options;
    const tentative: Tentative = new Tentative(
      new HocuspocusProviderWebsocket({
        url: environnement.adresse,
        WebSocketPolyfill: this.#constructeurMesure(),
        autoConnect: false,
        maxAttempts: 1,
      }),
      environnement.horloge.programmer(() => {
        if (this.#courante === tentative && tentative.etat === "tentative") {
          this.couper();
        }
      }, ECHEANCE_D_UNE_TENTATIVE_MS),
    );
    const { prise } = tentative;
    prise.on("open", () => {
      if (this.#courante === tentative) {
        tentative.etat = "etablie";
        tentative.annulerLEcheance();
        this.#options.surEtablie(prise);
      }
    });
    prise.on("disconnect", ({ event }: { event?: { code?: number; reason?: string } }) => {
      // Aucune reconnexion du fournisseur : demandée ici, pendant sa propre diffusion, la
      // déconnexion explicite l'en empêche (H12 f).
      prise.disconnect();
      if (this.#courante !== tentative) {
        return;
      }
      this.#courante = undefined;
      const etablie = tentative.etat === "etablie";
      tentative.arreter();
      this.#options.surFermee(
        etablie
          ? { sorte: "perdue", code: event?.code ?? 0, raison: event?.reason ?? "" }
          : { sorte: "echec" },
      );
    });
    void prise.connect();
    return tentative;
  }

  #constructeurMesure(): ConstructeurDeWebSocket {
    const { limiteDeMessage, surMessageTropGrand } = this.#options;
    const noter = (): void => {
      this.#emissions.push(this.#options.environnement.horloge.maintenant());
    };
    const Base = this.#options.environnement.WebSocket;
    return class PriseMesuree extends Base {
      override send(donnee: Parameters<WebSocket["send"]>[0]): void {
        const octets = octetsDe(donnee);
        if (octets !== undefined && octets.byteLength > limiteDeMessage) {
          surMessageTropGrand(nomEnTete(octets));
          return;
        }
        noter();
        super.send(donnee);
      }
    };
  }
}

class Tentative {
  etat: Exclude<EtatDeConnexion, "absente"> = "tentative";
  readonly prise: HocuspocusProviderWebsocket;
  #annulerLEcheance: () => void;

  constructor(prise: HocuspocusProviderWebsocket, annulerLEcheance: () => void) {
    this.prise = prise;
    this.#annulerLEcheance = annulerLEcheance;
  }

  annulerLEcheance(): void {
    this.#annulerLEcheance();
    this.#annulerLEcheance = () => undefined;
  }

  // La WebSocket du fournisseur est détruite : ses fournisseurs attachés n'ont plus rien sur quoi
  // émettre, et un message de fermeture qu'on leur ferait envoyer resterait en file sur elle.
  arreter(): void {
    this.annulerLEcheance();
    this.prise.destroy();
  }
}
